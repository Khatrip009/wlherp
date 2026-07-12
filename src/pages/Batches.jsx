// src/pages/Batches.jsx
import React, { useState, useRef, useEffect, useMemo } from "react";
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
import AdminLayout from "../layouts/AdminLayout";
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

  // ── Organization, Branch & Financial Year context ──
  const { branch, selectedFinancialYear } = useOrg();
  const branchId = branch?.id;
  const financialYearId = selectedFinancialYear?.id;

  const ctx = {
    branchId,
    financialYearId,
  };

  // Filters
  const [search, setSearch] = useState("");
  const [filters, setFilters] = useState({
    course_id: "",
    teacher_id: "",
    status: "",
    medium_id: "",
  });
  const [showFilters, setShowFilters] = useState(false);
  const allFilters = { ...filters, search };

  // Paginated data – now scoped
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
      if (lastPage.count && totalFetched < lastPage.count) {
        return allPages.length;
      }
      return undefined;
    },
    initialPageParam: 0,
    enabled: !!branchId && !!financialYearId,
    staleTime: 5 * 60 * 1000,
  });

  const batches = data?.pages.flatMap((page) => page.data) || [];

  const batchIds = useMemo(() => batches.map((b) => b.id), [batches]);

  // Fetch teacher assignments for displayed batches – scoped
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
        map[row.batch_id].push(
          `${row.teachers.first_name} ${row.teachers.last_name}`
        );
      }
    });
    for (const key in map) {
      map[key] = map[key].join(", ");
    }
    return map;
  }, [teacherAssignments]);

  // Dropdowns – scoped where applicable
  const { data: courses = [] } = useQuery({
    queryKey: ["coursesDropdown"],
    queryFn: getCourseOptions, // organisation‑wide, no parameters
    staleTime: 10 * 60 * 1000,
  });

  // Teachers dropdown – scoped
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
    queryFn: getMediumOptions, // organisation‑wide
    staleTime: 10 * 60 * 1000,
  });

  // ── Helper: Sync teacher_batches (with context) ──
  const syncTeacherBatches = async (batchId, payload, context) => {
    const teacherIds = [
      ...new Set(
        (payload.teacher_subjects || [])
          .map((a) => a.teacher_id)
          .filter(Boolean)
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

  // ── Mutations ──────────────────────────────────────────────
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

  // UI state
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState(null);
  const fileInputRef = useRef(null);

  // CSV Import – needs context
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
              batch_name: row.batch_name,
              course_id: row.course_id ? Number(row.course_id) : null,
              start_date: row.start_date || null,
              end_date: row.end_date || null,
              start_time: row.start_time || null,
              end_time: row.end_time || null,
              capacity: row.capacity ? Number(row.capacity) : null,
              status: row.status || "active",
              medium_id: row.medium_id ? Number(row.medium_id) : null,
              teacher_subjects: [], // no assignments in CSV
            };
            await createBatch(payload, ctx);
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
  }

  // CSV Export – now scoped
  async function handleCSVExport() {
    try {
      const allData = await getAllBatchesForExport(
        allFilters,       // first argument: filters object
        branchId,
        financialYearId
      );
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
  }

  function handleCreate(payload) {
    createMutation.mutate(payload);
  }

  function handleUpdate(payload) {
    updateMutation.mutate({ id: editing.id, payload });
  }

  function handleDelete(id) {
    if (!window.confirm("Are you sure you want to delete this batch?")) return;
    deleteMutation.mutate(id);
  }

  return (
    <AdminLayout>
      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-6 gap-4">
        <div>
          <h1 className="text-3xl font-righteous text-primary-dark">Batches</h1>
          <p className="text-sm text-secondary-dark font-montserrat mt-1">
            Manage course batches
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            onClick={() => setShowForm(true)}
            className="bg-primary hover:bg-primary-light text-white px-5 py-2.5 rounded-lg transition font-montserrat text-sm flex items-center gap-2"
          >
            <Plus size={18} /> Add Batch
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
            placeholder="Search by batch name..."
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

      {/* Advanced Filters */}
      {showFilters && (
        <div className="bg-white rounded-xl p-4 shadow-sm mb-4 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4 border border-secondary-light">
          <div>
            <label className="text-xs font-montserrat text-secondary-dark">Course</label>
            <select
              value={filters.course_id}
              onChange={(e) => setFilters((prev) => ({ ...prev, course_id: e.target.value }))}
              className="w-full border border-secondary-light rounded p-2 text-sm mt-1 focus:ring-1 focus:ring-primary"
            >
              <option value="">All Courses</option>
              {courses.map((c) => <option key={c.id} value={c.id}>{c.course_name}</option>)}
            </select>
          </div>
          <div>
            <label className="text-xs font-montserrat text-secondary-dark">Teacher</label>
            <select
              value={filters.teacher_id}
              onChange={(e) => setFilters((prev) => ({ ...prev, teacher_id: e.target.value }))}
              className="w-full border border-secondary-light rounded p-2 text-sm mt-1 focus:ring-1 focus:ring-primary"
            >
              <option value="">All Teachers</option>
              {teachers.map((t) => <option key={t.id} value={t.id}>{t.first_name} {t.last_name}</option>)}
            </select>
          </div>
          <div>
            <label className="text-xs font-montserrat text-secondary-dark">Medium</label>
            <select
              value={filters.medium_id}
              onChange={(e) => setFilters((prev) => ({ ...prev, medium_id: e.target.value }))}
              className="w-full border border-secondary-light rounded p-2 text-sm mt-1 focus:ring-1 focus:ring-primary"
            >
              <option value="">All Mediums</option>
              {mediums.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
            </select>
          </div>
          <div>
            <label className="text-xs font-montserrat text-secondary-dark">Status</label>
            <select
              value={filters.status}
              onChange={(e) => setFilters((prev) => ({ ...prev, status: e.target.value }))}
              className="w-full border border-secondary-light rounded p-2 text-sm mt-1 focus:ring-1 focus:ring-primary"
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
              className="text-primary text-sm hover:underline"
            >
              Clear Filters
            </button>
          </div>
        </div>
      )}

      {/* Batches Table */}
      <div className="bg-white rounded-xl shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[900px]">
            <thead className="bg-slate-100 border-b border-secondary-light">
              <tr>
                <th className="p-3 text-left text-sm font-montserrat text-secondary-dark">Batch</th>
                <th className="text-left text-sm font-montserrat text-secondary-dark">Course</th>
                <th className="text-left text-sm font-montserrat text-secondary-dark">Medium</th>
                <th className="text-left text-sm font-montserrat text-secondary-dark">Teacher</th>
                <th className="text-left text-sm font-montserrat text-secondary-dark">Schedule</th>
                <th className="text-left text-sm font-montserrat text-secondary-dark">Capacity</th>
                <th className="text-left text-sm font-montserrat text-secondary-dark">Status</th>
                <th className="text-left text-sm font-montserrat text-secondary-dark">Actions</th>
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                <tr><td colSpan={8} className="p-6 text-center text-secondary">Loading batches…</td></tr>
              ) : batches.length === 0 ? (
                <tr><td colSpan={8} className="p-6 text-center text-secondary">
                  <div className="flex flex-col items-center gap-2">
                    <Layers size={32} className="text-secondary-light" />
                    <span>No batches found</span>
                  </div>
                </td></tr>
              ) : (
                batches.map((batch) => (
                  <tr key={batch.id} className="border-b border-secondary-light hover:bg-primary-bg transition">
                    <td className="p-3 text-sm font-medium">{batch.batch_name}</td>
                    <td className="text-sm">{batch.courses?.course_name || "-"}</td>
                    <td className="text-sm">{batch.medium_name || "-"}</td>
                    <td className="text-sm">{teacherMap[batch.id] || "-"}</td>
                    <td className="text-sm">
                      <div>{batch.start_time} - {batch.end_time}</div>
                      <div className="text-xs text-secondary-light">{batch.start_date} → {batch.end_date}</div>
                    </td>
                    <td className="text-sm">{batch.capacity || "-"}</td>
                    <td className="text-sm">
                      <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                        batch.status === "active" ? "bg-green-100 text-green-700" : "bg-gray-100 text-gray-700"
                      }`}>{batch.status}</span>
                    </td>
                    <td className="text-sm">
                      <div className="flex gap-2">
                        <button onClick={() => setEditing(batch)} className="text-blue-600 hover:underline"><Edit3 size={15} /></button>
                        <button onClick={() => handleDelete(batch.id)} className="text-red-600 hover:underline"><Trash2 size={15} /></button>
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
          <button onClick={() => fetchNextPage()} disabled={isFetchingNextPage}
            className="bg-primary hover:bg-primary-light text-white px-6 py-2.5 rounded-lg font-montserrat text-sm transition disabled:opacity-60">
            {isFetchingNextPage ? "Loading more…" : "Load More"}
          </button>
        </div>
      )}

      {/* Batch Form Modals */}
      {showForm && <BatchForm onSubmit={handleCreate} onClose={() => setShowForm(false)} />}
      {editing && <BatchForm initialData={editing} onSubmit={handleUpdate} onClose={() => setEditing(null)} />}
    </AdminLayout>
  );
}