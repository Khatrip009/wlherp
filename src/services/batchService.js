// src/services/batchService.js
import { supabase } from "../api/supabase";

// Paginated fetch with filters – now scoped by branch & FY
export async function getBatches({
  pageParam = 0,
  filters = {},
  branchId,
  financialYearId,
} = {}) {
  const limit = 10;
  const from = pageParam * limit;
  const to = from + limit - 1;

  let query = supabase
    .from("batches")
    .select(
      `*, 
       courses(course_name),
       mediums(name),
       teachers(first_name, last_name),
       batch_teachers(teacher_id, subject_id, day, teachers(first_name, last_name), subjects(subject_name))
      `,
      { count: "exact" }
    )
    .order("id", { ascending: false })
    .range(from, to);

  // Apply branch and FY scope (conditional)
  if (branchId) query = query.eq("branch_id", branchId);
  if (financialYearId) query = query.eq("financial_year_id", financialYearId);

  // Filters
  if (filters.search) {
    query = query.ilike("batch_name", `%${filters.search}%`);
  }
  if (filters.course_id) query = query.eq("course_id", filters.course_id);
  if (filters.medium_id) query = query.eq("medium_id", filters.medium_id);
  if (filters.teacher_id) {
    // Subquery to find batch_ids linked to the teacher, also scoped by branch/FY
    let subQuery = supabase
      .from("batch_teachers")
      .select("batch_id")
      .eq("teacher_id", filters.teacher_id);
    if (branchId) subQuery = subQuery.eq("branch_id", branchId);
    if (financialYearId) subQuery = subQuery.eq("financial_year_id", financialYearId);
    const { data: linkedBatches } = await subQuery;
    const batchIds = linkedBatches?.map((r) => r.batch_id) || [];
    if (batchIds.length > 0) {
      query = query.in("id", batchIds);
    } else {
      return { data: [], count: 0 };
    }
  }
  if (filters.status) query = query.eq("status", filters.status);

  const { data, error, count } = await query;
  if (error) throw error;

  const enriched = (data || []).map((batch) => ({
    ...batch,
    medium_name: batch.mediums?.name || "",
    assigned_teachers: (batch.batch_teachers || []).map((bt) => ({
      teacher_id: bt.teacher_id,
      teacher_name: bt.teachers
        ? `${bt.teachers.first_name} ${bt.teachers.last_name}`
        : null,
      subject_id: bt.subject_id,
      subject_name: bt.subjects?.subject_name || null,
      day: bt.day,
    })),
  }));

  return { data: enriched, count };
}

// Export all (unpaginated) with same scoping
export async function getAllBatchesForExport(
  filters = {},
  branchId,
  financialYearId
) {
  let query = supabase
    .from("batches")
    .select(`*, courses(course_name), mediums(name)`)
    .order("id", { ascending: false });

  // Scope
  if (branchId) query = query.eq("branch_id", branchId);
  if (financialYearId) query = query.eq("financial_year_id", financialYearId);

  // Filters
  if (filters.search) query = query.ilike("batch_name", `%${filters.search}%`);
  if (filters.course_id) query = query.eq("course_id", filters.course_id);
  if (filters.medium_id) query = query.eq("medium_id", filters.medium_id);
  if (filters.teacher_id) {
    let subQuery = supabase
      .from("batch_teachers")
      .select("batch_id")
      .eq("teacher_id", filters.teacher_id);
    if (branchId) subQuery = subQuery.eq("branch_id", branchId);
    if (financialYearId) subQuery = subQuery.eq("financial_year_id", financialYearId);
    const { data: linkedBatches } = await subQuery;
    const batchIds = linkedBatches?.map((r) => r.batch_id) || [];
    if (batchIds.length > 0) {
      query = query.in("id", batchIds);
    } else {
      return [];
    }
  }
  if (filters.status) query = query.eq("status", filters.status);

  const { data, error } = await query;
  if (error) throw error;
  return data || [];
}

// context = { branchId, financialYearId }
export async function createBatch(payload, context) {
  const { teacher_subjects, teacher_id, ...batchData } = payload;
  console.log("Creating batch with payload:", payload);

  const { branchId, financialYearId } = context;

  // medium_id is already part of batchData (spread from form)
  const { data: batch, error } = await supabase
    .from("batches")
    .insert([{
      ...batchData,
      teacher_id: teacher_id || null,
      branch_id: branchId,
      financial_year_id: financialYearId,
    }])
    .select()
    .single();
  if (error) throw error;

  await syncBatchTeachers(batch.id, teacher_subjects, teacher_id, context);
  return batch;
}

