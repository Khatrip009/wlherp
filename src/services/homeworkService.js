// src/services/homeworkService.js
import { supabase } from "../api/supabase";
import { sendTemplateEmail } from "./emailService"; // 👈 Added

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

/**
 * Send homework assignment emails to all active students in the batch.
 */
async function sendHomeworkAssignmentEmails(homeworkId, context) {
  const { branchId, financialYearId } = context;
  try {
    // 1. Fetch homework details with batch, subject, and teacher
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

    // 2. Fetch all active students in the batch
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

    // 3. Fetch organization details
    const org = await getOrganizationFromBranch(branchId);

    // 4. For each student, find parent email or fallback to student email
    for (const sb of studentBatches) {
      const student = sb.students;
      let recipientEmail = student.email;

      // Try to find a parent
      const { data: parent, error: parentError } = await supabase
        .from("student_parents")
        .select("parents!inner(email, father_name, mother_name)")
        .eq("student_id", student.id)
        .maybeSingle();
      if (!parentError && parent && parent.parents && parent.parents.email) {
        recipientEmail = parent.parents.email;
      }

      // Build context for this student
      const contextEmail = {
        academyName: org.company_name,
        batch_name: homework.batches?.batch_name || '',
        subject_name: homework.subjects?.subject_name || '',
        title: homework.title,
        description: homework.description || '',
        due_date: homework.due_date,
        attachment_url: homework.attachment_url || '',
      };

      // Send email
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
    // Email failure should not block homework creation – log the error
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

  // Scope to current branch & FY – WITHOUT table prefix
  if (branchId) query = query.eq("branch_id", branchId);
  if (financialYearId) query = query.eq("financial_year_id", financialYearId);

  // Apply filters
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

  // Scope to current branch & FY – WITHOUT table prefix
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

// context: { branchId, financialYearId }
export async function createHomework(payload, context) {
  const { branchId, financialYearId } = context;
  const { data, error } = await supabase
    .from("homework")
    .insert([{ ...payload, branch_id: branchId, financial_year_id: financialYearId }])
    .select()
    .single();
  if (error) throw error;

  // ─── Send homework assignment emails ──────────────────────────
  await sendHomeworkAssignmentEmails(data.id, context);

  return data;
}

// context: { branchId, financialYearId }
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

// context: { branchId, financialYearId }
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

// ─── Submissions ──────────────────────────────────────────────────────

export async function getSubmissionsByHomework(homeworkId, branchId, financialYearId) {
  let query = supabase
    .from("homework_submissions")
    .select(
      `id, student_id, submission_file, submitted_at, remarks, marks, status,
      students(first_name, last_name, admission_no)`
    )
    .eq("homework_id", homeworkId)
    .order("submitted_at", { ascending: false });

  if (branchId) query = query.eq("homework_submissions.branch_id", branchId);
  if (financialYearId) query = query.eq("homework_submissions.financial_year_id", financialYearId);

  const { data, error } = await query;
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

export async function getBatchStudents(batchId, branchId, financialYearId) {
  let query = supabase
    .from("student_batches")
    .select("student_id, students(id, first_name, last_name, admission_no)")
    .eq("batch_id", batchId)
    .eq("status", "active");

  if (branchId) query = query.eq("student_batches.branch_id", branchId);
  if (financialYearId) query = query.eq("student_batches.financial_year_id", financialYearId);

  const { data, error } = await query;
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

// ─── Mediums (global) ────────────────────────────────────────────────

export async function getMediumOptions() {
  const { data, error } = await supabase
    .from("mediums")
    .select("id, name")
    .order("name");
  if (error) throw error;
  return data || [];
}