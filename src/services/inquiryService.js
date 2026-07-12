// src/services/inquiryService.js
import { supabase } from "../api/supabase";

// Paginated fetch with filters – now scoped by branch & FY
export async function getInquiries({ pageParam = 0, filters = {}, branchId, financialYearId } = {}) {
  const limit = 10;
  const from = pageParam * limit;
  const to = from + limit - 1;

  let query = supabase
    .from("inquiries")
    .select("*, mediums(name)", { count: "exact" })
    .order("created_at", { ascending: false })
    .range(from, to);

  // Scope by branch and financial year
  if (branchId) query = query.eq("branch_id", branchId);
  if (financialYearId) query = query.eq("financial_year_id", financialYearId);

  // Filters
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

  // Flatten medium name
  const enriched = (data || []).map((inq) => ({
    ...inq,
    medium_name: inq.mediums?.name || "",
  }));

  return { data: enriched, count };
}

// Export all inquiries matching filters – scoped
export async function getAllInquiriesForExport(filters = {}, branchId, financialYearId) {
  let query = supabase
    .from("inquiries")
    .select("*, mediums(name)")
    .order("created_at", { ascending: false });

  // Scope
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

// CRUD – context = { branchId, financialYearId }
export async function createInquiry(payload, context) {
  const { branchId, financialYearId } = context;
  const { data, error } = await supabase
    .from("inquiries")
    .insert([{ ...payload, branch_id: branchId, financial_year_id: financialYearId }])
    .select()
    .single();
  if (error) throw error;
  return data;
}

// Update – scoped to prevent cross-branch changes
export async function updateInquiry(id, payload, context) {
  const { branchId, financialYearId } = context;

  let query = supabase
    .from("inquiries")
    .update({ ...payload, branch_id: branchId, financial_year_id: financialYearId })
    .eq("id", id);

  if (branchId) query = query.eq("branch_id", branchId);
  if (financialYearId) query = query.eq("financial_year_id", financialYearId);

  const { data, error } = await query.select().single();
  if (error) throw error;
  return data;
}

// Soft delete – scoped
export async function deleteInquiry(id, context) {
  const { branchId, financialYearId } = context;

  let query = supabase
    .from("inquiries")
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

// Dropdown options for filters/form – organisation‑wide
export async function getCourseOptions() {
  const { data, error } = await supabase
    .from("courses")
    .select("id, course_name")
    .eq("status", true);
  if (error) throw error;
  return data || [];
}

// Mediums – organisation‑wide
export async function getMediumOptions() {
  const { data, error } = await supabase
    .from("mediums")
    .select("id, name")
    .order("name");
  if (error) throw error;
  return data || [];
}