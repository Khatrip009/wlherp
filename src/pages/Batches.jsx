// src/pages/Batches.jsx
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
  Layers,
} from "lucide-react";
import Papa from "papaparse";
import BatchForm from "../components/BatchForm";
import { supabase } from "../api/supabase";
import {
  getBatches,
  createBatch,
  updateBatch,
  deleteBatch,
  getAllBatchesForExport,
  getCourseOptions,
  getMediumOptions,
} from "../services/batchService";
import { useOrg } from "../context/OrganizationContext";

export default function Batches() {
  const queryClient = useQueryClient();
  const { branch, selectedFinancialYear } = useOrg();
  const branchId = branch?.id;
  const financialYearId = selectedFinancialYear?.id;
  const ctx = { branchId, financialYearId };

  const [search, setSearch] = useState("");
  const [filters, setFilters] = useState({
    course_id: "",
    teacher_id: "",
    status: "",
    medium_id: "",
  });
  const [showFilters, setShowFilters] = useState(false);
  const allFilters = { ...filters, search };

  const {
    data,
    isLoading,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
  } = useInfiniteQuery({
    queryKey: ["batches", allFilters, branchId, financialYearId],
    queryFn: ({ pageParam = 0 }) =>
      getBatches({ pageParam, filters: allFilters, branchId, financialYearId }),
    getNextPageParam: (lastPage, allPages) => {
      const totalFetched = allPages.reduce((sum, page) => sum + page.data.length, 0);
      if (lastPage.count && totalFetched < lastPage.count) return allPages.length;
      return undefined;
    },
    initialPageParam: 0,
    enabled: !!branchId && !!financialYearId,
    staleTime: 5 * 60 * 1000,
  });

  const batches = data?.pages.flatMap((page) => page.data) || [];
  const batchIds = useMemo(() => batches.map((b) => b.id), [batches]);

  const { data: teacherAssignments = [] } = useQuery({
    queryKey: ["batch-teachers", batchIds, branchId, financialYearId],
    queryFn: async () => {
      if (batchIds.length === 0) return [];
      const { data } = await supabase
        .from("batch_teachers")
        .select("batch_id, teachers(first_name, last_name)")
        .in("batch_id", batchIds)
        .eq("branch_id", branchId)
        .eq("financial_year_id", financialYearId);
      return data || [];
    },
    enabled: batchIds.length > 0 && !!branchId && !!financialYearId,
    staleTime: 5 * 60 * 1000,
  });

  const teacherMap = useMemo(() => {
    const map = {};
    teacherAssignments.forEach((row) => {
      if (!map[row.batch_id]) map[row.batch_id] = [];
      if (row.teachers) {
        map[row.batch_id].push(`${row.teachers.first_name} ${row.teachers.last_name}`);
      }
    });
    for (const key in map) map[key] = map[key].join(", ");
    return map;
  }, [teacherAssignments]);

  const { data: courses = [] } = useQuery({
    queryKey: ["coursesDropdown"],
    queryFn: getCourseOptions,
    staleTime: 10 * 60 * 1000,
  });
  const { data: teachers = [] } = useQuery({
    queryKey: ["teachersDropdown", branchId, financialYearId],
    queryFn: async () => {
      const { data } = await supabase
        .from("teachers")
        .select("id, first_name, last_name")
        .eq("branch_id", branchId)
        .eq("financial_year_id", financialYearId)
        .order("first_name");
      return data || [];
    },
    enabled: !!branchId && !!financialYearId,
    staleTime: 10 * 60 * 1000,
  });
  const { data: mediums = [] } = useQuery({
    queryKey: ["mediumsDropdown"],
    queryFn: getMediumOptions,
    staleTime: 10 * 60 * 1000,
  });

  const syncTeacherBatches = async (batchId, payload, context) => {
    const teacherIds = [
      ...new Set(
        (payload.teacher_subjects || []).map((a) => a.teacher_id).filter(Boolean)
      ),
    ];
    await supabase.from("teacher_batches").delete().eq("batch_id", batchId);
    if (teacherIds.length > 0) {
      const inserts = teacherIds.map((tid) => ({
        batch_id: batchId,
        teacher_id: tid,
        branch_id: context.branchId,
        financial_year_id: context.financialYearId,
      }));
      const { error } = await supabase.from("teacher_batches").insert(inserts);
      if (error) throw error;
    }
  };

  const createMutation = useMutation({
    mutationFn: async (payload) => {
      const result = await createBatch(payload, ctx);
      await syncTeacherBatches(result.id, payload, ctx);
      return result;
    },
    onSuccess: () => {
      toast.success("Batch created");
      queryClient.invalidateQueries({ queryKey: ["batches"] });
      setShowForm(false);
    },
    onError: (err) => toast.error(err.message || "Failed to create batch"),
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, payload }) => {
      const result = await updateBatch(id, payload, ctx);
      await syncTeacherBatches(id, payload, ctx);
      return result;
    },
    onSuccess: () => {
      toast.success("Batch updated");
      queryClient.invalidateQueries({ queryKey: ["batches"] });
      setEditing(null);
    },
    onError: (err) => toast.error(err.message || "Failed to update batch"),
  });

  const deleteMutation = useMutation({
    mutationFn: (id) => deleteBatch(id, branchId, financialYearId),
    onSuccess: () => {
      toast.success("Batch deleted");
      queryClient.invalidateQueries({ queryKey: ["batches"] });
    },
    onError: (err) => toast.error(err.message || "Delete failed"),
  });

  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState(null);
  const fileInputRef = useRef(null);

  const handleCSVImport = async (event) => {
    const file = event.target.files[0];
    if (!file) return;
    Papa.parse(file, {
      header: true,
      skipEmptyLines: true,
      complete: async (results) => {
        let successCount = 0;
        for (const row of results.data) {
          try {
            await createBatch(
              {
                batch_name: row.batch_name,
                course_id: row.course_id ? Number(row.course_id) : null,
                start_date: row.start_date || null,
                end_date: row.end_date || null,
                start_time: row.start_time || null,
                end_time: row.end_time || null,
                capacity: row.capacity ? Number(row.capacity) : null,
                status: row.status || "active",
                medium_id: row.medium_id ? Number(row.medium_id) : null,
                teacher_subjects: [],
              },
              ctx
            );
            successCount++;
          } catch (err) {
            console.error(err);
          }
        }
        toast.success(`${successCount} batches imported`);
        queryClient.invalidateQueries({ queryKey: ["batches"] });
      },
      error: () => toast.error("CSV parsing error"),
    });
  };

  const handleCSVExport = async () => {
    try {
      const allData = await getAllBatchesForExport(allFilters, branchId, financialYearId);
      const csv = Papa.unparse(
        allData.map((b) => ({
          batch_name: b.batch_name,
          course: b.courses?.course_name,
          medium: b.medium_name || "",
          teachers: teacherMap[b.id] || "",
          start_date: b.start_date,
          end_date: b.end_date,
          start_time: b.start_time,
          end_time: b.end_time,
          capacity: b.capacity,
          status: b.status,
        }))
      );
      const blob = new Blob([csv], { type: "text/csv" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "batches.csv";
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      toast.error("Export failed");
    }
  };

  const handleCreate = (payload) => createMutation.mutate(payload);
  const handleUpdate = (payload) => updateMutation.mutate({ id: editing.id, payload });
  const handleDelete = (id) => {
    if (!window.confirm("Are you sure you want to delete this batch?")) return;
    deleteMutation.mutate(id);
  };

  return (
    <div className="space-y-6 px-4 sm:px-6 lg:px-0">
      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1
            className="text-2xl sm:text-3xl font-bold"
            style={{ fontFamily: "var(--font-heading)", color: "var(--color-primary)" }}
          >
            Batches
          </h1>
          <p
            className="text-sm text-gray-600 dark:text-gray-400 mt-1"
            style={{ fontFamily: "var(--font-body)" }}
          >
            Manage course batches
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            onClick={() => setShowForm(true)}
            className="inline-flex items-center gap-2 px-4 py-2.5 bg-primary hover:bg-primary-light text-white rounded-lg transition-colors text-sm font-medium"
            style={{ fontFamily: "var(--font-body)" }}
          >
            <Plus size={18} /> Add Batch
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
      </div>

      {/* Search & Filter Toggle */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 dark:text-gray-500" />
          <input
            type="text"
            placeholder="Search by batch name..."
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

      {/* Advanced Filters */}
      {showFilters && (
        <div className="bg-white dark:bg-gray-800 rounded-xl p-4 shadow-sm border border-gray-200 dark:border-gray-700 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
          <div>
            <label className="text-xs font-medium text-gray-600 dark:text-gray-400 mb-1 block" style={{ fontFamily: "var(--font-body)" }}>
              Course
            </label>
            <select
              value={filters.course_id}
              onChange={(e) => setFilters((prev) => ({ ...prev, course_id: e.target.value }))}
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
              Teacher
            </label>
            <select
              value={filters.teacher_id}
              onChange={(e) => setFilters((prev) => ({ ...prev, teacher_id: e.target.value }))}
              className="w-full border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 rounded p-2 text-sm"
            >
              <option value="">All Teachers</option>
              {teachers.map((t) => (
                <option key={t.id} value={t.id}>{t.first_name} {t.last_name}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="text-xs font-medium text-gray-600 dark:text-gray-400 mb-1 block" style={{ fontFamily: "var(--font-body)" }}>
              Medium
            </label>
            <select
              value={filters.medium_id}
              onChange={(e) => setFilters((prev) => ({ ...prev, medium_id: e.target.value }))}
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
              Status
            </label>
            <select
              value={filters.status}
              onChange={(e) => setFilters((prev) => ({ ...prev, status: e.target.value }))}
              className="w-full border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 rounded p-2 text-sm"
            >
              <option value="">All Statuses</option>
              <option value="active">Active</option>
              <option value="inactive">Inactive</option>
            </select>
          </div>
          <div className="flex items-end">
            <button
              onClick={() => {
                setSearch("");
                setFilters({ course_id: "", teacher_id: "", status: "", medium_id: "" });
              }}
              className="text-sm text-primary hover:underline"
              style={{ fontFamily: "var(--font-body)" }}
            >
              Clear Filters
            </button>
          </div>
        </div>
      )}

      {/* Batches Table */}
      <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[900px]">
            <thead className="bg-gray-50 dark:bg-gray-700">
              <tr>
                <th className="p-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Batch</th>
                <th className="p-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Course</th>
                <th className="p-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Medium</th>
                <th className="p-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Teacher</th>
                <th className="p-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Schedule</th>
                <th className="p-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Capacity</th>
                <th className="p-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Status</th>
                <th className="p-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
              {isLoading ? (
                <tr>
                  <td colSpan={8} className="p-6 text-center text-gray-500 dark:text-gray-400">Loading batches…</td>
                </tr>
              ) : batches.length === 0 ? (
                <tr>
                  <td colSpan={8} className="p-6 text-center text-gray-500 dark:text-gray-400">
                    <div className="flex flex-col items-center gap-2">
                      <Layers size={32} className="text-gray-400 dark:text-gray-500" />
                      <span>No batches found</span>
                    </div>
                  </td>
                </tr>
              ) : (
                batches.map((batch) => (
                  <tr
                    key={batch.id}
                    className="hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
                  >
                    <td className="p-3 text-sm font-medium text-gray-800 dark:text-gray-100">
                      {batch.batch_name}
                    </td>
                    <td className="text-sm text-gray-700 dark:text-gray-300">
                      {batch.courses?.course_name || "-"}
                    </td>
                    <td className="text-sm text-gray-700 dark:text-gray-300">
                      {batch.medium_name || "-"}
                    </td>
                    <td className="text-sm text-gray-700 dark:text-gray-300">
                      {teacherMap[batch.id] || "-"}
                    </td>
                    <td className="text-sm text-gray-700 dark:text-gray-300">
                      <div>{batch.start_time} - {batch.end_time}</div>
                      <div className="text-xs text-gray-500 dark:text-gray-400">
                        {batch.start_date} → {batch.end_date}
                      </div>
                    </td>
                    <td className="text-sm text-gray-700 dark:text-gray-300">
                      {batch.capacity || "-"}
                    </td>
                    <td className="text-sm">
                      <span
                        className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                          batch.status === "active"
                            ? "bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-200"
                            : "bg-gray-100 text-gray-700 dark:bg-gray-700 dark:text-gray-300"
                        }`}
                      >
                        {batch.status}
                      </span>
                    </td>
                    <td className="text-sm">
                      <div className="flex gap-2">
                        <button onClick={() => setEditing(batch)} className="text-blue-600 hover:underline">
                          <Edit3 size={15} />
                        </button>
                        <button onClick={() => handleDelete(batch.id)} className="text-red-600 hover:underline">
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

      {showForm && <BatchForm onSubmit={handleCreate} onClose={() => setShowForm(false)} />}
      {editing && <BatchForm initialData={editing} onSubmit={handleUpdate} onClose={() => setEditing(null)} />}
    </div>
  );
}