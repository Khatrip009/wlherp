// src/services/parentService.js
import { supabase } from "../api/supabase";
import { sendTemplateEmail } from "./emailService"; // 👈 Added

// ─── Helpers ──────────────────────────────────────────────────────────

async function getOrganizationFromBranch(branchId) {
  const { data: branch, error: branchError } = await supabase
    .from("branches")
    .select("organization_id")
    .eq("id", branchId)
    .single();
  if (branchError) throw branchError;

  const { data: org, error: orgError } = await supabase
    .from("organization")
    .select("id, company_name")
    .eq("id", branch.organization_id)
    .single();
  if (orgError) throw orgError;
  return org;
}

/**
 * Send a welcome/activation email to the parent with login credentials.
 */
async function sendParentWelcomeEmail(parent, email, password, context) {
  const { branchId, financialYearId } = context;
  try {
    const org = await getOrganizationFromBranch(branchId);
    const fullName = parent.father_name || parent.mother_name || "Parent";

    const contextEmail = {
      academyName: org.company_name,
      full_name: fullName,
      email: email,
      temp_password: password,
      login_link: `${window.location.origin}/login`, // adjust to your app's login URL
    };

    await sendTemplateEmail({
      to: email,
      organizationId: org.id,
      slug: "account_activation", // or "account_welcome" – choose your template
      context: contextEmail,
      branchId,
    });
    console.log(`✅ Welcome email sent to parent ${email}`);
  } catch (error) {
    console.error("❌ Failed to send parent welcome email:", error);
  }
}

/**
 * Helper: create an auth user + update profile role.
 * Returns the new user's UUID, or null if no credentials provided.
 */
async function createAuthUser(email, password, fullName, role) {
  if (!email || !password) return null;

  const { data: existingProfile } = await supabase
    .from("profiles")
    .select("id")
    .eq("email", email)
    .maybeSingle();
  if (existingProfile) throw new Error("A user with this email already exists.");

  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: { data: { full_name: fullName } },
  });
  if (error) {
    if (error.message.includes("already been registered"))
      throw new Error("This email is already registered.");
    throw error;
  }

  const userId = data.user.id;
  const { error: profileError } = await supabase
    .from("profiles")
    .update({ role })
    .eq("id", userId);
  if (profileError) throw profileError;
  return userId;
}

// ─── Paginated fetch WITH linked students ──────────────────────
export async function getParents({
  pageParam = 0,
  filters = {},
  branchId,
  financialYearId,
} = {}) {
  const limit = 10;
  const from = pageParam * limit;
  const to = from + limit - 1;

  let query = supabase
    .from("parents")
    .select(
      `*,
       student_parents(
         students(first_name, last_name, id)
       )`,
      { count: "exact" }
    )
    .order("id", { ascending: false })
    .range(from, to);

  // Scope by branch and financial year
  if (branchId) query = query.eq("branch_id", branchId);
  if (financialYearId) query = query.eq("financial_year_id", financialYearId);

  if (filters.search) {
    query = query.or(
      `father_name.ilike.%${filters.search}%,mother_name.ilike.%${filters.search}%,mobile.ilike.%${filters.search}%,email.ilike.%${filters.search}%`
    );
  }

  const { data, error, count } = await query;
  if (error) throw error;

  // Flatten student data for easier rendering
  const enriched = (data || []).map((parent) => ({
    ...parent,
    linked_students: (parent.student_parents || [])
      .map((link) => link.students)
      .filter(Boolean),
  }));
  return { data: enriched, count };
}

// Export all parents (for CSV)
export async function getAllParentsForExport(filters = {}, branchId, financialYearId) {
  let query = supabase
    .from("parents")
    .select("*")
    .order("id", { ascending: false });

  // Scope
  if (branchId) query = query.eq("branch_id", branchId);
  if (financialYearId) query = query.eq("financial_year_id", financialYearId);

  if (filters.search) {
    query = query.or(
      `father_name.ilike.%${filters.search}%,mother_name.ilike.%${filters.search}%,mobile.ilike.%${filters.search}%,email.ilike.%${filters.search}%`
    );
  }

  const { data, error } = await query;
  if (error) throw error;
  return data || [];
}

