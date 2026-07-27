// src/pages/Results.jsx
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { Search, Award, Edit3, Eye, AlertCircle, Mail } from "lucide-react";

import BackButton from "../components/BackButton";
import { getAllExams } from "../services/examService";
import { useAuth } from "../context/AuthContext";
import { useOrg } from "../context/OrganizationContext";
import { useTheme } from "../context/ThemeContext"; // 👈 import theme
import { supabase } from "../api/supabase";
import toast from "react-hot-toast";
import { sendEmail, sendTemplateEmail } from "../services/emailService";

export default function Results() {
  const navigate = useNavigate();
  const { profile } = useAuth();
  const { branch, selectedFinancialYear, org } = useOrg();
  const theme = useTheme(); // 👈 get theme object
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

      // Build HTML table rows using theme colours
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
          <h2 style="color:${theme.primary_color};">Exam Results Report</h2>
          <p><strong>Organization:</strong> ${org?.company_name || 'Academy'}</p>
          <p><strong>Branch:</strong> ${branch?.branch_name || 'N/A'}</p>
          <p><strong>Total Exams:</strong> ${filtered.length}</p>
          <hr />
          <table style="width:100%;border-collapse:collapse;font-size:11px;border:1px solid #ddd;">
            <thead style="background:${theme.primary_light_color || '#e3f2fd'};">
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

      let sentCount = 0;
      for (const result of results) {
        const student = result.students;
        if (!student || !student.email) continue;

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
      <div className="p-8 text-center text-accent-dark dark:text-accent-light">
        <AlertCircle size={32} className="mx-auto mb-2" />
        <p>Failed to load exams.</p>
        <p className="text-sm mt-1">{error?.message || "Unknown error"}</p>
      </div>
    );
  }

  return (
    <div className="space-y-6 px-4 sm:px-6 lg:px-0">
      <BackButton to="/academics" label="Academics" />

      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-6 gap-4">
        <div>
          <h1 className="text-3xl font-heading text-primary">
            Results
          </h1>
          <p className="text-sm text-gray-600 dark:text-gray-400 font-body mt-1">
            Enter and view exam results
          </p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={sendReportEmail}
            className="bg-primary hover:bg-primary-dark text-white px-4 py-2 rounded-lg text-sm flex items-center gap-2 font-body"
          >
            <Mail size={16} /> Send Report
          </button>
        </div>
      </div>

      <div className="relative mb-6 max-w-md">
        <Search
          size={18}
          className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 dark:text-gray-500"
        />
        <input
          type="text"
          placeholder="Search exam..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 rounded-lg pl-10 pr-4 py-2.5 text-sm focus:ring-2 focus:ring-primary focus:border-primary outline-none placeholder-gray-400 dark:placeholder-gray-500"
        />
      </div>

      <div className="bg-white dark:bg-accent rounded-xl shadow-sm overflow-hidden border border-gray-200 dark:border-gray-700">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[700px]">
            <thead className="bg-gray-50 dark:bg-gray-700 border-b border-gray-200 dark:border-gray-600">
              <tr>
                <th className="p-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                  Exam
                </th>
                <th className="p-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                  Batch
                </th>
                <th className="p-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                  Medium
                </th>
                <th className="p-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                  Date
                </th>
                <th className="p-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                  Total Marks
                </th>
                <th className="p-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
              {isLoading ? (
                <tr>
                  <td colSpan={6} className="p-6 text-center text-gray-500 dark:text-gray-400">
                    Loading exams…
                  </td>
                </tr>
              ) : filtered.length === 0 ? (
                <tr>
                  <td colSpan={6} className="p-6 text-center text-gray-500 dark:text-gray-400">
                    <div className="flex flex-col items-center gap-2">
                      <Award size={32} className="text-gray-400 dark:text-gray-500" />
                      <span>No exams found</span>
                    </div>
                  </td>
                </tr>
              ) : (
                filtered.map((exam) => (
                  <tr
                    key={exam.id}
                    className="hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
                  >
                    <td className="p-3 text-sm font-medium text-gray-800 dark:text-gray-100">
                      {exam.exam_name}
                    </td>
                    <td className="p-3 text-sm text-gray-700 dark:text-gray-200">
                      {exam.batches?.batch_name}
                    </td>
                    <td className="p-3 text-sm text-gray-700 dark:text-gray-200">
                      {exam.batches?.mediums?.name || "—"}
                    </td>
                    <td className="p-3 text-sm text-gray-700 dark:text-gray-200">
                      {exam.exam_date}
                    </td>
                    <td className="p-3 text-sm text-gray-700 dark:text-gray-200">
                      {exam.total_marks || "-"}
                    </td>
                    <td className="p-3 text-sm">
                      <div className="flex gap-2 flex-wrap">
                        {isAdmin && (
                          <button
                            onClick={() => navigate(`/results/enter/${exam.id}`)}
                            className="text-accent hover:underline flex items-center gap-1"
                          >
                            <Edit3 size={15} /> Enter Results
                          </button>
                        )}
                        <button
                          onClick={() => navigate(`/results/view/${exam.id}`)}
                          className="text-primary hover:underline flex items-center gap-1"
                        >
                          <Eye size={15} /> View Results
                        </button>
                        <button
                          onClick={() => sendResultsEmail(exam.id)}
                          disabled={sendingEmailId === exam.id}
                          className="text-accent hover:underline flex items-center gap-1 disabled:opacity-50"
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
    </div>
  );
}