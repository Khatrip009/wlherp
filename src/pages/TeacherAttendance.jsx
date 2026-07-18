import { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "../api/supabase";
import toast from "react-hot-toast";
import { useAuth } from "../context/AuthContext";
import { useOrg } from "../context/OrganizationContext";
import { useTheme } from "../context/ThemeContext";                       // NEW
import { generateDailyTeacherAttendancePDF } from "../utils/teacherDailyAttendancePdf";  // NEW
import { Calendar, CheckCircle, XCircle, Clock, X, Download } from "lucide-react";      // added Download

export default function TeacherAttendance() {
  const qc = useQueryClient();
  const { profile } = useAuth();
  const isAdmin = profile?.role === "admin" || profile?.role === "super_admin";
  const [date, setDate] = useState(new Date().toISOString().split("T")[0]);

  // ── Contexts ──
  const { org: currentOrg, branch, selectedFinancialYear } = useOrg();
  const { theme } = useTheme();                                        // NEW
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
      // Determine month range from the selected date
      const chosenDate = new Date(date);
      const y = chosenDate.getFullYear();
      const m = chosenDate.getMonth(); // 0-indexed
      const start = `${y}-${String(m + 1).padStart(2, "0")}-01`;
      const end = new Date(y, m + 1, 0).toISOString().split("T")[0];

      // Build a query to get attendance records for that month (scoped)
      let query = supabase
        .from("teacher_attendance")
        .select("attendance_date, teacher_id, status, teachers(first_name, last_name, employee_code)")
        .gte("attendance_date", start)
        .lte("attendance_date", end)
        .eq("branch_id", branchId)
        .eq("financial_year_id", financialYearId)
        .order("attendance_date");

      // If teacher, fetch only their own records
      if (!isAdmin && ownTeacherId) {
        query = query.eq("teacher_id", ownTeacherId);
      }

      const { data: monthlyData, error } = await query;
      if (error) throw error;

      if (!monthlyData || monthlyData.length === 0) {
        toast.error("No attendance records for this month.");
        return;
      }

      // Transform to the format expected by generateDailyTeacherAttendancePDF
      const transformed = monthlyData.map((row) => ({
        date: row.attendance_date,
        teacher_name: row.teachers
          ? `${row.teachers.first_name} ${row.teachers.last_name}`
          : "Unknown",
        employee_code: row.teachers?.employee_code || "—",
        status: row.status,
      }));

      // Generate PDF using context values
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
    <>
      <div className="flex flex-col sm:flex-row sm:items-center justify-between mb-6">
        <h1 className="text-3xl font-righteous text-primary-dark">
          {isAdmin ? "Teacher Attendance" : "My Attendance"}
        </h1>
        <div className="flex items-center gap-3 mt-2 sm:mt-0">
          <div className="relative">
            <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 text-secondary-light w-4 h-4" />
            <input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className="pl-9 pr-4 py-2 border rounded-lg text-sm focus:ring-1 focus:ring-primary"
            />
          </div>

          {/* NEW: Monthly Export Button */}
          <button
            onClick={handleExportMonthlyPDF}
            disabled={exporting}
            className="bg-primary text-white px-4 py-2 rounded-lg text-sm flex items-center gap-2 hover:bg-primary-light disabled:opacity-50"
          >
            <Download size={16} />
            {exporting ? "Exporting…" : "Monthly Report"}
          </button>
        </div>
      </div>

      {/* Stats Cards (unchanged) */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-4 mb-6">
        <div className="bg-white rounded-lg shadow-sm p-3 border">
          <p className="text-xs text-secondary-light">Total Teachers</p>
          <p className="text-xl font-bold text-primary">{stats.total}</p>
        </div>
        <div className="bg-white rounded-lg shadow-sm p-3 border">
          <p className="text-xs text-secondary-light">Marked</p>
          <p className="text-xl font-bold">{stats.marked}</p>
        </div>
        <div className="bg-white rounded-lg shadow-sm p-3 border border-green-200">
          <p className="text-xs text-green-600">Present</p>
          <p className="text-xl font-bold text-green-700">{stats.present}</p>
        </div>
        <div className="bg-white rounded-lg shadow-sm p-3 border border-red-200">
          <p className="text-xs text-red-600">Absent</p>
          <p className="text-xl font-bold text-red-700">{stats.absent}</p>
        </div>
        <div className="bg-white rounded-lg shadow-sm p-3 border border-yellow-200">
          <p className="text-xs text-yellow-600">Leave / Half-Day</p>
          <p className="text-xl font-bold text-yellow-700">{stats.leave + stats.halfDay}</p>
        </div>
      </div>

      {/* Bulk Actions (unchanged) */}
      {isAdmin && (
        <div className="flex flex-wrap gap-2 mb-4">
          <button
            onClick={() => handleBulkStatus("present")}
            className="bg-green-100 text-green-700 px-3 py-1.5 rounded-lg text-sm hover:bg-green-200 transition flex items-center gap-1"
          >
            <CheckCircle className="w-4 h-4" /> Mark All Present
          </button>
          <button
            onClick={() => handleBulkStatus("absent")}
            className="bg-red-100 text-red-700 px-3 py-1.5 rounded-lg text-sm hover:bg-red-200 transition flex items-center gap-1"
          >
            <XCircle className="w-4 h-4" /> Mark All Absent
          </button>
          <button
            onClick={() => handleBulkStatus("leave")}
            className="bg-yellow-100 text-yellow-700 px-3 py-1.5 rounded-lg text-sm hover:bg-yellow-200 transition flex items-center gap-1"
          >
            <Clock className="w-4 h-4" /> Mark All Leave
          </button>
          <button
            onClick={() => {
              teachers.forEach((t) => clearMutation.mutate(t.id));
            }}
            className="bg-gray-100 text-gray-700 px-3 py-1.5 rounded-lg text-sm hover:bg-gray-200 transition flex items-center gap-1"
          >
            <X className="w-4 h-4" /> Clear All
          </button>
        </div>
      )}

      {/* Table (unchanged) */}
      <div className="bg-white rounded-xl shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-slate-50 border-b">
              <tr>
                <th className="px-4 py-3 text-left text-sm font-medium text-secondary-dark">Teacher</th>
                <th className="px-4 py-3 text-left text-sm font-medium text-secondary-dark">Employee Code</th>
                <th className="px-4 py-3 text-left text-sm font-medium text-secondary-dark">Status</th>
                <th className="px-4 py-3 text-left text-sm font-medium text-secondary-dark">Clear</th>
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                <tr>
                  <td colSpan={4} className="text-center py-8 text-secondary">Loading...</td>
                </tr>
              ) : teachers.length === 0 ? (
                <tr>
                  <td colSpan={4} className="text-center py-8 text-secondary">No active teachers.</td>
                </tr>
              ) : (
                teachers.map((t) => (
                  <tr key={t.id} className="border-t hover:bg-gray-50 transition">
                    <td className="px-4 py-3 text-sm font-medium">
                      {t.first_name} {t.last_name}
                    </td>
                    <td className="px-4 py-3 text-sm">{t.employee_code || "—"}</td>
                    <td className="px-4 py-3 text-sm">
                      <select
                        value={getStatus(t.id)}
                        onChange={(e) => {
                          const newStatus = e.target.value;
                          if (newStatus) {
                            markMutation.mutate({ teacher_id: t.id, status: newStatus });
                          }
                        }}
                        className="border rounded p-1.5 text-sm bg-white focus:ring-1 focus:ring-primary"
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
                          className="text-red-500 hover:text-red-700 p-1 rounded"
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
          <div className="px-4 py-2 text-xs text-secondary-light border-t">
            {stats.marked} out of {teachers.length} teachers marked
          </div>
        )}
      </div>
    </>
  );
} 