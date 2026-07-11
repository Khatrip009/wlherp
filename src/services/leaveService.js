// src/services/leaveService.js
import { supabase } from "../api/supabase";

// Get leaves (admin: all, teacher: own)
export async function getLeaves({ teacherId = null, pageParam = 0, filters = {} } = {}) {
  const limit = 10;
  const from = pageParam * limit;
  const to = from + limit - 1;

  let query = supabase
    .from("leaves")
    .select(`*, teachers(first_name, last_name, employee_code)`, { count: "exact" })
    .order("created_at", { ascending: false })
    .range(from, to);

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

// context: { branchId, financialYearId }
export async function updateLeaveStatus(id, status, adminRemarks = "", context) {
  const { branchId, financialYearId } = context;
  const { data, error } = await supabase
    .from("leaves")
    .update({
      status,
      admin_remarks: adminRemarks,
      branch_id: branchId,
      financial_year_id: financialYearId,
    })
    .eq("id", id)
    .select()
    .single();
  if (error) throw error;
  return data;
}