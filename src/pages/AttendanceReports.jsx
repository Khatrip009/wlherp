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
} from "lucide-react";
import Papa from "papaparse";

import BackButton from "../components/BackButton";
import { useOrg } from "../context/OrganizationContext";

import {
  getAttendanceReport,
  getActiveBatches,
  getMediumOptions,
} from "../services/attendanceReportService";

export default function AttendanceReports() {
  const { branch, selectedFinancialYear } = useOrg();
  const branchId = branch?.id;
  const financialYearId = selectedFinancialYear?.id;

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
        <h1 className="text-2xl sm:text-3xl font-bold" style={{ fontFamily: "var(--font-heading)", color: "var(--color-primary)" }}>
          Attendance Reports
        </h1>
        <p className="text-sm text-gray-600 dark:text-gray-400 mt-1" style={{ fontFamily: "var(--font-body)" }}>
          View student‑wise attendance percentages
        </p>
      </div>

      {/* Filters Card */}
      <div className="bg-white dark:bg-gray-800 rounded-xl p-5 shadow-sm border border-gray-200 dark:border-gray-700">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4 items-end">
          <div>
            <label className="block text-sm mb-1 text-gray-700 dark:text-gray-300" style={{ fontFamily: "var(--font-body)" }}>
              <Layers size={14} className="inline mr-1" />
              Batch
            </label>
            <select
              name="batch_id"
              value={filters.batch_id}
              onChange={handleFilterChange}
              className="w-full border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 rounded p-2.5 text-sm"
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
            <label className="block text-sm mb-1 text-gray-700 dark:text-gray-300" style={{ fontFamily: "var(--font-body)" }}>
              <Layers size={14} className="inline mr-1" />
              Medium
            </label>
            <select
              name="medium_id"
              value={filters.medium_id}
              onChange={handleFilterChange}
              className="w-full border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 rounded p-2.5 text-sm"
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
            <label className="block text-sm mb-1 text-gray-700 dark:text-gray-300" style={{ fontFamily: "var(--font-body)" }}>
              <Calendar size={14} className="inline mr-1" />
              Start Date
            </label>
            <input
              type="date"
              name="start_date"
              value={filters.start_date}
              onChange={handleFilterChange}
              className="w-full border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 rounded p-2.5 text-sm"
            />
          </div>
          <div>
            <label className="block text-sm mb-1 text-gray-700 dark:text-gray-300" style={{ fontFamily: "var(--font-body)" }}>
              <Calendar size={14} className="inline mr-1" />
              End Date
            </label>
            <input
              type="date"
              name="end_date"
              value={filters.end_date}
              onChange={handleFilterChange}
              className="w-full border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 rounded p-2.5 text-sm"
            />
          </div>
          <div className="flex gap-2">
            <button
              onClick={() => fetchReport()}
              disabled={reportLoading}
              className="flex-1 bg-primary hover:bg-primary-light text-white px-6 py-2.5 rounded-lg font-medium text-sm transition disabled:opacity-50 flex items-center justify-center gap-2"
              style={{ fontFamily: "var(--font-body)" }}
            >
              <BarChart3 size={18} />
              {reportLoading ? "Loading…" : "Generate"}
            </button>
            <button
              onClick={clearFilters}
              className="border border-gray-300 dark:border-gray-600 px-3 py-2.5 rounded-lg text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-700 transition"
              title="Clear filters"
            >
              <X size={18} />
            </button>
          </div>
        </div>
      </div>

      {/* Report Actions */}
      {report.length > 0 && (
        <div className="flex justify-end">
          <button
            onClick={exportCSV}
            className="inline-flex items-center gap-2 px-4 py-2.5 border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-200 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors text-sm"
            style={{ fontFamily: "var(--font-body)" }}
          >
            <Download size={18} /> Export CSV
          </button>
        </div>
      )}

      {/* Results Table */}
      <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 overflow-hidden">
        {reportLoading ? (
          <div className="p-8 text-center text-gray-500 dark:text-gray-400">
            <BarChart3 size={32} className="mx-auto mb-2 animate-pulse" />
            <p>Generating report…</p>
          </div>
        ) : report.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[800px]">
              <thead className="bg-gray-50 dark:bg-gray-700">
                <tr>
                  <th className="p-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                    Admission No
                  </th>
                  <th className="p-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                    Student
                  </th>
                  <th className="p-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                    Batch
                  </th>
                  <th className="p-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                    Medium
                  </th>
                  <th className="p-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                    Total Sessions
                  </th>
                  <th className="p-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                    Present
                  </th>
                  <th className="p-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                    Attendance %
                  </th>
                  <th className="p-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                    Status
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
                {report.map((row) => (
                  <tr
                    key={row.student_id}
                    className="hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
                  >
                    <td className="p-3 text-sm text-gray-700 dark:text-gray-300">
                      {row.admission_no}
                    </td>
                    <td className="p-3 text-sm font-medium text-gray-800 dark:text-gray-100" style={{ fontFamily: "var(--font-body)" }}>
                      {row.student_name}
                    </td>
                    <td className="p-3 text-sm text-gray-700 dark:text-gray-300">
                      {row.batch_name || "—"}
                    </td>
                    <td className="p-3 text-sm text-gray-700 dark:text-gray-300">
                      {row.medium_name || "—"}
                    </td>
                    <td className="p-3 text-sm text-gray-700 dark:text-gray-300">
                      {row.total_sessions}
                    </td>
                    <td className="p-3 text-sm text-gray-700 dark:text-gray-300">
                      {row.present_count}
                    </td>
                    <td className="p-3 text-sm">
                      <div className="flex items-center gap-2">
                        <div className="w-24 bg-gray-200 dark:bg-gray-600 rounded-full h-2">
                          <div
                            className="h-2 rounded-full"
                            style={{
                              width: `${row.percentage}%`,
                              backgroundColor: "var(--color-primary)",
                            }}
                          ></div>
                        </div>
                        <span className="font-medium text-gray-800 dark:text-gray-100">
                          {row.percentage}%
                        </span>
                      </div>
                    </td>
                    <td className="p-3 text-sm">
                      <span
                        className={`px-2 py-1 rounded-full text-xs font-medium ${
                          Number(row.percentage) >= 75
                            ? "bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-200"
                            : Number(row.percentage) >= 50
                            ? "bg-yellow-100 text-yellow-700 dark:bg-yellow-900 dark:text-yellow-200"
                            : "bg-red-100 text-red-700 dark:bg-red-900 dark:text-red-200"
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
          <div className="p-8 text-center text-gray-500 dark:text-gray-400">
            <BarChart3 size={32} className="mx-auto mb-2" />
            <p>Select filters and click "Generate Report"</p>
          </div>
        )}
      </div>
    </div>
  );
}