import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "../api/supabase";
import { generateTeacherAttendancePDF } from "../utils/teacherAttendancePdf";
import toast from "react-hot-toast";
import { Calendar, Download, FileText } from "lucide-react";
import { useOrg } from "../context/OrganizationContext";
import { useTheme } from "../context/ThemeContext";          // NEW

const STATUS_COLORS = {
  present: "bg-green-100 text-green-700",
  absent: "bg-red-100 text-red-700",
  leave: "bg-yellow-100 text-yellow-700",
  half_day: "bg-orange-100 text-orange-700",
};

export default function TeacherAttendanceReport() {
  const today = new Date();
  const [year, setYear] = useState(today.getFullYear());
  const [month, setMonth] = useState(today.getMonth() + 1); // 1-12

  const { org: currentOrg, branch, selectedFinancialYear } = useOrg();
  const { theme } = useTheme();                            // NEW
  const branchId = branch?.id;
  const financialYearId = selectedFinancialYear?.id;

  const startDate = `${year}-${String(month).padStart(2, "0")}-01`;
  const daysInMonth = new Date(year, month, 0).getDate();
  const endDate = `${year}-${String(month).padStart(2, "0")}-${daysInMonth}`;

  // Fetch all active teachers – scoped to branch & FY (unchanged)
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

  // Fetch attendance for the selected month – scoped (unchanged)
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

  // Build report data (unchanged)
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

  // ── PDF Export (fixed) ──
  const handleExportPDF = async () => {
    if (reportData.length === 0) {
      toast.error("No data to export");
      return;
    }
    const monthLabel = new Date(year, month - 1).toLocaleString("default", { month: "long", year: "numeric" });

    try {
      // Now passes context directly – no separate org fetch
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

  // ── Render (unchanged) ──
  return (
    <>
      <div className="flex flex-col sm:flex-row sm:items-center justify-between mb-6">
        <h1 className="text-3xl font-righteous text-primary-dark">Teacher Attendance Report</h1>
        <div className="flex flex-wrap gap-3 mt-2 sm:mt-0">
          <div className="flex items-center gap-2">
            <Calendar className="text-secondary-light w-4 h-4" />
            <select value={year} onChange={(e) => setYear(Number(e.target.value))} className="border rounded p-2 text-sm">
              {Array.from({ length: 5 }, (_, i) => today.getFullYear() - i).map((y) => (
                <option key={y} value={y}>{y}</option>
              ))}
            </select>
            <select value={month} onChange={(e) => setMonth(Number(e.target.value))} className="border rounded p-2 text-sm">
              {Array.from({ length: 12 }, (_, i) => i + 1).map((m) => (
                <option key={m} value={m}>{String(m).padStart(2, "0")}</option>
              ))}
            </select>
          </div>
          <button
            onClick={handleExportPDF}
            className="bg-primary text-white px-4 py-2 rounded-lg text-sm flex items-center gap-2"
          >
            <Download size={16} /> Export PDF
          </button>
        </div>
      </div>

      {isLoading ? (
        <div className="text-center py-8 text-secondary">Loading…</div>
      ) : reportData.length === 0 ? (
        <div className="text-center py-8 text-secondary">No attendance data for this month.</div>
      ) : (
        <div className="bg-white rounded-xl shadow-sm overflow-auto">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[800px]">
              <thead className="bg-slate-50">
                <tr>
                  <th className="sticky left-0 bg-slate-50 px-3 py-2 text-sm text-left">Teacher</th>
                  <th className="px-3 py-2 text-sm text-left">Code</th>
                  {Array.from({ length: daysInMonth }, (_, i) => (
                    <th key={i} className="px-1 py-2 text-xs text-center">{i + 1}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {reportData.map((teacher) => (
                  <tr key={teacher.id} className="border-t hover:bg-gray-50">
                    <td className="sticky left-0 bg-white px-3 py-2 text-sm font-medium">{teacher.name}</td>
                    <td className="px-3 py-2 text-sm">{teacher.employee_code}</td>
                    {teacher.days.map((day, idx) => (
                      <td key={idx} className="px-1 py-2 text-center text-xs">
                        {day.status ? (
                          <span className={`inline-block w-6 h-6 rounded-full ${STATUS_COLORS[day.status] || "bg-gray-100"} flex items-center justify-center text-[10px]`}>
                            {day.status === "present" ? "P" : day.status === "absent" ? "A" : day.status === "leave" ? "L" : day.status === "half_day" ? "H" : ""}
                          </span>
                        ) : (
                          <span className="text-gray-300">-</span>
                        )}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="px-4 py-2 text-xs text-secondary-light border-t">
            {year}-{String(month).padStart(2, "0")} | Total Teachers: {reportData.length}
          </div>
        </div>
      )}
    </>
  );
}