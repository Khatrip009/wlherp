// src/services/inquiryService.js
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

async function getCourseName(courseId) {
  if (!courseId) return null;
  const { data, error } = await supabase
    .from("courses")
    .select("course_name")
    .eq("id", courseId)
    .single();
  if (error) return null;
  return data?.course_name || null;
}

// ─── Email Sending Functions ──────────────────────────────────────────

/**
 * Send inquiry confirmation email.
 */
async function sendInquiryConfirmationEmail(inquiry, context) {
  const { branchId, financialYearId } = context;
  try {
    const org = await getOrganizationFromBranch(branchId);
    const courseName = await getCourseName(inquiry.interested_course_id);

    const contextEmail = {
      academyName: org.company_name,
      parent_name: inquiry.parent_name || 'Parent',
      student_name: inquiry.student_name,
      inquiry_no: inquiry.inquiry_no,
      mobile: inquiry.mobile,
      course_name: courseName || 'N/A',
    };

    await sendTemplateEmail({
      to: inquiry.email,
      organizationId: org.id,
      slug: "inquiry_confirmation",
      context: contextEmail,
      branchId,
    });
    console.log(`✅ Inquiry confirmation email sent to ${inquiry.email}`);
  } catch (error) {
    console.error("❌ Failed to send inquiry confirmation email:", error);
  }
}

/**
 * Send demo scheduled email.
 */
async function sendDemoScheduledEmail(inquiry, demoDateTime, context) {
  const { branchId, financialYearId } = context;
  try {
    const org = await getOrganizationFromBranch(branchId);
    const courseName = await getCourseName(inquiry.interested_course_id);

    // Fetch branch name
    const { data: branch, error: branchError } = await supabase
      .from("branches")
      .select("branch_name")
      .eq("id", branchId)
      .single();
    if (branchError) throw branchError;

    const contextEmail = {
      academyName: org.company_name,
      parent_name: inquiry.parent_name || 'Parent',
      student_name: inquiry.student_name,
      demo_datetime: demoDateTime,
      course_name: courseName || 'N/A',
      branch_name: branch?.branch_name || 'N/A',
    };

    await sendTemplateEmail({
      to: inquiry.email,
      organizationId: org.id,
      slug: "demo_scheduled",
      context: contextEmail,
      branchId,
    });
    console.log(`✅ Demo scheduled email sent to ${inquiry.email}`);
  } catch (error) {
    console.error("❌ Failed to send demo scheduled email:", error);
  }
}

/**
 * Send inquiry status change email.
 */
async function sendStatusChangeEmail(inquiry, oldStatus, newStatus, context) {
  const { branchId, financialYearId } = context;
  try {
    const org = await getOrganizationFromBranch(branchId);

    const contextEmail = {
      academyName: org.company_name,
      parent_name: inquiry.parent_name || 'Parent',
      student_name: inquiry.student_name,
      old_status: oldStatus || 'Unknown',
      new_status: newStatus,
      rejection_reason: inquiry.rejection_reason || '',
    };

    await sendTemplateEmail({
      to: inquiry.email,
      organizationId: org.id,
      slug: "inquiry_status_change",
      context: contextEmail,
      branchId,
    });
    console.log(`✅ Status change email sent to ${inquiry.email} (${oldStatus} → ${newStatus})`);
  } catch (error) {
    console.error("❌ Failed to send status change email:", error);
  }
}

// ─── Paginated fetch with filters ─────────────────────────────────────

export async function getInquiries({ pageParam = 0, filters = {}, branchId, financialYearId } = {}) {
  const limit = 10;
  const from = pageParam * limit;
  const to = from + limit - 1;

  let query = supabase
    .from("inquiries")
    .select("*, mediums(name)", { count: "exact" })
    .order("created_at", { ascending: false })
    .range(from, to);

  if (branchId) query = query.eq("branch_id", branchId);
  if (financialYearId) query = query.eq("financial_year_id", financialYearId);

  if (filters.search) {
    query = query.or(
      `student_name.ilike.%${filters.search}%,parent_name.ilike.%${filters.search}%,mobile.ilike.%${filters.search}%,inquiry_no.ilike.%${filters.search}%`
    );
  }
  if (filters.status) query = query.eq("status", filters.status);
  if (filters.interested_course_id) query = query.eq("interested_course_id", filters.interested_course_id);
  if (filters.medium_id) query = query.eq("medium_id", filters.medium_id);
  if (filters.source) query = query.eq("source", filters.source);
  if (filters.start_date) query = query.gte("created_at", filters.start_date);
  if (filters.end_date) query = query.lte("created_at", filters.end_date);

  const { data, error, count } = await query;
  if (error) throw error;

  const enriched = (data || []).map((inq) => ({
    ...inq,
    medium_name: inq.mediums?.name || "",
  }));

  return { data: enriched, count };
}

// ─── Export all inquiries ─────────────────────────────────────────────

export async function getAllInquiriesForExport(filters = {}, branchId, financialYearId) {
  let query = supabase
    .from("inquiries")
    .select("*, mediums(name)")
    .order("created_at", { ascending: false });

  if (branchId) query = query.eq("branch_id", branchId);
  if (financialYearId) query = query.eq("financial_year_id", financialYearId);

  if (filters.search) {
    query = query.or(
      `student_name.ilike.%${filters.search}%,parent_name.ilike.%${filters.search}%,mobile.ilike.%${filters.search}%,inquiry_no.ilike.%${filters.search}%`
    );
  }
  if (filters.status) query = query.eq("status", filters.status);
  if (filters.interested_course_id) query = query.eq("interested_course_id", filters.interested_course_id);
  if (filters.medium_id) query = query.eq("medium_id", filters.medium_id);
  if (filters.source) query = query.eq("source", filters.source);
  if (filters.start_date) query = query.gte("created_at", filters.start_date);
  if (filters.end_date) query = query.lte("created_at", filters.end_date);

  const { data, error } = await query;
  if (error) throw error;
  return (data || []).map((inq) => ({
    ...inq,
    medium_name: inq.mediums?.name || "",
  }));
}

