// src/pages/ProgressEvaluations.jsx
import React, { useState, useRef, useMemo } from "react";
import {
  useInfiniteQuery,
  useMutation,
  useQueryClient,
  useQuery,
} from "@tanstack/react-query";
import toast from "react-hot-toast";
import {
  Search,
  Plus,
  Edit3,
  Trash2,
  Filter,
  Download,
  Upload,
  X,
  TrendingUp,
  Calendar,
  Mail,
} from "lucide-react";
import Papa from "papaparse";

import BackButton from "../components/BackButton";
import ProgressEvaluationForm from "../components/ProgressEvaluationForm";
import {
  getProgressEvaluations,
  createProgressEvaluation,
  updateProgressEvaluation,
  deleteProgressEvaluation,
  getActiveBatches,
  getAllProgressEvaluationsForExport,
  getMediumOptions,
} from "../services/progressService";
import { useOrg } from "../context/OrganizationContext";
import { useTheme } from "../context/ThemeContext"; // ✅ dynamic theme
import { supabase } from "../api/supabase";
import { sendEmail } from "../services/emailService";

export default function ProgressEvaluations() {
  const queryClient = useQueryClient();

  const { branch, selectedFinancialYear, org } = useOrg();
  const theme = useTheme(); // ✅ theme hook
  const branchId = branch?.id;
  const financialYearId = selectedFinancialYear?.id;
  const ctx = { branchId, financialYearId };

  const headingFont = theme?.font_heading || "Righteous";
  const bodyFont = theme?.font_body || "Montserrat";

  // Filters
  const [batchFilter, setBatchFilter] = useState("");
  const [mediumFilter, setMediumFilter] = useState("");
  const [search, setSearch] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [showFilters, setShowFilters] = useState(false);
  const allFilters = {
    batchId: batchFilter,
    medium_id: mediumFilter,
    search,
    startDate,
    endDate,
  };

  // UI state
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState(null);
  const fileInputRef = useRef(null);

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
    if (evaluations.length === 0) {
      alert("No evaluations to send.");
      return;
    }

    try {
      const adminEmails = await getAdminEmails();
      if (adminEmails.length === 0) {
        alert("No admin emails found.");
        return;
      }

      // Build HTML table rows
      let tableRows = evaluations.map((e) => {
        const studentName = e.students ? `${e.students.first_name || ''} ${e.students.last_name || ''}`.trim() : '—';
        const admissionNo = e.students?.admission_no || '—';
        const batchName = e.batches?.batch_name || '—';
        const mediumName = e.medium_name || '—';
        const date = e.evaluation_date || '—';
        const attendance = e.attendance_percentage != null ? `${e.attendance_percentage}%` : '-';
        const score = e.performance_score != null ? e.performance_score : '-';
        const remarks = e.teacher_remarks || '-';

        return `
          <tr>
            <td style="padding:4px 8px;border:1px solid #ddd;">${studentName}</td>
            <td style="padding:4px 8px;border:1px solid #ddd;">${admissionNo}</td>
            <td style="padding:4px 8px;border:1px solid #ddd;">${batchName}</td>
            <td style="padding:4px 8px;border:1px solid #ddd;">${mediumName}</td>
            <td style="padding:4px 8px;border:1px solid #ddd;">${date}</td>
            <td style="padding:4px 8px;border:1px solid #ddd;text-align:center;">${attendance}</td>
            <td style="padding:4px 8px;border:1px solid #ddd;text-align:center;">${score}</td>
            <td style="padding:4px 8px;border:1px solid #ddd;">${remarks}</td>
          </tr>
        `;
      }).join('');

      const htmlBody = `
        <div style="font-family:Arial,sans-serif;max-width:800px;margin:0 auto;">
          <h2 style="color:#0D47A1;">Progress Evaluation Report</h2>
          <p><strong>Branch:</strong> ${branch?.branch_name || 'N/A'}</p>
          <p><strong>Total Evaluations:</strong> ${evaluations.length}</p>
          <p><strong>Filters:</strong> ${JSON.stringify(allFilters).replace(/[{}"]/g,'')}</p>
          <hr />
          <table style="width:100%;border-collapse:collapse;font-size:11px;border:1px solid #ddd;">
            <thead style="background:#e3f2fd;">
              <tr>
                <th style="padding:4px 8px;border:1px solid #ddd;text-align:left;">Student</th>
                <th style="padding:4px 8px;border:1px solid #ddd;text-align:left;">Admission No</th>
                <th style="padding:4px 8px;border:1px solid #ddd;text-align:left;">Batch</th>
                <th style="padding:4px 8px;border:1px solid #ddd;text-align:left;">Medium</th>
                <th style="padding:4px 8px;border:1px solid #ddd;text-align:left;">Date</th>
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
        to: adminEmails,
        subject: `Progress Evaluation Report - ${new Date().toLocaleDateString()}`,
        html: htmlBody,
        // from: org?.email || undefined,
      });

      alert("Report sent to admins.");
    } catch (err) {
      console.error("Failed to send report:", err);
      alert("Failed to send report. Check console for details.");
    }
  };

  // ─── Dropdowns ──────────────────────────────────────────────────────
  const { data: batches = [] } = useQuery({
    queryKey: ["active-batches", branchId, financialYearId],
    queryFn: () => getActiveBatches(branchId, financialYearId),
    enabled: !!branchId && !!financialYearId,
    staleTime: 10 * 60 * 1000,
  });

  const { data: mediums = [] } = useQuery({
    queryKey: ["mediums"],
    queryFn: getMediumOptions,
    staleTime: 10 * 60 * 1000,
  });

  // ─── Infinite query ─────────────────────────────────────────────────
  const {
    data,
    isLoading,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
  } = useInfiniteQuery({
    queryKey: ["progress-evaluations", allFilters, branchId, financialYearId],
    queryFn: ({ pageParam = 0 }) =>
      getProgressEvaluations({ pageParam, filters: allFilters, branchId, financialYearId }),
    getNextPageParam: (lastPage, allPages) => {
      const totalFetched = allPages.reduce((sum, page) => sum + page.data.length, 0);
      if (lastPage.count && totalFetched < lastPage.count) {
        return allPages.length;
      }
      return undefined;
    },
    initialPageParam: 0,
    enabled: !!branchId && !!financialYearId,
    staleTime: 2 * 60 * 1000,
  });

  const evaluations = data?.pages.flatMap((page) => page.data) || [];

  // ─── Averages ──────────────────────────────────────────────────────
  const averages = useMemo(() => {
    const items = evaluations.filter(
      (e) => e.attendance_percentage != null && e.performance_score != null
    );
    if (items.length === 0) return { avgAttendance: "—", avgScore: "—" };
    const totalAtt = items.reduce((sum, e) => sum + Number(e.attendance_percentage), 0);
    const totalScore = items.reduce((sum, e) => sum + Number(e.performance_score), 0);
    return {
      avgAttendance: (totalAtt / items.length).toFixed(1) + "%",
      avgScore: (totalScore / items.length).toFixed(1),
    };
  }, [evaluations]);

  // ─── Mutations ──────────────────────────────────────────────────────
  const createMutation = useMutation({
    mutationFn: (payload) => createProgressEvaluation(payload, ctx),
    onSuccess: () => {
      toast.success("Evaluation saved");
      queryClient.invalidateQueries({ queryKey: ["progress-evaluations"] });
      setShowForm(false);
    },
    onError: () => toast.error("Failed to create evaluation"),
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, payload }) => updateProgressEvaluation(id, payload, ctx),
    onSuccess: () => {
      toast.success("Evaluation updated");
      queryClient.invalidateQueries({ queryKey: ["progress-evaluations"] });
      setEditing(null);
    },
    onError: () => toast.error("Failed to update evaluation"),
  });

  const deleteMutation = useMutation({
    mutationFn: (id) => deleteProgressEvaluation(id, branchId, financialYearId),
    onSuccess: () => {
      toast.success("Evaluation deleted");
      queryClient.invalidateQueries({ queryKey: ["progress-evaluations"] });
    },
    onError: () => toast.error("Delete failed"),
  });

  // ─── CSV handlers ──────────────────────────────────────────────────
  async function handleCSVImport(event) {
    const file = event.target.files[0];
    if (!file) return;
    Papa.parse(file, {
      header: true,
      skipEmptyLines: true,
      complete: async (results) => {
        let successCount = 0;
        for (const row of results.data) {
          try {
            const payload = {
              student_id: row.student_id,
              batch_id: row.batch_id,
              evaluation_date: row.evaluation_date || new Date().toISOString().split("T")[0],
              attendance_percentage: row.attendance_percentage ? Number(row.attendance_percentage) : null,
              performance_score: row.performance_score ? Number(row.performance_score) : null,
              teacher_remarks: row.teacher_remarks || "",
            };
            await createProgressEvaluation(payload, ctx);
            successCount++;
          } catch (err) {
            console.error(err);
          }
        }
        toast.success(`${successCount} evaluations imported`);
        queryClient.invalidateQueries({ queryKey: ["progress-evaluations"] });
      },
      error: () => toast.error("CSV parsing error"),
    });
  }

  async function handleCSVExport() {
    try {
      const allData = await getAllProgressEvaluationsForExport(
        allFilters,
        branchId,
        financialYearId
      );
      const csv = Papa.unparse(
        allData.map((e) => ({
          student: `${e.students?.first_name} ${e.students?.last_name}`,
          admission_no: e.students?.admission_no,
          batch: e.batches?.batch_name,
          course: e.batches?.courses?.course_name,
          medium: e.medium_name || "",
          evaluation_date: e.evaluation_date,
          attendance_percentage: e.attendance_percentage,
          performance_score: e.performance_score,
          teacher_remarks: e.teacher_remarks,
        }))
      );
      const blob = new Blob([csv], { type: "text/csv" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "progress_evaluations.csv";
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      toast.error("Export failed");
    }
  }

  function handleCreate(payload) {
    createMutation.mutate(payload);
  }

  function handleUpdate(payload) {
    updateMutation.mutate({ id: editing.id, payload });
  }

  function handleDelete(id) {
    if (!window.confirm("Delete this evaluation?")) return;
    deleteMutation.mutate(id);
  }

  return (
    <>
      <BackButton to="/academics-hub" label="Academics" />

      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-6 gap-4">
        <div>
          <h1
            className="text-3xl font-bold text-primary"
            style={{ fontFamily: headingFont }}
          >
            Progress Evaluations
          </h1>
          <p
            className="text-sm text-primary-dark mt-1"
            style={{ fontFamily: bodyFont }}
          >
            Track student performance over time
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {/* Send Report button */}
          <button
            onClick={sendReportEmail}
            className="bg-accent hover:bg-accent-dark text-white px-5 py-2.5 rounded-lg transition text-sm flex items-center gap-2"
            style={{ fontFamily: bodyFont }}
          >
            <Mail size={18} /> Send Report
          </button>
          <button
            onClick={() => setShowForm(true)}
            className="bg-primary hover:bg-primary-light text-white px-5 py-2.5 rounded-lg transition text-sm flex items-center gap-2"
            style={{ fontFamily: bodyFont }}
          >
            <TrendingUp size={18} /> Add Evaluation
          </button>
          <button
            onClick={handleCSVExport}
            className="border border-primary-bg px-4 py-2.5 rounded-lg text-primary-dark hover:bg-primary-bg text-sm flex items-center gap-2"
            style={{ fontFamily: bodyFont }}
          >
            <Download size={18} /> Export
          </button>
          <button
            onClick={() => fileInputRef.current?.click()}
            className="border border-primary-bg px-4 py-2.5 rounded-lg text-primary-dark hover:bg-primary-bg text-sm flex items-center gap-2"
            style={{ fontFamily: bodyFont }}
          >
            <Upload size={18} /> Import
          </button>
          <input
            type="file"
            ref={fileInputRef}
            className="hidden"
            accept=".csv"
            onChange={handleCSVImport}
          />
        </div>
      </div>

      {/* Search & Filter Toggle */}
      <div className="flex flex-col sm:flex-row gap-3 mb-4">
        <div className="relative flex-1">
          <Search
            size={18}
            className="absolute left-3 top-1/2 -translate-y-1/2 text-primary-dark/60"
          />
          <input
            type="text"
            placeholder="Search by student name..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full border border-primary-bg bg-white text-primary-dark rounded-lg pl-10 pr-4 py-2.5 text-sm focus:ring-1 focus:ring-primary focus:border-primary outline-none placeholder-primary-dark/40"
            style={{ fontFamily: bodyFont }}
          />
        </div>
        <button
          onClick={() => setShowFilters(!showFilters)}
          className="border border-primary-bg px-4 py-2.5 rounded-lg text-primary-dark hover:bg-primary-bg text-sm flex items-center gap-2"
          style={{ fontFamily: bodyFont }}
        >
          <Filter size={18} /> Filters
          {showFilters && <X size={16} />}
        </button>
      </div>

      {/* Advanced Filters Panel */}
      {showFilters && (
        <div className="bg-white rounded-xl p-4 shadow-sm mb-4 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 border border-primary-bg">
          <div>
            <label
              className="text-xs text-primary-dark"
              style={{ fontFamily: bodyFont }}
            >
              Batch
            </label>
            <select
              value={batchFilter}
              onChange={(e) => setBatchFilter(e.target.value)}
              className="w-full border border-primary-bg bg-white text-primary-dark rounded p-2 text-sm mt-1 focus:ring-1 focus:ring-primary"
            >
              <option value="">All Batches</option>
              {batches.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.batch_name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label
              className="text-xs text-primary-dark"
              style={{ fontFamily: bodyFont }}
            >
              Medium
            </label>
            <select
              value={mediumFilter}
              onChange={(e) => setMediumFilter(e.target.value)}
              className="w-full border border-primary-bg bg-white text-primary-dark rounded p-2 text-sm mt-1 focus:ring-1 focus:ring-primary"
            >
              <option value="">All Mediums</option>
              {mediums.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label
              className="text-xs text-primary-dark"
              style={{ fontFamily: bodyFont }}
            >
              From Date
            </label>
            <input
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              className="w-full border border-primary-bg bg-white text-primary-dark rounded p-2 text-sm mt-1 focus:ring-1 focus:ring-primary"
            />
          </div>
          <div>
            <label
              className="text-xs text-primary-dark"
              style={{ fontFamily: bodyFont }}
            >
              To Date
            </label>
            <input
              type="date"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              className="w-full border border-primary-bg bg-white text-primary-dark rounded p-2 text-sm mt-1 focus:ring-1 focus:ring-primary"
            />
          </div>
          <div className="flex items-end">
            <button
              onClick={() => {
                setSearch("");
                setBatchFilter("");
                setMediumFilter("");
                setStartDate("");
                setEndDate("");
              }}
              className="text-primary text-sm hover:underline"
              style={{ fontFamily: bodyFont }}
            >
              Clear Filters
            </button>
          </div>
        </div>
      )}

      {/* Averages Summary Card */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-6">
        <div className="bg-white rounded-xl p-4 shadow-sm border border-primary-bg flex items-center justify-between">
          <div>
            <p className="text-xs text-primary-dark" style={{ fontFamily: bodyFont }}>
              Average Attendance
            </p>
            <p className="text-2xl font-bold text-primary mt-1" style={{ fontFamily: headingFont }}>
              {averages.avgAttendance}
            </p>
          </div>
          <div className="p-3 rounded-full bg-primary-bg">
            <Calendar size={22} className="text-primary" />
          </div>
        </div>
        <div className="bg-white rounded-xl p-4 shadow-sm border border-primary-bg flex items-center justify-between">
          <div>
            <p className="text-xs text-primary-dark" style={{ fontFamily: bodyFont }}>
              Average Score
            </p>
            <p className="text-2xl font-bold text-primary mt-1" style={{ fontFamily: headingFont }}>
              {averages.avgScore}
            </p>
          </div>
          <div className="p-3 rounded-full bg-primary-bg">
            <TrendingUp size={22} className="text-primary" />
          </div>
        </div>
      </div>

      {/* Evaluations Table */}
      <div className="bg-white rounded-xl shadow-sm overflow-hidden border border-primary-bg">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[900px]">
            <thead className="bg-primary-bg">
              <tr>
                <th
                  className="p-3 text-left text-sm font-medium text-primary-dark uppercase"
                  style={{ fontFamily: bodyFont }}
                >
                  Student
                </th>
                <th
                  className="text-left text-sm font-medium text-primary-dark uppercase"
                  style={{ fontFamily: bodyFont }}
                >
                  Batch
                </th>
                <th
                  className="text-left text-sm font-medium text-primary-dark uppercase"
                  style={{ fontFamily: bodyFont }}
                >
                  Medium
                </th>
                <th
                  className="text-left text-sm font-medium text-primary-dark uppercase"
                  style={{ fontFamily: bodyFont }}
                >
                  Date
                </th>
                <th
                  className="text-left text-sm font-medium text-primary-dark uppercase"
                  style={{ fontFamily: bodyFont }}
                >
                  Attendance %
                </th>
                <th
                  className="text-left text-sm font-medium text-primary-dark uppercase"
                  style={{ fontFamily: bodyFont }}
                >
                  Score
                </th>
                <th
                  className="text-left text-sm font-medium text-primary-dark uppercase"
                  style={{ fontFamily: bodyFont }}
                >
                  Remarks
                </th>
                <th
                  className="text-left text-sm font-medium text-primary-dark uppercase"
                  style={{ fontFamily: bodyFont }}
                >
                  Actions
                </th>
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                <tr>
                  <td
                    colSpan={8}
                    className="p-6 text-center text-primary-dark/60"
                    style={{ fontFamily: bodyFont }}
                  >
                    Loading evaluations…
                  </td>
                </tr>
              ) : evaluations.length === 0 ? (
                <tr>
                  <td
                    colSpan={8}
                    className="p-6 text-center text-primary-dark/60"
                    style={{ fontFamily: bodyFont }}
                  >
                    <div className="flex flex-col items-center gap-2">
                      <TrendingUp size={32} className="text-primary-dark/40" />
                      <span>No evaluations found</span>
                      <span className="text-xs text-primary-dark/60">
                        {search || batchFilter || mediumFilter || startDate || endDate
                          ? "Try adjusting your filters"
                          : "Add a new evaluation to get started"}
                      </span>
                    </div>
                  </td>
                </tr>
              ) : (
                evaluations.map((evalItem) => (
                  <tr
                    key={evalItem.id}
                    className="border-b border-primary-bg hover:bg-primary-bg transition-colors"
                  >
                    <td className="p-3 text-sm">
                      <div className="font-medium text-primary" style={{ fontFamily: headingFont }}>
                        {evalItem.students?.first_name} {evalItem.students?.last_name}
                      </div>
                      <div className="text-xs text-primary-dark/60" style={{ fontFamily: bodyFont }}>
                        {evalItem.students?.admission_no}
                      </div>
                    </td>
                    <td className="text-sm text-primary-dark" style={{ fontFamily: bodyFont }}>
                      {evalItem.batches?.batch_name}
                    </td>
                    <td className="text-sm text-primary-dark" style={{ fontFamily: bodyFont }}>
                      {evalItem.medium_name || "—"}
                    </td>
                    <td className="text-sm text-primary-dark" style={{ fontFamily: bodyFont }}>
                      {evalItem.evaluation_date}
                    </td>
                    <td className="text-sm text-primary-dark" style={{ fontFamily: bodyFont }}>
                      {evalItem.attendance_percentage != null
                        ? `${evalItem.attendance_percentage}%`
                        : "-"}
                    </td>
                    <td className="text-sm text-primary-dark" style={{ fontFamily: bodyFont }}>
                      {evalItem.performance_score != null ? evalItem.performance_score : "-"}
                    </td>
                    <td
                      className="text-sm max-w-[200px] truncate text-primary-dark"
                      style={{ fontFamily: bodyFont }}
                    >
                      {evalItem.teacher_remarks || "-"}
                    </td>
                    <td className="text-sm">
                      <div className="flex gap-2">
                        <button
                          onClick={() => setEditing(evalItem)}
                          className="text-primary hover:underline"
                          title="Edit"
                        >
                          <Edit3 size={15} />
                        </button>
                        <button
                          onClick={() => handleDelete(evalItem.id)}
                          className="text-accent hover:underline"
                          title="Delete"
                        >
                          <Trash2 size={15} />
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

      {/* Load More */}
      {hasNextPage && (
        <div className="flex justify-center mt-6">
          <button
            onClick={() => fetchNextPage()}
            disabled={isFetchingNextPage}
            className="bg-primary hover:bg-primary-light text-white px-6 py-2.5 rounded-lg text-sm font-medium transition disabled:opacity-60"
            style={{ fontFamily: bodyFont }}
          >
            {isFetchingNextPage ? "Loading more…" : "Load More"}
          </button>
        </div>
      )}

      {/* Modals */}
      {showForm && (
        <ProgressEvaluationForm
          onSubmit={handleCreate}
          onClose={() => setShowForm(false)}
        />
      )}
      {editing && (
        <ProgressEvaluationForm
          initialData={editing}
          onSubmit={handleUpdate}
          onClose={() => setEditing(null)}
        />
      )}
    </>
  );
}