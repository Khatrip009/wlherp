// src/services/progressService.js
import { supabase } from "../api/supabase";

// Paginated fetch with filters – now scoped to branch & FY
export async function getProgressEvaluations({ pageParam = 0, filters = {}, branchId, financialYearId } = {}) {
  const limit = 10;
  const from = pageParam * limit;
  const to = from + limit - 1;

  let query = supabase
    .from("student_progress")
    .select(
      `*,
      students!inner( first_name, last_name, admission_no ),
      batches!inner( batch_name, course_id, medium_id, mediums(name), courses ( course_name ) )`,
      { count: "exact" }
    )
    .order("evaluation_date", { ascending: false })
    .range(from, to);

  // Scope main table
  if (branchId) query = query.eq("student_progress.branch_id", branchId);
  if (financialYearId) query = query.eq("student_progress.financial_year_id", financialYearId);

  if (filters.batchId) query = query.eq("batch_id", filters.batchId);
  if (filters.medium_id) {
    // Subquery on batches – scope it
    let mediumSub = supabase
      .from("batches")
      .select("id")
      .eq("medium_id", filters.medium_id);
    if (branchId) mediumSub = mediumSub.eq("branch_id", branchId);
    if (financialYearId) mediumSub = mediumSub.eq("financial_year_id", financialYearId);
    const { data: mediumBatches } = await mediumSub;
    const batchIds = mediumBatches?.map((b) => b.id) || [];
    if (batchIds.length > 0) query = query.in("batch_id", batchIds);
    else return { data: [], count: 0 };
  }
  if (filters.search) {
    query = query.or(
      `students.first_name.ilike.%${filters.search}%,students.last_name.ilike.%${filters.search}%`
    );
  }
  if (filters.startDate) query = query.gte("evaluation_date", filters.startDate);
  if (filters.endDate) query = query.lte("evaluation_date", filters.endDate);

  const { data, error, count } = await query;
  if (error) throw error;

  // Flatten medium name
  const enriched = (data || []).map((item) => ({
    ...item,
    medium_name: item.batches?.mediums?.name || "",
  }));

  return { data: enriched, count };
}

// Export all evaluations matching filters – scoped
export async function getAllProgressEvaluationsForExport(filters = {}, branchId, financialYearId) {
  let query = supabase
    .from("student_progress")
    .select(
      `*,
      students!inner( first_name, last_name, admission_no ),
      batches!inner( batch_name, course_id, medium_id, mediums(name), courses ( course_name ) )`
    )
    .order("evaluation_date", { ascending: false });

  // Scope
  if (branchId) query = query.eq("student_progress.branch_id", branchId);
  if (financialYearId) query = query.eq("student_progress.financial_year_id", financialYearId);

  if (filters.batchId) query = query.eq("batch_id", filters.batchId);
  if (filters.medium_id) {
    let mediumSub = supabase
      .from("batches")
      .select("id")
      .eq("medium_id", filters.medium_id);
    if (branchId) mediumSub = mediumSub.eq("branch_id", branchId);
    if (financialYearId) mediumSub = mediumSub.eq("financial_year_id", financialYearId);
    const { data: mediumBatches } = await mediumSub;
    const batchIds = mediumBatches?.map((b) => b.id) || [];
    if (batchIds.length > 0) query = query.in("batch_id", batchIds);
    else return [];
  }
  if (filters.search) {
    query = query.or(
      `students.first_name.ilike.%${filters.search}%,students.last_name.ilike.%${filters.search}%`
    );
  }
  if (filters.startDate) query = query.gte("evaluation_date", filters.startDate);
  if (filters.endDate) query = query.lte("evaluation_date", filters.endDate);

  const { data, error } = await query;
  if (error) throw error;
  return (data || []).map((item) => ({
    ...item,
    medium_name: item.batches?.mediums?.name || "",
  }));
}

// CRUD – context: { branchId, financialYearId }
export async function createProgressEvaluation(payload, context) {
  const { branchId, financialYearId } = context;
  const { data, error } = await supabase
    .from("student_progress")
    .insert([{ ...payload, branch_id: branchId, financial_year_id: financialYearId }])
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function updateProgressEvaluation(id, payload, context) {
  const { branchId, financialYearId } = context;
  let query = supabase
    .from("student_progress")
    .update({ ...payload, branch_id: branchId, financial_year_id: financialYearId })
    .eq("id", id);

  // Scope to prevent cross‑branch edits
  if (branchId) query = query.eq("branch_id", branchId);
  if (financialYearId) query = query.eq("financial_year_id", financialYearId);

  const { data, error } = await query.select().single();
  if (error) throw error;
  return data;
}

// Hard delete – now scoped
export async function deleteProgressEvaluation(id, branchId, financialYearId) {
  let query = supabase
    .from("student_progress")
    .delete()
    .eq("id", id);

  if (branchId) query = query.eq("branch_id", branchId);
  if (financialYearId) query = query.eq("financial_year_id", financialYearId);

  const { error } = await query;
  if (error) throw error;
}

// Dropdowns
export async function getActiveBatches(branchId, financialYearId) {
  let query = supabase
    .from("batches")
    .select("id, batch_name")
    .eq("status", "active")
    .order("batch_name");

  if (branchId) query = query.eq("branch_id", branchId);
  if (financialYearId) query = query.eq("financial_year_id", financialYearId);

  const { data, error } = await query;
  if (error) throw error;
  return data || [];
}

export async function getStudentsByBatch(batchId, branchId, financialYearId) {
  let query = supabase
    .from("student_batches")
    .select("student_id, students( id, first_name, last_name, admission_no )")
    .eq("batch_id", batchId)
    .eq("status", "active");

  if (branchId) query = query.eq("branch_id", branchId);
  if (financialYearId) query = query.eq("financial_year_id", financialYearId);

  const { data, error } = await query;
  if (error) throw error;
  return data.map((item) => item.students);
}

// Mediums – organisation‑wide (no change)
export async function getMediumOptions() {
  const { data, error } = await supabase
    .from("mediums")
    .select("id, name")
    .order("name");
  if (error) throw error;
  return data || [];
}