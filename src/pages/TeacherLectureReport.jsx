// src/pages/TeacherLectureReport.jsx
import { useState, useMemo, useEffect, useCallback } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "../api/supabase";
import { useAuth } from "../context/AuthContext";
import { generateTeacherLectureReportPDF } from "../utils/teacherLectureReportPdf";
import toast from "react-hot-toast";
import AdminLayout from "../layouts/AdminLayout";
import { Calendar, Download } from "lucide-react";
import { useOrg } from "../context/OrganizationContext";   // NEW

export default function TeacherLectureReport() {
  const { profile } = useAuth();
  const isAdmin = profile?.role === "admin" || profile?.role === "super_admin";
  const queryClient = useQueryClient();

  // ── Branch & Financial Year context ──
  const { org: currentOrg, branch, selectedFinancialYear } = useOrg();   // NEW
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

  // If user is a teacher, automatically select their own ID – scoped
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

  // Auto‑set teacherId for teacher users
  useEffect(() => {
    if (!isAdmin && ownTeacherId) {
      setTeacherId(ownTeacherId);
    }
  }, [ownTeacherId, isAdmin]);

  // Fetch batches that the selected teacher is assigned to – scoped
  const { data: teacherBatches = [] } = useQuery({
    queryKey: ["teacher-batches", teacherId, branchId, financialYearId],
    queryFn: async () => {
      if (!teacherId || !branchId || !financialYearId) return [];
      let query = supabase
        .from("batch_teachers")
        .select("batch_id, batches(batch_name)")
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
      if (!batchIds.length || !branchId || !financialYearId) return [];
      let query = supabase
        .from("attendance_sessions")
        .select("id, batch_id, attendance_date, topic_covered, batches(batch_name)")
        .in("batch_id", batchIds)
        .order("attendance_date", { ascending: false });

      if (startDate) query = query.gte("attendance_date", startDate);
      if (endDate) query = query.lte("attendance_date", endDate);
      if (branchId) query = query.eq("branch_id", branchId);
      if (financialYearId) query = query.eq("financial_year_id", financialYearId);

      const { data } = await query;
      return data || [];
    },
    enabled: batchIds.length > 0 && !!startDate && !!endDate && !!branchId && !!financialYearId,
  });

  // Fetch attendance counts for each session (scoped) – using a separate query
  const sessionIds = sessions.map((s) => s.id);
  const { data: attendanceCounts = {} } = useQuery({
    queryKey: ["session-attendance-counts", sessionIds, branchId, financialYearId],
    queryFn: async () => {
      if (!sessionIds.length) return {};
      // Fetch all attendance rows for these sessions – scoped
      let attendanceQuery = supabase
        .from("student_attendance")
        .select("session_id, status")
        .in("session_id", sessionIds);

      if (branchId) attendanceQuery = attendanceQuery.eq("branch_id", branchId);
      if (financialYearId) attendanceQuery = attendanceQuery.eq("financial_year_id", financialYearId);

      const { data: rows } = await attendanceQuery;

      const counts = {};
      rows?.forEach((row) => {
        if (!counts[row.session_id]) {
          counts[row.session_id] = { present: 0, total: 0 };
        }
        counts[row.session_id].total++;
        if (row.status === "Present") {
          counts[row.session_id].present++;
        }
      });

      // Ensure we have entries for all sessions even if no attendance rows exist
      sessionIds.forEach((id) => {
        if (!counts[id]) {
          counts[id] = { present: 0, total: 0 };
        }
      });

      return counts;
    },
    enabled: sessionIds.length > 0 && !!branchId && !!financialYearId,
    staleTime: 0, // we want fresh counts when sessions change
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

  const handleExportPDF = async () => {
    if (reportData.length === 0) {
      toast.error("No data to export");
      return;
    }
    // Fetch org info using the current org id from context
    const { data: org } = await supabase
      .from("organization")
      .select("*")
      .eq("id", currentOrg?.id)   // now uses current org
      .single();

    const doc = await generateTeacherLectureReportPDF(
      reportData,
      selectedTeacherName,
      startDate,
      endDate,
      org || {}
    );
    doc.save(`Teacher_Lecture_Report_${startDate}_to_${endDate}.pdf`);
    toast.success("PDF downloaded");
  };

  return (
    <AdminLayout>
      <div className="flex flex-col sm:flex-row sm:items-center justify-between mb-6">
        <h1 className="text-3xl font-righteous text-primary-dark">Teacher Lecture Report</h1>
        <div className="flex flex-wrap gap-3 mt-2 sm:mt-0">
          {isAdmin && (
            <select
              value={teacherId}
              onChange={(e) => setTeacherId(e.target.value)}
              className="border rounded p-2 text-sm"
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
            <Calendar className="text-secondary-light w-4 h-4" />
            <input
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              className="border rounded p-2 text-sm"
            />
            <span className="text-sm">to</span>
            <input
              type="date"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              className="border rounded p-2 text-sm"
            />
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
      ) : !teacherId ? (
        <div className="text-center py-8 text-secondary">Please select a teacher.</div>
      ) : reportData.length === 0 ? (
        <div className="text-center py-8 text-secondary">No sessions found for the selected period.</div>
      ) : (
        <div className="bg-white rounded-xl shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[700px]">
              <thead className="bg-slate-50 border-b">
                <tr>
                  <th className="px-4 py-3 text-left text-sm font-medium text-secondary-dark">Date</th>
                  <th className="px-4 py-3 text-left text-sm font-medium text-secondary-dark">Batch</th>
                  <th className="px-4 py-3 text-left text-sm font-medium text-secondary-dark">Topic</th>
                  <th className="px-4 py-3 text-center text-sm font-medium text-secondary-dark">Present</th>
                  <th className="px-4 py-3 text-center text-sm font-medium text-secondary-dark">Absent</th>
                  <th className="px-4 py-3 text-center text-sm font-medium text-secondary-dark">Total</th>
                  <th className="px-4 py-3 text-center text-sm font-medium text-secondary-dark">%</th>
                </tr>
              </thead>
              <tbody>
                {reportData.map((row, idx) => (
                  <tr key={idx} className="border-t hover:bg-gray-50 transition">
                    <td className="px-4 py-3 text-sm">{row.date}</td>
                    <td className="px-4 py-3 text-sm">{row.batch_name}</td>
                    <td className="px-4 py-3 text-sm">{row.topic || "—"}</td>
                    <td className="px-4 py-3 text-sm text-center text-green-600">{row.present_count}</td>
                    <td className="px-4 py-3 text-sm text-center text-red-600">{row.absent_count}</td>
                    <td className="px-4 py-3 text-sm text-center">{row.total_students}</td>
                    <td className="px-4 py-3 text-sm text-center font-medium">{row.percentage}%</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="px-4 py-2 text-xs text-secondary-light border-t">
            Teacher: {selectedTeacherName} | {reportData.length} sessions | {startDate} to {endDate}
          </div>
        </div>
      )}
    </AdminLayout>
  );
}