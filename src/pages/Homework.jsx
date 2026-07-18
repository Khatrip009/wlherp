// src/pages/Homework.jsx
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
  Edit3,
  Trash2,
  Filter,
  Download,
  Upload,
  X,
  BookOpen,
  Layers,
} from "lucide-react";
import Papa from "papaparse";

import HomeworkForm from "../components/HomeworkForm";
import ViewSubmissionsModal from "../components/ViewSubmissionsModal";
import BackButton from "../components/BackButton";
import {
  getHomeworks,
  createHomework,
  updateHomework,
  deleteHomework,
  getBatchOptions,
  getMediumOptions,
  getAllHomeworksForExport,
} from "../services/homeworkService";
import { useAuth } from "../context/AuthContext";
import { useOrg } from "../context/OrganizationContext";

export default function Homework() {
  const { profile } = useAuth();

  const role = (profile?.role || "").toLowerCase().replace(/\s+/g, "_");
  const isAdmin = role === "admin" || role === "super_admin";
  const isTeacher = role === "teacher";

  const { branch, selectedFinancialYear } = useOrg();
  const branchId = branch?.id;
  const financialYearId = selectedFinancialYear?.id;
  const ctx = { branchId, financialYearId };

  const queryClient = useQueryClient();

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

  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState(null);
  const [viewingSubmissions, setViewingSubmissions] = useState(null);
  const fileInputRef = useRef(null);

  // Batches – scoped
  const { data: batches = [] } = useQuery({
    queryKey: ["batches-dropdown", branchId, financialYearId],
    queryFn: () => getBatchOptions(branchId, financialYearId),
    enabled: !!branchId && !!financialYearId,
    staleTime: 10 * 60 * 1000,
  });

  // Mediums – org‑wide
  const { data: mediums = [] } = useQuery({
    queryKey: ["mediums-dropdown"],
    queryFn: getMediumOptions,
    staleTime: 10 * 60 * 1000,
  });

  // Homework list – scoped
  const {
    data,
    isLoading,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
  } = useInfiniteQuery({
    queryKey: ["homeworks", allFilters, branchId, financialYearId],
    queryFn: ({ pageParam = 0 }) =>
      getHomeworks({ pageParam, filters: allFilters, branchId, financialYearId }),
    getNextPageParam: (lastPage, allPages) => {
      const totalFetched = allPages.reduce((sum, page) => sum + page.data.length, 0);
      if (lastPage.count && totalFetched < lastPage.count) return allPages.length;
      return undefined;
    },
    initialPageParam: 0,
    enabled: !!branchId && !!financialYearId,
    staleTime: 2 * 60 * 1000,
  });

  const homeworks = data?.pages.flatMap((page) => page.data) || [];

  // Mutations – pass context
  const createMutation = useMutation({
    mutationFn: (payload) => createHomework(payload, ctx),
    onSuccess: () => {
      toast.success("Homework created");
      queryClient.invalidateQueries({ queryKey: ["homeworks"] });
      setShowForm(false);
    },
    onError: () => toast.error("Failed to create homework"),
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, payload }) => updateHomework(id, payload, ctx),
    onSuccess: () => {
      toast.success("Homework updated");
      queryClient.invalidateQueries({ queryKey: ["homeworks"] });
      setEditing(null);
    },
    onError: () => toast.error("Failed to update homework"),
  });

  const deleteMutation = useMutation({
    mutationFn: (id) => deleteHomework(id, branchId, financialYearId),
    onSuccess: () => {
      toast.success("Homework deleted");
      queryClient.invalidateQueries({ queryKey: ["homeworks"] });
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
              batch_id: row.batch_id,
              subject_id: row.subject_id,
              title: row.title,
              description: row.description || "",
              assigned_date: row.assigned_date || new Date().toISOString().split("T")[0],
              due_date: row.due_date || null,
              attachment_url: row.attachment_url || null,
              created_by: row.created_by || null,
            };
            await createHomework(payload, ctx);
            successCount++;
          } catch (err) {
            console.error(err);
          }
        }
        toast.success(`${successCount} homework imported`);
        queryClient.invalidateQueries({ queryKey: ["homeworks"] });
      },
      error: () => toast.error("CSV parsing error"),
    });
  }

  async function handleCSVExport() {
    try {
      const allData = await getAllHomeworksForExport(allFilters, branchId, financialYearId);
      const csv = Papa.unparse(
        allData.map((h) => ({
          title: h.title,
          description: h.description,
          batch: h.batches?.batch_name,
          medium: h.medium_name || "",
          subject: h.subjects?.subject_name,
          assigned_date: h.assigned_date,
          due_date: h.due_date,
          submissions: h.submission_count,
        }))
      );
      const blob = new Blob([csv], { type: "text/csv" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "homework.csv";
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
    if (!window.confirm("Delete this homework?")) return;
    deleteMutation.mutate(id);
  }

  return (
    <div className="space-y-6 px-4 sm:px-6 lg:px-0">
     

      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1
            className="text-2xl sm:text-3xl font-bold"
            style={{ fontFamily: "var(--font-heading)", color: "var(--color-primary)" }}
          >
            Homework
          </h1>
          <p
            className="text-sm text-gray-600 dark:text-gray-400 mt-1"
            style={{ fontFamily: "var(--font-body)" }}
          >
            Assign and manage homework
          </p>
        </div>

        {(isAdmin || isTeacher) && (
          <div className="flex flex-wrap gap-2">
            <button
              onClick={() => setShowForm(true)}
              className="inline-flex items-center gap-2 px-4 py-2.5 bg-primary hover:bg-primary-light text-white rounded-lg transition-colors text-sm font-medium"
              style={{ fontFamily: "var(--font-body)" }}
            >
              <BookOpen size={18} /> Add Homework
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

      {/* Search & Filter Toggle */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search
            size={18}
            className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 dark:text-gray-500"
          />
          <input
            type="text"
            placeholder="Search by title or description..."
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
            <label
              className="text-xs font-medium text-gray-600 dark:text-gray-400 mb-1 block"
              style={{ fontFamily: "var(--font-body)" }}
            >
              Batch
            </label>
            <select
              value={batchFilter}
              onChange={(e) => setBatchFilter(e.target.value)}
              className="w-full border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 rounded p-2 text-sm"
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
              className="text-xs font-medium text-gray-600 dark:text-gray-400 mb-1 block"
              style={{ fontFamily: "var(--font-body)" }}
            >
              Medium
            </label>
            <select
              value={mediumFilter}
              onChange={(e) => setMediumFilter(e.target.value)}
              className="w-full border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 rounded p-2 text-sm"
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
              className="text-xs font-medium text-gray-600 dark:text-gray-400 mb-1 block"
              style={{ fontFamily: "var(--font-body)" }}
            >
              From Date
            </label>
            <input
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              className="w-full border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 rounded p-2 text-sm"
            />
          </div>
          <div>
            <label
              className="text-xs font-medium text-gray-600 dark:text-gray-400 mb-1 block"
              style={{ fontFamily: "var(--font-body)" }}
            >
              To Date
            </label>
            <input
              type="date"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              className="w-full border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 rounded p-2 text-sm"
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
              className="text-sm text-primary hover:underline"
              style={{ fontFamily: "var(--font-body)" }}
            >
              Clear Filters
            </button>
          </div>
        </div>
      )}

      {/* Table */}
      <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[900px]">
            <thead className="bg-gray-50 dark:bg-gray-700">
              <tr>
                <th className="p-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                  Title
                </th>
                <th className="p-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                  Batch
                </th>
                <th className="p-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                  Medium
                </th>
                <th className="p-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                  Subject
                </th>
                <th className="p-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                  Assigned
                </th>
                <th className="p-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                  Due
                </th>
                <th className="p-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                  Submissions
                </th>
                <th className="p-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
              {isLoading ? (
                <tr>
                  <td colSpan={8} className="p-6 text-center text-gray-500 dark:text-gray-400">
                    Loading homework…
                  </td>
                </tr>
              ) : homeworks.length === 0 ? (
                <tr>
                  <td colSpan={8} className="p-6 text-center text-gray-500 dark:text-gray-400">
                    <div className="flex flex-col items-center gap-2">
                      <BookOpen size={32} className="text-gray-400 dark:text-gray-500" />
                      <span>No homework found</span>
                      <span className="text-xs">
                        {search || batchFilter || mediumFilter || startDate || endDate
                          ? "Try adjusting your filters"
                          : "Add new homework to get started"}
                      </span>
                    </div>
                  </td>
                </tr>
              ) : (
                homeworks.map((hw) => (
                  <tr
                    key={hw.id}
                    className="hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
                  >
                    <td className="p-3 text-sm font-medium text-gray-800 dark:text-gray-100">
                      {hw.title}
                    </td>
                    <td className="text-sm text-gray-700 dark:text-gray-300">
                      {hw.batches?.batch_name}
                    </td>
                    <td className="text-sm">
                      {hw.medium_name ? (
                        <span
                          className="px-2 py-0.5 rounded-full text-xs"
                          style={{
                            backgroundColor: "var(--color-primary-light)",
                            color: "var(--color-primary)",
                          }}
                        >
                          {hw.medium_name}
                        </span>
                      ) : (
                        "-"
                      )}
                    </td>
                    <td className="text-sm text-gray-700 dark:text-gray-300">
                      {hw.subjects?.subject_name}
                    </td>
                    <td className="text-sm text-gray-700 dark:text-gray-300">{hw.assigned_date}</td>
                    <td className="text-sm text-gray-700 dark:text-gray-300">
                      {hw.due_date || "-"}
                    </td>
                    <td className="text-sm text-gray-700 dark:text-gray-300">
                      {hw.submission_count}
                    </td>
                    <td className="text-sm">
                      <div className="flex gap-2">
                        <button
                          onClick={() => setViewingSubmissions(hw)}
                          className="text-purple-600 dark:text-purple-400 hover:underline flex items-center gap-1"
                        >
                          <Layers size={15} /> Submissions
                        </button>
                        {isAdmin && (
                          <>
                            <button
                              onClick={() => setEditing(hw)}
                              className="text-blue-600 dark:text-blue-400 hover:underline"
                            >
                              <Edit3 size={15} />
                            </button>
                            <button
                              onClick={() => handleDelete(hw.id)}
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

      {/* Modals */}
      {(isAdmin || isTeacher) && showForm && (
        <HomeworkForm onSubmit={handleCreate} onClose={() => setShowForm(false)} />
      )}
      {isAdmin && editing && (
        <HomeworkForm
          initialData={editing}
          onSubmit={handleUpdate}
          onClose={() => setEditing(null)}
        />
      )}
      {viewingSubmissions && (
        <ViewSubmissionsModal
          homework={viewingSubmissions}
          onClose={() => setViewingSubmissions(null)}
        />
      )}
    </div>
  );
}