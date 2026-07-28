// src/services/homeworkService.js
import { supabase } from "../api/supabase";
import { sendTemplateEmail } from "./emailService";

// ─── Helpers ──────────────────────────────────────────────────────────

async function getOrganizationFromBranch(branchId) {
  const { data: branch, error: branchError } = await supabase
    .from("branches")
    .select("organization_id")
    .eq("id", branchId)
    .single();
  if (branchError) throw branchError;

  const { data: org, error: orgError } = await supabase
    .from("organization")
    .select("id, company_name")
    .eq("id", branch.organization_id)
    .single();
  if (orgError) throw orgError;
  return org;
}

async function sendHomeworkAssignmentEmails(homeworkId, context) {
  const { branchId, financialYearId } = context;
  try {
    const { data: homework, error: hwError } = await supabase
      .from("homework")
      .select(`
        *,
        batches(batch_name),
        subjects(subject_name),
        teachers(first_name, last_name)
      `)
      .eq("id", homeworkId)
      .single();
    if (hwError) throw hwError;

    let studentQuery = supabase
      .from("student_batches")
      .select("student_id, students(first_name, last_name, email, branch_id)")
      .eq("batch_id", homework.batch_id)
      .eq("status", "active");
    if (branchId) studentQuery = studentQuery.eq("branch_id", branchId);
    if (financialYearId) studentQuery = studentQuery.eq("financial_year_id", financialYearId);

    const { data: studentBatches, error: studentError } = await studentQuery;
    if (studentError) throw studentError;
    if (!studentBatches || studentBatches.length === 0) {
      console.log(`No active students found for batch ${homework.batch_id}, skipping emails.`);
      return;
    }

    const org = await getOrganizationFromBranch(branchId);

    for (const sb of studentBatches) {
      const student = sb.students;
      let recipientEmail = student.email;

      const { data: parent, error: parentError } = await supabase
        .from("student_parents")
        .select("parents!inner(email, father_name, mother_name)")
        .eq("student_id", student.id)
        .maybeSingle();
      if (!parentError && parent && parent.parents && parent.parents.email) {
        recipientEmail = parent.parents.email;
      }

      const contextEmail = {
        academyName: org.company_name,
        batch_name: homework.batches?.batch_name || '',
        subject_name: homework.subjects?.subject_name || '',
        title: homework.title,
        description: homework.description || '',
        due_date: homework.due_date,
        attachment_url: homework.attachment_url || '',
      };

      await sendTemplateEmail({
        to: recipientEmail,
        organizationId: org.id,
        slug: "new_homework",
        context: contextEmail,
        branchId,
      });
    }
    console.log(`✅ Homework assignment emails sent to ${studentBatches.length} students for homework ${homeworkId}`);
  } catch (error) {
    console.error("❌ Failed to send homework assignment emails:", error);
  }
}

// ─── Paginated fetch with filters – scoped to branch & FY ──────────

export async function getHomeworks({
  pageParam = 0,
  filters = {},
  branchId,
  financialYearId,
} = {}) {
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

  if (branchId) query = query.eq("branch_id", branchId);
  if (financialYearId) query = query.eq("financial_year_id", financialYearId);

  if (filters.batchId) query = query.eq("batch_id", filters.batchId);
  if (filters.subjectId) query = query.eq("subject_id", filters.subjectId);
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
  if (filters.search) {
    query = query.or(
      `title.ilike.%${filters.search}%,description.ilike.%${filters.search}%`
    );
  }
  if (filters.startDate) query = query.gte("assigned_date", filters.startDate);
  if (filters.endDate) query = query.lte("assigned_date", filters.endDate);

  const { data, error, count } = await query;
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

  return { data: enriched, count };
}

// ─── Export all homework (unpaginated) ──────────────────────────────