// context = { branchId, financialYearId }
export async function updateBatch(id, payload, context) {
  const { teacher_subjects, teacher_id, ...batchData } = payload;
  console.log("Updating batch", id, "with payload:", payload);

  const { branchId, financialYearId } = context;

  // medium_id is part of batchData
  const { data: batch, error } = await supabase
    .from("batches")
    .update({
      ...batchData,
      teacher_id: teacher_id || null,
      branch_id: branchId,
      financial_year_id: financialYearId,
    })
    .eq("id", id)
    .select()
    .single();
  if (error) throw error;

  await syncBatchTeachers(id, teacher_subjects, teacher_id, context);
  return batch;
}

// Internal helper – handles batch_teachers with branch & FY
async function syncBatchTeachers(batchId, teacherSubjects, singleTeacherId, context) {
  const { branchId, financialYearId } = context || {};
  if (teacherSubjects !== undefined) {
    console.log("Syncing teacher_subjects for batch", batchId, teacherSubjects);
    // Delete existing (scoped by batch_id – fine because only batch_id is needed)
    await supabase.from("batch_teachers").delete().eq("batch_id", batchId);
    const links = teacherSubjects
      .filter((ts) => ts.teacher_id)
      .map((ts) => ({
        batch_id: batchId,
        teacher_id: ts.teacher_id,
        subject_id: ts.subject_id || null,
        day: ts.day || null,
        branch_id: branchId,
        financial_year_id: financialYearId,
      }));
    if (links.length > 0) {
      console.log("Inserting links:", links);
      const { error: linkError } = await supabase
        .from("batch_teachers")
        .insert(links);
      if (linkError) {
        console.error("Link insert error:", linkError);
        throw linkError;
      }
    }
  } else if (singleTeacherId !== undefined) {
    await supabase.from("batch_teachers").delete().eq("batch_id", batchId);
    if (singleTeacherId) {
      const { error: linkError } = await supabase
        .from("batch_teachers")
        .insert({
          batch_id: batchId,
          teacher_id: singleTeacherId,
          branch_id: branchId,
          financial_year_id: financialYearId,
        });
      if (linkError) throw linkError;
    }
  }
}

// Soft delete now scoped to prevent cross-branch tampering
export async function deleteBatch(id, branchId, financialYearId) {
  // Scope the soft-delete on batches
  let batchQuery = supabase
    .from("batches")
    .update({ deleted_at: new Date().toISOString() })
    .eq("id", id);
  if (branchId) batchQuery = batchQuery.eq("branch_id", branchId);
  if (financialYearId) batchQuery = batchQuery.eq("financial_year_id", financialYearId);
  const { error } = await batchQuery;
  if (error) throw error;

  // Soft-delete associated batch_teachers (scoped similarly)
  let teacherQuery = supabase
    .from("batch_teachers")
    .update({ deleted_at: new Date().toISOString() })
    .eq("batch_id", id);
  if (branchId) teacherQuery = teacherQuery.eq("branch_id", branchId);
  if (financialYearId) teacherQuery = teacherQuery.eq("financial_year_id", financialYearId);
  await teacherQuery;
}

// Organisation-wide (no branch/FY needed – assume tables have no such columns)
export async function getCourseOptions() {
  const { data, error } = await supabase
    .from("courses")
    .select("id, course_name");
  if (error) throw error;
  return data || [];
}

// Teacher options now scoped to branch (if the table includes branch_id / financial_year_id)
export async function getTeacherOptions(branchId, financialYearId) {
  let query = supabase
    .from("teachers")
    .select("id, first_name, last_name");

  if (branchId) query = query.eq("branch_id", branchId);
  if (financialYearId) query = query.eq("financial_year_id", financialYearId);

  const { data, error } = await query;
  if (error) throw error;
  return data || [];
}

// Mediums – organisation-wide (no branch/FY)
export async function getMediumOptions() {
  const { data, error } = await supabase
    .from("mediums")
    .select("id, name")
    .order("name");
  if (error) throw error;
  return data || [];
}

// Active batches (scoped) – used for dropdowns and reports
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