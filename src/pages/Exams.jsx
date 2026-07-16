// src/pages/Exams.jsx
import React, { useState, useRef } from "react";
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
  Award,
  Calendar,
  Layers,
} from "lucide-react";
import { useNavigate } from "react-router-dom";
import Papa from "papaparse";

import ExamForm from "../components/ExamForm";
import ConfirmDialog from "../components/ConfirmDialog";
import BackButton from "../components/BackButton";
import {
  getExams,
  createExam,
  updateExam,
  deleteExam,
  getBatchOptions,
  getCourseOptions,
  getMediumOptions,
  getAllExamsForExport,
} from "../services/examService";
import { useAuth } from "../context/AuthContext";
import { useOrg } from "../context/OrganizationContext";

export default function Exams() {
  const { profile } = useAuth();
  const navigate = useNavigate();

  const role = (profile?.role || "").toLowerCase().replace(/\s+/g, "_");
  const isAdmin = role === "admin" || role === "super_admin";

  const queryClient = useQueryClient();

  const { branch, selectedFinancialYear } = useOrg();
  const branchId = branch?.id;
  const financialYearId = selectedFinancialYear?.id;
  const ctx = { branchId, financialYearId };

  const [search, setSearch] = useState("");
  const [batchFilter, setBatchFilter] = useState("");
  const [courseFilter, setCourseFilter] = useState("");
  const [mediumFilter, setMediumFilter] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [showFilters, setShowFilters] = useState(false);
  const allFilters = {
    search,
    batchId: batchFilter,
    courseId: courseFilter,
    medium_id: mediumFilter,
    startDate,
    endDate,
  };

  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState(null);
  const [confirmDelete, setConfirmDelete] = useState(null);
  const fileInputRef = useRef(null);

  // Dropdowns
  const { data: batches = [] } = useQuery({
    queryKey: ["batches-dropdown", branchId, financialYearId],
    queryFn: () => getBatchOptions(branchId, financialYearId),
    enabled: !!branchId && !!financialYearId,
    staleTime: 10 * 60 * 1000,
  });
  const { data: courses = [] } = useQuery({
    queryKey: ["courses-dropdown"],
    queryFn: getCourseOptions,
    staleTime: 10 * 60 * 1000,
  });
  const { data: mediums = [] } = useQuery({
    queryKey: ["mediums-dropdown"],
    queryFn: getMediumOptions,
    staleTime: 10 * 60 * 1000,
  });

  // Exams list – scoped
  const {
    data,
    isLoading,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
  } = useInfiniteQuery({
    queryKey: ["exams", allFilters, branchId, financialYearId],
    queryFn: ({ pageParam = 0 }) =>
      getExams({ pageParam, filters: allFilters, branchId, financialYearId }),
    getNextPageParam: (lastPage, allPages) => {
      const totalFetched = allPages.reduce((sum, page) => sum + page.data.length, 0);
      if (lastPage.count && totalFetched < lastPage.count) {
        return allPages.length;
      }
      return undefined;
    },
    initialPageParam: 0,
    enabled: !!branchId && !!financialYearId,
    staleTime: 5 * 60 * 1000,
  });

  const exams = data?.pages.flatMap((page) => page.data) || [];

  const createMutation = useMutation({
    mutationFn: (payload) => createExam(payload, ctx),
    onSuccess: () => {
      toast.success("Exam created");
      queryClient.invalidateQueries({ queryKey: ["exams"] });
      setShowForm(false);
    },
    onError: () => toast.error("Failed to create exam"),
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, payload }) => updateExam(id, payload, ctx),
    onSuccess: () => {
      toast.success("Exam updated");
      queryClient.invalidateQueries({ queryKey: ["exams"] });
      setEditing(null);
    },
    onError: () => toast.error("Failed to update exam"),
  });

  const deleteMutation = useMutation({
    mutationFn: (id) => deleteExam(id, ctx),
    onSuccess: () => {
      toast.success("Exam deleted");
      queryClient.invalidateQueries({ queryKey: ["exams"] });
    },
    onError: () => toast.error("Delete failed"),
  });

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
              exam_name: row.exam_name,
              batch_id: row.batch_id ? Number(row.batch_id) : null,
              exam_date: row.exam_date,
              total_marks: row.total_marks ? Number(row.total_marks) : null,
            };
            await createExam(payload, ctx);
            successCount++;
          } catch (err) {
            console.error(err);
          }
        }
        toast.success(`${successCount} exams imported`);
        queryClient.invalidateQueries({ queryKey: ["exams"] });
      },
      error: () => toast.error("CSV parsing error"),
    });
  }

  async function handleCSVExport() {
    try {
      const allData = await getAllExamsForExport(allFilters, branchId, financialYearId);
      const csv = Papa.unparse(
        allData.map((e) => ({
          exam_name: e.exam_name,
          batch: e.batches?.batch_name,
          course: e.batches?.courses?.course_name,
          medium: e.medium_name || "",
          exam_date: e.exam_date,
          total_marks: e.total_marks,
        }))
      );
      const blob = new Blob([csv], { type: "text/csv" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "exams.csv";
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
    setConfirmDelete(id);
  }

  return (
    <div className="space-y-6 px-4 sm:px-6 lg:px-0">
      <BackButton to="/academics-hub" label="Academics Hub" />

      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1
            className="text-2xl sm:text-3xl font-bold"
            style={{ fontFamily: "var(--font-heading)", color: "var(--color-primary)" }}
          >
            Exams
          </h1>
          <p
            className="text-sm text-gray-600 dark:text-gray-400 mt-1"
            style={{ fontFamily: "var(--font-body)" }}
          >
            Create and manage exams
          </p>
        </div>
        {isAdmin && (
          <div className="flex flex-wrap gap-2">
            <button
              onClick={() => setShowForm(true)}
              className="inline-flex items-center gap-2 px-4 py-2.5 bg-primary hover:bg-primary-light text-white rounded-lg transition-colors text-sm font-medium"
              style={{ fontFamily: "var(--font-body)" }}
            >
              <Award size={18} /> Add Exam
            </button>
            <button
              onClick={handleCSVExport}
              className="inline-flex items-center gap-2 px-4 py-2.5 border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-200 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors text-sm"
              style={{ fontFamily: "var(--font-body)" }}
            >
              <Download size={18} /> Export
            </button>
            <button
              onClick={() => fileInputRef.current?.click()}
              className="inline-flex items-center gap-2 px-4 py-2.5 border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-200 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors text-sm"
              style={{ fontFamily: "var(--font-body)" }}
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
        )}
      </div>

      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search
            size={18}
            className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 dark:text-gray-500"
          />
          <input
            type="text"
            placeholder="Search by exam or batch name..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 rounded-lg pl-10 pr-4 py-2.5 text-sm"
            style={{ fontFamily: "var(--font-body)" }}
          />
        </div>
        <button
          onClick={() => setShowFilters(!showFilters)}
          className="inline-flex items-center gap-2 px-4 py-2.5 border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-200 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors text-sm"
          style={{ fontFamily: "var(--font-body)" }}
        >
          <Filter size={18} /> Filters {showFilters && <X size={16} />}
        </button>
      </div>

      {showFilters && (
        <div className="bg-white dark:bg-gray-800 rounded-xl p-4 shadow-sm border border-gray-200 dark:border-gray-700 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
          <div>
            <label className="text-xs font-medium text-gray-600 dark:text-gray-400 mb-1 block" style={{ fontFamily: "var(--font-body)" }}>
              Batch
            </label>
            <select
              value={batchFilter}
              onChange={(e) => setBatchFilter(e.target.value)}
              className="w-full border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 rounded p-2 text-sm"
            >
              <option value="">All Batches</option>
              {batches.map((b) => (
                <option key={b.id} value={b.id}>{b.batch_name}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="text-xs font-medium text-gray-600 dark:text-gray-400 mb-1 block" style={{ fontFamily: "var(--font-body)" }}>
              Course
            </label>
            <select
              value={courseFilter}
              onChange={(e) => setCourseFilter(e.target.value)}
              className="w-full border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 rounded p-2 text-sm"
            >
              <option value="">All Courses</option>
              {courses.map((c) => (
                <option key={c.id} value={c.id}>{c.course_name}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="text-xs font-medium text-gray-600 dark:text-gray-400 mb-1 block" style={{ fontFamily: "var(--font-body)" }}>
              Medium
            </label>
            <select
              value={mediumFilter}
              onChange={(e) => setMediumFilter(e.target.value)}
              className="w-full border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 rounded p-2 text-sm"
            >
              <option value="">All Mediums</option>
              {mediums.map((m) => (
                <option key={m.id} value={m.id}>{m.name}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="text-xs font-medium text-gray-600 dark:text-gray-400 mb-1 block" style={{ fontFamily: "var(--font-body)" }}>
              From Date
            </label>
            <input
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              className="w-full border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 rounded p-2 text-sm"
            />
          </div>
          <div className="flex items-end">
            <button
              onClick={() => {
                setSearch("");
                setBatchFilter("");
                setCourseFilter("");
                setMediumFilter("");
                setStartDate("");
                setEndDate("");
              }}
              className="text-sm text-primary hover:underline"
              style={{ fontFamily: "var(--font-body)" }}
            >
              Clear Filters
            </button>
          </div>
        </div>
      )}

      <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[800px]">
            <thead className="bg-gray-50 dark:bg-gray-700">
              <tr>
                <th className="p-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Exam</th>
                <th className="p-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Batch</th>
                <th className="p-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Course</th>
                <th className="p-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Medium</th>
                <th className="p-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Date</th>
                <th className="p-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Total Marks</th>
                <th className="p-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
              {isLoading ? (
                <tr>
                  <td colSpan={7} className="p-6 text-center text-gray-500 dark:text-gray-400">Loading exams…</td>
                </tr>
              ) : exams.length === 0 ? (
                <tr>
                  <td colSpan={7} className="p-6 text-center text-gray-500 dark:text-gray-400">
                    <div className="flex flex-col items-center gap-2">
                      <Award size={32} className="text-gray-400 dark:text-gray-500" />
                      <span>No exams found</span>
                      <span className="text-xs">
                        {search || batchFilter || courseFilter || mediumFilter || startDate || endDate
                          ? "Try adjusting your filters"
                          : "Add a new exam to get started"}
                      </span>
                    </div>
                  </td>
                </tr>
              ) : (
                exams.map((exam) => (
                  <tr
                    key={exam.id}
                    className="hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
                  >
                    <td className="p-3 text-sm font-medium text-gray-800 dark:text-gray-100">{exam.exam_name}</td>
                    <td className="text-sm text-gray-700 dark:text-gray-300">{exam.batches?.batch_name}</td>
                    <td className="text-sm text-gray-700 dark:text-gray-300">{exam.batches?.courses?.course_name}</td>
                    <td className="text-sm">
                      {exam.medium_name ? (
                        <span
                          className="px-2 py-0.5 rounded-full text-xs"
                          style={{
                            backgroundColor: "var(--color-primary-light)",
                            color: "var(--color-primary)",
                          }}
                        >
                          {exam.medium_name}
                        </span>
                      ) : (
                        "-"
                      )}
                    </td>
                    <td className="text-sm text-gray-700 dark:text-gray-300">{exam.exam_date}</td>
                    <td className="text-sm text-gray-700 dark:text-gray-300">{exam.total_marks || "-"}</td>
                    <td className="text-sm">
                      <div className="flex gap-2">
                        <button
                          onClick={() => navigate(`/results/enter/${exam.id}`)}
                          className="text-purple-600 dark:text-purple-400 hover:underline"
                        >
                          Results
                        </button>
                        {isAdmin && (
                          <>
                            <button
                              onClick={() => setEditing(exam)}
                              className="text-blue-600 dark:text-blue-400 hover:underline"
                            >
                              <Edit3 size={15} />
                            </button>
                            <button
                              onClick={() => handleDelete(exam.id)}
                              className="text-red-600 dark:text-red-400 hover:underline"
                            >
                              <Trash2 size={15} />
                            </button>
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {hasNextPage && (
        <div className="flex justify-center mt-6">
          <button
            onClick={() => fetchNextPage()}
            disabled={isFetchingNextPage}
            className="bg-primary hover:bg-primary-light text-white px-6 py-2.5 rounded-lg text-sm font-medium transition disabled:opacity-60"
            style={{ fontFamily: "var(--font-body)" }}
          >
            {isFetchingNextPage ? "Loading more…" : "Load More"}
          </button>
        </div>
      )}

      {confirmDelete && (
        <ConfirmDialog
          message="Delete this exam and all its results?"
          onConfirm={() => {
            deleteMutation.mutate(confirmDelete);
            setConfirmDelete(null);
          }}
          onCancel={() => setConfirmDelete(null)}
        />
      )}

      {isAdmin && showForm && (
        <ExamForm onSubmit={handleCreate} onClose={() => setShowForm(false)} />
      )}
      {isAdmin && editing && (
        <ExamForm
          initialData={editing}
          onSubmit={handleUpdate}
          onClose={() => setEditing(null)}
        />
      )}
    </div>
  );
}