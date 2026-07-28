// src/pages/TeacherLectureCountReport.jsx
import { useState, useMemo, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "../api/supabase";
import { useAuth } from "../context/AuthContext";
import toast from "react-hot-toast";
import { Calendar, Download } from "lucide-react";
import { generateTeacherLectureCountPDF } from "../utils/teacherLectureCountPdf";
import { useOrg } from "../context/OrganizationContext";
import { useTheme } from "../context/ThemeContext"; // 👈 import theme

export default function TeacherLectureCountReport() {
  const { profile } = useAuth();
  const isAdmin = profile?.role === "admin" || profile?.role === "super_admin";

  const { org: currentOrg, branch, selectedFinancialYear } = useOrg();
  const theme = useTheme(); // 👈 get theme colours (optional for PDF)
  const branchId = branch?.id;
  const financialYearId = selectedFinancialYear?.id;

  const today = new Date();
  const [teacherId, setTeacherId] = useState("");
  const [year, setYear] = useState(today.getFullYear());
  const [month, setMonth] = useState(today.getMonth() + 1);

  const startDate = `${year}-${String(month).padStart(2, "0")}-01`;
  const daysInMonth = new Date(year, month, 0).getDate();
  const endDate = `${year}-${String(month).padStart(2, "0")}-${daysInMonth}`;
  const monthLabel = new Date(year, month - 1).toLocaleString("default", {
    month: "long",
    year: "numeric",
  });

  // Fetch all teachers (for admin dropdown) – scoped to branch & FY
  const { data: teachers = [] } = useQuery({
    queryKey: ["teachers-list", branchId, financialYearId],
    queryFn: async () => {
      let query = supabase
        .from("teachers")
        .select("id, first_name, last_name, employee_code")
        .order("first_name");

      if (branchId) query = query.eq("branch_id", branchId);
      if (financialYearId) query = query.eq("financial_year_id", financialYearId);

      const { data } = await query;
      return data || [];
    },
    enabled: isAdmin && !!branchId && !!financialYearId,
    staleTime: 10 * 60 * 1000,
  });

  // If user is a teacher, get own teacher id – scoped
  const { data: ownTeacherId } = useQuery({
    queryKey: ["my-teacher-id", profile?.id, branchId, financialYearId],
    queryFn: async () => {
      if (!profile?.id || isAdmin || !branchId || !financialYearId) return null;
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

  // Auto‑select the teacher when user is a teacher
  useEffect(() => {
    if (!isAdmin && ownTeacherId) {
      setTeacherId(ownTeacherId);
    }
  }, [ownTeacherId, isAdmin]);

  // Fetch sessions where teacher_id matches for the selected month – scoped
  const { data: sessions = [], isLoading } = useQuery({
    queryKey: ["teacher-lectures", teacherId, startDate, endDate, branchId, financialYearId],
    queryFn: async () => {
      if (!teacherId || !branchId || !financialYearId) return [];
      const { data } = await supabase
        .from("attendance_sessions")
        .select("id, attendance_date")
        .eq("teacher_id", teacherId)
        .gte("attendance_date", startDate)
        .lte("attendance_date", endDate)
        .eq("branch_id", branchId)
        .eq("financial_year_id", financialYearId)
        .order("attendance_date");
      return data || [];
    },
    enabled: !!teacherId && !!branchId && !!financialYearId,
  });

  // Build daily counts
  const dailyCounts = useMemo(() => {
    const map = {};
    sessions.forEach((s) => {
      const date = s.attendance_date;
      map[date] = (map[date] || 0) + 1;
    });
    return Object.entries(map).map(([date, count]) => ({ date, count }));
  }, [sessions]);

  const totalLectures = sessions.length;
  const selectedTeacher = teachers.find((t) => t.id == teacherId);
  const selectedTeacherName = selectedTeacher
    ? `${selectedTeacher.first_name} ${selectedTeacher.last_name}`
    : "All";

  const handleExportPDF = async () => {
    if (dailyCounts.length === 0) {
      toast.error("No data to export");
      return;
    }
    // Use the same org fetch, but it's okay to keep as is
    const { data: org } = await supabase
      .from("organization")
      .select("*")
      .eq("id", currentOrg?.id)
      .single();

    const doc = await generateTeacherLectureCountPDF(
      dailyCounts,
      selectedTeacherName,
      monthLabel,
      totalLectures,
      org || {}
    );
    doc.save(
      `Teacher_Lecture_Count_${year}-${String(month).padStart(2, "0")}.pdf`
    );
    toast.success("PDF downloaded");
  };

  return (
    <div className="space-y-6 px-4 sm:px-6 lg:px-0">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between mb-6">
        <h1 className="text-3xl font-heading text-primary">
          Teacher Lecture Count
        </h1>
        <div className="flex flex-wrap gap-3 mt-2 sm:mt-0">
          {isAdmin && (
            <select
              value={teacherId}
              onChange={(e) => setTeacherId(e.target.value)}
              className="border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 rounded p-2 text-sm focus:ring-2 focus:ring-primary outline-none"
            >
              <option value="">Select Teacher</option>
              {teachers.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.first_name} {t.last_name}
                </option>
              ))}
            </select>
          )}

          <div className="flex items-center gap-2">
            <Calendar className="text-gray-400 dark:text-gray-500 w-4 h-4" />
            <select
              value={year}
              onChange={(e) => setYear(Number(e.target.value))}
              className="border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 rounded p-2 text-sm focus:ring-2 focus:ring-primary outline-none"
            >
              {Array.from({ length: 5 }, (_, i) => today.getFullYear() - i).map(
                (y) => (
                  <option key={y} value={y}>
                    {y}
                  </option>
                )
              )}
            </select>
            <select
              value={month}
              onChange={(e) => setMonth(Number(e.target.value))}
              className="border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 rounded p-2 text-sm focus:ring-2 focus:ring-primary outline-none"
            >
              {Array.from({ length: 12 }, (_, i) => i + 1).map((m) => (
                <option key={m} value={m}>
                  {String(m).padStart(2, "0")}
                </option>
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
      ) : !teacherId ? (
        <div className="text-center py-8 text-gray-500 dark:text-gray-400">
          Please select a teacher.
        </div>
      ) : (
        <>
          <div className="bg-white dark:bg-accent rounded-xl shadow-sm p-4 mb-4 border border-gray-200 dark:border-gray-700 flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-700 dark:text-gray-200">
                {selectedTeacherName}
              </p>
              <p className="text-xs text-gray-500 dark:text-gray-400">{monthLabel}</p>
            </div>
            <div className="text-right">
              <p className="text-2xl font-bold text-primary">
                {totalLectures}
              </p>
              <p className="text-xs text-gray-500 dark:text-gray-400">Total Lectures</p>
            </div>
          </div>

          {dailyCounts.length === 0 ? (
            <div className="text-center py-8 text-gray-500 dark:text-gray-400">
              No lectures found for this month.
            </div>
          ) : (
            <div className="bg-white dark:bg-accent rounded-xl shadow-sm overflow-hidden border border-gray-200 dark:border-gray-700">
              <div className="overflow-x-auto">
                <table className="w-full min-w-[400px]">
                  <thead className="bg-gray-50 dark:bg-gray-700 border-b border-gray-200 dark:border-gray-600">
                    <tr>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                        Date
                      </th>
                      <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                        Lectures
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
                    {dailyCounts.map((d) => (
                      <tr key={d.date} className="hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors">
                        <td className="px-4 py-3 text-sm text-gray-700 dark:text-gray-200">{d.date}</td>
                        <td className="px-4 py-3 text-sm text-center font-medium text-gray-800 dark:text-gray-100">
                          {d.count}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}