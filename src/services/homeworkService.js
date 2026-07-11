// src/services/homeworkService.js
import { supabase } from "../api/supabase";

// Paginated fetch with filters – now includes medium name
export async function getHomeworks({ pageParam = 0, filters = {} } = {}) {
  const limit = 10;
  const from = pageParam * limit;
  const to = from + limit - 1;

  let query = supabase
    .from("homework")
    .select(
      `*,
      batches(batch_name, course_id, medium_id, mediums(name)),
      subjects(subject_name),
      teachers(first_name, last_name)`,
      { count: "exact" }
    )
    .order("assigned_date", { ascending: false })
    .range(from, to);

  // Apply filters
  if (filters.batchId) query = query.eq("batch_id", filters.batchId);
  if (filters.subjectId) query = query.eq("subject_id", filters.subjectId);
  if (filters.medium_id) {
    const { data: mediumBatches } = await supabase
      .from("batches")
      .select("id")
      .eq("medium_id", filters.medium_id);
    const batchIds = mediumBatches?.map((b) => b.id) || [];
    if (batchIds.length > 0) query = query.in("batch_id", batchIds);
    else return { data: [], count: 0 };
  }
  if (filters.search) {
    query = query.or(
      `title.ilike.%${filters.search}%,description.ilike.%${filters.search}%`
    );
  }
  if (filters.startDate) query = query.gte("assigned_date", filters.startDate);
  if (filters.endDate) query = query.lte("assigned_date", filters.endDate);

  const { data, error, count } = await query;
  if (error) throw error;

  // Enrich with submission count and flatten medium name
  const enriched = await Promise.all(
    data.map(async (hw) => {
      let subCount = 0;
      try {
        const { count, error: subError } = await supabase
          .from("homework_submissions")
          .select("*", { count: "exact", head: true })
          .eq("homework_id", hw.id);
        if (!subError) subCount = count || 0;
      } catch {}
      return {
        ...hw,
        medium_name: hw.batches?.mediums?.name || "",
        submission_count: subCount,
      };
    })
  );

  return { data: enriched, count };
}

// Export all homework matching filters (for CSV) – now includes medium name
export async function getAllHomeworksForExport(filters = {}) {
  let query = supabase
    .from("homework")
    .select(
      `*,
      batches(batch_name, course_id, medium_id, mediums(name)),
      subjects(subject_name),
      teachers(first_name, last_name)`
    )
    .order("assigned_date", { ascending: false });

  if (filters.batchId) query = query.eq("batch_id", filters.batchId);
  if (filters.subjectId) query = query.eq("subject_id", filters.subjectId);
  if (filters.medium_id) {
    const { data: mediumBatches } = await supabase
      .from("batches")
      .select("id")
      .eq("medium_id", filters.medium_id);
    const batchIds = mediumBatches?.map((b) => b.id) || [];
    if (batchIds.length > 0) query = query.in("batch_id", batchIds);
    else return [];
  }
  if (filters.search) {
    query = query.or(
      `title.ilike.%${filters.search}%,description.ilike.%${filters.search}%`
    );
  }
  if (filters.startDate) query = query.gte("assigned_date", filters.startDate);
  if (filters.endDate) query = query.lte("assigned_date", filters.endDate);

  const { data, error } = await query;
  if (error) throw error;

  const enriched = await Promise.all(
    data.map(async (hw) => {
      let subCount = 0;
      try {
        const { count, error: subError } = await supabase
          .from("homework_submissions")
          .select("*", { count: "exact", head: true })
          .eq("homework_id", hw.id);
        if (!subError) subCount = count || 0;
      } catch {}
      return {
        ...hw,
        medium_name: hw.batches?.mediums?.name || "",
        submission_count: subCount,
      };
    })
  );

  return enriched;
}

// CRUD – context = { branchId, financialYearId }
export async function createHomework(payload, context) {
  const { branchId, financialYearId } = context;
  const { data, error } = await supabase
    .from("homework")
    .insert([{ ...payload, branch_id: branchId, financial_year_id: financialYearId }])
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function updateHomework(id, payload, context) {
  const { branchId, financialYearId } = context;
  const { data, error } = await supabase
    .from("homework")
    .update({ ...payload, branch_id: branchId, financial_year_id: financialYearId })
    .eq("id", id)
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function deleteHomework(id, context) {
  const { branchId, financialYearId } = context;
  const { error } = await supabase
    .from("homework")
    .update({
      deleted_at: new Date().toISOString(),
      branch_id: branchId,
      financial_year_id: financialYearId,
    })
    .eq("id", id);
  if (error) throw error;
}

// Submissions
export async function getSubmissionsByHomework(homeworkId) {
  const { data, error } = await supabase
    .from("homework_submissions")
    .select(
      `id, student_id, submission_file, submitted_at, remarks, marks, status,
      students(first_name, last_name, admission_no)`
    )
    .eq("homework_id", homeworkId)
    .order("submitted_at", { ascending: false });
  if (error) throw error;
  return data;
}

export async function updateSubmission(id, payload, context) {
  const { branchId, financialYearId } = context;
  const { data, error } = await supabase
    .from("homework_submissions")
    .update({ ...payload, branch_id: branchId, financial_year_id: financialYearId })
    .eq("id", id)
    .select()
    .single();
  if (error) throw error;
  return data;
}

// Dropdowns
export async function getBatchOptions() {
  const { data, error } = await supabase
    .from("batches")
    .select("id, batch_name")
    .eq("status", "active")
    .order("batch_name");
  if (error) throw error;
  return data || [];
}

export async function getSubjectsByCourse(courseId) {
  const { data, error } = await supabase
    .from("subjects")
    .select("id, subject_name")
    .eq("course_id", courseId);
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

export async function getBatchStudents(batchId) {
  const { data, error } = await supabase
    .from("student_batches")
    .select("student_id, students(id, first_name, last_name, admission_no)")
    .eq("batch_id", batchId)
    .eq("status", "active");
  if (error) throw error;
  return data.map((item) => item.students);
}

export async function submitHomework({ homeworkId, studentId, file, remarks }, context) {
  const { branchId, financialYearId } = context;

  const fileExt = file.name.split(".").pop();
  const fileName = `${Date.now()}-${Math.random().toString(36).substring(2)}.${fileExt}`;
  const filePath = `homework-submissions/${studentId}/${homeworkId}/${fileName}`;

  const { error: uploadError } = await supabase.storage
    .from("ShreeVidhya_Academy")
    .upload(filePath, file, { cacheControl: "3600", upsert: false });
  if (uploadError) throw uploadError;

  const { data: urlData } = supabase.storage
    .from("ShreeVidhya_Academy")
    .getPublicUrl(filePath);
  const fileUrl = urlData.publicUrl;

  const { data, error } = await supabase
    .from("homework_submissions")
    .insert([
      {
        homework_id: homeworkId,
        student_id: studentId,
        submission_file: fileUrl,
        remarks: remarks || "",
        status: "Pending",
        branch_id: branchId,
        financial_year_id: financialYearId,
      },
    ])
    .select()
    .single();
  if (error) throw error;
  return data;
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