/**
 * Create a parent record.
 * @param {Object} payload – parent fields + optional `email` & `password` for auth.
 * @param {number} [studentId] – if provided, the new parent is immediately linked to this student.
 * @param {Object} context – { branchId, financialYearId }
 */
export async function createParent(payload, studentId = null, context) {
  const { email, password, ...parentData } = payload;
  const { branchId, financialYearId } = context;

  const fullName =
    parentData.father_name || parentData.mother_name || "Parent";
  const userId = await createAuthUser(email, password, fullName, "parent");

  const { data: parent, error } = await supabase
    .from("parents")
    .insert([{ ...parentData, user_id: userId, branch_id: branchId, financial_year_id: financialYearId }])
    .select()
    .single();
  if (error) throw error;

  // If a student ID was provided, automatically link
  if (studentId) {
    const { error: linkError } = await supabase
      .from("student_parents")
      .insert({
        student_id: studentId,
        parent_id: parent.id,
        relation: "guardian",
        branch_id: branchId,
        financial_year_id: financialYearId,
      });
    if (linkError) throw linkError;
  }

  // ─── Send welcome email ──────────────────────────────────────
  if (email && password) {
    await sendParentWelcomeEmail(parent, email, password, context);
  }

  return parent;
}

/**
 * Update a parent record – scoped to prevent cross‑branch edits.
 * @param {number} id – parent ID
 * @param {Object} payload – fields to update
 * @param {Object} context – { branchId, financialYearId }
 */
export async function updateParent(id, payload, context) {
  const { branchId, financialYearId } = context;

  let query = supabase
    .from("parents")
    .update({ ...payload, branch_id: branchId, financial_year_id: financialYearId })
    .eq("id", id);

  if (branchId) query = query.eq("branch_id", branchId);
  if (financialYearId) query = query.eq("financial_year_id", financialYearId);

  const { data, error } = await query.select().single();
  if (error) throw error;
  return data;
}

/**
 * Soft delete a parent record – scoped.
 * @param {number} id
 * @param {Object} context – { branchId, financialYearId }
 */
export async function deleteParent(id, context) {
  const { branchId, financialYearId } = context;

  let query = supabase
    .from("parents")
    .update({
      deleted_at: new Date().toISOString(),
      branch_id: branchId,
      financial_year_id: financialYearId,
    })
    .eq("id", id);

  if (branchId) query = query.eq("branch_id", branchId);
  if (financialYearId) query = query.eq("financial_year_id", financialYearId);

  const { error } = await query;
  if (error) throw error;
}

/**
 * Link a student to a parent – scoped checks and inserts.
 * @param {number} parentId
 * @param {number} studentId
 * @param {Object} context – { branchId, financialYearId }
 */
export async function linkStudentToParent(parentId, studentId, context) {
  const { branchId, financialYearId } = context;

  // Check if link already exists – scope the check
  let existingQuery = supabase
    .from("student_parents")
    .select("id")
    .eq("parent_id", parentId)
    .eq("student_id", studentId);

  if (branchId) existingQuery = existingQuery.eq("branch_id", branchId);
  if (financialYearId) existingQuery = existingQuery.eq("financial_year_id", financialYearId);

  const { data: existing } = await existingQuery.maybeSingle();

  if (existing) {
    throw new Error("This student is already linked to this parent.");
  }

  // Create new link (already includes branch/FY in payload)
  const { error } = await supabase
    .from("student_parents")
    .insert({
      parent_id: parentId,
      student_id: studentId,
      relation: "parent",
      branch_id: branchId,
      financial_year_id: financialYearId,
    });

  if (error) throw error;
}