// src/services/leaveService.js
import { supabase } from "../api/supabase";

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
  return data;
}

// context: { branchId, financialYearId } – update scoped to prevent cross‑branch changes
export async function updateLeaveStatus(id, status, adminRemarks = "", context) {
  const { branchId, financialYearId } = context;

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
  return data;
}