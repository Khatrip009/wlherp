// src/pages/Attendance.jsx
import React, { useState, useRef, useEffect } from "react";
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
import { supabase } from "../api/supabase";
import { sendTemplateEmail } from "../services/emailService"; // 👈 Added

export default function Attendance({ studentId: propStudentId = null, standalone = true }) {
  const { profile, loading: authLoading } = useAuth();
  const { branch, selectedFinancialYear, org } = useOrg(); // 👈 Added org
  const branchId = branch?.id;
  const financialYearId = selectedFinancialYear?.id;

  // ── Compute role ──
  const role = (profile?.role || "").toLowerCase().replace(/\s+/g, "_");
  const isAdmin = role === "admin" || role === "super_admin" || role === "organization_admin" || role === "org_admin";
  const isTeacher = role === "teacher";
  const canManage = isAdmin || isTeacher;

  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const [batchFilter, setBatchFilter] = useState("");
  const [mediumFilter, setMediumFilter] = useState("");
  const [search, setSearch] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [showFilters, setShowFilters] = useState(false);
  const [studentBatchIds, setStudentBatchIds] = useState([]);

  // ── If studentId provided, fetch their active batch IDs ──
  useEffect(() => {
    if (propStudentId && branchId && financialYearId) {
      const fetchStudentBatches = async () => {
        let query = supabase
          .from("student_batches")
          .select("batch_id")
          .eq("student_id", propStudentId)
          .eq("status", "active");
        if (branchId) query = query.eq("branch_id", branchId);
        if (financialYearId) query = query.eq("financial_year_id", financialYearId);
        const { data } = await query;
        setStudentBatchIds(data?.map((row) => row.batch_id) || []);
      };
      fetchStudentBatches();
    } else {
      setStudentBatchIds([]);
    }
  }, [propStudentId, branchId, financialYearId]);

  // All filters combined
  const allFilters = {
    batchId: batchFilter || (studentBatchIds.length > 0 ? studentBatchIds : undefined),
    medium_id: mediumFilter,
    search,
    startDate,
    endDate,
  };

  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState(null);
  const [confirmDelete, setConfirmDelete] = useState(null);
  const fileInputRef = useRef(null);

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

  // ─── Email notification on session creation ──────────────────────
  const sendSessionCreatedNotification = async (session) => {
    try {
      const adminEmails = await getAdminEmails();
      if (adminEmails.length === 0) return;

      // Fetch batch name
      const { data: batch, error: batchError } = await supabase
        .from("batches")
        .select("batch_name")
        .eq("id", session.batch_id)
        .single();
      if (batchError) throw batchError;

      const message =
        `A new attendance session has been created:\n` +
        `Batch: ${batch?.batch_name || 'N/A'}\n` +
        `Date: ${session.attendance_date}\n` +
        `Topic: ${session.topic_covered || 'N/A'}\n` +
        `Created by: ${profile?.full_name || 'System'}`;

      await sendTemplateEmail({
        to: adminEmails,
        organizationId: org.id,
        slug: "system_announcement",
        context: {
          academyName: org?.company_name || "Academy",
          title: "New Attendance Session Created",
          message,
          target_type: "Admin",
        },
        branchId,
      });
    } catch (error) {
      console.error("Failed to send attendance notification:", error);
    }
  };

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
    queryKey: ["attendance-sessions", allFilters, branchId, financialYearId, propStudentId],
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

  // Mutations
  const createMutation = useMutation({
    mutationFn: (payload) => createAttendanceSession(payload, branchId, financialYearId),
    onSuccess: (data) => {
      toast.success("Session created");
      queryClient.invalidateQueries({ queryKey: ["attendance-sessions"] });
      setShowForm(false);

      // ─── Send email notification ──────────────────────────────
      if (data) {
        sendSessionCreatedNotification(data);
      }
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

  // ── Auth loading or missing profile ──
  if (authLoading) {
    return <div className="p-8 text-center text-gray-500 dark:text-gray-400">Loading...</div>;
  }
  if (!profile) {
    return <div className="p-8 text-center text-red-500">Please log in to view attendance.</div>;
  }

  return (
    <div className="space-y-6 px-4 sm:px-6 lg:px-0">
      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold" style={{ fontFamily: "var(--font-heading)", color: "var(--color-primary)" }}>
            Attendance
          </h1>
          <p className="text-sm text-gray-600 dark:text-gray-400 mt-1" style={{ fontFamily: "var(--font-body)" }}>
            Manage daily session attendance
          </p>
        </div>

        {/* Action buttons – only for managers, not for student-specific view */}
        {canManage && !propStudentId && (
          <div className="flex flex-wrap gap-2">
            <button
              onClick={() => setShowForm(true)}
              className="inline-flex items-center gap-2 px-4 py-2.5 bg-primary hover:bg-primary-light text-white rounded-lg transition-colors text-sm font-medium"
              style={{ fontFamily: "var(--font-body)" }}
            >
              <CalendarCheck size={18} /> New Session
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

      {/* Filter Bar */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 dark:text-gray-500" />
          <input
            type="text"
            placeholder="Search by topic or date..."
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

      {/* Filter Panels */}
      {showFilters && (
        <div className="bg-white dark:bg-gray-800 rounded-xl p-4 shadow-sm border border-gray-200 dark:border-gray-700 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
          {!propStudentId && (
            <div>
              <label className="text-xs font-medium text-gray-600 dark:text-gray-400" style={{ fontFamily: "var(--font-body)" }}>
                Batch
              </label>
              <select
                value={batchFilter}
                onChange={(e) => setBatchFilter(e.target.value)}
                className="w-full border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 rounded p-2 text-sm mt-1"
              >
                <option value="">All Batches</option>
                {batches.map((b) => (
                  <option key={b.id} value={b.id}>{b.batch_name}</option>
                ))}
              </select>
            </div>
          )}
          <div>
            <label className="text-xs font-medium text-gray-600 dark:text-gray-400" style={{ fontFamily: "var(--font-body)" }}>
              Medium
            </label>
            <select
              value={mediumFilter}
              onChange={(e) => setMediumFilter(e.target.value)}
              className="w-full border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 rounded p-2 text-sm mt-1"
            >
              <option value="">All Mediums</option>
              {mediums.map((m) => (
                <option key={m.id} value={m.id}>{m.name}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="text-xs font-medium text-gray-600 dark:text-gray-400" style={{ fontFamily: "var(--font-body)" }}>
              From Date
            </label>
            <input
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              className="w-full border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 rounded p-2 text-sm mt-1"
            />
          </div>
          <div>
            <label className="text-xs font-medium text-gray-600 dark:text-gray-400" style={{ fontFamily: "var(--font-body)" }}>
              To Date
            </label>
            <input
              type="date"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              className="w-full border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 rounded p-2 text-sm mt-1"
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

      {/* Sessions Table */}
      <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[800px]">
            <thead className="bg-gray-50 dark:bg-gray-700">
              <tr>
                <th className="p-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                  Date
                </th>
                <th className="p-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                  Batch
                </th>
                <th className="p-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                  Medium
                </th>
                <th className="p-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                  Topic
                </th>
                <th className="p-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                  Attendance
                </th>
                <th className="p-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
              {isLoading ? (
                <tr>
                  <td colSpan={6} className="p-6 text-center text-gray-500 dark:text-gray-400">
                    Loading sessions…
                  </td>
                </tr>
              ) : sessions.length === 0 ? (
                <tr>
                  <td colSpan={6} className="p-6 text-center text-gray-500 dark:text-gray-400">
                    <div className="flex flex-col items-center gap-2">
                      <CalendarCheck size={32} className="text-gray-400 dark:text-gray-500" />
                      <span>No sessions found</span>
                      <span className="text-xs">
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
                    className="hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
                  >
                    <td className="p-3 text-sm text-gray-700 dark:text-gray-300">
                      {session.attendance_date}
                    </td>
                    <td className="p-3 text-sm text-gray-700 dark:text-gray-300">
                      {session.batch_name}
                    </td>
                    <td className="p-3 text-sm">
                      {session.medium_name ? (
                        <span className="bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-200 px-2 py-0.5 rounded-full text-xs">
                          {session.medium_name}
                        </span>
                      ) : (
                        "-"
                      )}
                    </td>
                    <td className="p-3 text-sm text-gray-700 dark:text-gray-300">
                      {session.topic_covered || "-"}
                    </td>
                    <td className="p-3 text-sm">
                      <span className="text-green-600 dark:text-green-400 font-medium">
                        {session.present_count}
                      </span>
                      <span className="text-gray-500 dark:text-gray-400">
                        {" "}/ {session.total_count}
                      </span>
                    </td>
                    <td className="p-3 text-sm">
                      <div className="flex gap-2">
                        <button
                          onClick={() => navigate(`/attendance/mark/${session.id}`)}
                          className="text-blue-600 dark:text-blue-400 hover:underline"
                        >
                          Mark
                        </button>
                        {isAdmin && (
                          <>
                            <button
                              onClick={() => setEditing(session)}
                              className="text-yellow-600 dark:text-yellow-400 hover:underline"
                            >
                              <Edit3 size={15} />
                            </button>
                            <button
                              onClick={() => handleDelete(session.id)}
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

      {/* Load More */}
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

      {/* Confirm delete dialog */}
      {confirmDelete && (
        <ConfirmDialog
          message="Delete this session and all attendance records?"
          onConfirm={() => {
            deleteMutation.mutate(confirmDelete);
            setConfirmDelete(null);
          }}
          onCancel={() => setConfirmDelete(null)}
        />
      )}

      {/* Modals */}
      {canManage && showForm && (
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
    </div>
  );
}