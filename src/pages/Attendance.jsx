import React, { useState, useRef } from "react";
import { useNavigate } from "react-router-dom";
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
  CalendarCheck,
} from "lucide-react";
import Papa from "papaparse";
import AdminLayout from "../layouts/AdminLayout";
import AttendanceSessionForm from "../components/AttendanceSessionForm";
import ConfirmDialog from "../components/ConfirmDialog";
import BackButton from "../components/BackButton";
import {
  getAttendanceSessions,
  createAttendanceSession,
  updateAttendanceSession,
  deleteAttendanceSession,
  getBatchOptions,
  getMediumOptions,
  getAllAttendanceSessionsForExport,
} from "../services/attendanceService";
import { useAuth } from "../context/AuthContext";
import { useOrg } from "../context/OrganizationContext";

export default function Attendance() {
  const { profile } = useAuth();
  const { branch, selectedFinancialYear } = useOrg();
  const branchId = branch?.id;
  const financialYearId = selectedFinancialYear?.id;

  const role = (profile?.role || "").toLowerCase().replace(/\s+/g, "_");
  const isAdmin = role === "admin" || role === "super_admin";
  const isTeacher = role === "teacher";

  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const [batchFilter, setBatchFilter] = useState("");
  const [mediumFilter, setMediumFilter] = useState("");
  const [search, setSearch] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [showFilters, setShowFilters] = useState(false);
  const allFilters = { batchId: batchFilter, medium_id: mediumFilter, search, startDate, endDate };

  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState(null);
  const [confirmDelete, setConfirmDelete] = useState(null);
  const fileInputRef = useRef(null);

  // Dropdowns – scoped
  const { data: batches = [] } = useQuery({
    queryKey: ["batches-dropdown", branchId, financialYearId],
    queryFn: () => getBatchOptions(branchId, financialYearId),
    enabled: !!branchId && !!financialYearId,
    staleTime: 10 * 60 * 1000,
  });

  const { data: mediums = [] } = useQuery({
    queryKey: ["mediums-dropdown"],
    queryFn: getMediumOptions,
    staleTime: 10 * 60 * 1000,
  });

  // Main sessions query – scoped
  const {
    data,
    isLoading,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
  } = useInfiniteQuery({
    queryKey: ["attendance-sessions", allFilters, branchId, financialYearId],
    queryFn: ({ pageParam = 0 }) =>
      getAttendanceSessions({
        pageParam,
        filters: allFilters,
        branchId,
        financialYearId,
      }),
    getNextPageParam: (lastPage, allPages) => {
      const totalFetched = allPages.reduce((sum, page) => sum + page.data.length, 0);
      if (lastPage.count && totalFetched < lastPage.count) return allPages.length;
      return undefined;
    },
    initialPageParam: 0,
    enabled: !!branchId && !!financialYearId,
    staleTime: 2 * 60 * 1000,
  });

  const sessions = data?.pages.flatMap((page) => page.data) || [];

  // Mutations – now pass branchId and financialYearId to all write functions
  const createMutation = useMutation({
    mutationFn: (payload) => createAttendanceSession(payload, branchId, financialYearId),
    onSuccess: () => {
      toast.success("Session created");
      queryClient.invalidateQueries({ queryKey: ["attendance-sessions"] });
      setShowForm(false);
    },
    onError: () => toast.error("Failed to create session"),
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, payload }) => updateAttendanceSession(id, payload, branchId, financialYearId),
    onSuccess: () => {
      toast.success("Session updated");
      queryClient.invalidateQueries({ queryKey: ["attendance-sessions"] });
      setEditing(null);
    },
    onError: () => toast.error("Failed to update session"),
  });

  const deleteMutation = useMutation({
    mutationFn: (id) => deleteAttendanceSession(id, branchId, financialYearId),
    onSuccess: () => {
      toast.success("Session deleted");
      queryClient.invalidateQueries({ queryKey: ["attendance-sessions"] });
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
              attendance_date: row.attendance_date,
              topic_covered: row.topic_covered || "",
            };
            await createAttendanceSession(payload, branchId, financialYearId);
            successCount++;
          } catch (err) {
            console.error(err);
          }
        }
        toast.success(`${successCount} sessions imported`);
        queryClient.invalidateQueries({ queryKey: ["attendance-sessions"] });
      },
      error: () => toast.error("CSV parsing error"),
    });
  }

  async function handleCSVExport() {
    try {
      const allData = await getAllAttendanceSessionsForExport(
        allFilters,
        branchId,
        financialYearId
      );
      const csv = Papa.unparse(
        allData.map((s) => ({
          date: s.attendance_date,
          batch: s.batch_name,
          topic: s.topic_covered,
          present: s.present_count,
          total: s.total_count,
        }))
      );
      const blob = new Blob([csv], { type: "text/csv" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "attendance_sessions.csv";
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
    <AdminLayout>
      <BackButton to="/academics-hub" label="Academics Hub" />
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-6 gap-4">
        <div>
          <h1 className="text-3xl font-righteous text-primary-dark">Attendance</h1>
          <p className="text-sm text-secondary-dark font-montserrat mt-1">
            Manage daily session attendance
          </p>
        </div>

        {(isAdmin || isTeacher) && (
          <div className="flex flex-wrap gap-2">
            <button
              onClick={() => setShowForm(true)}
              className="bg-primary hover:bg-primary-light text-white px-5 py-2.5 rounded-lg transition font-montserrat text-sm flex items-center gap-2"
            >
              <CalendarCheck size={18} /> New Session
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

      {/* Filter Bar */}
      <div className="flex flex-col sm:flex-row gap-3 mb-4">
        <div className="relative flex-1">
          <Search
            size={18}
            className="absolute left-3 top-1/2 -translate-y-1/2 text-secondary"
          />
          <input
            type="text"
            placeholder="Search by topic or date..."
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

      <div className="bg-white rounded-xl shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[800px]">
            <thead className="bg-slate-100 border-b border-secondary-light">
              <tr>
                <th className="p-3 text-left text-sm font-montserrat text-secondary-dark">Date</th>
                <th className="text-left text-sm font-montserrat text-secondary-dark">Batch</th>
                <th className="text-left text-sm font-montserrat text-secondary-dark">Medium</th>
                <th className="text-left text-sm font-montserrat text-secondary-dark">Topic</th>
                <th className="text-left text-sm font-montserrat text-secondary-dark">Attendance</th>
                <th className="text-left text-sm font-montserrat text-secondary-dark">Actions</th>
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                <tr>
                  <td colSpan={6} className="p-6 text-center text-secondary">
                    Loading sessions…
                  </td>
                </tr>
              ) : sessions.length === 0 ? (
                <tr>
                  <td colSpan={6} className="p-6 text-center text-secondary">
                    <div className="flex flex-col items-center gap-2">
                      <CalendarCheck size={32} className="text-secondary-light" />
                      <span>No sessions found</span>
                      <span className="text-xs text-secondary-light">
                        {search || batchFilter || mediumFilter || startDate || endDate
                          ? "Try adjusting your filters"
                          : "Create a new session to get started"}
                      </span>
                    </div>
                  </td>
                </tr>
              ) : (
                sessions.map((session) => (
                  <tr
                    key={session.id}
                    className="border-b border-secondary-light hover:bg-primary-bg transition"
                  >
                    <td className="p-3 text-sm">{session.attendance_date}</td>
                    <td className="text-sm">{session.batch_name}</td>
                    <td className="text-sm">
                      {session.medium_name ? (
                        <span className="bg-primary-bg text-primary px-2 py-0.5 rounded-full text-xs">
                          {session.medium_name}
                        </span>
                      ) : "-"}
                    </td>
                    <td className="text-sm">{session.topic_covered || "-"}</td>
                    <td className="text-sm">
                      <span className="text-green-600 font-medium">
                        {session.present_count}
                      </span>
                      <span className="text-secondary"> / {session.total_count}</span>
                    </td>
                    <td className="text-sm">
                      <div className="flex gap-2">
                        <button
                          onClick={() => navigate(`/attendance/mark/${session.id}`)}
                          className="text-blue-600 hover:underline"
                        >
                          Mark
                        </button>
                        {isAdmin && (
                          <>
                            <button
                              onClick={() => setEditing(session)}
                              className="text-yellow-600 hover:underline"
                            >
                              <Edit3 size={15} />
                            </button>
                            <button
                              onClick={() => handleDelete(session.id)}
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

      {confirmDelete && (
        <ConfirmDialog
          message="Delete this session and all attendance records?"
          onConfirm={() => { deleteMutation.mutate(confirmDelete); setConfirmDelete(null); }}
          onCancel={() => setConfirmDelete(null)}
        />
      )}

      {(isAdmin || isTeacher) && showForm && (
        <AttendanceSessionForm
          onSubmit={handleCreate}
          onClose={() => setShowForm(false)}
        />
      )}
      {isAdmin && editing && (
        <AttendanceSessionForm
          initialData={editing}
          onSubmit={handleUpdate}
          onClose={() => setEditing(null)}
        />
      )}
    </AdminLayout>
  );
}