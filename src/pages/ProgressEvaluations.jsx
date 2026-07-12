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
} from "lucide-react";
import Papa from "papaparse";
import AdminLayout from "../layouts/AdminLayout";
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

export default function ProgressEvaluations() {
  const queryClient = useQueryClient();

  // ── Organization, Branch & Financial Year context ──
  const { branch, selectedFinancialYear } = useOrg();
  const branchId = branch?.id;
  const financialYearId = selectedFinancialYear?.id;
  const ctx = { branchId, financialYearId };

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

  // Dropdown for batches & mediums
  const { data: batches = [] } = useQuery({
    queryKey: ["active-batches", branchId, financialYearId],
    queryFn: () => getActiveBatches(branchId, financialYearId),
    enabled: !!branchId && !!financialYearId,
    staleTime: 10 * 60 * 1000,
  });

  const { data: mediums = [] } = useQuery({
    queryKey: ["mediums"],
    queryFn: getMediumOptions, // organisation‑wide
    staleTime: 10 * 60 * 1000,
  });

  // Infinite query for evaluations – now scoped
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

  // Auto-computed averages
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

  // Mutations – now pass context or explicit IDs
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

  // CSV Import – pass context
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

  // CSV Export – scoped
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
    <AdminLayout>
      <BackButton to="/academics-hub" label="Academics" />
      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-6 gap-4">
        <div>
          <h1 className="text-3xl font-righteous text-primary-dark">Progress Evaluations</h1>
          <p className="text-sm text-secondary-dark font-montserrat mt-1">
            Track student performance over time
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            onClick={() => setShowForm(true)}
            className="bg-primary hover:bg-primary-light text-white px-5 py-2.5 rounded-lg transition font-montserrat text-sm flex items-center gap-2"
          >
            <TrendingUp size={18} /> Add Evaluation
          </button>
          <button
            onClick={handleCSVExport}
            className="border border-secondary-light px-4 py-2.5 rounded-lg text-secondary-dark hover:bg-secondary-bg font-montserrat text-sm flex items-center gap-2"
          >
            <Download size={18} /> Export
          </button>
          <button
            onClick={() => fileInputRef.current?.click()}
            className="border border-secondary-light px-4 py-2.5 rounded-lg text-secondary-dark hover:bg-secondary-bg font-montserrat text-sm flex items-center gap-2"
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
          <Search size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-secondary" />
          <input
            type="text"
            placeholder="Search by student name..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full border border-secondary-light rounded-lg pl-10 pr-4 py-2.5 text-sm focus:ring-1 focus:ring-primary focus:border-primary outline-none placeholder-secondary-light"
          />
        </div>
        <button
          onClick={() => setShowFilters(!showFilters)}
          className="border border-secondary-light px-4 py-2.5 rounded-lg text-secondary-dark hover:bg-secondary-bg font-montserrat text-sm flex items-center gap-2"
        >
          <Filter size={18} /> Filters
          {showFilters && <X size={16} />}
        </button>
      </div>

      {/* Advanced Filters Panel */}
      {showFilters && (
        <div className="bg-white rounded-xl p-4 shadow-sm mb-4 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 border border-secondary-light">
          <div>
            <label className="text-xs font-montserrat text-secondary-dark">Batch</label>
            <select
              value={batchFilter}
              onChange={(e) => setBatchFilter(e.target.value)}
              className="w-full border border-secondary-light rounded p-2 text-sm mt-1 focus:ring-1 focus:ring-primary"
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
            <label className="text-xs font-montserrat text-secondary-dark">Medium</label>
            <select
              value={mediumFilter}
              onChange={(e) => setMediumFilter(e.target.value)}
              className="w-full border border-secondary-light rounded p-2 text-sm mt-1 focus:ring-1 focus:ring-primary"
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
            <label className="text-xs font-montserrat text-secondary-dark">From Date</label>
            <input
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              className="w-full border border-secondary-light rounded p-2 text-sm mt-1 focus:ring-1 focus:ring-primary"
            />
          </div>
          <div>
            <label className="text-xs font-montserrat text-secondary-dark">To Date</label>
            <input
              type="date"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              className="w-full border border-secondary-light rounded p-2 text-sm mt-1 focus:ring-1 focus:ring-primary"
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
            >
              Clear Filters
            </button>
          </div>
        </div>
      )}

      {/* Averages Summary Card */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-6">
        <div className="bg-white rounded-xl p-4 shadow-sm border border-secondary-light flex items-center justify-between">
          <div>
            <p className="text-xs font-montserrat text-secondary">Average Attendance</p>
            <p className="text-2xl font-bold text-primary-dark mt-1">{averages.avgAttendance}</p>
          </div>
          <div className="p-3 rounded-full bg-blue-50">
            <Calendar size={22} className="text-blue-600" />
          </div>
        </div>
        <div className="bg-white rounded-xl p-4 shadow-sm border border-secondary-light flex items-center justify-between">
          <div>
            <p className="text-xs font-montserrat text-secondary">Average Score</p>
            <p className="text-2xl font-bold text-primary-dark mt-1">{averages.avgScore}</p>
          </div>
          <div className="p-3 rounded-full bg-emerald-50">
            <TrendingUp size={22} className="text-emerald-600" />
          </div>
        </div>
      </div>

      {/* Evaluations Table */}
      <div className="bg-white rounded-xl shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[900px]">
            <thead className="bg-slate-100 border-b border-secondary-light">
              <tr>
                <th className="p-3 text-left text-sm font-montserrat text-secondary-dark">Student</th>
                <th className="text-left text-sm font-montserrat text-secondary-dark">Batch</th>
                <th className="text-left text-sm font-montserrat text-secondary-dark">Medium</th>
                <th className="text-left text-sm font-montserrat text-secondary-dark">Date</th>
                <th className="text-left text-sm font-montserrat text-secondary-dark">Attendance %</th>
                <th className="text-left text-sm font-montserrat text-secondary-dark">Score</th>
                <th className="text-left text-sm font-montserrat text-secondary-dark">Remarks</th>
                <th className="text-left text-sm font-montserrat text-secondary-dark">Actions</th>
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                <tr><td colSpan={8} className="p-6 text-center text-secondary">Loading evaluations…</td></tr>
              ) : evaluations.length === 0 ? (
                <tr><td colSpan={8} className="p-6 text-center text-secondary">
                  <div className="flex flex-col items-center gap-2">
                    <TrendingUp size={32} className="text-secondary-light" />
                    <span>No evaluations found</span>
                    <span className="text-xs text-secondary-light">
                      {search || batchFilter || mediumFilter || startDate || endDate
                        ? "Try adjusting your filters"
                        : "Add a new evaluation to get started"}
                    </span>
                  </div>
                </td></tr>
              ) : (
                evaluations.map((evalItem) => (
                  <tr key={evalItem.id} className="border-b border-secondary-light hover:bg-primary-bg transition">
                    <td className="p-3 text-sm"><div className="font-medium">{evalItem.students?.first_name} {evalItem.students?.last_name}</div><div className="text-xs text-secondary-light">{evalItem.students?.admission_no}</div></td>
                    <td className="text-sm">{evalItem.batches?.batch_name}</td>
                    <td className="text-sm">{evalItem.medium_name || "—"}</td>
                    <td className="text-sm">{evalItem.evaluation_date}</td>
                    <td className="text-sm">{evalItem.attendance_percentage != null ? `${evalItem.attendance_percentage}%` : "-"}</td>
                    <td className="text-sm">{evalItem.performance_score != null ? evalItem.performance_score : "-"}</td>
                    <td className="text-sm max-w-[200px] truncate">{evalItem.teacher_remarks || "-"}</td>
                    <td className="text-sm"><div className="flex gap-2"><button onClick={() => setEditing(evalItem)} className="text-blue-600 hover:underline" title="Edit"><Edit3 size={15} /></button><button onClick={() => handleDelete(evalItem.id)} className="text-red-600 hover:underline" title="Delete"><Trash2 size={15} /></button></div></td>
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
            className="bg-primary hover:bg-primary-light text-white px-6 py-2.5 rounded-lg font-montserrat text-sm transition disabled:opacity-60"
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
    </AdminLayout>
  );
}