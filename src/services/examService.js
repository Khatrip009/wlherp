// src/services/examService.js
import { supabase } from "../api/supabase";

// ============================
// EXAMS LIST (paginated, filters) – now includes medium & scoping
// ============================

export async function getExams({ pageParam = 0, filters = {}, branchId, financialYearId } = {}) {
  const limit = 10;
  const from = pageParam * limit;
  const to = from + limit - 1;

  let query = supabase
    .from("exams")
    .select(
      `*, batches(batch_name, course_id, medium_id, mediums(name), courses(course_name))`,
      { count: "exact" }
    )
    .order("exam_date", { ascending: false })
    .range(from, to);

  // Scope by branch & FY (main table)
  if (branchId) query = query.eq("branch_id", branchId);
  if (financialYearId) query = query.eq("financial_year_id", financialYearId);

  // Filters
  if (filters.search) {
    query = query.or(
      `exam_name.ilike.%${filters.search}%,batches.batch_name.ilike.%${filters.search}%`
    );
  }
  if (filters.batchId) query = query.eq("batch_id", filters.batchId);
  if (filters.courseId) {
    // Subquery on batches – scope it
    let batchSub = supabase
      .from("batches")
      .select("id")
      .eq("course_id", filters.courseId);
    if (branchId) batchSub = batchSub.eq("branch_id", branchId);
    if (financialYearId) batchSub = batchSub.eq("financial_year_id", financialYearId);
    const { data: courseBatches } = await batchSub;
    const batchIds = courseBatches?.map(b => b.id) || [];
    if (batchIds.length > 0) query = query.in("batch_id", batchIds);
    else return { data: [], count: 0 };
  }
  if (filters.medium_id) {
    let mediumSub = supabase
      .from("batches")
      .select("id")
      .eq("medium_id", filters.medium_id);
    if (branchId) mediumSub = mediumSub.eq("branch_id", branchId);
    if (financialYearId) mediumSub = mediumSub.eq("financial_year_id", financialYearId);
    const { data: mediumBatches } = await mediumSub;
    const batchIds = mediumBatches?.map(b => b.id) || [];
    if (batchIds.length > 0) query = query.in("batch_id", batchIds);
    else return { data: [], count: 0 };
  }
  if (filters.startDate) query = query.gte("exam_date", filters.startDate);
  if (filters.endDate) query = query.lte("exam_date", filters.endDate);

  const { data, error, count } = await query;
  if (error) throw error;

  // Flatten medium name for easier access
  const enriched = (data || []).map((exam) => ({
    ...exam,
    medium_name: exam.batches?.mediums?.name || "",
  }));

  return { data: enriched, count };
}

// ============================
// EXPORT (unpaginated) – scoped
// ============================
export async function getAllExamsForExport(filters = {}, branchId, financialYearId) {
  let query = supabase
    .from("exams")
    .select(`*, batches(batch_name, course_id, medium_id, mediums(name), courses(course_name))`)
    .order("exam_date", { ascending: false });

  // Scope
  if (branchId) query = query.eq("branch_id", branchId);
  if (financialYearId) query = query.eq("financial_year_id", financialYearId);

  if (filters.search) {
    query = query.or(
      `exam_name.ilike.%${filters.search}%,batches.batch_name.ilike.%${filters.search}%`
    );
  }
  if (filters.batchId) query = query.eq("batch_id", filters.batchId);
  if (filters.courseId) {
    let batchSub = supabase
      .from("batches")
      .select("id")
      .eq("course_id", filters.courseId);
    if (branchId) batchSub = batchSub.eq("branch_id", branchId);
    if (financialYearId) batchSub = batchSub.eq("financial_year_id", financialYearId);
    const { data: courseBatches } = await batchSub;
    const batchIds = courseBatches?.map(b => b.id) || [];
    if (batchIds.length > 0) query = query.in("batch_id", batchIds);
    else return [];
  }
  if (filters.medium_id) {
    let mediumSub = supabase
      .from("batches")
      .select("id")
      .eq("medium_id", filters.medium_id);
    if (branchId) mediumSub = mediumSub.eq("branch_id", branchId);
    if (financialYearId) mediumSub = mediumSub.eq("financial_year_id", financialYearId);
    const { data: mediumBatches } = await mediumSub;
    const batchIds = mediumBatches?.map(b => b.id) || [];
    if (batchIds.length > 0) query = query.in("batch_id", batchIds);
    else return [];
  }
  if (filters.startDate) query = query.gte("exam_date", filters.startDate);
  if (filters.endDate) query = query.lte("exam_date", filters.endDate);

  const { data, error } = await query;
  if (error) throw error;

  return (data || []).map((exam) => ({
    ...exam,
    medium_name: exam.batches?.mediums?.name || "",
  }));
}

