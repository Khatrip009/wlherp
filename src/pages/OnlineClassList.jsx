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
} from "lucide-react";
import { useNavigate } from "react-router-dom";
import OnlineClassModal from "../components/CreateOnlineClassModal";

export default function OnlineClassList() {
  const navigate = useNavigate();
  const { profile } = useAuth();
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [filterStatus, setFilterStatus] = useState("all");
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [editingClass, setEditingClass] = useState(null);

  // ── Organisation / Branch / Financial Year context ──
  const { branch, selectedFinancialYear } = useOrg();
  const branchId = branch?.id;
  const financialYearId = selectedFinancialYear?.id;

  const userRole = profile?.role?.toLowerCase() || "student";
  const isAdmin = userRole === "admin" || userRole === "super_admin";
  const isTeacher = userRole === "teacher";
  const isStudent = userRole === "student";

  // ---------- Fetch classes (scoped) ----------
  const { data: classes = [], isLoading, error } = useQuery({
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

      // Scope to current branch and financial year
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

  // ---------- Delete mutation (scoped) ----------
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

  // ---------- Start mutation – already includes branch & FY ----------
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

  // ---------- Helpers ----------
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

  // ---------- Render ----------
  return (
    <AdminLayout>
      <BackButton to="/communication-hub" label="Communication" />
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-6 gap-4">
        <div>
          <h1 className="text-3xl font-righteous text-primary-dark">Online Classes</h1>
          <p className="text-sm text-secondary-dark font-montserrat mt-1">
            Schedule and join live virtual sessions
          </p>
        </div>
        {(isAdmin || isTeacher) && (
          <button
            onClick={() => setShowCreateModal(true)}
            className="bg-primary hover:bg-primary-light text-white px-5 py-2.5 rounded-lg transition font-montserrat text-sm flex items-center gap-2"
          >
            <Plus size={18} /> Create Class
          </button>
        )}
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
    </AdminLayout>
  );
}