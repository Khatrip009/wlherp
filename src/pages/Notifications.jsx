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
  Trash2,
  Download,
  Upload,
  X,
  Bell,
  Check,
  Mail,
  Layers,
  FileText,
} from "lucide-react";
import Papa from "papaparse";
import AdminLayout from "../layouts/AdminLayout";
import BackButton from "../components/BackButton";

import { supabase } from "../api/supabase";
import { useOrgDarkLogo } from "../hooks/useOrgDarkLogo";
import { useOrg } from "../context/OrganizationContext";

export default function Notifications() {
  const queryClient = useQueryClient();
  const darkLogo = useOrgDarkLogo();
  const [search, setSearch] = useState("");
  const [showForm, setShowForm] = useState(false);
  const fileInputRef = useRef(null);

  // ── Organisation / Branch / Financial Year context ──
  const { branch, selectedFinancialYear } = useOrg();
  const branchId = branch?.id;
  const financialYearId = selectedFinancialYear?.id;

  const [form, setForm] = useState({
    title: "",
    message: "",
    target_type: "All",
    batch_id: "",
  });

  // Fetch batches for the dropdown – scoped to branch & FY
  const { data: batches = [] } = useQuery({
    queryKey: ["batches-dropdown", branchId, financialYearId],
    queryFn: async () => {
      let query = supabase
        .from("batches")
        .select("id, batch_name")
        .eq("status", "active");

      if (branchId) query = query.eq("branch_id", branchId);
      if (financialYearId) query = query.eq("financial_year_id", financialYearId);

      const { data } = await query;
      return data || [];
    },
    enabled: !!branchId && !!financialYearId,
    staleTime: 10 * 60 * 1000,
  });

  // ---------- Helper: get recipients (scoped) ----------
  async function getRecipients(targetType, batchId = null) {
    let candidateIds = [];

    switch (targetType) {
      case "All": {
        // Students – scoped
        let studentsQuery = supabase
          .from("students")
          .select("user_id")
          .not("user_id", "is", null);
        if (branchId) studentsQuery = studentsQuery.eq("branch_id", branchId);
        if (financialYearId) studentsQuery = studentsQuery.eq("financial_year_id", financialYearId);
        const { data: students } = await studentsQuery;

        // Teachers – scoped
        let teachersQuery = supabase
          .from("teachers")
          .select("user_id")
          .not("user_id", "is", null);
        if (branchId) teachersQuery = teachersQuery.eq("branch_id", branchId);
        if (financialYearId) teachersQuery = teachersQuery.eq("financial_year_id", financialYearId);
        const { data: teachers } = await teachersQuery;

        const studentIds = students?.map((s) => s.user_id) || [];
        const teacherIds = teachers?.map((t) => t.user_id) || [];
        candidateIds = [...studentIds, ...teacherIds];
        break;
      }
      case "Batch": {
        if (!batchId) return [];
        // Get students in batch – scoped
        let batchStudentsQuery = supabase
          .from("student_batches")
          .select("student_id")
          .eq("batch_id", batchId)
          .eq("status", "active");
        if (branchId) batchStudentsQuery = batchStudentsQuery.eq("branch_id", branchId);
        if (financialYearId) batchStudentsQuery = batchStudentsQuery.eq("financial_year_id", financialYearId);
        const { data: batchStudents } = await batchStudentsQuery;
        const studentIds = batchStudents?.map((bs) => bs.student_id) || [];
        let studentUserIds = [];
        if (studentIds.length) {
          let studentsQuery = supabase
            .from("students")
            .select("user_id")
            .in("id", studentIds)
            .not("user_id", "is", null);
          if (branchId) studentsQuery = studentsQuery.eq("branch_id", branchId);
          if (financialYearId) studentsQuery = studentsQuery.eq("financial_year_id", financialYearId);
          const { data: students } = await studentsQuery;
          studentUserIds = students?.map((s) => s.user_id) || [];
        }
        // Get teachers in batch – scoped
        let batchTeachersQuery = supabase
          .from("batch_teachers")
          .select("teacher_id")
          .eq("batch_id", batchId);
        if (branchId) batchTeachersQuery = batchTeachersQuery.eq("branch_id", branchId);
        if (financialYearId) batchTeachersQuery = batchTeachersQuery.eq("financial_year_id", financialYearId);
        const { data: batchTeachers } = await batchTeachersQuery;
        const teacherIds = batchTeachers?.map((bt) => bt.teacher_id) || [];
        let teacherUserIds = [];
        if (teacherIds.length) {
          let teachersQuery = supabase
            .from("teachers")
            .select("user_id")
            .in("id", teacherIds)
            .not("user_id", "is", null);
          if (branchId) teachersQuery = teachersQuery.eq("branch_id", branchId);
          if (financialYearId) teachersQuery = teachersQuery.eq("financial_year_id", financialYearId);
          const { data: teachers } = await teachersQuery;
          teacherUserIds = teachers?.map((t) => t.user_id) || [];
        }
        candidateIds = [...studentUserIds, ...teacherUserIds];
        break;
      }
      case "Teachers": {
        let teachersQuery = supabase
          .from("teachers")
          .select("user_id")
          .not("user_id", "is", null);
        if (branchId) teachersQuery = teachersQuery.eq("branch_id", branchId);
        if (financialYearId) teachersQuery = teachersQuery.eq("financial_year_id", financialYearId);
        const { data: teachers } = await teachersQuery;
        candidateIds = teachers?.map((t) => t.user_id) || [];
        break;
      }
      case "Students": {
        let studentsQuery = supabase
          .from("students")
          .select("user_id")
          .not("user_id", "is", null);
        if (branchId) studentsQuery = studentsQuery.eq("branch_id", branchId);
        if (financialYearId) studentsQuery = studentsQuery.eq("financial_year_id", financialYearId);
        const { data: students } = await studentsQuery;
        candidateIds = students?.map((s) => s.user_id) || [];
        break;
      }
      default:
        return [];
    }

    // Remove duplicates and nulls
    const uniqueIds = [...new Set(candidateIds.filter(Boolean))];

    if (!uniqueIds.length) return [];

    // Validate against auth.users using the RPC function
    const { data: validIds, error } = await supabase.rpc("get_valid_user_ids", {
      user_ids: uniqueIds,
    });

    if (error) {
      console.error("Error filtering user IDs:", error);
      return uniqueIds;
    }

    return validIds || [];
  }

  // ---------- Infinite query for notifications – scoped to branch & FY ----------
  const {
    data,
    isLoading,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
  } = useInfiniteQuery({
    queryKey: ["notifications", { search }, branchId, financialYearId],
    queryFn: async ({ pageParam = 0 }) => {
      const limit = 20;
      const from = pageParam * limit;
      const to = from + limit - 1;

      let query = supabase
        .from("notifications")
        .select(`*, batches(batch_name)`, { count: "exact" })
        .order("created_at", { ascending: false })
        .range(from, to);

      // Scope to branch & FY
      if (branchId) query = query.eq("branch_id", branchId);
      if (financialYearId) query = query.eq("financial_year_id", financialYearId);

      if (search) {
        query = query.or(
          `title.ilike.%${search}%,message.ilike.%${search}%`
        );
      }

      const { data, error, count } = await query;
      if (error) throw error;
      return { data: data || [], count };
    },
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

  const notifications = data?.pages.flatMap((page) => page.data) || [];

  // ---------- Create mutation – already includes branch & FY ----------
  const createMutation = useMutation({
    mutationFn: async (payload) => {
      const { title, message, target_type, batch_id } = payload;
      const userIds = await getRecipients(target_type, batch_id);

      if (!userIds || userIds.length === 0) {
        throw new Error("No valid recipients found for this target.");
      }

      const rows = userIds.map((user_id) => ({
        title,
        message,
        target_type,
        batch_id: batch_id || null,
        user_id,
        is_read: false,
        created_at: new Date().toISOString(),
        branch_id: branchId,
        financial_year_id: financialYearId,
      }));

      const chunkSize = 500;
      for (let i = 0; i < rows.length; i += chunkSize) {
        const chunk = rows.slice(i, i + chunkSize);
        const { error } = await supabase.from("notifications").insert(chunk);
        if (error) throw error;
      }

      return rows.length;
    },
    onSuccess: (count) => {
      toast.success(`Notification sent to ${count} users.`);
      queryClient.invalidateQueries({ queryKey: ["notifications"] });
      setShowForm(false);
      setForm({ title: "", message: "", target_type: "All", batch_id: "" });
    },
    onError: (err) => {
      toast.error(err.message || "Failed to send notification.");
    },
  });

  // ---------- Mutations: Mark read, delete, mark all (scoped) ----------
  const markReadMutation = useMutation({
    mutationFn: async (id) => {
      const { error } = await supabase
        .from("notifications")
        .update({ is_read: true })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["notifications"] });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id) => {
      let query = supabase.from("notifications").delete().eq("id", id);
      if (branchId) query = query.eq("branch_id", branchId);
      if (financialYearId) query = query.eq("financial_year_id", financialYearId);
      const { error } = await query;
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Notification deleted.");
      queryClient.invalidateQueries({ queryKey: ["notifications"] });
    },
    onError: () => toast.error("Delete failed."),
  });

  const markAllReadMutation = useMutation({
    mutationFn: async () => {
      let query = supabase
        .from("notifications")
        .update({ is_read: true })
        .eq("is_read", false);

      if (branchId) query = query.eq("branch_id", branchId);
      if (financialYearId) query = query.eq("financial_year_id", financialYearId);

      const { error } = await query;
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("All notifications marked as read.");
      queryClient.invalidateQueries({ queryKey: ["notifications"] });
    },
  });

  // ---------- CSV Import – already includes branch & FY ----------
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
              title: row.title,
              message: row.message,
              target_type: row.target_type || "All",
              batch_id: row.batch_id || null,
              is_read: false,
              branch_id: branchId,
              financial_year_id: financialYearId,
            };
            const { error } = await supabase.from("notifications").insert([payload]);
            if (!error) successCount++;
          } catch (err) {
            console.error(err);
          }
        }
        toast.success(`${successCount} notifications imported.`);
        queryClient.invalidateQueries({ queryKey: ["notifications"] });
      },
      error: () => toast.error("CSV parsing error."),
    });
  }

  // ---------- CSV Export (scoped) ----------
  async function handleCSVExport() {
    try {
      let query = supabase
        .from("notifications")
        .select(`*, batches(batch_name)`)
        .order("created_at", { ascending: false });

      if (branchId) query = query.eq("branch_id", branchId);
      if (financialYearId) query = query.eq("financial_year_id", financialYearId);

      const { data: allData } = await query;

      const csv = Papa.unparse(
        (allData || []).map((n) => ({
          title: n.title,
          message: n.message,
          target: n.target_type === "Batch" && n.batches?.batch_name
            ? `Batch: ${n.batches.batch_name}`
            : n.target_type,
          is_read: n.is_read,
          created_at: n.created_at,
        }))
      );
      const blob = new Blob([csv], { type: "text/csv" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "notifications.csv";
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      toast.error("Export failed.");
    }
  }

  // ---------- Submit handler ----------
  function handleSubmit(e) {
    e.preventDefault();
    if (!form.title.trim() || !form.message.trim()) {
      toast.error("Title and message are required.");
      return;
    }
    createMutation.mutate({
      title: form.title,
      message: form.message,
      target_type: form.target_type,
      batch_id: form.batch_id || null,
    });
  }

  // ---------- Render ----------
  return (
    <AdminLayout>
      <BackButton to="/communication-hub" label="Communication" />
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-6 gap-4">
        <div>
          <h1 className="text-3xl font-righteous text-primary-dark">Notifications</h1>
          <p className="text-sm text-secondary-dark font-montserrat mt-1">
            Send and view announcements
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            onClick={() => setShowForm(true)}
            className="bg-primary hover:bg-primary-light text-white px-5 py-2.5 rounded-lg transition font-montserrat text-sm flex items-center gap-2"
          >
            <Bell size={18} /> New Notification
          </button>
          <button
            onClick={() => markAllReadMutation.mutate()}
            className="border border-secondary-light px-4 py-2.5 rounded-lg text-secondary-dark hover:bg-secondary-bg font-montserrat text-sm flex items-center gap-2"
          >
            <Check size={18} /> Mark All Read
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

      <div className="relative mb-6 max-w-md">
        <Search
          size={18}
          className="absolute left-3 top-1/2 -translate-y-1/2 text-secondary"
        />
        <input
          type="text"
          placeholder="Search by title or message..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full border border-secondary-light rounded-lg pl-10 pr-4 py-2.5 text-sm focus:ring-1 focus:ring-primary focus:border-primary outline-none placeholder-secondary-light"
        />
      </div>

      <div className="bg-white rounded-xl shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[600px]">
            <thead className="bg-slate-100 border-b border-secondary-light">
              <tr>
                <th className="p-3 text-left text-sm font-montserrat text-secondary-dark">Title</th>
                <th className="text-left text-sm font-montserrat text-secondary-dark">Message</th>
                <th className="text-left text-sm font-montserrat text-secondary-dark">Target</th>
                <th className="text-left text-sm font-montserrat text-secondary-dark">Date</th>
                <th className="text-left text-sm font-montserrat text-secondary-dark">Status</th>
                <th className="text-left text-sm font-montserrat text-secondary-dark">Actions</th>
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                <tr>
                  <td colSpan={6} className="p-6 text-center text-secondary">Loading notifications…</td>
                </tr>
              ) : notifications.length === 0 ? (
                <tr>
                  <td colSpan={6} className="p-6 text-center text-secondary">
                    <div className="flex flex-col items-center gap-2">
                      <Bell size={32} className="text-secondary-light" />
                      <span>No notifications found</span>
                      <span className="text-xs text-secondary-light">
                        {search ? "Try adjusting your search" : "Send a new notification to get started"}
                      </span>
                    </div>
                  </td>
                </tr>
              ) : (
                notifications.map((n) => (
                  <tr
                    key={n.id}
                    className={`border-b border-secondary-light hover:bg-primary-bg transition ${
                      !n.is_read ? "bg-blue-50/50" : ""
                    }`}
                  >
                    <td className="p-3 text-sm font-medium">{n.title}</td>
                    <td className="text-sm max-w-xs truncate">{n.message}</td>
                    <td className="text-sm">
                      {n.target_type === "Batch" && n.batches?.batch_name
                        ? `Batch: ${n.batches.batch_name}`
                        : n.target_type}
                    </td>
                    <td className="text-sm">
                      {new Date(n.created_at).toLocaleDateString()}
                    </td>
                    <td className="text-sm">
                      {n.is_read ? (
                        <span className="text-xs text-secondary">Read</span>
                      ) : (
                        <span className="text-xs text-accent font-medium">New</span>
                      )}
                    </td>
                    <td className="text-sm">
                      <div className="flex gap-2">
                        {!n.is_read && (
                          <button
                            onClick={() => markReadMutation.mutate(n.id)}
                            className="text-green-600 hover:underline flex items-center gap-1"
                            title="Mark as read"
                          >
                            <Check size={15} /> Read
                          </button>
                        )}
                        <button
                          onClick={() => {
                            if (!window.confirm("Delete this notification?")) return;
                            deleteMutation.mutate(n.id);
                          }}
                          className="text-red-600 hover:underline flex items-center gap-1"
                          title="Delete"
                        >
                          <Trash2 size={15} /> Delete
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
            className="bg-primary hover:bg-primary-light text-white px-6 py-2.5 rounded-lg font-montserrat text-sm transition disabled:opacity-60"
          >
            {isFetchingNextPage ? "Loading more…" : "Load More"}
          </button>
        </div>
      )}

      {showForm && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl w-full max-w-md shadow-xl">
            <div className="sticky top-0 bg-white border-b border-secondary-light px-6 py-4 flex items-center justify-between rounded-t-xl">
              <div className="flex items-center gap-3">
                <img
                  src={darkLogo}
                  alt="ShreeVidhya Academy"
                  className="h-10 w-auto"
                />
                <h2 className="text-xl font-righteous text-primary-dark">New Notification</h2>
              </div>
              <button
                onClick={() => setShowForm(false)}
                className="p-2 hover:bg-secondary-bg rounded-lg"
              >
                <X size={20} className="text-secondary-dark" />
              </button>
            </div>
            <form onSubmit={handleSubmit} className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-montserrat text-secondary-dark mb-1">
                  <Mail size={14} className="inline mr-1" />
                  Title *
                </label>
                <input
                  type="text"
                  placeholder="Notification title"
                  value={form.title}
                  onChange={(e) => setForm({ ...form, title: e.target.value })}
                  className="w-full border border-secondary-light rounded p-2.5 focus:ring-1 focus:ring-primary focus:border-primary outline-none placeholder-secondary-light"
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-montserrat text-secondary-dark mb-1">
                  <FileText size={14} className="inline mr-1" />
                  Message *
                </label>
                <textarea
                  placeholder="Notification message"
                  value={form.message}
                  onChange={(e) => setForm({ ...form, message: e.target.value })}
                  rows={4}
                  className="w-full border border-secondary-light rounded p-2.5 focus:ring-1 focus:ring-primary focus:border-primary outline-none placeholder-secondary-light resize-none"
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-montserrat text-secondary-dark mb-1">
                  <Layers size={14} className="inline mr-1" />
                  Target Type
                </label>
                <select
                  value={form.target_type}
                  onChange={(e) => setForm({ ...form, target_type: e.target.value })}
                  className="w-full border border-secondary-light rounded p-2.5 focus:ring-1 focus:ring-primary focus:border-primary outline-none"
                >
                  <option>All</option>
                  <option>Batch</option>
                  <option>Teachers</option>
                  <option>Students</option>
                </select>
              </div>
              {form.target_type === "Batch" && (
                <div>
                  <label className="block text-sm font-montserrat text-secondary-dark mb-1">
                    <Layers size={14} className="inline mr-1" />
                    Select Batch *
                  </label>
                  <select
                    value={form.batch_id}
                    onChange={(e) => setForm({ ...form, batch_id: e.target.value })}
                    className="w-full border border-secondary-light rounded p-2.5 focus:ring-1 focus:ring-primary focus:border-primary outline-none"
                    required
                  >
                    <option value="">Select Batch</option>
                    {batches.map((b) => (
                      <option key={b.id} value={b.id}>
                        {b.batch_name}
                      </option>
                    ))}
                  </select>
                </div>
              )}
              <div className="flex flex-col sm:flex-row-reverse gap-3 pt-2">
                <button
                  type="submit"
                  disabled={createMutation.isPending}
                  className="w-full sm:w-auto bg-primary hover:bg-primary-light text-white px-6 py-2.5 rounded-lg font-montserrat transition disabled:opacity-60"
                >
                  {createMutation.isPending ? "Sending…" : "Send"}
                </button>
                <button
                  type="button"
                  onClick={() => setShowForm(false)}
                  className="w-full sm:w-auto border border-secondary-light text-secondary-dark hover:bg-secondary-bg px-6 py-2.5 rounded-lg font-montserrat transition"
                >
                  Cancel
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </AdminLayout>
  );
}