// ============================
// CRUD – already uses context, adds scope to delete
// ============================
export async function createExam(payload, context) {
  const { branchId, financialYearId } = context;
  const { data, error } = await supabase
    .from("exams")
    .insert([{ ...payload, branch_id: branchId, financial_year_id: financialYearId }])
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function updateExam(id, payload, context) {
  const { branchId, financialYearId } = context;
  const { data, error } = await supabase
    .from("exams")
    .update({ ...payload, branch_id: branchId, financial_year_id: financialYearId })
    .eq("id", id)
    .select()
    .single();
  if (error) throw error;
  return data;
}

// Soft delete – now scoped to prevent cross‑branch deletion
export async function deleteExam(id, context) {
  const { branchId, financialYearId } = context;

  let query = supabase
    .from("exams")
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

// ============================
// RESULTS & MARKING HELPERS – scoped
// ============================

export async function getBatchStudents(batchId, branchId, financialYearId) {
  let query = supabase
    .from("student_batches")
    .select("student_id, students(id, first_name, last_name, admission_no)")
    .eq("batch_id", batchId)
    .eq("status", "active");

  if (branchId) query = query.eq("branch_id", branchId);
  if (financialYearId) query = query.eq("financial_year_id", financialYearId);

  const { data, error } = await query;
  if (error) throw error;
  return data.map((item) => item.students);
}

export async function getResultsByExam(examId, branchId, financialYearId) {
  if (!examId) return [];

  let query = supabase
    .from("student_results")
    .select(`*, students(first_name, last_name, admission_no)`)
    .eq("exam_id", examId)
    .order("marks_obtained", { ascending: false });

  if (branchId) query = query.eq("branch_id", branchId);
  if (financialYearId) query = query.eq("financial_year_id", financialYearId);

  const { data, error } = await query;
  if (error) throw error;
  return data || [];
}

// Save results – delete old marks now scoped; insert already includes branch & FY
export async function saveResults(examId, resultsPayload, context) {
  const { branchId, financialYearId } = context;

  // Delete existing marks for this exam – scoped
  let deleteQuery = supabase
    .from("student_results")
    .delete()
    .eq("exam_id", examId);

  if (branchId) deleteQuery = deleteQuery.eq("branch_id", branchId);
  if (financialYearId) deleteQuery = deleteQuery.eq("financial_year_id", financialYearId);

  const { error: deleteError } = await deleteQuery;
  if (deleteError) throw deleteError;

  if (resultsPayload.length === 0) return;

  const enrichedPayload = resultsPayload.map((r) => ({
    exam_id: examId,
    student_id: r.student_id,
    marks_obtained: r.marks_obtained,
    remarks: r.remarks || "",
    branch_id: branchId,
    financial_year_id: financialYearId,
  }));

  const { error: insertError } = await supabase
    .from("student_results")
    .insert(enrichedPayload);
  if (insertError) throw insertError;
}

export async function getExamById(id, branchId, financialYearId) {
  if (!id) throw new Error("Exam ID is required");

  let query = supabase
    .from("exams")
    .select(`*, batches(batch_name, course_id, courses(course_name))`)
    .eq("id", id);

  if (branchId) query = query.eq("branch_id", branchId);
  if (financialYearId) query = query.eq("financial_year_id", financialYearId);

  const { data, error } = await query.single();
  if (error) throw error;
  return data;
}

// ============================
// DROPDOWNS – scoped where needed
// ============================

export async function getBatchOptions(branchId, financialYearId) {
  let query = supabase
    .from("batches")
    .select("id, batch_name")
    .eq("status", "active");

  if (branchId) query = query.eq("branch_id", branchId);
  if (financialYearId) query = query.eq("financial_year_id", financialYearId);

  const { data, error } = await query;
  if (error) throw error;
  return data || [];
}

// Organisation‑wide – no change
export async function getCourseOptions() {
  const { data, error } = await supabase
    .from("courses")
    .select("id, course_name")
    .order("course_name");
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

export async function getAllExams(branchId, financialYearId) {
  let query = supabase
    .from("exams")
    .select(`*, batches(batch_name, course_id, courses(course_name))`)
    .order("exam_date", { ascending: false });

  if (branchId) query = query.eq("branch_id", branchId);
  if (financialYearId) query = query.eq("financial_year_id", financialYearId);

  const { data, error } = await query;
  if (error) throw error;
  return data || [];
}

export async function getStudentProgress(studentId, branchId, financialYearId) {
  let query = supabase
    .from("student_results")
    .select(
      `marks_obtained,
      exams!inner(
        id,
        exam_name,
        exam_date,
        total_marks,
        batches(course_id, courses(course_name))
      )`
    )
    .eq("student_id", studentId)
    .order("exam_date", { ascending: true, foreignTable: "exams" });

  // Scope both tables
  if (branchId) {
    query = query.eq("branch_id", branchId);
    query = query.eq("exams.branch_id", branchId);
  }
  if (financialYearId) {
    query = query.eq("financial_year_id", financialYearId);
    query = query.eq("exams.financial_year_id", financialYearId);
  }

  const { data: results, error } = await query;
  if (error) throw error;

  const grouped = {};
  results.forEach((r) => {
    const courseId = r.exams?.batches?.course_id;
    const courseName = r.exams?.batches?.courses?.course_name || "Unknown Course";
    if (!grouped[courseId]) {
      grouped[courseId] = {
        course_id: courseId,
        course_name: courseName,
        exams: [],
      };
    }
    grouped[courseId].exams.push({
      exam_id: r.exams.id,
      exam_name: r.exams.exam_name,
      exam_date: r.exams.exam_date,
      total_marks: r.exams.total_marks,
      marks_obtained: r.marks_obtained,
    });
  });

  return Object.values(grouped);
}