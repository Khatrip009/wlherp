// src/services/attendanceReportService.js
import { supabase } from "../api/supabase";

/**
 * Get attendance report: per student in a batch (or all batches)
 * Optionally filter by medium.
 * Returns array of { student_id, student_name, admission_no, total_sessions, present_count, percentage, batch_name, medium_name }
 */
export async function getAttendanceReport(batchId, startDate, endDate, mediumId = null) {
  // 1. Get sessions for the batch (and date range), optionally filtered by medium
  let sessionQuery = supabase
    .from("attendance_sessions")
    .select("id, attendance_date, batch_id")
    .order("attendance_date", { ascending: true });

  if (batchId) {
    sessionQuery = sessionQuery.eq("batch_id", batchId);
  }
  if (startDate) {
    sessionQuery = sessionQuery.gte("attendance_date", startDate);
  }
  if (endDate) {
    sessionQuery = sessionQuery.lte("attendance_date", endDate);
  }

  // If medium filter is provided, restrict to batches of that medium
  if (mediumId) {
    const { data: mediumBatchIds } = await supabase
      .from("batches")
      .select("id")
      .eq("medium_id", mediumId);
    const batchIds = mediumBatchIds?.map((b) => b.id) || [];
    if (batchIds.length > 0) {
      sessionQuery = sessionQuery.in("batch_id", batchIds);
    } else {
      return []; // no batches for this medium → no data
    }
  }

  const { data: sessions, error: sessionError } = await sessionQuery;
  if (sessionError) throw sessionError;
  if (!sessions.length) return [];

  const sessionIds = sessions.map((s) => s.id);

  // 2. Get all students in the batch(es) – if batchId specified, get that batch's students, else all active students
  let studentQuery = supabase.from("student_batches").select(`
      student_id,
      students!inner( id, first_name, last_name, admission_no )
    `).eq("status", "active");

  if (batchId) {
    studentQuery = studentQuery.eq("batch_id", batchId);
  } else if (mediumId) {
    // If no batchId but mediumId is set, restrict students to batches of that medium
    const { data: mediumBatchIds } = await supabase
      .from("batches")
      .select("id")
      .eq("medium_id", mediumId);
    const batchIds = mediumBatchIds?.map((b) => b.id) || [];
    if (batchIds.length > 0) {
      studentQuery = studentQuery.in("batch_id", batchIds);
    } else {
      return [];
    }
  }

  const { data: studentRows, error: studentError } = await studentQuery;
  if (studentError) throw studentError;

  // unique students
  const studentsMap = {};
  studentRows.forEach((row) => {
    if (row.students) {
      studentsMap[row.student_id] = row.students;
    }
  });
  const students = Object.values(studentsMap);

  // 3. Get attendance marks for these sessions and students
  const studentIds = Object.keys(studentsMap);
  if (!studentIds.length) return [];

  const { data: marks, error: marksError } = await supabase
    .from("student_attendance")
    .select("student_id, status")
    .in("session_id", sessionIds)
    .in("student_id", studentIds);

  if (marksError) throw marksError;

  // 4. Calculate per student
  const totalSessions = sessionIds.length;
  const presentCountMap = {};
  marks.forEach((m) => {
    if (m.status === "Present") {
      presentCountMap[m.student_id] = (presentCountMap[m.student_id] || 0) + 1;
    }
  });

  // 5. If a single batch is selected, fetch its name and medium for display
  let batchName = "";
  let mediumName = "";
  if (batchId) {
    const { data: batch } = await supabase
      .from("batches")
      .select("batch_name, mediums(name)")
      .eq("id", batchId)
      .single();
    if (batch) {
      batchName = batch.batch_name || "";
      mediumName = batch.mediums?.name || "";
    }
  }

  return students.map((student) => {
    const present = presentCountMap[student.id] || 0;
    return {
      student_id: student.id,
      student_name: `${student.first_name} ${student.last_name}`,
      admission_no: student.admission_no,
      total_sessions: totalSessions,
      present_count: present,
      percentage: totalSessions > 0 ? ((present / totalSessions) * 100).toFixed(1) : 0,
      batch_name: batchName,
      medium_name: mediumName,
    };
  });
}

// Get active batches for filter dropdown
export async function getActiveBatches() {
  const { data, error } = await supabase
    .from("batches")
    .select("id, batch_name")
    .eq("status", "active")
    .order("batch_name");
  if (error) throw error;
  return data;
}

// NEW – get mediums for attendance report filter dropdown
export async function getMediumOptions() {
  const { data, error } = await supabase
    .from("mediums")
    .select("id, name")
    .order("name");
  if (error) throw error;
  return data || [];
}