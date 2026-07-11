// src/services/batchAssignmentService.js
import { supabase } from "../api/supabase";

// Get paginated assignments with joins and filters
export async function getStudentBatches({ pageParam = 0, filters = {} } = {}) {
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

  if (filters.search) {
    query = query.or(
      `students.first_name.ilike.%${filters.search}%,students.last_name.ilike.%${filters.search}%`
    );
  }
  if (filters.batch_id) query = query.eq("batch_id", filters.batch_id);
  if (filters.course_id) {
    const { data: courseBatches } = await supabase
      .from("batches")
      .select("id")
      .eq("course_id", filters.course_id);
    const batchIds = courseBatches?.map((b) => b.id) || [];
    if (batchIds.length > 0) query = query.in("batch_id", batchIds);
    else return { data: [], count: 0 };
  }
  if (filters.medium_id) {
    const { data: mediumBatches } = await supabase
      .from("batches")
      .select("id")
      .eq("medium_id", filters.medium_id);
    const batchIds = mediumBatches?.map((b) => b.id) || [];
    if (batchIds.length > 0) query = query.in("batch_id", batchIds);
    else return { data: [], count: 0 };
  }
  if (filters.status) query = query.eq("status", filters.status);

  const { data, error, count } = await query;
  if (error) throw error;
  return { data, count };
}

// Export all assignments (unpaginated)
export async function getAllStudentBatchesForExport(filters = {}) {
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

  if (filters.search) {
    query = query.or(
      `students.first_name.ilike.%${filters.search}%,students.last_name.ilike.%${filters.search}%`
    );
  }
  if (filters.batch_id) query = query.eq("batch_id", filters.batch_id);
  if (filters.course_id) {
    const { data: courseBatches } = await supabase
      .from("batches")
      .select("id")
      .eq("course_id", filters.course_id);
    const batchIds = courseBatches?.map((b) => b.id) || [];
    if (batchIds.length > 0) query = query.in("batch_id", batchIds);
    else return [];
  }
  if (filters.medium_id) {
    const { data: mediumBatches } = await supabase
      .from("batches")
      .select("id")
      .eq("medium_id", filters.medium_id);
    const batchIds = mediumBatches?.map((b) => b.id) || [];
    if (batchIds.length > 0) query = query.in("batch_id", batchIds);
    else return [];
  }
  if (filters.status) query = query.eq("status", filters.status);

  const { data, error } = await query;
  if (error) throw error;
  return data || [];
}

// Single assignment
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

// Bulk assignment
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

// Update an assignment
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

// Delete assignment (RLS will check branch & FY)
export async function deleteStudentBatch(id) {
  const { error } = await supabase
    .from("student_batches")
    .delete()
    .eq("id", id);
  if (error) throw error;
}

// Get active students for dropdown
export async function getActiveStudents() {
  const { data, error } = await supabase
    .from("students")
    .select("id, first_name, last_name, admission_no")
    .eq("status", "active")
    .order("first_name");
  if (error) throw error;
  return data;
}

// Get active batches for dropdown
export async function getActiveBatches() {
  const { data, error } = await supabase
    .from("batches")
    .select("id, batch_name")
    .eq("status", "active")
    .order("batch_name");
  if (error) throw error;
  return data;
}

// Get courses for filter dropdown
export async function getCoursesForFilter() {
  const { data, error } = await supabase
    .from("courses")
    .select("id, course_name")
    .order("course_name");
  if (error) throw error;
  return data;
}

// Get mediums for filter dropdown
export async function getMediumOptions() {
  const { data, error } = await supabase
    .from("mediums")
    .select("id, name")
    .order("name");
  if (error) throw error;
  return data || [];
}