// src/services/batchService.js
import { supabase } from "../api/supabase";

// Paginated fetch with filters – now includes medium info
export async function getBatches({ pageParam = 0, filters = {} } = {}) {
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

  if (filters.search) {
    query = query.ilike("batch_name", `%${filters.search}%`);
  }
  if (filters.course_id) query = query.eq("course_id", filters.course_id);
  if (filters.medium_id) query = query.eq("medium_id", filters.medium_id);
  if (filters.teacher_id) {
    const { data: linkedBatches } = await supabase
      .from("batch_teachers")
      .select("batch_id")
      .eq("teacher_id", filters.teacher_id);
    const batchIds = linkedBatches?.map((r) => r.batch_id) || [];
    if (batchIds.length > 0) query = query.in("id", batchIds);
    else return { data: [], count: 0 };
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

export async function getAllBatchesForExport(filters = {}) {
  let query = supabase
    .from("batches")
    .select(`*, courses(course_name), mediums(name)`)
    .order("id", { ascending: false });

  if (filters.search) query = query.ilike("batch_name", `%${filters.search}%`);
  if (filters.course_id) query = query.eq("course_id", filters.course_id);
  if (filters.medium_id) query = query.eq("medium_id", filters.medium_id);
  if (filters.teacher_id) {
    const { data: linkedBatches } = await supabase
      .from("batch_teachers")
      .select("batch_id")
      .eq("teacher_id", filters.teacher_id);
    const batchIds = linkedBatches?.map((r) => r.batch_id) || [];
    if (batchIds.length > 0) query = query.in("id", batchIds);
    else return [];
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
    // Delete existing (RLS allows based on org/branch/FY)
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

export async function deleteBatch(id) {
  const { error } = await supabase
    .from("batches")
    .update({ deleted_at: new Date().toISOString() })
    .eq("id", id);
  if (error) throw error;

  await supabase
    .from("batch_teachers")
    .update({ deleted_at: new Date().toISOString() })
    .eq("batch_id", id);
}

export async function getCourseOptions() {
  const { data, error } = await supabase
    .from("courses")
    .select("id, course_name");
  if (error) throw error;
  return data || [];
}

export async function getTeacherOptions() {
  const { data, error } = await supabase
    .from("teachers")
    .select("id, first_name, last_name");
  if (error) throw error;
  return data || [];
}

// NEW – get mediums for filter dropdowns
export async function getMediumOptions() {
  const { data, error } = await supabase
    .from("mediums")
    .select("id, name")
    .order("name");
  if (error) throw error;
  return data || [];
}