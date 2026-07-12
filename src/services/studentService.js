// src/services/studentService.js
import { supabase } from "../api/supabase";

// Helper: convert empty strings to null for fields that must be integers or dates
function cleanStudentPayload(payload) {
  const clean = { ...payload };
  const intFields = ['medium_id', 'batch_id', 'fee_structure_id'];
  const dateFields = ['dob'];

  intFields.forEach(field => {
    if (clean[field] === '' || clean[field] === undefined) {
      clean[field] = null;
    }
  });

  dateFields.forEach(field => {
    if (clean[field] === '') {
      clean[field] = null;
    }
  });

  return clean;
}

// ─── CRUD ───────────────────────────────────────────────

export async function getStudents({ pageParam = 0, filters = {}, branchId, financialYearId } = {}) {
  const limit = 10;
  const from = pageParam * limit;
  const to = from + limit - 1;

  let query = supabase
    .from("students")
    .select("*, mediums(name)", { count: "exact" })
    .order("id", { ascending: false })
    .range(from, to);

  // Scope students table
  if (branchId) query = query.eq("branch_id", branchId);
  if (financialYearId) query = query.eq("financial_year_id", financialYearId);

  if (filters.search) {
    query = query.or(
      `first_name.ilike.%${filters.search}%,last_name.ilike.%${filters.search}%`
    );
  }
  if (filters.standard) query = query.eq("standard", filters.standard);
  if (filters.gender) query = query.eq("gender", filters.gender);
  if (filters.status) query = query.eq("status", filters.status);
  if (filters.medium_id) query = query.eq("medium_id", filters.medium_id);

  if (filters.batch_id) {
    let subQuery = supabase
      .from("student_batches")
      .select("student_id")
      .eq("batch_id", filters.batch_id)
      .eq("status", "active");
    if (branchId) subQuery = subQuery.eq("branch_id", branchId);
    if (financialYearId) subQuery = subQuery.eq("financial_year_id", financialYearId);
    const { data: batchStudents } = await subQuery;
    const ids = batchStudents?.map((b) => b.student_id) || [];
    if (ids.length > 0) query = query.in("id", ids);
    else return { data: [], count: 0 };
  }

  if (filters.course_id) {
    // Scope batches query
    let batchSub = supabase
      .from("batches")
      .select("id")
      .eq("course_id", filters.course_id);
    if (branchId) batchSub = batchSub.eq("branch_id", branchId);
    if (financialYearId) batchSub = batchSub.eq("financial_year_id", financialYearId);
    const { data: courseBatches } = await batchSub;
    const batchIds = courseBatches?.map((b) => b.id) || [];
    // Scope student_batches query
    let studentSub = supabase
      .from("student_batches")
      .select("student_id")
      .in("batch_id", batchIds)
      .eq("status", "active");
    if (branchId) studentSub = studentSub.eq("branch_id", branchId);
    if (financialYearId) studentSub = studentSub.eq("financial_year_id", financialYearId);
    const { data: batchStudents } = await studentSub;
    const ids = batchStudents?.map((b) => b.student_id) || [];
    if (ids.length > 0) query = query.in("id", ids);
    else return { data: [], count: 0 };
  }

  const { data, error, count } = await query;
  if (error) throw error;

  const enriched = (data || []).map((student) => ({
    ...student,
    medium_name: student.mediums?.name || "",
  }));

  return { data: enriched, count };
}

export async function getStudent(id, branchId, financialYearId) {
  let query = supabase
    .from("students")
    .select("*, mediums(name)")
    .eq("id", id);

  if (branchId) query = query.eq("branch_id", branchId);
  if (financialYearId) query = query.eq("financial_year_id", financialYearId);

  const { data, error } = await query.single();
  if (error) throw error;

  return {
    ...data,
    medium_name: data.mediums?.name || "",
  };
}

