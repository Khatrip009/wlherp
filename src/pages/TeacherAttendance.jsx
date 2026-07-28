// src/pages/TeacherAttendance.jsx
import { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "../api/supabase";
import toast from "react-hot-toast";
import { useAuth } from "../context/AuthContext";
import { useOrg } from "../context/OrganizationContext";
import { useTheme } from "../context/ThemeContext"; // already imported
import { generateDailyTeacherAttendancePDF } from "../utils/teacherDailyAttendancePdf";
import { Calendar, CheckCircle, XCircle, Clock, X, Download } from "lucide-react";

export default function TeacherAttendance() {
  const qc = useQueryClient();
  const { profile } = useAuth();
  const isAdmin = profile?.role === "admin" || profile?.role === "super_admin";
  const [date, setDate] = useState(new Date().toISOString().split("T")[0]);

  // ── Contexts ──
  const { org: currentOrg, branch, selectedFinancialYear } = useOrg();
  const { theme } = useTheme();
  const branchId = branch?.id;
  const financialYearId = selectedFinancialYear?.id;

  // ---- Get the teacher's own ID if the user is a teacher ----
  const { data: ownTeacherId } = useQuery({
    queryKey: ["my-teacher-id", profile?.id, branchId, financialYearId],
    queryFn: async () => {
      if (!profile?.id || isAdmin) return null;
      const { data } = await supabase
        .from("teachers")
        .select("id")
        .eq("user_id", profile.id)
        .eq("branch_id", branchId)
        .eq("financial_year_id", financialYearId)
        .single();
      return data?.id || null;
    },
    enabled: !!profile?.id && !isAdmin && !!branchId && !!financialYearId,
  });

  // ---- Fetch teachers (admin sees all; teacher sees only themselves) ----
  const { data: teachers = [] } = useQuery({
    queryKey: ["active-teachers", isAdmin, ownTeacherId, branchId, financialYearId],
    queryFn: async () => {
      let query = supabase
        .from("teachers")
        .select("id, first_name, last_name, employee_code")
        .eq("status", "active")
        .order("first_name");

      if (branchId) query = query.eq("branch_id", branchId);
      if (financialYearId) query = query.eq("financial_year_id", financialYearId);

      if (!isAdmin && ownTeacherId) {
        query = query.eq("id", ownTeacherId);
      }
      if (!isAdmin && !ownTeacherId) return [];

      const { data } = await query;
      return data || [];
    },
    enabled: (isAdmin || !!ownTeacherId) && !!branchId && !!financialYearId,
  });

  // ---- Fetch attendance for selected date ----
  const { data: attendance = [], isLoading } = useQuery({
    queryKey: ["teacher-attendance", date, isAdmin, ownTeacherId, branchId, financialYearId],
    queryFn: async () => {
      let query = supabase
        .from("teacher_attendance")
        .select("*")
        .eq("attendance_date", date)
        .eq("branch_id", branchId)
        .eq("financial_year_id", financialYearId);

      if (!isAdmin && ownTeacherId) {
        query = query.eq("teacher_id", ownTeacherId);
      }

      const { data } = await query;
      return data || [];
    },
    enabled: (isAdmin || !!ownTeacherId) && !!branchId && !!financialYearId,
  });

  // ---- Statistics ----
  const stats = useMemo(() => {
    const present = attendance.filter((a) => a.status === "present").length;
    const absent = attendance.filter((a) => a.status === "absent").length;
    const leave = attendance.filter((a) => a.status === "leave").length;
    const halfDay = attendance.filter((a) => a.status === "half_day").length;
    const total = teachers.length;
    const marked = attendance.length;
    return { total, marked, present, absent, leave, halfDay };
  }, [attendance, teachers]);

  // ---- Mark/update attendance ----
  const markMutation = useMutation({
    mutationFn: async ({ teacher_id, status }) => {
      const existing = attendance.find((a) => a.teacher_id === teacher_id);
      const payload = {
        status,
        updated_at: new Date().toISOString(),
        branch_id: branchId,
        financial_year_id: financialYearId,
      };
      if (existing) {
        const { error } = await supabase
          .from("teacher_attendance")
          .update(payload)
          .eq("id", existing.id);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from("teacher_attendance")
          .insert({
            teacher_id,
            attendance_date: date,
            status,
            branch_id: branchId,
            financial_year_id: financialYearId,
          });
        if (error) throw error;
      }
    },
    onSuccess: () => {
      toast.success("Attendance updated");
      qc.invalidateQueries(["teacher-attendance"]);
    },
    onError: (err) => toast.error(err.message),
  });

  // ---- Clear / unmark attendance ----
  const clearMutation = useMutation({
    mutationFn: async (teacherId) => {
      const existing = attendance.find((a) => a.teacher_id === teacherId);
      if (existing) {
        const { error } = await supabase
          .from("teacher_attendance")
          .delete()
          .eq("id", existing.id);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      toast.success("Attendance cleared");
      qc.invalidateQueries(["teacher-attendance"]);
    },
    onError: (err) => toast.error(err.message),
  });

  // ---- Helpers ----
  const getStatus = (teacherId) => {
    const record = attendance.find((a) => a.teacher_id === teacherId);
    return record?.status || "";
  };

  // ---- Bulk actions (admin only) ----
  const handleBulkStatus = (status) => {
    if (!isAdmin) return;
    teachers.forEach((t) => {
      markMutation.mutate({ teacher_id: t.id, status });
    });
  };

  // ── Monthly attendance PDF export ────────────────────────
  const [exporting, setExporting] = useState(false);

  const handleExportMonthlyPDF = async () => {
    setExporting(true);
    try {
      const chosenDate = new Date(date);
      const y = chosenDate.getFullYear();
      const m = chosenDate.getMonth();
      const start = `${y}-${String(m + 1).padStart(2, "0")}-01`;
      const end = new Date(y, m + 1, 0).toISOString().split("T")[0];

      let query = supabase
        .from("teacher_attendance")
        .select("attendance_date, teacher_id, status, teachers(first_name, last_name, employee_code)")
        .gte("attendance_date", start)
        .lte("attendance_date", end)
        .eq("branch_id", branchId)
        .eq("financial_year_id", financialYearId)
        .order("attendance_date");

      if (!isAdmin && ownTeacherId) {
        query = query.eq("teacher_id", ownTeacherId);
      }

      const { data: monthlyData, error } = await query;
      if (error) throw error;

      if (!monthlyData || monthlyData.length === 0) {
        toast.error("No attendance records for this month.");
        return;
      }

      const transformed = monthlyData.map((row) => ({
        date: row.attendance_date,
        teacher_name: row.teachers
          ? `${row.teachers.first_name} ${row.teachers.last_name}`
          : "Unknown",
        employee_code: row.teachers?.employee_code || "—",
        status: row.status,
      }));

      await generateDailyTeacherAttendancePDF(transformed, start, end, {
        org: currentOrg,
        branch,
        theme,
      });

      toast.success("Monthly attendance PDF downloaded");
    } catch (err) {
      toast.error("Failed to generate PDF");
      console.error(err);
    } finally {
      setExporting(false);
    }
  };

  return (
    <div className="space-y-6 px-4 sm:px-6 lg:px-0">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between mb-6">
        <h1 className="text-3xl font-heading text-primary">
          {isAdmin ? "Teacher Attendance" : "My Attendance"}
        </h1>
        <div className="flex items-center gap-3 mt-2 sm:mt-0">
          <div className="relative">
            <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 dark:text-gray-500 w-4 h-4" />
            <input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className="pl-9 pr-4 py-2 border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 rounded-lg text-sm focus:ring-2 focus:ring-primary focus:border-primary outline-none"
            />
          </div>

          <button
            onClick={handleExportMonthlyPDF}
            disabled={exporting}
            className="bg-primary hover:bg-primary-light text-white px-4 py-2 rounded-lg text-sm flex items-center gap-2 disabled:opacity-50 transition-colors"
          >
            <Download size={16} />
            {exporting ? "Exporting…" : "Monthly Report"}
          </button>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-4 mb-6">
        <div className="bg-white dark:bg-accent rounded-xl shadow-sm p-3 border border-gray-200 dark:border-gray-700">
          <p className="text-xs text-gray-500 dark:text-gray-400">Total Teachers</p>
          <p className="text-xl font-bold text-primary">{stats.total}</p>
        </div>
        <div className="bg-white dark:bg-accent rounded-xl shadow-sm p-3 border border-gray-200 dark:border-gray-700">
          <p className="text-xs text-gray-500 dark:text-gray-400">Marked</p>
          <p className="text-xl font-bold text-primary">{stats.marked}</p>
        </div>
        <div className="bg-white dark:bg-accent rounded-xl shadow-sm p-3 border border-accent">
          <p className="text-xs text-accent">Present</p>
          <p className="text-xl font-bold text-accent">{stats.present}</p>
        </div>
        <div className="bg-white dark:bg-accent rounded-xl shadow-sm p-3 border border-accent-dark">
          <p className="text-xs text-accent-dark">Absent</p>
          <p className="text-xl font-bold text-accent-dark">{stats.absent}</p>
        </div>
        <div className="bg-white dark:bg-accent rounded-xl shadow-sm p-3 border border-primary">
          <p className="text-xs text-primary">Leave / Half-Day</p>
          <p className="text-xl font-bold text-primary">{stats.leave + stats.halfDay}</p>
        </div>
      </div>

      {/* Bulk Actions */}
      {isAdmin && (
        <div className="flex flex-wrap gap-2 mb-4">
          <button
            onClick={() => handleBulkStatus("present")}
            className="bg-accent-bg text-accent px-3 py-1.5 rounded-lg text-sm hover:bg-accent-light transition flex items-center gap-1"
          >
            <CheckCircle className="w-4 h-4" /> Mark All Present
          </button>
          <button
            onClick={() => handleBulkStatus("absent")}
            className="bg-accent-bg text-accent-dark px-3 py-1.5 rounded-lg text-sm hover:bg-accent-light transition flex items-center gap-1"
          >
            <XCircle className="w-4 h-4" /> Mark All Absent
          </button>
          <button
            onClick={() => handleBulkStatus("leave")}
            className="bg-primary-bg text-primary px-3 py-1.5 rounded-lg text-sm hover:bg-primary-light transition flex items-center gap-1"
          >
            <Clock className="w-4 h-4" /> Mark All Leave
          </button>
          <button
            onClick={() => {
              teachers.forEach((t) => clearMutation.mutate(t.id));
            }}
            className="bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-200 px-3 py-1.5 rounded-lg text-sm hover:bg-gray-200 dark:hover:bg-gray-600 transition flex items-center gap-1"
          >
            <X className="w-4 h-4" /> Clear All
          </button>
        </div>
      )}

      {/* Table */}
      <div className="bg-white dark:bg-accent rounded-xl shadow-sm overflow-hidden border border-gray-200 dark:border-gray-700">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-gray-50 dark:bg-gray-700 border-b border-gray-200 dark:border-gray-600">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Teacher</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Employee Code</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Status</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Clear</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
              {isLoading ? (
                <tr>
                  <td colSpan={4} className="text-center py-8 text-gray-500 dark:text-gray-400">Loading...</td>
                </tr>
              ) : teachers.length === 0 ? (
                <tr>
                  <td colSpan={4} className="text-center py-8 text-gray-500 dark:text-gray-400">No active teachers.</td>
                </tr>
              ) : (
                teachers.map((t) => (
                  <tr key={t.id} className="hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors">
                    <td className="px-4 py-3 text-sm font-medium text-gray-800 dark:text-gray-100">
                      {t.first_name} {t.last_name}
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-700 dark:text-gray-200">{t.employee_code || "—"}</td>
                    <td className="px-4 py-3 text-sm">
                      <select
                        value={getStatus(t.id)}
                        onChange={(e) => {
                          const newStatus = e.target.value;
                          if (newStatus) {
                            markMutation.mutate({ teacher_id: t.id, status: newStatus });
                          }
                        }}
                        className="border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 rounded p-1.5 text-sm focus:ring-2 focus:ring-primary focus:border-primary outline-none"
                      >
                        <option value="" disabled hidden>
                          Select status
                        </option>
                        <option value="present">Present</option>
                        <option value="absent">Absent</option>
                        <option value="leave">Leave</option>
                        <option value="half_day">Half Day</option>
                      </select>
                    </td>
                    <td className="px-4 py-3 text-sm">
                      {getStatus(t.id) && (
                        <button
                          onClick={() => clearMutation.mutate(t.id)}
                          className="text-accent-dark hover:text-accent p-1 rounded"
                          title="Clear attendance"
                        >
                          <X size={16} />
                        </button>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
        {teachers.length > 0 && (
          <div className="px-4 py-2 text-xs text-gray-500 dark:text-gray-400 border-t border-gray-200 dark:border-gray-700">
            {stats.marked} out of {teachers.length} teachers marked
          </div>
        )}
      </div>
    </div>
  );
}