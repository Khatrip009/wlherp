// src/pages/Results.jsx
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { Search, Award, Edit3, Eye, AlertCircle, Mail } from "lucide-react";

import BackButton from "../components/BackButton";
import { getAllExams } from "../services/examService";
import { useAuth } from "../context/AuthContext";
import { useOrg } from "../context/OrganizationContext";
import { supabase } from "../api/supabase";
import toast from "react-hot-toast";
import { sendEmail, sendTemplateEmail } from "../services/emailService";

export default function Results() {
  const navigate = useNavigate();
  const { profile } = useAuth();
  const { branch, selectedFinancialYear, org } = useOrg();
  const [search, setSearch] = useState("");
  const [sendingEmailId, setSendingEmailId] = useState(null);

  const role = (profile?.role || "").toLowerCase().replace(/\s+/g, "_");
  const isAdmin = role === "admin" || role === "super_admin";

  const branchId = branch?.id;
  const financialYearId = selectedFinancialYear?.id;

  // ─── Helper: get admin emails ──────────────────────────────────────
  const getAdminEmails = async () => {
    if (!org?.id) return [];
    const { data, error } = await supabase
      .from("profiles")
      .select("email")
      .eq("organization_id", org.id)
      .in("role", ["admin", "super_admin", "organization_admin"])
      .eq("is_active", true);
    if (error) {
      console.error("Failed to fetch admin emails:", error);
      return [];
    }
    return data?.map(p => p.email).filter(Boolean) || [];
  };

  // ─── Send Report Email ─────────────────────────────────────────────
  const sendReportEmail = async () => {
    if (filtered.length === 0) {
      alert("No exams to send.");
      return;
    }

    try {
      const adminEmails = await getAdminEmails();
      if (adminEmails.length === 0) {
        alert("No admin emails found.");
        return;
      }

      // Build HTML table rows
      let tableRows = filtered.map((exam) => `
        <tr>
          <td style="padding:4px 8px;border:1px solid #ddd;">${exam.exam_name}</td>
          <td style="padding:4px 8px;border:1px solid #ddd;">${exam.batches?.batch_name || ''}</td>
          <td style="padding:4px 8px;border:1px solid #ddd;">${exam.batches?.mediums?.name || '—'}</td>
          <td style="padding:4px 8px;border:1px solid #ddd;">${exam.exam_date}</td>
          <td style="padding:4px 8px;border:1px solid #ddd;text-align:center;">${exam.total_marks || '-'}</td>
        </tr>
      `).join('');

      const htmlBody = `
        <div style="font-family:Arial,sans-serif;max-width:800px;margin:0 auto;">
          <h2 style="color:#0D47A1;">Exam Results Report</h2>
          <p><strong>Organization:</strong> ${org?.company_name || 'Academy'}</p>
          <p><strong>Branch:</strong> ${branch?.branch_name || 'N/A'}</p>
          <p><strong>Total Exams:</strong> ${filtered.length}</p>
          <hr />
          <table style="width:100%;border-collapse:collapse;font-size:11px;border:1px solid #ddd;">
            <thead style="background:#e3f2fd;">
              <tr>
                <th style="padding:4px 8px;border:1px solid #ddd;text-align:left;">Exam</th>
                <th style="padding:4px 8px;border:1px solid #ddd;text-align:left;">Batch</th>
                <th style="padding:4px 8px;border:1px solid #ddd;text-align:left;">Medium</th>
                <th style="padding:4px 8px;border:1px solid #ddd;text-align:left;">Date</th>
                <th style="padding:4px 8px;border:1px solid #ddd;text-align:center;">Total Marks</th>
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
        to: adminEmails,
        subject: `Exam Results Report - ${new Date().toLocaleDateString()}`,
        html: htmlBody,
       // from: org?.email || undefined,
      });

      alert("Report sent to admins.");
    } catch (err) {
      console.error("Failed to send report:", err);
      alert("Failed to send report. Check console for details.");
    }
  };

  // ─── Send Results Email to Students ───────────────────────────────
  const sendResultsEmail = async (examId) => {
    setSendingEmailId(examId);
    try {
      // 1. Fetch exam details with batch and subject
      const { data: exam, error: examError } = await supabase
        .from("exams")
        .select(`
          *,
          batches(batch_name),
          subjects(subject_name)
        `)
        .eq("id", examId)
        .single();
      if (examError) throw examError;

      // 2. Fetch student results for this exam with student details
      const { data: results, error: resultsError } = await supabase
        .from("student_results")
        .select(`
          marks_obtained,
          grade,
          remarks,
          students(id, first_name, last_name, email)
        `)
        .eq("exam_id", examId)
        .eq("branch_id", branchId)
        .eq("financial_year_id", financialYearId);
      if (resultsError) throw resultsError;

      if (!results || results.length === 0) {
        toast.error("No results found for this exam.");
        setSendingEmailId(null);
        return;
      }

      const totalMarks = exam.total_marks || 0;

      // 3. Send email to each student (or parent)
      let sentCount = 0;
      for (const result of results) {
        const student = result.students;
        if (!student || !student.email) continue;

        // Try to find parent email
        let recipientEmail = student.email;
        const { data: parent, error: parentError } = await supabase
          .from("student_parents")
          .select("parents!inner(email)")
          .eq("student_id", student.id)
          .maybeSingle();
        if (!parentError && parent && parent.parents?.email) {
          recipientEmail = parent.parents.email;
        }

        const context = {
          academyName: org?.company_name || "Academy",
          student_name: `${student.first_name || ''} ${student.last_name || ''}`.trim(),
          exam_name: exam.exam_name,
          subject_name: exam.subjects?.subject_name || '',
          marks_obtained: result.marks_obtained || 0,
          total_marks: totalMarks,
          grade: result.grade || '',
          remarks: result.remarks || '',
        };

        await sendTemplateEmail({
          to: recipientEmail,
          organizationId: org?.id,
          slug: "results_published",
          context,
          branchId,
        });
        sentCount++;
      }

      toast.success(`Results sent to ${sentCount} student(s).`);
    } catch (err) {
      console.error("Send results error:", err);
      toast.error("Failed to send results emails.");
    } finally {
      setSendingEmailId(null);
    }
  };

  // ─── Fetch exams ────────────────────────────────────────────────────
  const {
    data: exams = [],
    isLoading,
    isError,
    error,
  } = useQuery({
    queryKey: ["all-exams", branchId, financialYearId],
    queryFn: async () => {
      const result = await getAllExams(branchId, financialYearId);
      if (!result) throw new Error("No data returned");
      return result;
    },
    enabled: !!branchId && !!financialYearId,
    staleTime: 5 * 60 * 1000,
  });

  const filtered = exams.filter((exam) =>
    exam.exam_name.toLowerCase().includes(search.toLowerCase())
  );

  if (isError) {
    return (
      <div className="p-8 text-center text-red-600">
        <AlertCircle size={32} className="mx-auto mb-2" />
        <p>Failed to load exams.</p>
        <p className="text-sm mt-1">{error?.message || "Unknown error"}</p>
      </div>
    );
  }

  return (
    <>
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-6 gap-4">
        <div>
          <h1 className="text-3xl font-righteous text-primary-dark">Results</h1>
          <p className="text-sm text-secondary-dark font-montserrat mt-1">
            Enter and view exam results
          </p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={sendReportEmail}
            className="bg-green-600 hover:bg-green-700 text-white px-4 py-2 rounded-lg text-sm flex items-center gap-2"
          >
            <Mail size={16} /> Send Report
          </button>
        </div>
      </div>

      <div className="relative mb-6 max-w-md">
        <Search
          size={18}
          className="absolute left-3 top-1/2 -translate-y-1/2 text-secondary"
        />
        <input
          type="text"
          placeholder="Search exam..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full border border-secondary-light rounded-lg pl-10 pr-4 py-2.5 text-sm focus:ring-1 focus:ring-primary focus:border-primary outline-none placeholder-secondary-light"
        />
      </div>

      <div className="bg-white rounded-xl shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[700px]">
            <thead className="bg-slate-100 border-b border-secondary-light">
              <tr>
                <th className="p-3 text-left text-sm font-montserrat text-secondary-dark">Exam</th>
                <th className="p-3 text-left text-sm font-montserrat text-secondary-dark">Batch</th>
                <th className="p-3 text-left text-sm font-montserrat text-secondary-dark">Medium</th>
                <th className="p-3 text-left text-sm font-montserrat text-secondary-dark">Date</th>
                <th className="p-3 text-left text-sm font-montserrat text-secondary-dark">Total Marks</th>
                <th className="p-3 text-left text-sm font-montserrat text-secondary-dark">Actions</th>
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                <tr>
                  <td colSpan={6} className="p-6 text-center text-secondary">
                    Loading exams…
                  </td>
                </tr>
              ) : filtered.length === 0 ? (
                <tr>
                  <td colSpan={6} className="p-6 text-center text-secondary">
                    <div className="flex flex-col items-center gap-2">
                      <Award size={32} className="text-secondary-light" />
                      <span>No exams found</span>
                    </div>
                  </td>
                </tr>
              ) : (
                filtered.map((exam) => (
                  <tr
                    key={exam.id}
                    className="border-b border-secondary-light hover:bg-primary-bg transition"
                  >
                    <td className="p-3 text-sm font-medium">{exam.exam_name}</td>
                    <td className="p-3 text-sm">{exam.batches?.batch_name}</td>
                    <td className="p-3 text-sm">{exam.batches?.mediums?.name || "—"}</td>
                    <td className="p-3 text-sm">{exam.exam_date}</td>
                    <td className="p-3 text-sm">{exam.total_marks || "-"}</td>
                    <td className="p-3 text-sm">
                      <div className="flex gap-2 flex-wrap">
                        {isAdmin && (
                          <button
                            onClick={() => navigate(`/results/enter/${exam.id}`)}
                            className="text-green-600 hover:underline flex items-center gap-1"
                          >
                            <Edit3 size={15} /> Enter Results
                          </button>
                        )}
                        <button
                          onClick={() => navigate(`/results/view/${exam.id}`)}
                          className="text-blue-600 hover:underline flex items-center gap-1"
                        >
                          <Eye size={15} /> View Results
                        </button>
                        {/* 👇 Send Results Email button */}
                        <button
                          onClick={() => sendResultsEmail(exam.id)}
                          disabled={sendingEmailId === exam.id}
                          className="text-purple-600 hover:underline flex items-center gap-1 disabled:opacity-50"
                          title="Send results to students"
                        >
                          <Mail size={15} />
                          {sendingEmailId === exam.id ? '...' : ''}
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}