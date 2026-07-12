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
import AdminLayout from "../layouts/AdminLayout";
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
    <AdminLayout>
      <BackButton to="/academics-hub" label="Academics" />
      <div className="mb-6">
        <h1 className="text-3xl font-righteous text-primary-dark">
          Attendance Reports
        </h1>
        <p className="text-sm text-secondary-dark font-montserrat mt-1">
          View student‑wise attendance percentages
        </p>
      </div>

      {/* Filters Card */}
      <div className="bg-white rounded-xl p-5 shadow-sm mb-6 border border-secondary-light">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4 items-end">
          <div>
            <label className="block text-sm font-montserrat text-secondary-dark mb-1">
              <Layers size={14} className="inline mr-1" />
              Batch
            </label>
            <select
              name="batch_id"
              value={filters.batch_id}
              onChange={handleFilterChange}
              className="w-full border border-secondary-light rounded p-2.5 text-sm focus:ring-1 focus:ring-primary focus:border-primary outline-none"
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
            <label className="block text-sm font-montserrat text-secondary-dark mb-1">
              <Layers size={14} className="inline mr-1" />
              Medium
            </label>
            <select
              name="medium_id"
              value={filters.medium_id}
              onChange={handleFilterChange}
              className="w-full border border-secondary-light rounded p-2.5 text-sm focus:ring-1 focus:ring-primary focus:border-primary outline-none"
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
            <label className="block text-sm font-montserrat text-secondary-dark mb-1">
              <Calendar size={14} className="inline mr-1" />
              Start Date
            </label>
            <input
              type="date"
              name="start_date"
              value={filters.start_date}
              onChange={handleFilterChange}
              className="w-full border border-secondary-light rounded p-2.5 text-sm focus:ring-1 focus:ring-primary focus:border-primary outline-none"
            />
          </div>
          <div>
            <label className="block text-sm font-montserrat text-secondary-dark mb-1">
              <Calendar size={14} className="inline mr-1" />
              End Date
            </label>
            <input
              type="date"
              name="end_date"
              value={filters.end_date}
              onChange={handleFilterChange}
              className="w-full border border-secondary-light rounded p-2.5 text-sm focus:ring-1 focus:ring-primary focus:border-primary outline-none"
            />
          </div>
          <div className="flex gap-2">
            <button
              onClick={() => fetchReport()}
              disabled={reportLoading}
              className="flex-1 bg-primary hover:bg-primary-light text-white px-6 py-2.5 rounded-lg font-montserrat text-sm transition disabled:opacity-50 flex items-center justify-center gap-2"
            >
              <BarChart3 size={18} />
              {reportLoading ? "Loading…" : "Generate"}
            </button>
            <button
              onClick={clearFilters}
              className="border border-secondary-light px-3 py-2.5 rounded-lg text-secondary-dark hover:bg-secondary-bg transition"
              title="Clear filters"
            >
              <X size={18} />
            </button>
          </div>
        </div>
      </div>

      {/* Report Actions */}
      {report.length > 0 && (
        <div className="flex justify-end mb-4">
          <button
            onClick={exportCSV}
            className="border border-secondary-light px-4 py-2.5 rounded-lg text-secondary-dark hover:bg-secondary-bg font-montserrat text-sm flex items-center gap-2"
          >
            <Download size={18} /> Export CSV
          </button>
        </div>
      )}

      {/* Results Table */}
      <div className="bg-white rounded-xl shadow-sm overflow-hidden">
        {reportLoading ? (
          <div className="p-8 text-center text-secondary">
            <BarChart3 size={32} className="mx-auto text-secondary-light mb-2 animate-pulse" />
            <p>Generating report…</p>
          </div>
        ) : report.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[800px]">
              <thead className="bg-slate-100 border-b border-secondary-light">
                <tr>
                  <th className="p-3 text-left text-sm font-montserrat text-secondary-dark">
                    Admission No
                  </th>
                  <th className="text-left text-sm font-montserrat text-secondary-dark">
                    Student
                  </th>
                  <th className="text-left text-sm font-montserrat text-secondary-dark">
                    Batch
                  </th>
                  <th className="text-left text-sm font-montserrat text-secondary-dark">
                    Medium
                  </th>
                  <th className="text-left text-sm font-montserrat text-secondary-dark">
                    Total Sessions
                  </th>
                  <th className="text-left text-sm font-montserrat text-secondary-dark">
                    Present
                  </th>
                  <th className="text-left text-sm font-montserrat text-secondary-dark">
                    Attendance %
                  </th>
                  <th className="text-left text-sm font-montserrat text-secondary-dark">
                    Status
                  </th>
                </tr>
              </thead>
              <tbody>
                {report.map((row) => (
                  <tr
                    key={row.student_id}
                    className="border-b border-secondary-light hover:bg-primary-bg transition"
                  >
                    <td className="p-3 text-sm">{row.admission_no}</td>
                    <td className="text-sm font-medium">{row.student_name}</td>
                    <td className="text-sm">{row.batch_name || "—"}</td>
                    <td className="text-sm">{row.medium_name || "—"}</td>
                    <td className="text-sm">{row.total_sessions}</td>
                    <td className="text-sm">{row.present_count}</td>
                    <td className="text-sm">
                      <div className="flex items-center gap-2">
                        <div className="w-24 bg-gray-200 rounded-full h-2">
                          <div
                            className="bg-green-500 h-2 rounded-full"
                            style={{ width: `${row.percentage}%` }}
                          ></div>
                        </div>
                        <span className="font-medium">{row.percentage}%</span>
                      </div>
                    </td>
                    <td className="text-sm">
                      <span
                        className={`px-2 py-1 rounded-full text-xs font-medium ${
                          Number(row.percentage) >= 75
                            ? "bg-green-100 text-green-700"
                            : Number(row.percentage) >= 50
                            ? "bg-yellow-100 text-yellow-700"
                            : "bg-red-100 text-red-700"
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
          <div className="p-8 text-center text-secondary">
            <BarChart3 size={32} className="mx-auto text-secondary-light mb-2" />
            <p>Select filters and click "Generate Report"</p>
          </div>
        )}
      </div>
    </AdminLayout>
  );
}