export async function createStudent(payload, context) {
  const { _parent_ids, email, password, batch_id, ...studentData } = payload;
  const { branchId, financialYearId } = context;

  // Clean the payload to avoid empty string integers/dates
  const cleanData = cleanStudentPayload({
    ...studentData,
    email,
    batch_id,
    user_id: null,
    branch_id: branchId,
    financial_year_id: financialYearId,
  });

  const { data: student, error } = await supabase
    .from("students")
    .insert([cleanData])
    .select()
    .single();
  if (error) throw error;

  // Link parents
  if (_parent_ids && _parent_ids.length > 0) {
    const links = _parent_ids.map((parentId) => ({
      student_id: student.id,
      parent_id: parentId,
      relation: "Parent",
      branch_id: branchId,
      financial_year_id: financialYearId,
    }));
    const { error: linkError } = await supabase.from("student_parents").insert(links);
    if (linkError) throw linkError;
  }

  // Assign to batch if provided
  if (batch_id) {
    const { error: batchError } = await supabase.from("student_batches").insert({
      student_id: student.id,
      batch_id: batch_id,
      status: "active",
      branch_id: branchId,
      financial_year_id: financialYearId,
    });
    if (batchError) throw batchError;
  }

  return student;
}

export async function updateStudent(id, payload, context) {
  const { _parent_ids, email, password, batch_id, ...studentData } = payload;
  const { branchId, financialYearId } = context;

  const cleanData = cleanStudentPayload({
    ...studentData,
    email,
    batch_id,
    branch_id: branchId,
    financial_year_id: financialYearId,
  });

  // Build update query and scope it
  let updateQuery = supabase
    .from("students")
    .update(cleanData)
    .eq("id", id);

  if (branchId) updateQuery = updateQuery.eq("branch_id", branchId);
  if (financialYearId) updateQuery = updateQuery.eq("financial_year_id", financialYearId);

  const { data: student, error } = await updateQuery.select().single();
  if (error) throw error;

  // Update parent links (scoped deletion and insertion)
  if (_parent_ids !== undefined) {
    let deleteParentsQuery = supabase
      .from("student_parents")
      .delete()
      .eq("student_id", id);
    if (branchId) deleteParentsQuery = deleteParentsQuery.eq("branch_id", branchId);
    if (financialYearId) deleteParentsQuery = deleteParentsQuery.eq("financial_year_id", financialYearId);
    await deleteParentsQuery;

    if (_parent_ids.length > 0) {
      const links = _parent_ids.map((parentId) => ({
        student_id: id,
        parent_id: parentId,
        relation: "Parent",
        branch_id: branchId,
        financial_year_id: financialYearId,
      }));
      const { error: linkError } = await supabase.from("student_parents").insert(links);
      if (linkError) throw linkError;
    }
  }

  // Update batch assignment (scoped)
  if (batch_id !== undefined) {
    let deleteBatchQuery = supabase
      .from("student_batches")
      .delete()
      .eq("student_id", id);
    if (branchId) deleteBatchQuery = deleteBatchQuery.eq("branch_id", branchId);
    if (financialYearId) deleteBatchQuery = deleteBatchQuery.eq("financial_year_id", financialYearId);
    await deleteBatchQuery;

    const { error: batchError } = await supabase.from("student_batches").insert({
      student_id: id,
      batch_id: batch_id,
      status: "active",
      branch_id: branchId,
      financial_year_id: financialYearId,
    });
    if (batchError) throw batchError;
  }

  return student;
}

export async function deleteStudent(id, context) {
  const { branchId, financialYearId } = context;

  let query = supabase
    .from("students")
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

// ─── EXPORT ──────────────────────────────────────────────
export async function getAllStudentsForExport(filters = {}, branchId, financialYearId) {
  let query = supabase
    .from("students")
    .select("*, mediums(name)")
    .order("id", { ascending: false });

  // Scope
  if (branchId) query = query.eq("branch_id", branchId);
  if (financialYearId) query = query.eq("financial_year_id", financialYearId);

  if (filters.search) {
    query = query.or(
      `first_name.ilike.%${filters.search}%,last_name.ilike.%${filters.search}%`
    );
  }
  if (filters.standard) query = query.eq("standard", filters.standard);
  if (filters.gender) query = query.eq("gender", filters.gender);
  if (filters.status) query = query.eq("status", filters.status);
  if (filters.medium_id) query = query.eq("medium_id", filters.medium_id);

  const { data, error } = await query;
  if (error) throw error;

  return (data || []).map((student) => ({
    ...student,
    medium_name: student.mediums?.name || "",
  }));
}

// ─── OPTIONS ─────────────────────────────────────────────
export async function getMediumOptions() {
  const { data, error } = await supabase
    .from("mediums")
    .select("id, name")
    .order("name");
  if (error) throw error;
  return data || [];
}