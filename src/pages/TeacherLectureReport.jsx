// src/pages/TeacherLectureReport.jsx
import { useState, useMemo, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "../api/supabase";
import { useAuth } from "../context/AuthContext";
import { generateTeacherLectureReportPDF } from "../utils/teacherLectureReportPdf";
import toast from "react-hot-toast";
import { Calendar, Download } from "lucide-react";
import { useOrg } from "../context/OrganizationContext";
import { useTheme } from "../context/ThemeContext";

export default function TeacherLectureReport() {
  const { profile } = useAuth();
  const isAdmin = profile?.role === "admin" || profile?.role === "super_admin";

  const { org: currentOrg, branch, selectedFinancialYear } = useOrg();
  const { theme } = useTheme();  // dynamic theme
  const branchId = branch?.id;
  const financialYearId = selectedFinancialYear?.id;

  const today = new Date().toISOString().split("T")[0];
  const [teacherId, setTeacherId] = useState("");
  const [startDate, setStartDate] = useState(today);
  const [endDate, setEndDate] = useState(today);

  // Fetch list of teachers – scoped to branch & FY
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

  // If user is a teacher, get own id – scoped
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
  useEffect(() => {
    if (!isAdmin && ownTeacherId) setTeacherId(ownTeacherId);
  }, [ownTeacherId, isAdmin]);

  // Fetch batches assigned to selected teacher – scoped
  const { data: teacherBatches = [] } = useQuery({
    queryKey: ["teacher-batches", teacherId, branchId, financialYearId],
    queryFn: async () => {
      if (!teacherId || !branchId || !financialYearId) return [];
      let query = supabase
        .from("batch_teachers")
        .select(`id, batch_id`)
        .eq("teacher_id", teacherId);
      if (branchId) query = query.eq("branch_id", branchId);
      if (financialYearId) query = query.eq("financial_year_id", financialYearId);
      const { data } = await query;
      return data || [];
    },
    enabled: !!teacherId && !!branchId && !!financialYearId,
  });
  const batchIds = teacherBatches.map((bt) => bt.batch_id);

  // Fetch sessions for those batches within the date range – scoped
  const { data: sessions = [], isLoading } = useQuery({
    queryKey: ["teacher-sessions", batchIds, startDate, endDate, branchId, financialYearId],
    queryFn: async () => {
      if (batchIds.length === 0 || !branchId || !financialYearId) return [];
      let query = supabase
        .from("attendance_sessions")
        .select(`id, attendance_date, topic_covered, batches(batch_name)`)
        .in("batch_id", batchIds)
        .gte("attendance_date", startDate)
        .lte("attendance_date", endDate)
        .order("attendance_date");
      if (branchId) query = query.eq("branch_id", branchId);
      if (financialYearId) query = query.eq("financial_year_id", financialYearId);
      const { data } = await query;
      return data || [];
    },
    enabled: batchIds.length > 0 && !!teacherId && !!branchId && !!financialYearId,
  });

  // Fetch attendance counts for each session – scoped
  const sessionIds = sessions.map((s) => s.id);
  const { data: attendanceCounts = {} } = useQuery({
    queryKey: ["session-attendance-counts", sessionIds, branchId, financialYearId],
    queryFn: async () => {
      if (sessionIds.length === 0) return {};
      let query = supabase
        .from("student_attendance")
        .select("session_id, status")
        .in("session_id", sessionIds);
      if (branchId) query = query.eq("branch_id", branchId);
      if (financialYearId) query = query.eq("financial_year_id", financialYearId);
      const { data } = await query;
      const map = {};
      sessionIds.forEach((id) => { map[id] = { present: 0, total: 0 }; });
      (data || []).forEach((row) => {
        if (map[row.session_id]) {
          map[row.session_id].total++;
          if (row.status === "Present") map[row.session_id].present++;
        }
      });
      return map;
    },
    enabled: sessionIds.length > 0 && !!branchId && !!financialYearId,
  });

  // Build report data
  const reportData = useMemo(() => {
    return sessions.map((session) => {
      const counts = attendanceCounts[session.id] || { present: 0, total: 0 };
      const absent = counts.total - counts.present;
      const percentage = counts.total > 0 ? ((counts.present / counts.total) * 100).toFixed(1) : 0;
      return {
        date: session.attendance_date,
        batch_name: session.batches?.batch_name || "—",
        topic: session.topic_covered || "",
        present_count: counts.present,
        absent_count: absent,
        total_students: counts.total,
        percentage,
      };
    });
  }, [sessions, attendanceCounts]);

  const selectedTeacherName = teachers.find((t) => t.id == teacherId)
    ? `${teachers.find((t) => t.id == teacherId).first_name} ${teachers.find((t) => t.id == teacherId).last_name}`
    : "All";

  // ── PDF Export – uses context values ──
  const handleExportPDF = async () => {
    if (reportData.length === 0) {
      toast.error("No data to export");
      return;
    }
    try {
      const doc = await generateTeacherLectureReportPDF(
        reportData,
        selectedTeacherName,
        startDate,
        endDate,
        { org: currentOrg, branch, theme }
      );
      doc.save(`Teacher_Lecture_Report_${startDate}_to_${endDate}.pdf`);
      toast.success("PDF downloaded");
    } catch (err) {
      toast.error("Failed to generate PDF");
      console.error(err);
    }
  };

  return (
    <div className="space-y-6 px-4 sm:px-6 lg:px-0">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between mb-6">
        <h1 className="text-3xl font-heading text-primary">
          Teacher Lecture Report
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
            <input
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              className="border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 rounded p-2 text-sm focus:ring-2 focus:ring-primary outline-none"
            />
            <span className="text-sm text-gray-600 dark:text-gray-400">to</span>
            <input
              type="date"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              className="border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 rounded p-2 text-sm focus:ring-2 focus:ring-primary outline-none"
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
      ) : !teacherId ? (
        <div className="text-center py-8 text-gray-500 dark:text-gray-400">
          Please select a teacher.
        </div>
      ) : reportData.length === 0 ? (
        <div className="text-center py-8 text-gray-500 dark:text-gray-400">
          No sessions found for the selected period.
        </div>
      ) : (
        <div className="bg-white dark:bg-accent rounded-xl shadow-sm overflow-hidden border border-gray-200 dark:border-gray-700">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[700px]">
              <thead className="bg-gray-50 dark:bg-gray-700 border-b border-gray-200 dark:border-gray-600">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Date</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Batch</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Topic</th>
                  <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Present</th>
                  <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Absent</th>
                  <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Total</th>
                  <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">%</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
                {reportData.map((row, idx) => (
                  <tr key={idx} className="hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors">
                    <td className="px-4 py-3 text-sm text-gray-700 dark:text-gray-200">{row.date}</td>
                    <td className="px-4 py-3 text-sm text-gray-700 dark:text-gray-200">{row.batch_name}</td>
                    <td className="px-4 py-3 text-sm text-gray-700 dark:text-gray-200">{row.topic || "—"}</td>
                    <td className="px-4 py-3 text-sm text-center text-accent">{row.present_count}</td>
                    <td className="px-4 py-3 text-sm text-center text-accent-dark">{row.absent_count}</td>
                    <td className="px-4 py-3 text-sm text-center text-primary">{row.total_students}</td>
                    <td className="px-4 py-3 text-sm text-center font-medium text-primary">{row.percentage}%</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="px-4 py-2 text-xs text-gray-500 dark:text-gray-400 border-t border-gray-200 dark:border-gray-700">
            Teacher: {selectedTeacherName} | {reportData.length} sessions | {startDate} to {endDate}
          </div>
        </div>
      )}
    </div>
  );
}