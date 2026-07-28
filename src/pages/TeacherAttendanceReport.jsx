// src/pages/TeacherAttendanceReport.jsx
import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "../api/supabase";
import { generateTeacherAttendancePDF } from "../utils/teacherAttendancePdf";
import toast from "react-hot-toast";
import { Calendar, Download, FileText } from "lucide-react";
import { useOrg } from "../context/OrganizationContext";
import { useTheme } from "../context/ThemeContext";          // already used

// Status colours now use theme‐based classes
const STATUS_COLORS = {
  present: "bg-primary-bg text-primary",
  absent: "bg-accent-bg text-accent-dark",
  leave: "bg-primary-bg text-primary-light",
  half_day: "bg-accent-bg text-accent",
};

export default function TeacherAttendanceReport() {
  const today = new Date();
  const [year, setYear] = useState(today.getFullYear());
  const [month, setMonth] = useState(today.getMonth() + 1); // 1-12

  const { org: currentOrg, branch, selectedFinancialYear } = useOrg();
  const { theme } = useTheme();                            // theme already available
  const branchId = branch?.id;
  const financialYearId = selectedFinancialYear?.id;

  const startDate = `${year}-${String(month).padStart(2, "0")}-01`;
  const daysInMonth = new Date(year, month, 0).getDate();
  const endDate = `${year}-${String(month).padStart(2, "0")}-${daysInMonth}`;

  // Fetch all active teachers – scoped to branch & FY
  const { data: teachers = [] } = useQuery({
    queryKey: ["active-teachers-list", branchId, financialYearId],
    queryFn: async () => {
      let query = supabase
        .from("teachers")
        .select("id, first_name, last_name, employee_code")
        .eq("status", "active")
        .order("first_name");
      if (branchId) query = query.eq("branch_id", branchId);
      if (financialYearId) query = query.eq("financial_year_id", financialYearId);
      const { data } = await query;
      return data || [];
    },
    enabled: !!branchId && !!financialYearId,
    staleTime: 5 * 60 * 1000,
  });

  // Fetch attendance for the selected month – scoped
  const { data: attendance = [], isLoading } = useQuery({
    queryKey: ["teacher-attendance-month", startDate, endDate, branchId, financialYearId],
    queryFn: async () => {
      let query = supabase
        .from("teacher_attendance")
        .select("teacher_id, attendance_date, status")
        .gte("attendance_date", startDate)
        .lte("attendance_date", endDate);
      if (branchId) query = query.eq("branch_id", branchId);
      if (financialYearId) query = query.eq("financial_year_id", financialYearId);
      const { data } = await query;
      return data || [];
    },
    enabled: !!startDate && !!endDate && !!branchId && !!financialYearId,
  });

  // Build report data
  const reportData = useMemo(() => {
    if (!teachers.length) return [];
    return teachers.map((teacher) => {
      const days = Array.from({ length: daysInMonth }, (_, i) => {
        const dayNum = i + 1;
        const date = `${year}-${String(month).padStart(2, "0")}-${String(dayNum).padStart(2, "0")}`;
        const record = attendance.find((a) => a.teacher_id === teacher.id && a.attendance_date === date);
        return { date, status: record ? record.status : null };
      });
      return {
        id: teacher.id,
        name: `${teacher.first_name} ${teacher.last_name}`,
        employee_code: teacher.employee_code || "—",
        days,
      };
    });
  }, [teachers, attendance, year, month, daysInMonth]);

  // ── PDF Export (theme already passed) ──
  const handleExportPDF = async () => {
    if (reportData.length === 0) {
      toast.error("No data to export");
      return;
    }
    const monthLabel = new Date(year, month - 1).toLocaleString("default", { month: "long", year: "numeric" });
    try {
      await generateTeacherAttendancePDF(reportData, monthLabel, {
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

  const monthLabel = new Date(year, month - 1).toLocaleString("default", { month: "long", year: "numeric" });

  return (
    <div className="space-y-6 px-4 sm:px-6 lg:px-0">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between mb-6">
        <h1 className="text-3xl font-heading text-primary">Teacher Attendance Report</h1>
        <div className="flex flex-wrap gap-3 mt-2 sm:mt-0">
          <div className="flex items-center gap-2">
            <Calendar className="text-gray-400 dark:text-gray-500 w-4 h-4" />
            <select
              value={year}
              onChange={(e) => setYear(Number(e.target.value))}
              className="border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 rounded p-2 text-sm focus:ring-2 focus:ring-primary outline-none"
            >
              {Array.from({ length: 5 }, (_, i) => today.getFullYear() - i).map((y) => (
                <option key={y} value={y}>{y}</option>
              ))}
            </select>
            <select
              value={month}
              onChange={(e) => setMonth(Number(e.target.value))}
              className="border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 rounded p-2 text-sm focus:ring-2 focus:ring-primary outline-none"
            >
              {Array.from({ length: 12 }, (_, i) => i + 1).map((m) => (
                <option key={m} value={m}>{String(m).padStart(2, "0")}</option>
              ))}
            </select>
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
        <div className="text-center py-8 text-gray-500 dark:text-gray-400">No attendance data for this month.</div>
      ) : (
        <div className="bg-white dark:bg-accent rounded-xl shadow-sm overflow-auto border border-gray-200 dark:border-gray-700">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[800px]">
              <thead className="bg-gray-50 dark:bg-gray-700">
                <tr>
                  <th className="sticky left-0 bg-gray-50 dark:bg-gray-700 px-3 py-2 text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider text-left">
                    Teacher
                  </th>
                  <th className="px-3 py-2 text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider text-left">
                    Code
                  </th>
                  {Array.from({ length: daysInMonth }, (_, i) => (
                    <th key={i} className="px-1 py-2 text-xs text-center text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                      {i + 1}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
                {reportData.map((teacher) => (
                  <tr key={teacher.id} className="hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors">
                    <td className="sticky left-0 bg-white dark:bg-accent px-3 py-2 text-sm font-medium text-gray-800 dark:text-gray-100">
                      {teacher.name}
                    </td>
                    <td className="px-3 py-2 text-sm text-gray-700 dark:text-gray-200">{teacher.employee_code}</td>
                    {teacher.days.map((day, idx) => (
                      <td key={idx} className="px-1 py-2 text-center text-xs">
                        {day.status ? (
                          <span className={`inline-flex items-center justify-center w-6 h-6 rounded-full text-[10px] ${STATUS_COLORS[day.status] || "bg-gray-100 dark:bg-gray-700 text-gray-500"}`}>
                            {day.status === "present" ? "P" : day.status === "absent" ? "A" : day.status === "leave" ? "L" : day.status === "half_day" ? "H" : ""}
                          </span>
                        ) : (
                          <span className="text-gray-300 dark:text-gray-600">-</span>
                        )}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="px-4 py-2 text-xs text-gray-500 dark:text-gray-400 border-t border-gray-200 dark:border-gray-700">
            {year}-{String(month).padStart(2, "0")} | Total Teachers: {reportData.length}
          </div>
        </div>
      )}
    </div>
  );
}