// ─── CRUD ──────────────────────────────────────────────────────────────

// context: { branchId, financialYearId }
export async function createInquiry(payload, context) {
  const { branchId, financialYearId } = context;
  const { data, error } = await supabase
    .from("inquiries")
    .insert([{
      ...payload,
      status: "Interested",   // default status
      branch_id: branchId,
      financial_year_id: financialYearId,
    }])
    .select()
    .single();
  if (error) throw error;

  // ─── Send inquiry confirmation email ──────────────────────────
  await sendInquiryConfirmationEmail(data, context);

  return data;
}

export async function updateInquiry(id, payload, context) {
  const { branchId, financialYearId } = context;

  // Fetch current inquiry to check for status change
  let currentQuery = supabase
    .from("inquiries")
    .select("status, email, parent_name, student_name, rejection_reason, interested_course_id")
    .eq("id", id);
  if (branchId) currentQuery = currentQuery.eq("branch_id", branchId);
  if (financialYearId) currentQuery = currentQuery.eq("financial_year_id", financialYearId);
  const { data: current, error: currentError } = await currentQuery.single();
  if (currentError) throw currentError;

  let query = supabase
    .from("inquiries")
    .update({ ...payload, branch_id: branchId, financial_year_id: financialYearId })
    .eq("id", id);

  if (branchId) query = query.eq("branch_id", branchId);
  if (financialYearId) query = query.eq("financial_year_id", financialYearId);

  const { data, error } = await query.select().single();
  if (error) throw error;

  // If status changed, send status change email
  if (payload.status && payload.status !== current.status) {
    await sendStatusChangeEmail(
      { ...current, ...data }, // merge current and new data
      current.status,
      payload.status,
      context
    );
  }

  return data;
}

// Soft delete – scoped
export async function deleteInquiry(id, context) {
  const { branchId, financialYearId } = context;
  let query = supabase
    .from("inquiries")
    .update({ deleted_at: new Date().toISOString() })
    .eq("id", id);

  if (branchId) query = query.eq("branch_id", branchId);
  if (financialYearId) query = query.eq("financial_year_id", financialYearId);

  const { error } = await query;
  if (error) throw error;
}

// ─── Schedule Demo ────────────────────────────────────────────────────

export async function scheduleDemo(inquiryId, demoDateTime, context) {
  const { branchId, financialYearId } = context;

  // Fetch inquiry before update (for email context)
  let currentQuery = supabase
    .from("inquiries")
    .select("*")
    .eq("id", inquiryId);
  if (branchId) currentQuery = currentQuery.eq("branch_id", branchId);
  if (financialYearId) currentQuery = currentQuery.eq("financial_year_id", financialYearId);
  const { data: inquiry, error: fetchError } = await currentQuery.single();
  if (fetchError) throw fetchError;

  let query = supabase
    .from("inquiries")
    .update({
      demo_scheduled_at: demoDateTime,
      status: "Demo Scheduled",
      branch_id: branchId,
      financial_year_id: financialYearId,
    })
    .eq("id", inquiryId);

  if (branchId) query = query.eq("branch_id", branchId);
  if (financialYearId) query = query.eq("financial_year_id", financialYearId);

  const { data, error } = await query.select().single();
  if (error) throw error;

  // ─── Send demo scheduled email ────────────────────────────────
  await sendDemoScheduledEmail(inquiry, demoDateTime, context);

  return data;
}

// ─── Reject Inquiry ──────────────────────────────────────────────────

export async function rejectInquiry(inquiryId, reason, context) {
  const { branchId, financialYearId } = context;

  // Fetch inquiry before update (for old status)
  let currentQuery = supabase
    .from("inquiries")
    .select("*")
    .eq("id", inquiryId);
  if (branchId) currentQuery = currentQuery.eq("branch_id", branchId);
  if (financialYearId) currentQuery = currentQuery.eq("financial_year_id", financialYearId);
  const { data: inquiry, error: fetchError } = await currentQuery.single();
  if (fetchError) throw fetchError;

  let query = supabase
    .from("inquiries")
    .update({
      status: "Rejected",
      rejection_reason: reason,
      branch_id: branchId,
      financial_year_id: financialYearId,
    })
    .eq("id", inquiryId);

  if (branchId) query = query.eq("branch_id", branchId);
  if (financialYearId) query = query.eq("financial_year_id", financialYearId);

  const { data, error } = await query.select().single();
  if (error) throw error;

  // ─── Send status change email ──────────────────────────────────
  await sendStatusChangeEmail(inquiry, inquiry.status, "Rejected", context);

  return data;
}

// ─── Dropdown options ─────────────────────────────────────────────────

export async function getCourseOptions() {
  const { data, error } = await supabase
    .from("courses")
    .select("id, course_name")
    .eq("status", true);
  if (error) throw error;
  return data || [];
}

export async function getMediumOptions() {
  const { data, error } = await supabase
    .from("mediums")
    .select("id, name")
    .order("name");
  if (error) throw error;
  return data || [];
}