// src/services/batchAssignmentService.js
import { supabase } from "../api/supabase";
import { sendTemplateEmail } from "./emailService"; // 👈 Added

// ------------------------------------------------------------
// Helper: send batch change email for a student
// ------------------------------------------------------------
async function sendBatchChangeEmail({
  studentId,
  newBatchId,
  branchId,
  financialYearId,
  oldBatchId = null, // optionally pass to avoid fetching
}) {
  try {
    // 1. Fetch student details
    const { data: student, error: studentError } = await supabase
      .from("students")
      .select("first_name, last_name, email, admission_no")
      .eq("id", studentId)
      .single();
    if (studentError) throw studentError;

    // 2. Fetch parent email (prefer parent, fallback to student email)
    const { data: parent, error: parentError } = await supabase
      .from("student_parents")
      .select("parents!inner(email, father_name, mother_name)")
      .eq("student_id", studentId)
      .maybeSingle();
    // parentError is ignored – we just may not have a parent

    let parentEmail = student.email; // fallback
    let parentName = student.first_name; // fallback
    if (parent && parent.parents) {
      parentEmail = parent.parents.email || student.email;
      parentName = parent.parents.father_name || parent.parents.mother_name || student.first_name;
    }

    // 3. Fetch new batch details
    const { data: newBatch, error: batchError } = await supabase
      .from("batches")
      .select("batch_name, course_id, courses(course_name), branch_id")
      .eq("id", newBatchId)
      .single();
    if (batchError) throw batchError;

    // 4. Fetch organization details from branch
    const { data: branch, error: branchError } = await supabase
      .from("branches")
      .select("organization_id")
      .eq("id", branchId)
      .single();
    if (branchError) throw branchError;

    const { data: org, error: orgError } = await supabase
      .from("organization")
      .select("company_name, id")
      .eq("id", branch.organization_id)
      .single();
    if (orgError) throw orgError;

    // 5. Fetch old batch name (if oldBatchId is not provided, try to find current active batch)
    let oldBatchName = "None";
    if (oldBatchId) {
      const { data: oldBatch } = await supabase
        .from("batches")
        .select("batch_name")
        .eq("id", oldBatchId)
        .single();
      if (oldBatch) oldBatchName = oldBatch.batch_name;
    } else {
      // Try to find an active batch for this student (excluding the new one)
      const { data: currentBatch } = await supabase
        .from("student_batches")
        .select("batch_id, batches(batch_name)")
        .eq("student_id", studentId)
        .eq("status", "active")
        .neq("batch_id", newBatchId)
        .maybeSingle();
      if (currentBatch && currentBatch.batches) {
        oldBatchName = currentBatch.batches.batch_name;
      }
    }

    // 6. Build context for email template
    const context = {
      academyName: org.company_name,
      student_name: `${student.first_name} ${student.last_name}`,
      old_batch: oldBatchName,
      new_batch: newBatch.batch_name,
      effective_date: new Date().toISOString().split("T")[0],
    };

    // 7. Send email
    await sendTemplateEmail({
      to: parentEmail,
      organizationId: org.id,
      slug: "batch_change",
      context,
      branchId,
    });

    console.log(`✅ Batch change email sent to ${parentEmail} for student ${studentId}`);
  } catch (error) {
    // Email failure should not block the assignment – log the error
    console.error("❌ Failed to send batch change email:", error);
  }
}

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
// WRITE OPERATIONS with email notifications
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

  // ─── Send email notification ──────────────────────────────
  await sendBatchChangeEmail({
    studentId: payload.student_id,
    newBatchId: payload.batch_id,
    branchId,
    financialYearId,
    // oldBatchId not provided – will be auto-detected
  });

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

  // ─── Send email notifications for each student ──────────
  for (const sid of studentIds) {
    await sendBatchChangeEmail({
      studentId: sid,
      newBatchId: batchId,
      branchId,
      financialYearId,
    });
  }
}

// context: { branchId, financialYearId }
export async function updateStudentBatch(id, payload, context) {
  const { branchId, financialYearId } = context;

  // Fetch current batch before update (for email)
  const { data: current, error: fetchError } = await supabase
    .from("student_batches")
    .select("student_id, batch_id")
    .eq("id", id)
    .single();
  if (fetchError) throw fetchError;

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

  // If batch_id changed, send notification
  if (payload.batch_id && payload.batch_id !== current.batch_id) {
    await sendBatchChangeEmail({
      studentId: current.student_id,
      newBatchId: payload.batch_id,
      branchId,
      financialYearId,
      oldBatchId: current.batch_id, // pass old batch
    });
  }

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