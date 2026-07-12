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
import AdminLayout from "../layouts/AdminLayout";
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
import { useOrg } from "../context/OrganizationContext";  // NEW

export default function Homework() {
  const { profile } = useAuth();

  const role = (profile?.role || "").toLowerCase().replace(/\s+/g, "_");
  const isAdmin = role === "admin" || role === "super_admin";
  const isTeacher = role === "teacher";

  // ── Branch & Financial Year context ──
  const { branch, selectedFinancialYear } = useOrg();  // NEW
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
    <AdminLayout>
      <BackButton to="/academics-hub" label="Academics Hub" />
      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-6 gap-4">
        <div>
          <h1 className="text-3xl font-righteous text-primary-dark">Homework</h1>
          <p className="text-sm text-secondary-dark font-montserrat mt-1">
            Assign and manage homework
          </p>
        </div>

        {(isAdmin || isTeacher) && (
          <div className="flex flex-wrap gap-2">
            <button
              onClick={() => setShowForm(true)}
              className="bg-primary hover:bg-primary-light text-white px-5 py-2.5 rounded-lg transition font-montserrat text-sm flex items-center gap-2"
            >
              <BookOpen size={18} /> Add Homework
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
        )}
      </div>

      {/* Search & Filter Toggle */}
      <div className="flex flex-col sm:flex-row gap-3 mb-4">
        <div className="relative flex-1">
          <Search
            size={18}
            className="absolute left-3 top-1/2 -translate-y-1/2 text-secondary"
          />
          <input
            type="text"
            placeholder="Search by title or description..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full border border-secondary-light rounded-lg pl-10 pr-4 py-2.5 text-sm focus:ring-1 focus:ring-primary focus:border-primary outline-none placeholder-secondary-light"
          />
        </div>
        <button
          onClick={() => setShowFilters(!showFilters)}
          className="border border-secondary-light px-4 py-2.5 rounded-lg text-secondary-dark hover:bg-secondary-bg font-montserrat text-sm flex items-center gap-2"
        >
          <Filter size={18} /> Filters {showFilters && <X size={16} />}
        </button>
      </div>

      {showFilters && (
        <div className="bg-white rounded-xl p-4 shadow-sm mb-4 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4 border border-secondary-light">
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
                <option key={m.id} value={m.id}>{m.name}</option>
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

      {/* Table */}
      <div className="bg-white rounded-xl shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[900px]">
            <thead className="bg-slate-100 border-b border-secondary-light">
              <tr>
                <th className="p-3 text-left text-sm font-montserrat text-secondary-dark">Title</th>
                <th className="text-left text-sm font-montserrat text-secondary-dark">Batch</th>
                <th className="text-left text-sm font-montserrat text-secondary-dark">Medium</th>
                <th className="text-left text-sm font-montserrat text-secondary-dark">Subject</th>
                <th className="text-left text-sm font-montserrat text-secondary-dark">Assigned</th>
                <th className="text-left text-sm font-montserrat text-secondary-dark">Due</th>
                <th className="text-left text-sm font-montserrat text-secondary-dark">Submissions</th>
                <th className="text-left text-sm font-montserrat text-secondary-dark">Actions</th>
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                <tr>
                  <td colSpan={8} className="p-6 text-center text-secondary">Loading homework…</td>
                </tr>
              ) : homeworks.length === 0 ? (
                <tr>
                  <td colSpan={8} className="p-6 text-center text-secondary">
                    <div className="flex flex-col items-center gap-2">
                      <BookOpen size={32} className="text-secondary-light" />
                      <span>No homework found</span>
                      <span className="text-xs text-secondary-light">
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
                    className="border-b border-secondary-light hover:bg-primary-bg transition"
                  >
                    <td className="p-3 text-sm font-medium">{hw.title}</td>
                    <td className="text-sm">{hw.batches?.batch_name}</td>
                    <td className="text-sm">
                      {hw.medium_name ? (
                        <span className="bg-primary-bg text-primary px-2 py-0.5 rounded-full text-xs">
                          {hw.medium_name}
                        </span>
                      ) : "-"}
                    </td>
                    <td className="text-sm">{hw.subjects?.subject_name}</td>
                    <td className="text-sm">{hw.assigned_date}</td>
                    <td className="text-sm">{hw.due_date || "-"}</td>
                    <td className="text-sm">{hw.submission_count}</td>
                    <td className="text-sm">
                      <div className="flex gap-2">
                        <button
                          onClick={() => setViewingSubmissions(hw)}
                          className="text-purple-600 hover:underline flex items-center gap-1"
                        >
                          <Layers size={15} /> Submissions
                        </button>
                        {isAdmin && (
                          <>
                            <button
                              onClick={() => setEditing(hw)}
                              className="text-blue-600 hover:underline"
                            >
                              <Edit3 size={15} />
                            </button>
                            <button
                              onClick={() => handleDelete(hw.id)}
                              className="text-red-600 hover:underline"
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
            className="bg-primary hover:bg-primary-light text-white px-6 py-2.5 rounded-lg font-montserrat text-sm transition disabled:opacity-60"
          >
            {isFetchingNextPage ? "Loading more…" : "Load More"}
          </button>
        </div>
      )}

      {/* Modals */}
      {(isAdmin || isTeacher) && showForm && (
        <HomeworkForm
          onSubmit={handleCreate}
          onClose={() => setShowForm(false)}
        />
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
    </AdminLayout>
  );
}