// src/services/leaveService.js
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

async function getAdminEmails(organizationId) {
  const { data, error } = await supabase
    .from("profiles")
    .select("email")
    .eq("organization_id", organizationId)
    .in("role", ["admin", "super_admin", "organization_admin"])
    .eq("is_active", true);
  if (error) throw error;
  return data?.map(p => p.email).filter(Boolean) || [];
}

async function getTeacherEmail(teacherId) {
  const { data, error } = await supabase
    .from("teachers")
    .select("email, first_name, last_name")
    .eq("id", teacherId)
    .single();
  if (error) throw error;
  return data;
}

// ─── Email notifications ─────────────────────────────────────────────

/**
 * Send leave submitted notification to admins.
 */
async function sendLeaveSubmittedNotification(leave, context) {
  const { branchId, financialYearId } = context;
  try {
    const org = await getOrganizationFromBranch(branchId);
    const adminEmails = await getAdminEmails(org.id);
    if (adminEmails.length === 0) {
      console.warn('No admin emails found, skipping leave notification.');
      return;
    }

    // Fetch teacher details
    const { data: teacher, error: teacherError } = await supabase
      .from("teachers")
      .select("first_name, last_name")
      .eq("id", leave.teacher_id)
      .single();
    if (teacherError) throw teacherError;

    const teacherName = `${teacher.first_name} ${teacher.last_name}`;

    const contextEmail = {
      academyName: org.company_name,
      teacher_name: teacherName,
      leave_dates: `${leave.start_date} to ${leave.end_date}`,
      reason: leave.reason || 'Not specified',
      status: leave.status || 'Pending',
    };

    await sendTemplateEmail({
      to: adminEmails,
      organizationId: org.id,
      slug: "leave_submitted",
      context: contextEmail,
      branchId,
    });
    console.log(`✅ Leave submitted notification sent to admins for ${teacherName}`);
  } catch (error) {
    console.error("❌ Failed to send leave submitted notification:", error);
  }
}

/**
 * Send leave status update notification to the teacher.
 */
async function sendLeaveStatusUpdateNotification(leave, context) {
  const { branchId, financialYearId } = context;
  try {
    const org = await getOrganizationFromBranch(branchId);
    const teacher = await getTeacherEmail(leave.teacher_id);
    if (!teacher || !teacher.email) {
      console.warn(`No email found for teacher ${leave.teacher_id}, skipping status update notification.`);
      return;
    }

    const teacherName = `${teacher.first_name} ${teacher.last_name}`;

    const contextEmail = {
      academyName: org.company_name,
      teacher_name: teacherName,
      leave_dates: `${leave.start_date} to ${leave.end_date}`,
      new_status: leave.status,
      admin_remarks: leave.admin_remarks || '',
    };

    await sendTemplateEmail({
      to: teacher.email,
      organizationId: org.id,
      slug: "leave_status_update",
      context: contextEmail,
      branchId,
    });
    console.log(`✅ Leave status update sent to ${teacher.email} (${leave.status})`);
  } catch (error) {
    console.error("❌ Failed to send leave status update notification:", error);
  }
}

// ─── Service functions ──────────────────────────────────────────────

// Get leaves (admin: all, teacher: own) – scoped to branch & FY
export async function getLeaves({
  teacherId = null,
  pageParam = 0,
  filters = {},
  branchId,
  financialYearId,
} = {}) {
  const limit = 10;
  const from = pageParam * limit;
  const to = from + limit - 1;

  let query = supabase
    .from("leaves")
    .select(`*, teachers(first_name, last_name, employee_code)`, { count: "exact" })
    .order("created_at", { ascending: false })
    .range(from, to);

  // Scope by branch and financial year
  if (branchId) query = query.eq("branch_id", branchId);
  if (financialYearId) query = query.eq("financial_year_id", financialYearId);

  if (teacherId) query = query.eq("teacher_id", teacherId);
  if (filters.status) query = query.eq("status", filters.status);

  const { data, error, count } = await query;
  if (error) throw error;
  return { data, count };
}

// context: { branchId, financialYearId }
export async function createLeave(payload, context) {
  const { branchId, financialYearId } = context;
  const { data, error } = await supabase
    .from("leaves")
    .insert([{ ...payload, branch_id: branchId, financial_year_id: financialYearId }])
    .select()
    .single();
  if (error) throw error;

  // ─── Send notification to admins ──────────────────────────
  await sendLeaveSubmittedNotification(data, context);

  return data;
}

// context: { branchId, financialYearId } – update scoped to prevent cross‑branch changes
export async function updateLeaveStatus(id, status, adminRemarks = "", context) {
  const { branchId, financialYearId } = context;

  // Fetch current leave details (for email)
  let fetchQuery = supabase
    .from("leaves")
    .select("*")
    .eq("id", id);
  if (branchId) fetchQuery = fetchQuery.eq("branch_id", branchId);
  if (financialYearId) fetchQuery = fetchQuery.eq("financial_year_id", financialYearId);
  const { data: current, error: fetchError } = await fetchQuery.single();
  if (fetchError) throw fetchError;

  let query = supabase
    .from("leaves")
    .update({
      status,
      admin_remarks: adminRemarks,
      branch_id: branchId,
      financial_year_id: financialYearId,
    })
    .eq("id", id);

  if (branchId) query = query.eq("branch_id", branchId);
  if (financialYearId) query = query.eq("financial_year_id", financialYearId);

  const { data, error } = await query.select().single();
  if (error) throw error;

  // ─── Send status update to teacher ──────────────────────────
  // Only send if status changed (old vs new)
  if (current.status !== status) {
    // Use the updated data (which includes new status)
    await sendLeaveStatusUpdateNotification(data, context);
  }

  return data;
}