export async function getAllHomeworksForExport({
  filters = {},
  branchId,
  financialYearId,
} = {}) {
  let query = supabase
    .from("homework")
    .select(
      `*,
      batches(batch_name, course_id, medium_id, mediums(name)),
      subjects(subject_name),
      teachers(first_name, last_name)`
    )
    .order("assigned_date", { ascending: false });

  if (branchId) query = query.eq("branch_id", branchId);
  if (financialYearId) query = query.eq("financial_year_id", financialYearId);

  if (filters.batchId) query = query.eq("batch_id", filters.batchId);
  if (filters.subjectId) query = query.eq("subject_id", filters.subjectId);
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

// ─── CRUD ──────────────────────────────────────────────────────────────

export async function createHomework(payload, context) {
  const { branchId, financialYearId } = context;
  const { data, error } = await supabase
    .from("homework")
    .insert([{ ...payload, branch_id: branchId, financial_year_id: financialYearId }])
    .select()
    .single();
  if (error) throw error;

  await sendHomeworkAssignmentEmails(data.id, context);
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

// ─── Submissions (SAFE – no table prefix, no embedded join) ──────────

export async function getSubmissionsByHomework(homeworkId, branchId, financialYearId) {
  // 1. Fetch submissions (no student details)
  let query = supabase
    .from("homework_submissions")
    .select("id, student_id, submission_file, submitted_at, remarks, marks, status")
    .eq("homework_id", homeworkId)
    .order("submitted_at", { ascending: false });

  // Use plain column names (no table prefix)
  if (branchId) query = query.eq("branch_id", branchId);
  if (financialYearId) query = query.eq("financial_year_id", financialYearId);

  const { data: submissions, error } = await query;
  if (error) throw error;
  if (!submissions || submissions.length === 0) return [];

  // 2. Fetch student details separately
  const studentIds = [...new Set(submissions.map(s => s.student_id).filter(Boolean))];
  let studentMap = {};
  if (studentIds.length > 0) {
    const { data: students } = await supabase
      .from("students")
      .select("id, first_name, last_name, admission_no")
      .in("id", studentIds);
    (students || []).forEach(s => { studentMap[s.id] = s; });
  }

  // 3. Merge student details into each submission
  return submissions.map(sub => ({
    ...sub,
    students: studentMap[sub.student_id] || null,
  }));
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

// ─── Dropdowns ────────────────────────────────────────────────────────

export async function getBatchOptions(branchId, financialYearId) {
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

export async function getSubjectsByCourse(courseId, branchId, financialYearId) {
  let query = supabase
    .from("subjects")
    .select("id, subject_name")
    .eq("course_id", courseId);

  if (branchId) query = query.eq("branch_id", branchId);
  if (financialYearId) query = query.eq("financial_year_id", financialYearId);

  const { data, error } = await query;
  if (error) throw error;
  return data || [];
}

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

// ─── Batch Students (SAFE two‑step pattern) ─────────────────────────

export async function getBatchStudents(batchId, branchId, financialYearId) {
  // 1. Get student IDs from the batch
  let sbQuery = supabase
    .from("student_batches")
    .select("student_id")
    .eq("batch_id", batchId)
    .eq("status", "active");

  if (branchId) sbQuery = sbQuery.eq("branch_id", branchId);
  if (financialYearId) sbQuery = sbQuery.eq("financial_year_id", financialYearId);

  const { data: studentBatches } = await sbQuery;
  const studentIds = (studentBatches || []).map(sb => sb.student_id).filter(Boolean);

  if (studentIds.length === 0) return [];

  // 2. Fetch student details
  const { data: students } = await supabase
    .from("students")
    .select("id, first_name, last_name, admission_no")
    .in("id", studentIds);

  return students || [];
}

// ─── Submit Homework ─────────────────────────────────────────────────

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

// ─── Mediums (global) ────────────────────────────────────────────────

export async function getMediumOptions() {
  const { data, error } = await supabase
    .from("mediums")
    .select("id, name")
    .order("name");
  if (error) throw error;
  return data || [];
}