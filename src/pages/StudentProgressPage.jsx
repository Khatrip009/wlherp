// src/pages/StudentProgressPage.jsx
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "../api/supabase";
import { useOrg } from "../context/OrganizationContext";
import { TrendingUp, Calendar, Layers, User, Mail } from "lucide-react";
import { sendEmail, sendTemplateEmail } from "../services/emailService";

export default function StudentProgressPage({ studentId: propStudentId = null, standalone = true }) {
  const { branch, selectedFinancialYear, org } = useOrg();
  const branchId = branch?.id;
  const financialYearId = selectedFinancialYear?.id;
  const [sendingEmailId, setSendingEmailId] = useState(null);

  const effectiveStudentId = propStudentId;

  // ─── Helper: get student/parent email ──────────────────────────────
  const getStudentParentEmail = async (studentId) => {
    if (!studentId) return null;
    // Fetch student email
    const { data: student, error: studentError } = await supabase
      .from("students")
      .select("email, first_name, last_name")
      .eq("id", studentId)
      .single();
    if (studentError) return null;

    // Try to find parent email
    const { data: parent, error: parentError } = await supabase
      .from("student_parents")
      .select("parents!inner(email, father_name, mother_name)")
      .eq("student_id", studentId)
      .maybeSingle();

    if (!parentError && parent && parent.parents?.email) {
      return {
        email: parent.parents.email,
        name: parent.parents.father_name || parent.parents.mother_name || `${student.first_name} ${student.last_name}`,
      };
    }
    return {
      email: student.email,
      name: `${student.first_name} ${student.last_name}`.trim(),
    };
  };

  // ─── Send Report Email ─────────────────────────────────────────────
  const sendReportEmail = async () => {
    if (evaluations.length === 0) {
      alert("No progress evaluations to send.");
      return;
    }

    try {
      const recipient = await getStudentParentEmail(effectiveStudentId);
      if (!recipient || !recipient.email) {
        toast.error("No email found for this student or parent.");
        return;
      }

      // Build HTML table rows
      let tableRows = evaluations.map((evalItem) => `
        <tr>
          <td style="padding:4px 8px;border:1px solid #ddd;">${evalItem.evaluation_date}</td>
          <td style="padding:4px 8px;border:1px solid #ddd;">${evalItem.batches?.batch_name || '—'}</td>
          <td style="padding:4px 8px;border:1px solid #ddd;">${evalItem.batches?.courses?.course_name || '—'}</td>
          <td style="padding:4px 8px;border:1px solid #ddd;text-align:center;">${evalItem.attendance_percentage !== null ? evalItem.attendance_percentage + '%' : '—'}</td>
          <td style="padding:4px 8px;border:1px solid #ddd;text-align:center;">${evalItem.performance_score !== null ? evalItem.performance_score : '—'}</td>
          <td style="padding:4px 8px;border:1px solid #ddd;">${evalItem.teacher_remarks || '—'}</td>
        </tr>
      `).join('');

      const htmlBody = `
        <div style="font-family:Arial,sans-serif;max-width:800px;margin:0 auto;">
          <h2 style="color:#0D47A1;">Student Progress Report</h2>
          <p><strong>Student:</strong> ${recipient.name}</p>
          <p><strong>Total Evaluations:</strong> ${evaluations.length}</p>
          <hr />
          <table style="width:100%;border-collapse:collapse;font-size:11px;border:1px solid #ddd;">
            <thead style="background:#e3f2fd;">
              <tr>
                <th style="padding:4px 8px;border:1px solid #ddd;text-align:left;">Date</th>
                <th style="padding:4px 8px;border:1px solid #ddd;text-align:left;">Batch</th>
                <th style="padding:4px 8px;border:1px solid #ddd;text-align:left;">Course</th>
                <th style="padding:4px 8px;border:1px solid #ddd;text-align:center;">Attendance %</th>
                <th style="padding:4px 8px;border:1px solid #ddd;text-align:center;">Score</th>
                <th style="padding:4px 8px;border:1px solid #ddd;text-align:left;">Remarks</th>
              </tr>
            </thead>
            <tbody>
              ${tableRows}
            </tbody>
          </table>
          <p style="color:#888;font-size:10px;margin-top:20px;">Computer‑generated report from ${org?.company_name || 'Academy'}</p>
        </div>
      `;

      await sendEmail({
        to: recipient.email,
        subject: `Progress Report - ${recipient.name}`,
        html: htmlBody,
        from: org?.email || undefined,
      });

      toast.success(`Report sent to ${recipient.email}`);
    } catch (err) {
      console.error("Failed to send report:", err);
      toast.error("Failed to send report.");
    }
  };

  // ─── Send Evaluation Email ──────────────────────────────────────────
  const sendEvaluationEmail = async (evalItem, index) => {
    setSendingEmailId(index);
    try {
      const recipient = await getStudentParentEmail(effectiveStudentId);
      if (!recipient || !recipient.email) {
        toast.error("No email found for this student or parent.");
        setSendingEmailId(null);
        return;
      }

      const batchName = evalItem.batches?.batch_name || 'N/A';
      const courseName = evalItem.batches?.courses?.course_name || 'N/A';

      const message = `A new progress evaluation has been recorded for ${recipient.name}:\n` +
        `Batch: ${batchName}\n` +
        `Course: ${courseName}\n` +
        `Evaluation Date: ${evalItem.evaluation_date}\n` +
        `Attendance Percentage: ${evalItem.attendance_percentage ?? 'N/A'}%\n` +
        `Performance Score: ${evalItem.performance_score ?? 'N/A'}\n` +
        `Teacher Remarks: ${evalItem.teacher_remarks || 'No remarks'}\n\n` +
        `Please log in for more details.`;

      await sendTemplateEmail({
        to: recipient.email,
        organizationId: org?.id,
        slug: "system_announcement",
        context: {
          academyName: org?.company_name || "Academy",
          title: "Student Progress Evaluation",
          message,
          target_type: "Student/Parent",
        },
        branchId,
      });

      toast.success(`Evaluation email sent to ${recipient.email}`);
    } catch (err) {
      console.error("Send evaluation email error:", err);
      toast.error("Failed to send evaluation email.");
    } finally {
      setSendingEmailId(null);
    }
  };

  // ─── Data fetching ──────────────────────────────────────────────────
  const { data: evaluations = [], isLoading } = useQuery({
    queryKey: ["student-progress", effectiveStudentId, branchId, financialYearId],
    queryFn: async () => {
      if (!effectiveStudentId || !branchId || !financialYearId) return [];
      let query = supabase
        .from("student_progress")
        .select(`
          evaluation_date,
          attendance_percentage,
          performance_score,
          teacher_remarks,
          batches ( batch_name, courses ( course_name ) )
        `)
        .eq("student_id", effectiveStudentId);
      if (branchId) query = query.eq("branch_id", branchId);
      if (financialYearId) query = query.eq("financial_year_id", financialYearId);
      const { data } = await query.order("evaluation_date", { ascending: false });
      return data || [];
    },
    enabled: !!effectiveStudentId && !!branchId && !!financialYearId,
    staleTime: 2 * 60 * 1000,
  });

  const content = (
    <div>
      {isLoading ? (
        <div className="p-4 text-center text-secondary">Loading progress…</div>
      ) : evaluations.length === 0 ? (
        <div className="bg-white rounded-xl p-8 shadow-sm border border-secondary-light text-center">
          <TrendingUp size={32} className="text-secondary-light mx-auto mb-2" />
          <p className="text-secondary">No progress evaluations found.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {evaluations.map((evalItem, idx) => (
            <div
              key={idx}
              className="bg-white rounded-xl p-4 shadow-sm border border-secondary-light"
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 mb-1">
                  <TrendingUp size={18} className="text-primary" />
                  <span className="font-bold text-primary-dark">
                    {evalItem.batches?.batch_name}
                  </span>
                  {evalItem.batches?.courses?.course_name && (
                    <span className="text-sm text-secondary-dark">
                      ({evalItem.batches.courses.course_name})
                    </span>
                  )}
                </div>
                {/* 👇 Resend Evaluation Email button */}
                <button
                  onClick={() => sendEvaluationEmail(evalItem, idx)}
                  disabled={sendingEmailId === idx}
                  className="text-blue-600 hover:text-blue-800 disabled:opacity-50 flex items-center gap-1"
                  title="Resend evaluation email"
                >
                  <Mail size={16} />
                  {sendingEmailId === idx ? '...' : ''}
                </button>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 text-sm">
                <div className="flex items-center gap-1">
                  <Calendar size={16} className="text-secondary" />
                  <span>{evalItem.evaluation_date}</span>
                </div>
                {evalItem.attendance_percentage !== null && (
                  <div className="flex items-center gap-1">
                    <User size={16} className="text-secondary" />
                    <span>Attendance: {evalItem.attendance_percentage}%</span>
                  </div>
                )}
                {evalItem.performance_score !== null && (
                  <div className="flex items-center gap-1">
                    <TrendingUp size={16} className="text-secondary" />
                    <span>Score: {evalItem.performance_score}</span>
                  </div>
                )}
              </div>
              {evalItem.teacher_remarks && (
                <div className="mt-2 text-sm text-secondary-dark border-t pt-2">
                  Remarks: {evalItem.teacher_remarks}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );

  if (!standalone) return <div>{content}</div>;

  return (
    <div className="p-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between mb-4 gap-3">
        <h1 className="text-3xl font-righteous text-primary-dark">My Progress</h1>
        {/* 👇 Send Report button */}
        {evaluations.length > 0 && (
          <button
            onClick={sendReportEmail}
            className="bg-green-600 hover:bg-green-700 text-white px-4 py-2 rounded-lg text-sm font-medium flex items-center gap-2"
          >
            <Mail size={16} /> Send Report
          </button>
        )}
      </div>
      {content}
    </div>
  );
}