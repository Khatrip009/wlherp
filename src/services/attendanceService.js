// src/services/attendanceService.js
import { supabase } from "../api/supabase";

// ============================
// PAGINATED SESSIONS (for list)
// ============================

export async function getAttendanceSessions({
  pageParam = 0,
  filters = {},
  branchId,
  financialYearId,
} = {}) {
  const limit = 10;
  const from = pageParam * limit;
  const to = from + limit - 1;

  let query = supabase
    .from("attendance_sessions")
    .select(
      `id, batch_id, attendance_date, topic_covered, batches(batch_name, medium_id, mediums(name))`,
      { count: "exact" }
    )
    .order("attendance_date", { ascending: false })
    .range(from, to);

  // ✅ FIXED: no table alias
  if (branchId) query = query.eq("branch_id", branchId);
  if (financialYearId) query = query.eq("financial_year_id", financialYearId);

  // Handle batch_id filter (array or single)
  if (filters.batchId) {
    if (Array.isArray(filters.batchId) && filters.batchId.length > 0) {
      query = query.in("batch_id", filters.batchId);
    } else if (!Array.isArray(filters.batchId)) {
      query = query.eq("batch_id", filters.batchId);
    }
  }

  if (filters.search) {
    query = query.or(
      `topic_covered.ilike.%${filters.search}%,attendance_date::text.ilike.%${filters.search}%`
    );
  }
  if (filters.startDate) query = query.gte("attendance_date", filters.startDate);
  if (filters.endDate) query = query.lte("attendance_date", filters.endDate);

  if (filters.medium_id) {
    let mediumQuery = supabase
      .from("batches")
      .select("id")
      .eq("medium_id", filters.medium_id);
    if (branchId) mediumQuery = mediumQuery.eq("branch_id", branchId);
    if (financialYearId) mediumQuery = mediumQuery.eq("financial_year_id", financialYearId);
    const { data: batchIds } = await mediumQuery;
    const ids = batchIds?.map((b) => b.id) || [];
    if (ids.length > 0) query = query.in("batch_id", ids);
    else return { data: [], count: 0 };
  }

  const { data, error, count } = await query;
  if (error) throw error;

  // Enrich with attendance counts (these sub‑queries inherit session scope, so no extra filters needed)
  const enriched = await Promise.all(
    data.map(async (session) => {
      const { data: presentRows } = await supabase
        .from("student_attendance")
        .select("id")
        .eq("session_id", session.id)
        .eq("status", "Present");

      const { data: allRows } = await supabase
        .from("student_attendance")
        .select("id")
        .eq("session_id", session.id);

      return {
        ...session,
        batch_name: session.batches?.batch_name,
        medium_name: session.batches?.mediums?.name || "",
        present_count: presentRows ? presentRows.length : 0,
        total_count: allRows ? allRows.length : 0,
      };
    })
  );

  return { data: enriched, count };
}

// Export for CSV (same scoping)
export async function getAllAttendanceSessionsForExport({
  filters = {},
  branchId,
  financialYearId,
} = {}) {
  let query = supabase
    .from("attendance_sessions")
    .select(`id, batch_id, attendance_date, topic_covered, batches(batch_name, medium_id, mediums(name))`)
    .order("attendance_date", { ascending: false });

  // ✅ FIXED: no table alias
  if (branchId) query = query.eq("branch_id", branchId);
  if (financialYearId) query = query.eq("financial_year_id", financialYearId);

  if (filters.batchId) {
    if (Array.isArray(filters.batchId) && filters.batchId.length > 0) {
      query = query.in("batch_id", filters.batchId);
    } else if (!Array.isArray(filters.batchId)) {
      query = query.eq("batch_id", filters.batchId);
    }
  }
  if (filters.search) {
    query = query.or(
      `topic_covered.ilike.%${filters.search}%,attendance_date::text.ilike.%${filters.search}%`
    );
  }
  if (filters.startDate) query = query.gte("attendance_date", filters.startDate);
  if (filters.endDate) query = query.lte("attendance_date", filters.endDate);

  if (filters.medium_id) {
    let mediumQuery = supabase
      .from("batches")
      .select("id")
      .eq("medium_id", filters.medium_id);
    if (branchId) mediumQuery = mediumQuery.eq("branch_id", branchId);
    if (financialYearId) mediumQuery = mediumQuery.eq("financial_year_id", financialYearId);
    const { data: batchIds } = await mediumQuery;
    const ids = batchIds?.map((b) => b.id) || [];
    if (ids.length > 0) query = query.in("batch_id", ids);
    else return [];
  }

  const { data, error } = await query;
  if (error) throw error;

  const enriched = await Promise.all(
    (data || []).map(async (session) => {
      const { data: presentRows } = await supabase
        .from("student_attendance")
        .select("id")
        .eq("session_id", session.id)
        .eq("status", "Present");

      const { data: allRows } = await supabase
        .from("student_attendance")
        .select("id")
        .eq("session_id", session.id);

      return {
        ...session,
        batch_name: session.batches?.batch_name,
        medium_name: session.batches?.mediums?.name || "",
        present_count: presentRows ? presentRows.length : 0,
        total_count: allRows ? allRows.length : 0,
      };
    })
  );

  return enriched;
}

