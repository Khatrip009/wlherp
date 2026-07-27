// src/pages/AttendanceReports.jsx
import React, { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import toast from "react-hot-toast";
import {
  Download,
  X,
  BarChart3,
  Calendar,
  Layers,
  Mail,
} from "lucide-react";
import Papa from "papaparse";

import BackButton from "../components/BackButton";
import { useOrg } from "../context/OrganizationContext";
import { useTheme } from "../context/ThemeContext";
import { supabase } from "../api/supabase";
import { sendEmail } from "../services/emailService";

import {
  getAttendanceReport,
  getActiveBatches,
  getMediumOptions,
} from "../services/attendanceReportService";

export default function AttendanceReports() {
  const { branch, selectedFinancialYear, org } = useOrg();
  const theme = useTheme();
  const branchId = branch?.id;
  const financialYearId = selectedFinancialYear?.id;

  const headingFont = theme?.font_heading || "Righteous";
  const bodyFont = theme?.font_body || "Montserrat";

  const [filters, setFilters] = useState({
    batch_id: "",
    start_date: "",
    end_date: "",
    medium_id: "",
  });

  // Batches dropdown – scoped
  const { data: batches = [] } = useQuery({
    queryKey: ["active-batches", branchId, financialYearId],
    queryFn: () => getActiveBatches(branchId, financialYearId),
    enabled: !!branchId && !!financialYearId,
    staleTime: 10 * 60 * 1000,
  });

  // Mediums – org‑wide
  const { data: mediums = [] } = useQuery({
    queryKey: ["report-mediums"],
    queryFn: getMediumOptions,
    staleTime: 10 * 60 * 1000,
  });

  // Report generation – scoped
  const {
    mutate: fetchReport,
    data: report = [],
    isLoading: reportLoading,
  } = useMutation({
    mutationFn: () =>
      getAttendanceReport(
        filters.batch_id || null,
        filters.start_date || null,
        filters.end_date || null,
        filters.medium_id || null,
        branchId,
        financialYearId,
      ),
    onError: () => toast.error("Failed to load report"),
    onSuccess: (data) => {
      if (data.length === 0) {
        toast("No attendance data found for the selected criteria", {
          icon: "ℹ️",
        });
      }
    },
  });

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
    if (report.length === 0) {
      alert("No data to send. Please generate a report first.");
      return;
    }

    try {
      const adminEmails = await getAdminEmails();
      if (adminEmails.length === 0) {
        alert("No admin emails found to send the report.");
        return;
      }

      // Build HTML table rows
      let tableRows = report.map((r) => {
        const percentage = Number(r.percentage);
        const statusColor = percentage >= 75 ? "#22c55e" : percentage >= 50 ? "#eab308" : "#ef4444";
        return `
          <tr>
            <td style="padding:4px 8px;border:1px solid #ddd;">${r.admission_no || ""}</td>
            <td style="padding:4px 8px;border:1px solid #ddd;">${r.student_name}</td>
            <td style="padding:4px 8px;border:1px solid #ddd;">${r.batch_name || "—"}</td>
            <td style="padding:4px 8px;border:1px solid #ddd;">${r.medium_name || "—"}</td>
            <td style="padding:4px 8px;border:1px solid #ddd;text-align:center;">${r.total_sessions}</td>
            <td style="padding:4px 8px;border:1px solid #ddd;text-align:center;">${r.present_count}</td>
            <td style="padding:4px 8px;border:1px solid #ddd;text-align:center;font-weight:bold;color:${statusColor};">${r.percentage}%</td>
          </tr>
        `;
      }).join('');

      const totalStudents = report.length;
      const avgAttendance = (report.reduce((sum, r) => sum + Number(r.percentage), 0) / totalStudents).toFixed(1);

      // Build full HTML body (email template – left unchanged)
      const htmlBody = `
        <div style="font-family:Arial,sans-serif;max-width:800px;margin:0 auto;">
          <h2 style="color:#0D47A1;">Attendance Report</h2>
          <p><strong>Branch:</strong> ${branch?.branch_name || 'N/A'}</p>
          <p><strong>Period:</strong> ${filters.start_date || 'Start'} to ${filters.end_date || 'End'}</p>
          <p><strong>Batch:</strong> ${filters.batch_id ? batches.find(b => b.id == filters.batch_id)?.batch_name || 'N/A' : 'All Batches'}</p>
          <p><strong>Medium:</strong> ${filters.medium_id ? mediums.find(m => m.id == filters.medium_id)?.name || 'N/A' : 'All Mediums'}</p>
          <p><strong>Total Students:</strong> ${totalStudents}</p>
          <p><strong>Average Attendance:</strong> ${avgAttendance}%</p>
          <hr />
          <h3>Student-wise Attendance</h3>
          <table style="width:100%;border-collapse:collapse;font-size:12px;">
            <thead>
              <tr style="background:#e3f2fd;">
                <th style="padding:4px 8px;border:1px solid #ddd;text-align:left;">Admission No</th>
                <th style="padding:4px 8px;border:1px solid #ddd;text-align:left;">Student</th>
                <th style="padding:4px 8px;border:1px solid #ddd;text-align:left;">Batch</th>
                <th style="padding:4px 8px;border:1px solid #ddd;text-align:left;">Medium</th>
                <th style="padding:4px 8px;border:1px solid #ddd;text-align:center;">Total Sessions</th>
                <th style="padding:4px 8px;border:1px solid #ddd;text-align:center;">Present</th>
                <th style="padding:4px 8px;border:1px solid #ddd;text-align:center;">%</th>
              </tr>
            </thead>
            <tbody>
              ${tableRows}
            </tbody>
            <tfoot>
              <tr style="font-weight:bold;background:#f5f5f5;">
                <td colspan="6" style="padding:4px 8px;border:1px solid #ddd;text-align:right;">Average</td>
                <td style="padding:4px 8px;border:1px solid #ddd;text-align:center;">${avgAttendance}%</td>
              </tr>
            </tfoot>
          </table>
          <p style="color:#888;font-size:10px;margin-top:20px;">Computer‑generated report from ${org?.company_name || 'Academy'}</p>
        </div>
      `;

      await sendEmail({
        to: adminEmails,
        subject: `Attendance Report - ${new Date().toLocaleDateString()}`,
        html: htmlBody,
        from: org?.email || undefined,
      });

      alert("Report sent to admins.");
    } catch (err) {
      console.error("Failed to send report:", err);
      alert("Failed to send report. Check console for details.");
    }
  };

  function handleFilterChange(e) {
    setFilters((prev) => ({ ...prev, [e.target.name]: e.target.value }));
  }

  function clearFilters() {
    setFilters({ batch_id: "", start_date: "", end_date: "", medium_id: "" });
  }

  function exportCSV() {
    if (report.length === 0) return;
    const csv = Papa.unparse(
      report.map((r) => ({
        admission_no: r.admission_no,
        student_name: r.student_name,
        batch: r.batch_name,
        medium: r.medium_name,
        total_sessions: r.total_sessions,
        present_count: r.present_count,
        percentage: r.percentage,
      }))
    );
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "attendance_report.csv";
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="space-y-6 px-4 sm:px-6 lg:px-0">
      {/* Header */}
      <div>
        <BackButton to="/academics-hub" label="Academics" />
        <h1 className="text-2xl sm:text-3xl font-bold text-primary" style={{ fontFamily: headingFont }}>
          Attendance Reports
        </h1>
        <p className="text-sm text-primary-dark mt-1" style={{ fontFamily: bodyFont }}>
          View student‑wise attendance percentages
        </p>
      </div>

      {/* Filters Card */}
      <div className="bg-white rounded-xl p-5 shadow-sm border border-primary-bg">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4 items-end">
          <div>
            <label className="block text-sm mb-1 text-primary-dark" style={{ fontFamily: bodyFont }}>
              <Layers size={14} className="inline mr-1" />
              Batch
            </label>
            <select
              name="batch_id"
              value={filters.batch_id}
              onChange={handleFilterChange}
              className="w-full border border-primary-bg bg-white text-primary-dark rounded p-2.5 text-sm"
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
            <label className="block text-sm mb-1 text-primary-dark" style={{ fontFamily: bodyFont }}>
              <Layers size={14} className="inline mr-1" />
              Medium
            </label>
            <select
              name="medium_id"
              value={filters.medium_id}
              onChange={handleFilterChange}
              className="w-full border border-primary-bg bg-white text-primary-dark rounded p-2.5 text-sm"
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
            <label className="block text-sm mb-1 text-primary-dark" style={{ fontFamily: bodyFont }}>
              <Calendar size={14} className="inline mr-1" />
              Start Date
            </label>
            <input
              type="date"
              name="start_date"
              value={filters.start_date}
              onChange={handleFilterChange}
              className="w-full border border-primary-bg bg-white text-primary-dark rounded p-2.5 text-sm"
            />
          </div>
          <div>
            <label className="block text-sm mb-1 text-primary-dark" style={{ fontFamily: bodyFont }}>
              <Calendar size={14} className="inline mr-1" />
              End Date
            </label>
            <input
              type="date"
              name="end_date"
              value={filters.end_date}
              onChange={handleFilterChange}
              className="w-full border border-primary-bg bg-white text-primary-dark rounded p-2.5 text-sm"
            />
          </div>
          <div className="flex gap-2">
            <button
              onClick={() => fetchReport()}
              disabled={reportLoading}
              className="flex-1 bg-primary hover:bg-primary-light text-white px-6 py-2.5 rounded-lg font-medium text-sm transition disabled:opacity-50 flex items-center justify-center gap-2"
              style={{ fontFamily: bodyFont }}
            >
              <BarChart3 size={18} />
              {reportLoading ? "Loading…" : "Generate"}
            </button>
            <button
              onClick={clearFilters}
              className="border border-primary-bg px-3 py-2.5 rounded-lg text-primary-dark hover:bg-primary-bg transition"
              title="Clear filters"
            >
              <X size={18} />
            </button>
          </div>
        </div>
      </div>

      {/* Report Actions */}
      {report.length > 0 && (
        <div className="flex justify-end gap-3">
          <button
            onClick={sendReportEmail}
            className="inline-flex items-center gap-2 px-4 py-2.5 bg-accent hover:bg-accent-dark text-white rounded-lg transition-colors text-sm font-medium"
            style={{ fontFamily: bodyFont }}
          >
            <Mail size={18} /> Send Report
          </button>
          <button
            onClick={exportCSV}
            className="inline-flex items-center gap-2 px-4 py-2.5 border border-primary-bg bg-white text-primary-dark rounded-lg hover:bg-primary-bg transition-colors text-sm"
            style={{ fontFamily: bodyFont }}
          >
            <Download size={18} /> Export CSV
          </button>
        </div>
      )}

      {/* Results Table */}
      <div className="bg-white rounded-xl shadow-sm border border-primary-bg overflow-hidden">
        {reportLoading ? (
          <div className="p-8 text-center text-primary-dark/60">
            <BarChart3 size={32} className="mx-auto mb-2 animate-pulse" />
            <p style={{ fontFamily: bodyFont }}>Generating report…</p>
          </div>
        ) : report.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[800px]">
              <thead className="bg-primary-bg">
                <tr>
                  <th className="p-3 text-left text-xs font-medium text-primary-dark uppercase tracking-wider">
                    Admission No
                  </th>
                  <th className="p-3 text-left text-xs font-medium text-primary-dark uppercase tracking-wider">
                    Student
                  </th>
                  <th className="p-3 text-left text-xs font-medium text-primary-dark uppercase tracking-wider">
                    Batch
                  </th>
                  <th className="p-3 text-left text-xs font-medium text-primary-dark uppercase tracking-wider">
                    Medium
                  </th>
                  <th className="p-3 text-left text-xs font-medium text-primary-dark uppercase tracking-wider">
                    Total Sessions
                  </th>
                  <th className="p-3 text-left text-xs font-medium text-primary-dark uppercase tracking-wider">
                    Present
                  </th>
                  <th className="p-3 text-left text-xs font-medium text-primary-dark uppercase tracking-wider">
                    Attendance %
                  </th>
                  <th className="p-3 text-left text-xs font-medium text-primary-dark uppercase tracking-wider">
                    Status
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-primary-bg">
                {report.map((row) => (
                  <tr
                    key={row.student_id}
                    className="hover:bg-primary-bg transition-colors"
                  >
                    <td className="p-3 text-sm text-primary-dark">
                      {row.admission_no}
                    </td>
                    <td className="p-3 text-sm font-medium text-primary" style={{ fontFamily: bodyFont }}>
                      {row.student_name}
                    </td>
                    <td className="p-3 text-sm text-primary-dark">
                      {row.batch_name || "—"}
                    </td>
                    <td className="p-3 text-sm text-primary-dark">
                      {row.medium_name || "—"}
                    </td>
                    <td className="p-3 text-sm text-primary-dark">
                      {row.total_sessions}
                    </td>
                    <td className="p-3 text-sm text-primary-dark">
                      {row.present_count}
                    </td>
                    <td className="p-3 text-sm">
                      <div className="flex items-center gap-2">
                        <div className="w-24 bg-gray-200 rounded-full h-2">
                          <div
                            className="h-2 rounded-full bg-primary"
                            style={{
                              width: `${row.percentage}%`,
                            }}
                          ></div>
                        </div>
                        <span className="font-medium text-primary">
                          {row.percentage}%
                        </span>
                      </div>
                    </td>
                    <td className="p-3 text-sm">
                      <span
                        className={`px-2 py-1 rounded-full text-xs font-medium ${
                          Number(row.percentage) >= 75
                            ? "bg-primary-bg text-primary-dark"
                            : Number(row.percentage) >= 50
                            ? "bg-accent-bg text-accent-dark"
                            : "bg-accent text-white"
                        }`}
                      >
                        {Number(row.percentage) >= 75
                          ? "Good"
                          : Number(row.percentage) >= 50
                          ? "Average"
                          : "Low"}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="p-8 text-center text-primary-dark/60">
            <BarChart3 size={32} className="mx-auto mb-2" />
            <p style={{ fontFamily: bodyFont }}>Select filters and click "Generate Report"</p>
          </div>
        )}
      </div>
    </div>
  );
}