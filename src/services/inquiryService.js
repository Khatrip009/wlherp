// src/services/inquiryService.js
import { supabase } from "../api/supabase";

// Paginated fetch with filters – now includes medium name
export async function getInquiries({ pageParam = 0, filters = {} } = {}) {
  const limit = 10;
  const from = pageParam * limit;
  const to = from + limit - 1;

  let query = supabase
    .from("inquiries")
    .select("*, mediums(name)", { count: "exact" })
    .order("created_at", { ascending: false })
    .range(from, to);

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

// Export all inquiries matching filters (for CSV) – now includes medium name
export async function getAllInquiriesForExport(filters = {}) {
  let query = supabase
    .from("inquiries")
    .select("*, mediums(name)")
    .order("created_at", { ascending: false });

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

export async function updateInquiry(id, payload, context) {
  const { branchId, financialYearId } = context;
  const { data, error } = await supabase
    .from("inquiries")
    .update({ ...payload, branch_id: branchId, financial_year_id: financialYearId })
    .eq("id", id)
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function deleteInquiry(id, context) {
  const { branchId, financialYearId } = context;
  const { error } = await supabase
    .from("inquiries")
    .update({
      deleted_at: new Date().toISOString(),
      branch_id: branchId,
      financial_year_id: financialYearId,
    })
    .eq("id", id);
  if (error) throw error;
}

// Dropdown options for filters/form
export async function getCourseOptions() {
  const { data, error } = await supabase
    .from("courses")
    .select("id, course_name")
    .eq("status", true);
  if (error) throw error;
  return data || [];
}

// NEW – get mediums for filter dropdown
export async function getMediumOptions() {
  const { data, error } = await supabase
    .from("mediums")
    .select("id, name")
    .order("name");
  if (error) throw error;
  return data || [];
}