// ============================
// CRUD (now with branchId)
// ============================

export async function createAttendanceSession(payload, branchId, financialYearId) {
  const { created_by, ...rest } = payload;

  const { data, error } = await supabase
    .from("attendance_sessions")
    .insert([{
      ...rest,
      created_by: created_by || null,
      branch_id: branchId,
      financial_year_id: financialYearId,
    }])
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function updateAttendanceSession(id, payload, branchId, financialYearId) {
  const { data, error } = await supabase
    .from("attendance_sessions")
    .update({
      ...payload,
      branch_id: branchId,
      financial_year_id: financialYearId,
    })
    .eq("id", id)
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function deleteAttendanceSession(id, branchId, financialYearId) {
  let query = supabase
    .from("attendance_sessions")
    .update({ deleted_at: new Date().toISOString() })
    .eq("id", id);

  if (branchId) query = query.eq("branch_id", branchId);
  if (financialYearId) query = query.eq("financial_year_id", financialYearId);

  const { error } = await query;
  if (error) throw error;
}

// ============================
// MARKING ATTENDANCE HELPERS
// ============================

export async function getStudentsByBatch(batchId, branchId, financialYearId) {
  let query = supabase
    .from("student_batches")
    .select(`
      student_id,
      students!inner( id, first_name, last_name, admission_no )
    `)
    .eq("batch_id", batchId)
    .eq("status", "active");

  // ✅ FIXED: no table alias
  if (branchId) query = query.eq("branch_id", branchId);
  if (financialYearId) query = query.eq("financial_year_id", financialYearId);

  const { data, error } = await query;
  if (error) throw error;

  return data.map((item) => ({
    student_id: item.student_id,
    ...item.students,
  }));
}

export async function getMarkedAttendance(sessionId, branchId, financialYearId) {
  // Ensure we only fetch attendance for sessions within the current branch/FY (in case sessionId is spoofed)
  let query = supabase
    .from("student_attendance")
    .select("*")
    .eq("session_id", sessionId);

  if (branchId) query = query.eq("branch_id", branchId);
  if (financialYearId) query = query.eq("financial_year_id", financialYearId);

  const { data, error } = await query;
  if (error) throw error;
  return data;
}

export async function saveAttendance(sessionId, records, branchId, financialYearId) {
  // Delete existing records within the same branch/FY
  let deleteQuery = supabase
    .from("student_attendance")
    .delete()
    .eq("session_id", sessionId);
  if (branchId) deleteQuery = deleteQuery.eq("branch_id", branchId);
  if (financialYearId) deleteQuery = deleteQuery.eq("financial_year_id", financialYearId);
  const { error: deleteError } = await deleteQuery;
  if (deleteError) throw deleteError;

  if (records.length === 0) return;

  const payload = records.map((r) => ({
    session_id: sessionId,
    student_id: r.student_id,
    status: r.status,
    remarks: r.remarks || "",
    branch_id: branchId,
    financial_year_id: financialYearId,
  }));

  const { error: insertError } = await supabase.from("student_attendance").insert(payload);
  if (insertError) throw insertError;
}

// ============================
// DROPDOWNS
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

// Mediums – organization‑wide, no branch/FY filter needed
export async function getMediumOptions() {
  const { data, error } = await supabase
    .from("mediums")
    .select("id, name")
    .order("name");
  if (error) throw error;
  return data || [];
}