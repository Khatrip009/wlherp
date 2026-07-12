// src/services/batchAssignmentService.js
import { supabase } from "../api/supabase";

// ------------------------------------------------------------
// PAGINATED LIST
// ------------------------------------------------------------
export async function getStudentBatches({
  pageParam = 0,
  filters = {},
  branchId,
  financialYearId,
} = {}) {
  const limit = 10;
  const from = pageParam * limit;
  const to = from + limit - 1;

  let query = supabase
    .from("student_batches")
    .select(
      `
      id,
      student_id,
      batch_id,
      enrollment_date,
      status,
      students ( first_name, last_name, admission_no ),
      batches ( batch_name, course_id, medium_id, mediums(name), courses ( course_name ) )
      `,
      { count: "exact" }
    )
    .order("enrollment_date", { ascending: false })
    .range(from, to);

  // Safe scope – use column name without table prefix for main table
  if (branchId) query = query.eq("branch_id", branchId);
  if (financialYearId) query = query.eq("financial_year_id", financialYearId);

  // Apply text search on student name
  if (filters.search) {
    query = query.or(
      `students.first_name.ilike.%${filters.search}%,students.last_name.ilike.%${filters.search}%`
    );
  }
  // Direct batch filter
  if (filters.batch_id) query = query.eq("batch_id", filters.batch_id);

  // Course filter – restrict to batches of that course (still within branch & FY)
  if (filters.course_id) {
    let batchQuery = supabase
      .from("batches")
      .select("id")
      .eq("course_id", filters.course_id);
    if (branchId) batchQuery = batchQuery.eq("branch_id", branchId);
    if (financialYearId) batchQuery = batchQuery.eq("financial_year_id", financialYearId);
    const { data: courseBatches } = await batchQuery;
    const batchIds = courseBatches?.map((b) => b.id) || [];
    if (batchIds.length > 0) query = query.in("batch_id", batchIds);
    else return { data: [], count: 0 };
  }

  // Medium filter – similar scoping
  if (filters.medium_id) {
    let mediumQuery = supabase
      .from("batches")
      .select("id")
      .eq("medium_id", filters.medium_id);
    if (branchId) mediumQuery = mediumQuery.eq("branch_id", branchId);
    if (financialYearId) mediumQuery = mediumQuery.eq("financial_year_id", financialYearId);
    const { data: mediumBatches } = await mediumQuery;
    const batchIds = mediumBatches?.map((b) => b.id) || [];
    if (batchIds.length > 0) query = query.in("batch_id", batchIds);
    else return { data: [], count: 0 };
  }

  if (filters.status) query = query.eq("status", filters.status);

  const { data, error, count } = await query;
  if (error) throw error;
  return { data, count };
}

// ------------------------------------------------------------
// EXPORT (unpaginated, same filters)
// ------------------------------------------------------------
export async function getAllStudentBatchesForExport({
  filters = {},
  branchId,
  financialYearId,
} = {}) {
  let query = supabase
    .from("student_batches")
    .select(
      `
      id,
      student_id,
      batch_id,
      enrollment_date,
      status,
      students ( first_name, last_name, admission_no ),
      batches ( batch_name, course_id, medium_id, mediums(name), courses ( course_name ) )
      `
    )
    .order("enrollment_date", { ascending: false });

  // Safe scope
  if (branchId) query = query.eq("branch_id", branchId);
  if (financialYearId) query = query.eq("financial_year_id", financialYearId);

  if (filters.search) {
    query = query.or(
      `students.first_name.ilike.%${filters.search}%,students.last_name.ilike.%${filters.search}%`
    );
  }
  if (filters.batch_id) query = query.eq("batch_id", filters.batch_id);

  if (filters.course_id) {
    let batchQuery = supabase
      .from("batches")
      .select("id")
      .eq("course_id", filters.course_id);
    if (branchId) batchQuery = batchQuery.eq("branch_id", branchId);
    if (financialYearId) batchQuery = batchQuery.eq("financial_year_id", financialYearId);
    const { data: courseBatches } = await batchQuery;
    const batchIds = courseBatches?.map((b) => b.id) || [];
    if (batchIds.length > 0) query = query.in("batch_id", batchIds);
    else return [];
  }

  if (filters.medium_id) {
    let mediumQuery = supabase
      .from("batches")
      .select("id")
      .eq("medium_id", filters.medium_id);
    if (branchId) mediumQuery = mediumQuery.eq("branch_id", branchId);
    if (financialYearId) mediumQuery = mediumQuery.eq("financial_year_id", financialYearId);
    const { data: mediumBatches } = await mediumQuery;
    const batchIds = mediumBatches?.map((b) => b.id) || [];
    if (batchIds.length > 0) query = query.in("batch_id", batchIds);
    else return [];
  }

  if (filters.status) query = query.eq("status", filters.status);

  const { data, error } = await query;
  if (error) throw error;
  return data || [];
}

// ------------------------------------------------------------
// WRITE OPERATIONS (already used context, no change needed)
// ------------------------------------------------------------

// context: { branchId, financialYearId }
export async function assignStudentToBatch(payload, context) {
  const { branchId, financialYearId } = context;
  const enrichedPayload = {
    ...payload,
    branch_id: branchId,
    financial_year_id: financialYearId,
  };
  const { data, error } = await supabase
    .from("student_batches")
    .insert([enrichedPayload])
    .select()
    .single();
  if (error) throw error;
  return data;
}

// context: { branchId, financialYearId }
export async function bulkAssignStudents(batchId, studentIds, enrollmentDate, context) {
  const { branchId, financialYearId } = context;
  const payload = studentIds.map((sid) => ({
    student_id: sid,
    batch_id: batchId,
    enrollment_date: enrollmentDate,
    status: "active",
    branch_id: branchId,
    financial_year_id: financialYearId,
  }));

  const { error } = await supabase.from("student_batches").insert(payload);
  if (error) throw error;
}

// context: { branchId, financialYearId }
export async function updateStudentBatch(id, payload, context) {
  const { branchId, financialYearId } = context;
  const enrichedPayload = {
    ...payload,
    branch_id: branchId,
    financial_year_id: financialYearId,
  };
  const { data, error } = await supabase
    .from("student_batches")
    .update(enrichedPayload)
    .eq("id", id)
    .select()
    .single();
  if (error) throw error;
  return data;
}

// ------------------------------------------------------------
// DELETE – now scoped to prevent cross‑branch deletion
// ------------------------------------------------------------
export async function deleteStudentBatch(id, branchId, financialYearId) {
  let query = supabase
    .from("student_batches")
    .delete()
    .eq("id", id);

  if (branchId) query = query.eq("branch_id", branchId);
  if (financialYearId) query = query.eq("financial_year_id", financialYearId);

  const { error } = await query;
  if (error) throw error;
}

// ------------------------------------------------------------
// DROPDOWNS – now scoped
// ------------------------------------------------------------
export async function getActiveStudents(branchId, financialYearId) {
  let query = supabase
    .from("students")
    .select("id, first_name, last_name, admission_no")
    .eq("status", "active")
    .order("first_name");

  if (branchId) query = query.eq("branch_id", branchId);
  if (financialYearId) query = query.eq("financial_year_id", financialYearId);

  const { data, error } = await query;
  if (error) throw error;
  return data;
}

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
  return data;
}

// Courses – organisation‑wide, no branch/FY filter needed
export async function getCoursesForFilter() {
  const { data, error } = await supabase
    .from("courses")
    .select("id, course_name")
    .order("course_name");
  if (error) throw error;
  return data;
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