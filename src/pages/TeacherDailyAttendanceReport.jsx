// src/pages/TeacherDailyAttendanceReport.jsx
import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "../api/supabase";
import { useAuth } from "../context/AuthContext";
import { generateDailyTeacherAttendancePDF } from "../utils/teacherDailyAttendancePdf";
import toast from "react-hot-toast";
import { Calendar, Download } from "lucide-react";
import { useOrg } from "../context/OrganizationContext";
import { useTheme } from "../context/ThemeContext";

export default function TeacherDailyAttendanceReport() {
  const { profile } = useAuth();
  const isAdmin = profile?.role === "admin" || profile?.role === "super_admin";

  const { org: currentOrg, branch, selectedFinancialYear } = useOrg();
  const { theme } = useTheme();
  const branchId = branch?.id;
  const financialYearId = selectedFinancialYear?.id;

  const today = new Date().toISOString().split("T")[0];
  const [startDate, setStartDate] = useState(today);
  const [endDate, setEndDate] = useState(today);

  // Fetch teacher ID if user is a teacher – scoped
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

  // Fetch teachers (admin sees all, teacher sees only self) – scoped
  const { data: teachers = [] } = useQuery({
    queryKey: ["active-teachers-list", isAdmin, ownTeacherId, branchId, financialYearId],
    queryFn: async () => {
      let query = supabase
        .from("teachers")
        .select("id, first_name, last_name, employee_code")
        .eq("status", "active")
        .order("first_name");

      if (branchId) query = query.eq("branch_id", branchId);
      if (financialYearId) query = query.eq("financial_year_id", financialYearId);

      if (!isAdmin && ownTeacherId) query = query.eq("id", ownTeacherId);
      if (!isAdmin && !ownTeacherId) return [];
      const { data } = await query;
      return data || [];
    },
    enabled: (isAdmin || !!ownTeacherId) && !!branchId && !!financialYearId,
  });

  // Fetch attendance records for the selected date range – scoped
  const { data: attendance = [], isLoading } = useQuery({
    queryKey: ["teacher-attendance-range", startDate, endDate, isAdmin, ownTeacherId, branchId, financialYearId],
    queryFn: async () => {
      let query = supabase
        .from("teacher_attendance")
        .select("*")
        .gte("attendance_date", startDate)
        .lte("attendance_date", endDate)
        .order("attendance_date");

      if (branchId) query = query.eq("branch_id", branchId);
      if (financialYearId) query = query.eq("financial_year_id", financialYearId);

      if (!isAdmin && ownTeacherId) query = query.eq("teacher_id", ownTeacherId);

      const { data } = await query;
      return data || [];
    },
    enabled: !!startDate && !!endDate && (isAdmin || !!ownTeacherId) && !!branchId && !!financialYearId,
  });

  // Merge attendance with teacher details
  const reportData = useMemo(() => {
    const teacherMap = {};
    teachers.forEach((t) => {
      teacherMap[t.id] = `${t.first_name} ${t.last_name}`;
    });
    return attendance.map((a) => ({
      date: a.attendance_date,
      teacher_id: a.teacher_id,
      teacher_name: teacherMap[a.teacher_id] || "Unknown",
      employee_code: teachers.find((t) => t.id === a.teacher_id)?.employee_code || "—",
      status: a.status,
    }));
  }, [attendance, teachers]);

  // ── PDF Export – context driven ──
  const handleExportPDF = async () => {
    if (reportData.length === 0) {
      toast.error("No data to export");
      return;
    }
    try {
      await generateDailyTeacherAttendancePDF(reportData, startDate, endDate, {
        org: currentOrg,
        branch,
        theme,
      });
      toast.success("PDF downloaded");
    } catch (err) {
      toast.error("Failed to generate PDF");
      console.error(err);
    }
  };

  // Status colour mapping using theme classes
  const getStatusClass = (status) => {
    switch (status) {
      case "present":
        return "bg-accent-bg text-accent";
      case "absent":
        return "bg-accent-bg text-accent-dark";
      case "leave":
        return "bg-primary-bg text-primary";
      case "half_day":
        return "bg-primary-bg text-primary-light";
      default:
        return "bg-gray-100 text-gray-700 dark:bg-gray-700 dark:text-gray-300";
    }
  };

  return (
    <div className="space-y-6 px-4 sm:px-6 lg:px-0">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between mb-6">
        <h1 className="text-3xl font-heading text-primary">
          {isAdmin ? "Teacher Daily Attendance Report" : "My Daily Attendance"}
        </h1>
        <div className="flex flex-wrap gap-3 mt-2 sm:mt-0">
          <div className="flex items-center gap-2">
            <Calendar className="text-gray-400 dark:text-gray-500 w-4 h-4" />
            <input
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              className="border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 rounded p-2 text-sm focus:ring-2 focus:ring-primary focus:border-primary outline-none"
            />
            <span className="text-sm text-gray-600 dark:text-gray-400">to</span>
            <input
              type="date"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              className="border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 rounded p-2 text-sm focus:ring-2 focus:ring-primary focus:border-primary outline-none"
            />
          </div>
          <button
            onClick={handleExportPDF}
            className="bg-primary hover:bg-primary-light text-white px-4 py-2 rounded-lg text-sm flex items-center gap-2 transition-colors"
          >
            <Download size={16} /> Export PDF
          </button>
        </div>
      </div>

      {isLoading ? (
        <div className="text-center py-8 text-gray-500 dark:text-gray-400">Loading…</div>
      ) : reportData.length === 0 ? (
        <div className="text-center py-8 text-gray-500 dark:text-gray-400">No attendance records found for the selected period.</div>
      ) : (
        <div className="bg-white dark:bg-accent rounded-xl shadow-sm overflow-hidden border border-gray-200 dark:border-gray-700">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[600px]">
              <thead className="bg-gray-50 dark:bg-gray-700 border-b border-gray-200 dark:border-gray-600">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                    Date
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                    Teacher
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                    Code
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                    Status
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
                {reportData.map((row, idx) => (
                  <tr key={idx} className="hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors">
                    <td className="px-4 py-3 text-sm text-gray-700 dark:text-gray-200">{row.date}</td>
                    <td className="px-4 py-3 text-sm font-medium text-gray-800 dark:text-gray-100">
                      {row.teacher_name}
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-700 dark:text-gray-200">{row.employee_code}</td>
                    <td className="px-4 py-3 text-sm">
                      <span
                        className={`inline-block px-2 py-0.5 rounded-full text-xs font-medium ${getStatusClass(row.status)}`}
                      >
                        {row.status === "present"
                          ? "Present"
                          : row.status === "absent"
                          ? "Absent"
                          : row.status === "leave"
                          ? "Leave"
                          : row.status === "half_day"
                          ? "Half Day"
                          : row.status}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="px-4 py-2 text-xs text-gray-500 dark:text-gray-400 border-t border-gray-200 dark:border-gray-700">
            {reportData.length} records | {startDate} to {endDate}
          </div>
        </div>
      )}
    </div>
  );
}