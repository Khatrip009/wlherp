// src/pages/StudentResultsPage.jsx
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "../api/supabase";
import { useOrg } from "../context/OrganizationContext";
import { Award, Calendar, Layers, BookOpen, Mail } from "lucide-react";
import { sendEmail, sendTemplateEmail } from "../services/emailService";

export default function StudentResultsPage({ studentId: propStudentId = null, standalone = true }) {
  const { branch, selectedFinancialYear, org } = useOrg();
  const branchId = branch?.id;
  const financialYearId = selectedFinancialYear?.id;
  const [sendingEmailId, setSendingEmailId] = useState(null);

  const effectiveStudentId = propStudentId;

  // ─── Helper: get student/parent email ──────────────────────────────
  const getStudentParentEmail = async (studentId) => {
    if (!studentId) return null;
    const { data: student, error: studentError } = await supabase
      .from("students")
      .select("email, first_name, last_name")
      .eq("id", studentId)
      .single();
    if (studentError) return null;

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
    if (results.length === 0) {
      alert("No results to send.");
      return;
    }

    try {
      const recipient = await getStudentParentEmail(effectiveStudentId);
      if (!recipient || !recipient.email) {
        toast.error("No email found for this student or parent.");
        return;
      }

      // Build HTML table rows
      let tableRows = results.map((res) => {
        const exam = res.exams;
        const percentage = exam?.total_marks ? ((res.marks_obtained / exam.total_marks) * 100).toFixed(1) : '—';
        return `
          <tr>
            <td style="padding:4px 8px;border:1px solid #ddd;">${exam?.exam_name || '—'}</td>
            <td style="padding:4px 8px;border:1px solid #ddd;">${exam?.batches?.batch_name || '—'}</td>
            <td style="padding:4px 8px;border:1px solid #ddd;">${exam?.batches?.courses?.course_name || '—'}</td>
            <td style="padding:4px 8px;border:1px solid #ddd;text-align:center;">${res.marks_obtained}</td>
            <td style="padding:4px 8px;border:1px solid #ddd;text-align:center;">${exam?.total_marks || '—'}</td>
            <td style="padding:4px 8px;border:1px solid #ddd;text-align:center;">${percentage}</td>
            <td style="padding:4px 8px;border:1px solid #ddd;text-align:center;">${res.grade || '—'}</td>
            <td style="padding:4px 8px;border:1px solid #ddd;">${exam?.exam_date || '—'}</td>
          </tr>
        `;
      }).join('');

      const htmlBody = `
        <div style="font-family:Arial,sans-serif;max-width:800px;margin:0 auto;">
          <h2 style="color:#0D47A1;">Exam Results Report</h2>
          <p><strong>Student:</strong> ${recipient.name}</p>
          <p><strong>Total Exams:</strong> ${results.length}</p>
          <hr />
          <table style="width:100%;border-collapse:collapse;font-size:11px;border:1px solid #ddd;">
            <thead style="background:#e3f2fd;">
              <tr>
                <th style="padding:4px 8px;border:1px solid #ddd;text-align:left;">Exam</th>
                <th style="padding:4px 8px;border:1px solid #ddd;text-align:left;">Batch</th>
                <th style="padding:4px 8px;border:1px solid #ddd;text-align:left;">Course</th>
                <th style="padding:4px 8px;border:1px solid #ddd;text-align:center;">Marks</th>
                <th style="padding:4px 8px;border:1px solid #ddd;text-align:center;">Total</th>
                <th style="padding:4px 8px;border:1px solid #ddd;text-align:center;">%</th>
                <th style="padding:4px 8px;border:1px solid #ddd;text-align:center;">Grade</th>
                <th style="padding:4px 8px;border:1px solid #ddd;text-align:left;">Date</th>
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
        subject: `Exam Results Report - ${recipient.name}`,
        html: htmlBody,
        from: org?.email || undefined,
      });

      toast.success(`Report sent to ${recipient.email}`);
    } catch (err) {
      console.error("Failed to send report:", err);
      toast.error("Failed to send report.");
    }
  };

  // ─── Send Individual Result Email ──────────────────────────────────
  const sendResultEmail = async (res, index) => {
    setSendingEmailId(index);
    try {
      const recipient = await getStudentParentEmail(effectiveStudentId);
      if (!recipient || !recipient.email) {
        toast.error("No email found for this student or parent.");
        setSendingEmailId(null);
        return;
      }

      const exam = res.exams;
      const totalMarks = exam?.total_marks || 0;
      const marksObtained = res.marks_obtained;
      const percentage = totalMarks ? ((marksObtained / totalMarks) * 100).toFixed(1) : 'N/A';
      const grade = res.grade || '';
      const remarks = res.remarks || '';

      const context = {
        academyName: org?.company_name || "Academy",
        student_name: recipient.name,
        exam_name: exam?.exam_name || 'N/A',
        subject_name: exam?.batches?.courses?.course_name || 'N/A',
        marks_obtained: marksObtained,
        total_marks: totalMarks,
        grade: grade,
        remarks: remarks,
      };

      await sendTemplateEmail({
        to: recipient.email,
        organizationId: org?.id,
        slug: "results_published",
        context,
        branchId,
      });

      toast.success(`Result email sent to ${recipient.email}`);
    } catch (err) {
      console.error("Send result email error:", err);
      toast.error("Failed to send result email.");
    } finally {
      setSendingEmailId(null);
    }
  };

  // ─── Data fetching ──────────────────────────────────────────────────
  const { data: results = [], isLoading } = useQuery({
    queryKey: ["student-results", effectiveStudentId, branchId, financialYearId],
    queryFn: async () => {
      if (!effectiveStudentId || !branchId || !financialYearId) return [];
      let query = supabase
        .from("student_results")
        .select(`
          marks_obtained,
          remarks,
          grade,
          exams (
            exam_name,
            exam_date,
            total_marks,
            batches (
              batch_name,
              courses ( course_name ),
              mediums ( name )
            )
          )
        `)
        .eq("student_id", effectiveStudentId);
      if (branchId) query = query.eq("branch_id", branchId);
      if (financialYearId) query = query.eq("financial_year_id", financialYearId);
      const { data } = await query.order("exam_id", { ascending: false });
      return data || [];
    },
    enabled: !!effectiveStudentId && !!branchId && !!financialYearId,
    staleTime: 2 * 60 * 1000,
  });

  const content = (
    <div>
      {isLoading ? (
        <div className="p-4 text-center text-secondary">Loading results…</div>
      ) : results.length === 0 ? (
        <div className="bg-white rounded-xl p-8 shadow-sm border border-secondary-light text-center">
          <Award size={32} className="text-secondary-light mx-auto mb-2" />
          <p className="text-secondary">No exam results found for this student.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {results.map((res, idx) => {
            const exam = res.exams;
            return (
              <div
                key={idx}
                className="bg-white rounded-xl p-4 shadow-sm border border-secondary-light"
              >
                <div className="flex items-center justify-between mb-1">
                  <div className="flex items-center gap-2">
                    <Award size={18} className="text-primary" />
                    <h3 className="font-bold text-primary-dark">{exam?.exam_name}</h3>
                  </div>
                  {/* 👇 Resend Result Email button */}
                  <button
                    onClick={() => sendResultEmail(res, idx)}
                    disabled={sendingEmailId === idx}
                    className="text-blue-600 hover:text-blue-800 disabled:opacity-50 flex items-center gap-1"
                    title="Resend result email"
                  >
                    <Mail size={16} />
                    {sendingEmailId === idx ? '...' : ''}
                  </button>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 text-sm text-secondary-dark">
                  <div className="flex items-center gap-1">
                    <Layers size={16} /> {exam?.batches?.batch_name}
                  </div>
                  <div className="flex items-center gap-1">
                    <BookOpen size={16} /> {exam?.batches?.courses?.course_name}
                  </div>
                  <div className="flex items-center gap-1">
                    <Calendar size={16} /> {exam?.exam_date}
                  </div>
                </div>
                <div className="flex flex-wrap items-center gap-4 mt-2 text-sm">
                  <span>
                    Marks: <strong>{res.marks_obtained}</strong>
                    {exam?.total_marks && ` / ${exam.total_marks}`}
                  </span>
                  {res.grade && (
                    <span className="bg-primary-bg text-primary px-2 py-0.5 rounded-full text-xs">
                      Grade: {res.grade}
                    </span>
                  )}
                  {res.remarks && (
                    <span className="text-secondary text-xs">Remarks: {res.remarks}</span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );

  if (!standalone) return <div>{content}</div>;

  return (
    <div className="p-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between mb-4 gap-3">
        <h1 className="text-3xl font-righteous text-primary-dark">My Results</h1>
        {/* 👇 Send Report button */}
        {results.length > 0 && (
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