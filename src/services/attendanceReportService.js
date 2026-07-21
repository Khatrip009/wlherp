// src/services/attendanceReportService.js
import { supabase } from "../api/supabase";
import { sendEmail } from "./emailService"; // 👈 Added import for email sending

/**
 * Get attendance report: per student in a batch (or all batches)
 * Optionally filter by medium.
 * Returns array of { student_id, student_name, admission_no, total_sessions, present_count, percentage, batch_name, medium_name }
 */
export async function getAttendanceReport(
  batchId,
  startDate,
  endDate,
  mediumId = null,
  branchId,
  financialYearId
) {
  // 1. Get sessions for the batch (and date range), scoped by branch & FY
  let sessionQuery = supabase
    .from("attendance_sessions")
    .select("id, attendance_date, batch_id")
    .order("attendance_date", { ascending: true });

  // Safely apply branch and financial year scope
  if (branchId) sessionQuery = sessionQuery.eq("branch_id", branchId);
  if (financialYearId) sessionQuery = sessionQuery.eq("financial_year_id", financialYearId);

  if (batchId) sessionQuery = sessionQuery.eq("batch_id", batchId);
  if (startDate) sessionQuery = sessionQuery.gte("attendance_date", startDate);
  if (endDate) sessionQuery = sessionQuery.lte("attendance_date", endDate);

  // If medium filter is provided, restrict to batches of that medium (also scoped)
  if (mediumId) {
    let mediumBatchQuery = supabase
      .from("batches")
      .select("id")
      .eq("medium_id", mediumId);
    if (branchId) mediumBatchQuery = mediumBatchQuery.eq("branch_id", branchId);
    if (financialYearId) mediumBatchQuery = mediumBatchQuery.eq("financial_year_id", financialYearId);
    const { data: mediumBatchIds } = await mediumBatchQuery;
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

  // 2. Get all students in the batch(es) – scoped by branch & FY
  let studentQuery = supabase
    .from("student_batches")
    .select(`
      student_id,
      students!inner( id, first_name, last_name, admission_no )
    `)
    .eq("status", "active");

  if (branchId) studentQuery = studentQuery.eq("branch_id", branchId);
  if (financialYearId) studentQuery = studentQuery.eq("financial_year_id", financialYearId);

  if (batchId) {
    studentQuery = studentQuery.eq("batch_id", batchId);
  } else if (mediumId) {
    // Restrict students to batches of that medium – already scoped
    let mediumStudentBatchQuery = supabase
      .from("batches")
      .select("id")
      .eq("medium_id", mediumId);
    if (branchId) mediumStudentBatchQuery = mediumStudentBatchQuery.eq("branch_id", branchId);
    if (financialYearId) mediumStudentBatchQuery = mediumStudentBatchQuery.eq("financial_year_id", financialYearId);
    const { data: mediumBatchIds } = await mediumStudentBatchQuery;
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

  // 5. If a single batch is selected, fetch its name and medium for display (scoped)
  let batchName = "";
  let mediumName = "";
  if (batchId) {
    let batchQuery = supabase
      .from("batches")
      .select("batch_name, mediums(name)")
      .eq("id", batchId);
    if (branchId) batchQuery = batchQuery.eq("branch_id", branchId);
    if (financialYearId) batchQuery = batchQuery.eq("financial_year_id", financialYearId);
    const { data: batch } = await batchQuery.single();
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

// Get active batches for filter dropdown – scoped by branch & FY
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

// Get mediums for attendance report filter dropdown – organization‑wide
export async function getMediumOptions() {
  const { data, error } = await supabase
    .from("mediums")
    .select("id, name")
    .order("name");
  if (error) throw error;
  return data || [];
}

// ─── NEW: Send attendance report via email ─────────────────────────────

/**
 * Fetches the attendance report and sends it as an HTML email to the specified recipients.
 * 
 * @param {Object} params
 * @param {number} params.batchId - optional, batch ID to filter
 * @param {string} params.startDate - optional, YYYY-MM-DD
 * @param {string} params.endDate - optional, YYYY-MM-DD
 * @param {number|null} params.mediumId - optional, medium filter
 * @param {number} params.branchId - required
 * @param {number} params.financialYearId - required
 * @param {string|string[]} params.recipients - email address(es) to send the report to
 * @param {string} [params.subject] - email subject (default: "Attendance Report")
 * @param {string} [params.from] - optional sender override
 * @param {string} [params.includeTable] - if true, include the full HTML table (default: true)
 * 
 * @returns {Promise<{ success: boolean, data?: any, error?: any }>}
 */
export async function sendAttendanceReportEmail({
  batchId,
  startDate,
  endDate,
  mediumId = null,
  branchId,
  financialYearId,
  recipients,
  subject = "Attendance Report",
  from,
  includeTable = true,
}) {
  try {
    // 1. Fetch the report data
    const reportData = await getAttendanceReport(
      batchId,
      startDate,
      endDate,
      mediumId,
      branchId,
      financialYearId
    );

    if (!reportData || reportData.length === 0) {
      throw new Error("No attendance data found for the given parameters.");
    }

    // 2. Build an HTML table from the report
    let tableHtml = `
      <table style="border-collapse: collapse; width: 100%; font-family: Arial, sans-serif; font-size: 14px;">
        <thead>
          <tr style="background-color: #f2f2f2;">
            <th style="border: 1px solid #ddd; padding: 8px; text-align: left;">Student</th>
            <th style="border: 1px solid #ddd; padding: 8px; text-align: left;">Admission No.</th>
            <th style="border: 1px solid #ddd; padding: 8px; text-align: center;">Total Sessions</th>
            <th style="border: 1px solid #ddd; padding: 8px; text-align: center;">Present</th>
            <th style="border: 1px solid #ddd; padding: 8px; text-align: center;">Attendance %</th>
          </tr>
        </thead>
        <tbody>
    `;

    reportData.forEach((row) => {
      const percentage = parseFloat(row.percentage);
      const color = percentage < 75 ? '#ff6b6b' : (percentage < 85 ? '#ffd93d' : '#6bcb77');
      tableHtml += `
        <tr>
          <td style="border: 1px solid #ddd; padding: 8px;">${row.student_name}</td>
          <td style="border: 1px solid #ddd; padding: 8px;">${row.admission_no || '—'}</td>
          <td style="border: 1px solid #ddd; padding: 8px; text-align: center;">${row.total_sessions}</td>
          <td style="border: 1px solid #ddd; padding: 8px; text-align: center;">${row.present_count}</td>
          <td style="border: 1px solid #ddd; padding: 8px; text-align: center; font-weight: bold; color: ${color};">${row.percentage}%</td>
        </tr>
      `;
    });

    tableHtml += `
        </tbody>
      </table>
    `;

    // Add summary info
    const batchInfo = reportData.length > 0 ? reportData[0].batch_name || 'All Batches' : 'All Batches';
    const mediumInfo = reportData.length > 0 ? reportData[0].medium_name || 'All Mediums' : 'All Mediums';
    const dateRange = startDate && endDate ? `${startDate} to ${endDate}` : 'All Dates';

    const htmlBody = `
      <div style="font-family: Arial, sans-serif; max-width: 800px; margin: 0 auto;">
        <h2>Attendance Report</h2>
        <p><strong>Batch:</strong> ${batchInfo}</p>
        <p><strong>Medium:</strong> ${mediumInfo}</p>
        <p><strong>Period:</strong> ${dateRange}</p>
        <p><strong>Total Students:</strong> ${reportData.length}</p>
        ${includeTable ? tableHtml : '<p>Report generated. (Table not included)</p>'}
        <hr>
        <p style="font-size: 12px; color: #888;">This is an automated report from your Academy Management System.</p>
      </div>
    `;

    // 3. Send the email
    const result = await sendEmail({
      to: recipients,
      subject: subject,
      html: htmlBody,
      from,
    });

    return { success: true, data: result };
  } catch (error) {
    console.error("Error sending attendance report email:", error);
    return { success: false, error: error.message };
  }
}