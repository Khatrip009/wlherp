// src/pages/OnlineClassList.jsx
import React, { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "../api/supabase";
import { useAuth } from "../context/AuthContext";
import { useOrg } from "../context/OrganizationContext";
import BackButton from "../components/BackButton";
import toast from "react-hot-toast";
import {
  Search,
  Plus,
  Video,
  Trash2,
  Edit,
  Play,
  RefreshCw,
  Trash,
  Mail,
} from "lucide-react";
import { useNavigate } from "react-router-dom";
import OnlineClassModal from "../components/CreateOnlineClassModal";
import { sendEmail, sendTemplateEmail } from "../services/emailService";

export default function OnlineClassList() {
  const navigate = useNavigate();
  const { profile } = useAuth();
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [filterStatus, setFilterStatus] = useState("all");
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [editingClass, setEditingClass] = useState(null);
  const [sendingReminder, setSendingReminder] = useState(null); // track class id

  const { branch, selectedFinancialYear, org } = useOrg();
  const branchId = branch?.id;
  const financialYearId = selectedFinancialYear?.id;

  const userRole = profile?.role?.toLowerCase() || "student";
  const adminRoles = [
    "admin",
    "super_admin",
    "organization_admin",
    "org_admin",
    "branch_admin",
  ];
  const isAdmin = adminRoles.includes(userRole);
  const isTeacher = userRole === "teacher";
  const isStudent = userRole === "student";

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

  // ─── Send report email ─────────────────────────────────────────────
  const sendReportEmail = async () => {
    if (classes.length === 0) {
      alert("No classes to send.");
      return;
    }

    try {
      const adminEmails = await getAdminEmails();
      if (adminEmails.length === 0) {
        alert("No admin emails found.");
        return;
      }

      // Build HTML table rows
      let tableRows = classes.map((cls) => {
        const teacherName = cls.teacher ? `${cls.teacher.first_name || ''} ${cls.teacher.last_name || ''}`.trim() : '—';
        const statusColor = cls.status === "live" ? "#2e7d32" :
                            cls.status === "scheduled" ? "#1565C0" : "#757575";
        const statusBg = cls.status === "live" ? "#e8f5e9" :
                         cls.status === "scheduled" ? "#e3f2fd" : "#f5f5f5";

        return `
          <tr>
            <td style="padding:4px 8px;border:1px solid #ddd;">${cls.title}</td>
            <td style="padding:4px 8px;border:1px solid #ddd;">${cls.batch?.batch_name || '—'}</td>
            <td style="padding:4px 8px;border:1px solid #ddd;">${teacherName}</td>
            <td style="padding:4px 8px;border:1px solid #ddd;">${new Date(cls.start_time).toLocaleString()}</td>
            <td style="padding:4px 8px;border:1px solid #ddd;">${cls.duration_minutes || '—'} min</td>
            <td style="padding:4px 8px;border:1px solid #ddd;">
              <span style="background:${statusBg};color:${statusColor};padding:2px 8px;border-radius:12px;font-size:10px;font-weight:600;">${cls.status}</span>
            </td>
          </tr>
        `;
      }).join('');

      const htmlBody = `
        <div style="font-family:Arial,sans-serif;max-width:800px;margin:0 auto;">
          <h2 style="color:#0D47A1;">Online Classes Report</h2>
          <p><strong>Branch:</strong> ${branch?.branch_name || 'N/A'}</p>
          <p><strong>Filters:</strong> Status: ${filterStatus} | Search: ${search || 'None'}</p>
          <p><strong>Total Classes:</strong> ${classes.length}</p>
          <hr />
          <table style="width:100%;border-collapse:collapse;font-size:11px;border:1px solid #ddd;">
            <thead style="background:#e3f2fd;">
              <tr>
                <th style="padding:4px 8px;border:1px solid #ddd;text-align:left;">Title</th>
                <th style="padding:4px 8px;border:1px solid #ddd;text-align:left;">Batch</th>
                <th style="padding:4px 8px;border:1px solid #ddd;text-align:left;">Teacher</th>
                <th style="padding:4px 8px;border:1px solid #ddd;text-align:left;">Start Time</th>
                <th style="padding:4px 8px;border:1px solid #ddd;text-align:left;">Duration</th>
                <th style="padding:4px 8px;border:1px solid #ddd;text-align:left;">Status</th>
              </tr>
            </thead>
            <tbody>
              ${tableRows}
            </tbody>
          </table>
          <p style="color:#888;font-size:10px;margin-top:20px;">Computer‑generated report from ${org?.company_name || 'Academy'}</p>
        </div>
      `;

      await sendEmail({
        to: adminEmails,
        subject: `Online Classes Report - ${new Date().toLocaleDateString()}`,
        html: htmlBody,
        from: org?.email || undefined,
      });

      alert("Report sent to admins.");
    } catch (err) {
      console.error("Failed to send report:", err);
      alert("Failed to send report. Check console for details.");
    }
  };

  // ─── Send class reminder to students ───────────────────────────────
  const sendClassReminder = async (cls) => {
    try {
      setSendingReminder(cls.id);

      // 1. Fetch active students in the batch
      let studentQuery = supabase
        .from("student_batches")
        .select("student_id, students(first_name, last_name, email)")
        .eq("batch_id", cls.batch_id)
        .eq("status", "active")
        .eq("branch_id", branchId)
        .eq("financial_year_id", financialYearId);

      const { data: studentBatches, error: studentError } = await studentQuery;
      if (studentError) throw studentError;

      if (!studentBatches || studentBatches.length === 0) {
        toast.error("No active students in this batch.");
        setSendingReminder(null);
        return;
      }

      // 2. Send email to each student (or parent)
      let sentCount = 0;
      for (const sb of studentBatches) {
        const student = sb.students;
        let recipientEmail = student.email;

        // Try to find parent email
        const { data: parent, error: parentError } = await supabase
          .from("student_parents")
          .select("parents!inner(email)")
          .eq("student_id", student.id)
          .maybeSingle();
        if (!parentError && parent && parent.parents?.email) {
          recipientEmail = parent.parents.email;
        }

        if (!recipientEmail) continue;

        const context = {
          academyName: org?.company_name || "Academy",
          batch_name: cls.batch?.batch_name || '',
          title: cls.title,
          start_time: new Date(cls.start_time).toLocaleString(),
          duration: cls.duration_minutes || '30',
          room_link: `https://your-meeting-link.com/${cls.room_name || ''}`, // adjust as needed
        };

        await sendTemplateEmail({
          to: recipientEmail,
          organizationId: org?.id,
          slug: "online_class_scheduled",
          context,
          branchId,
        });
        sentCount++;
      }
      toast.success(`Class reminder sent to ${sentCount} student(s).`);
    } catch (err) {
      console.error("Reminder error:", err);
      toast.error("Failed to send reminder emails.");
    } finally {
      setSendingReminder(null);
    }
  };

  // ─── Fetch classes (unchanged) ─────────────────────────────────────
  const { data: classes = [], isLoading, error, refetch } = useQuery({
    queryKey: ["online-classes", filterStatus, search, branchId, financialYearId],
    queryFn: async () => {
      let query = supabase
        .from("online_classes")
        .select(`
          *,
          batch:batch_id (id, batch_name),
          teacher:teacher_id (id, first_name, last_name)
        `)
        .order("start_time", { ascending: true });

      if (branchId) query = query.eq("branch_id", branchId);
      if (financialYearId) query = query.eq("financial_year_id", financialYearId);

      if (isStudent) {
        try {
          let studentQuery = supabase
            .from("students")
            .select("id")
            .eq("user_id", profile.id);
          if (branchId) studentQuery = studentQuery.eq("branch_id", branchId);
          if (financialYearId) studentQuery = studentQuery.eq("financial_year_id", financialYearId);
          const { data: student, error: studentError } = await studentQuery.maybeSingle();
          if (studentError) throw studentError;
          if (!student) return [];

          let enrollmentQuery = supabase
            .from("student_batches")
            .select("batch_id")
            .eq("student_id", student.id)
            .eq("status", "active");
          if (branchId) enrollmentQuery = enrollmentQuery.eq("branch_id", branchId);
          if (financialYearId) enrollmentQuery = enrollmentQuery.eq("financial_year_id", financialYearId);
          const { data: enrollments } = await enrollmentQuery;
          const batchIds = enrollments?.map(e => e.batch_id) || [];
          if (batchIds.length === 0) return [];
          query = query.in("batch_id", batchIds);
        } catch (err) {
          console.error("Student lookup error:", err);
          return [];
        }
      } else if (isTeacher) {
        try {
          let teacherQuery = supabase
            .from("teachers")
            .select("id")
            .eq("user_id", profile.id);
          if (branchId) teacherQuery = teacherQuery.eq("branch_id", branchId);
          if (financialYearId) teacherQuery = teacherQuery.eq("financial_year_id", financialYearId);
          const { data: teacher, error: teacherError } = await teacherQuery.maybeSingle();
          if (teacherError) throw teacherError;
          if (!teacher) return [];
          query = query.eq("teacher_id", teacher.id);
        } catch (err) {
          console.error("Teacher lookup error:", err);
          return [];
        }
      }

      if (filterStatus !== "all") {
        query = query.eq("status", filterStatus);
      }
      if (search.trim()) {
        query = query.ilike("title", `%${search.trim()}%`);
      }

      const { data, error } = await query;
      if (error) throw error;
      return data || [];
    },
    staleTime: 2 * 60 * 1000,
    enabled: !!profile?.id && !!branchId && !!financialYearId,
  });

  // ─── Mutations (unchanged) ──────────────────────────────────────────
  const deleteMutation = useMutation({
    mutationFn: async (classId) => {
      let query = supabase
        .from("online_classes")
        .delete()
        .eq("id", classId);
      if (branchId) query = query.eq("branch_id", branchId);
      if (financialYearId) query = query.eq("financial_year_id", financialYearId);
      const { error } = await query;
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Class deleted");
      queryClient.invalidateQueries({ queryKey: ["online-classes"] });
    },
    onError: (err) => toast.error(err.message),
  });

  const cleanupMutation = useMutation({
    mutationFn: async () => {
      const cutoff = new Date();
      cutoff.setDate(cutoff.getDate() - 7);
      const cutoffISO = cutoff.toISOString();

      let query = supabase
        .from("online_classes")
        .delete()
        .eq("status", "ended")
        .lt("start_time", cutoffISO);

      if (branchId) query = query.eq("branch_id", branchId);
      if (financialYearId) query = query.eq("financial_year_id", financialYearId);

      const { error, count } = await query;
      if (error) throw error;
      return count || 0;
    },
    onSuccess: (deletedCount) => {
      toast.success(`Deleted ${deletedCount} old ended classes`);
      queryClient.invalidateQueries({ queryKey: ["online-classes"] });
    },
    onError: (err) => toast.error(err.message || "Cleanup failed"),
  });

  const startClassMutation = useMutation({
    mutationFn: async (classId) => {
      const { error } = await supabase
        .from("online_classes")
        .update({
          status: "live",
          branch_id: branchId,
          financial_year_id: financialYearId,
        })
        .eq("id", classId);
      if (error) throw error;
    },
    onSuccess: (_, classId) => {
      toast.success("Class started! Students have been notified.");
      queryClient.invalidateQueries({ queryKey: ["online-classes"] });
      navigate(`/online-classes/join/${classId}`);
    },
    onError: (err) => toast.error(err.message),
  });

  // ─── Helpers ─────────────────────────────────────────────────────────
  const getStatusColor = (status) => {
    switch (status) {
      case "scheduled": return "bg-blue-100 text-blue-800";
      case "live": return "bg-green-100 text-green-800 animate-pulse";
      case "ended": return "bg-gray-100 text-gray-600";
      default: return "bg-gray-100 text-gray-600";
    }
  };

  const handleEdit = (cls) => {
    setEditingClass(cls);
  };

  const handleModalClose = () => {
    setShowCreateModal(false);
    setEditingClass(null);
  };

  const handleModalSuccess = () => {
    queryClient.invalidateQueries({ queryKey: ["online-classes"] });
  };

  const handleCleanup = () => {
    if (
      window.confirm(
        "This will permanently delete all ended classes older than 7 days. Continue?"
      )
    ) {
      cleanupMutation.mutate();
    }
  };

  // ─── Render ─────────────────────────────────────────────────────────
  return (
    <>
      <BackButton to="/communication-hub" label="Communication" />
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-6 gap-4">
        <div>
          <h1 className="text-3xl font-righteous text-primary-dark">Online Classes</h1>
          <p className="text-sm text-secondary-dark font-montserrat mt-1">
            Schedule and join live virtual sessions
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {/* 👇 Send Report button */}
          <button
            onClick={sendReportEmail}
            disabled={classes.length === 0}
            className="bg-green-600 hover:bg-green-700 text-white px-4 py-2.5 rounded-lg transition font-montserrat text-sm flex items-center gap-2 disabled:opacity-50"
          >
            <Mail size={18} /> Send Report
          </button>
          {(isAdmin || isTeacher) && (
            <>
              <button
                onClick={() => setShowCreateModal(true)}
                className="bg-primary hover:bg-primary-light text-white px-5 py-2.5 rounded-lg transition font-montserrat text-sm flex items-center gap-2"
              >
                <Plus size={18} /> Create Class
              </button>
              {isAdmin && (
                <button
                  onClick={handleCleanup}
                  disabled={cleanupMutation.isPending}
                  className="border border-red-300 text-red-600 hover:bg-red-50 px-4 py-2.5 rounded-lg transition font-montserrat text-sm flex items-center gap-2 disabled:opacity-50"
                  title="Delete ended classes older than 7 days"
                >
                  <Trash size={16} />
                  {cleanupMutation.isPending ? "Cleaning..." : "Clean Up Ended"}
                </button>
              )}
            </>
          )}
          <button
            onClick={() => refetch()}
            disabled={isLoading}
            className="border border-secondary-light px-4 py-2.5 rounded-lg text-secondary-dark hover:bg-secondary-bg font-montserrat text-sm flex items-center gap-2 disabled:opacity-50"
          >
            <RefreshCw size={16} className={isLoading ? "animate-spin" : ""} />
            Refresh
          </button>
        </div>
      </div>

      <div className="flex flex-col sm:flex-row gap-4 mb-6">
        <div className="relative flex-1 max-w-md">
          <Search
            size={18}
            className="absolute left-3 top-1/2 -translate-y-1/2 text-secondary"
          />
          <input
            type="text"
            placeholder="Search by title..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full border border-secondary-light rounded-lg pl-10 pr-4 py-2.5 text-sm focus:ring-1 focus:ring-primary focus:border-primary outline-none"
          />
        </div>
        <div>
          <select
            value={filterStatus}
            onChange={(e) => setFilterStatus(e.target.value)}
            className="border border-secondary-light rounded-lg px-4 py-2.5 text-sm focus:ring-1 focus:ring-primary focus:border-primary outline-none"
          >
            <option value="all">All Status</option>
            <option value="scheduled">Scheduled</option>
            <option value="live">Live</option>
            <option value="ended">Ended</option>
          </select>
        </div>
      </div>

      <div className="bg-white rounded-xl shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[800px]">
            <thead className="bg-slate-100 border-b border-secondary-light">
              <tr>
                <th className="p-3 text-left text-sm font-montserrat text-secondary-dark">Title</th>
                <th className="p-3 text-left text-sm font-montserrat text-secondary-dark">Batch</th>
                <th className="p-3 text-left text-sm font-montserrat text-secondary-dark">Teacher</th>
                <th className="p-3 text-left text-sm font-montserrat text-secondary-dark">Start Time</th>
                <th className="p-3 text-left text-sm font-montserrat text-secondary-dark">Duration</th>
                <th className="p-3 text-left text-sm font-montserrat text-secondary-dark">Status</th>
                <th className="p-3 text-left text-sm font-montserrat text-secondary-dark">Actions</th>
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                <tr><td colSpan={7} className="p-6 text-center text-secondary">Loading...</td></tr>
              ) : error ? (
                <tr><td colSpan={7} className="p-6 text-center text-red-500">Error: {error.message}</td></tr>
              ) : classes.length === 0 ? (
                <tr>
                  <td colSpan={7} className="p-6 text-center text-secondary">
                    <div className="flex flex-col items-center gap-2">
                      <Video size={32} className="text-secondary-light" />
                      <span>No online classes found</span>
                      <span className="text-xs text-secondary-light">
                        {search || filterStatus !== "all"
                          ? "Try adjusting your filters"
                          : (isAdmin || isTeacher)
                            ? "Click 'Create Class' to schedule your first session"
                            : "Check back later for upcoming classes"}
                      </span>
                    </div>
                  </td>
                </tr>
              ) : (
                classes.map((cls) => {
                  const isLive = cls.status === "live";
                  const isScheduled = cls.status === "scheduled";
                  const canJoin = isLive || isScheduled;
                  const canEdit = isAdmin || (isTeacher && cls.teacher_id === profile?.id);
                  const canDelete = isAdmin;
                  const canStart = (isAdmin || (isTeacher && cls.teacher_id === profile?.id)) && isScheduled;

                  return (
                    <tr key={cls.id} className={`border-b border-secondary-light hover:bg-primary-bg transition ${isLive ? "bg-green-50/50" : ""}`}>
                      <td className="p-3 text-sm font-medium">{cls.title}</td>
                      <td className="p-3 text-sm">{cls.batch?.batch_name || "—"}</td>
                      <td className="p-3 text-sm">
                        {cls.teacher ? `${cls.teacher.first_name} ${cls.teacher.last_name}` : "—"}
                      </td>
                      <td className="p-3 text-sm">{new Date(cls.start_time).toLocaleString()}</td>
                      <td className="p-3 text-sm">{cls.duration_minutes || "—"} min</td>
                      <td className="p-3 text-sm">
                        <span className={`px-2 py-1 rounded-full text-xs font-medium ${getStatusColor(cls.status)}`}>
                          {cls.status}
                        </span>
                      </td>
                      <td className="p-3 text-sm">
                        <div className="flex flex-wrap gap-2">
                          {canJoin && (
                            <button
                              onClick={() => navigate(`/online-classes/join/${cls.id}`)}
                              className="text-green-600 hover:underline flex items-center gap-1"
                            >
                              <Video size={15} /> Join
                            </button>
                          )}
                          {canStart && (
                            <button
                              onClick={() => startClassMutation.mutate(cls.id)}
                              className="text-blue-600 hover:underline flex items-center gap-1"
                              title="Start Class"
                            >
                              <Play size={15} /> Start
                            </button>
                          )}
                          {/* 👇 Send Reminder button (mail icon) */}
                          {(isAdmin || (isTeacher && cls.teacher_id === profile?.id)) && (
                            <button
                              onClick={() => sendClassReminder(cls)}
                              disabled={sendingReminder === cls.id}
                              className="text-purple-600 hover:underline flex items-center gap-1 disabled:opacity-50"
                              title="Send reminder to students"
                            >
                              <Mail size={15} />
                              {sendingReminder === cls.id ? '...' : ''}
                            </button>
                          )}
                          {canEdit && (
                            <button
                              onClick={() => handleEdit(cls)}
                              className="text-blue-600 hover:underline flex items-center gap-1"
                            >
                              <Edit size={15} />
                            </button>
                          )}
                          {canDelete && (
                            <button
                              onClick={() => {
                                if (window.confirm("Delete this class?")) {
                                  deleteMutation.mutate(cls.id);
                                }
                              }}
                              className="text-red-600 hover:underline flex items-center gap-1"
                            >
                              <Trash2 size={15} />
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Create Modal */}
      <OnlineClassModal
        isOpen={showCreateModal}
        onClose={handleModalClose}
        onSuccess={handleModalSuccess}
      />

      {/* Edit Modal */}
      <OnlineClassModal
        isOpen={!!editingClass}
        initialData={editingClass}
        onClose={handleModalClose}
        onSuccess={handleModalSuccess}
      />
    </>
  );
}