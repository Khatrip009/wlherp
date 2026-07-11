// src/pages/TeacherLectureReport.jsx
import { useState, useMemo, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
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

  // ── Get current organization from context ──
  const { org: currentOrg } = useOrg();   // NEW

  const today = new Date().toISOString().split("T")[0];
  const [teacherId, setTeacherId] = useState("");
  const [startDate, setStartDate] = useState(today);
  const [endDate, setEndDate] = useState(today);

  // Fetch list of teachers
  const { data: teachers = [] } = useQuery({
    queryKey: ["teachers-list"],
    queryFn: async () => {
      const { data } = await supabase
        .from("teachers")
        .select("id, first_name, last_name, employee_code")
        .order("first_name");
      return data || [];
    },
  });

  // If user is a teacher, automatically select their own ID
  const { data: ownTeacherId } = useQuery({
    queryKey: ["my-teacher-id", profile?.id],
    queryFn: async () => {
      if (!profile?.id || isAdmin) return null;
      const { data } = await supabase
        .from("teachers")
        .select("id")
        .eq("user_id", profile.id)
        .single();
      return data?.id || null;
    },
    enabled: !!profile?.id && !isAdmin,
  });

  // Auto‑set teacherId for teacher users
  useEffect(() => {
    if (!isAdmin && ownTeacherId) {
      setTeacherId(ownTeacherId);
    }
  }, [ownTeacherId, isAdmin]);

  // Fetch batches that the selected teacher is assigned to
  const { data: teacherBatches = [] } = useQuery({
    queryKey: ["teacher-batches", teacherId],
    queryFn: async () => {
      if (!teacherId) return [];
      const { data } = await supabase
        .from("batch_teachers")
        .select("batch_id, batches(batch_name)")
        .eq("teacher_id", teacherId);
      return data || [];
    },
    enabled: !!teacherId,
  });

  const batchIds = teacherBatches.map((bt) => bt.batch_id);

  // Fetch sessions for those batches within the date range
  const { data: sessions = [], isLoading } = useQuery({
    queryKey: ["teacher-sessions", batchIds, startDate, endDate],
    queryFn: async () => {
      if (!batchIds.length) return [];
      let query = supabase
        .from("attendance_sessions")
        .select("id, batch_id, attendance_date, topic_covered, batches(batch_name)")
        .in("batch_id", batchIds)
        .order("attendance_date", { ascending: false });

      if (startDate) query = query.gte("attendance_date", startDate);
      if (endDate) query = query.lte("attendance_date", endDate);

      const { data } = await query;
      return data || [];
    },
    enabled: batchIds.length > 0 && !!startDate && !!endDate,
  });

  // For each session, fetch attendance counts (existing memo – not changed for multi‑tenancy)
  const [attendanceCounts, setAttendanceCounts] = useState({});
  useMemo(async () => {
    if (!sessions.length) return;
    const counts = {};
    await Promise.all(
      sessions.map(async (session) => {
        const { data: presentRows } = await supabase
          .from("student_attendance")
          .select("id")
          .eq("session_id", session.id)
          .eq("status", "Present");
        const { data: allRows } = await supabase
          .from("student_attendance")
          .select("id")
          .eq("session_id", session.id);
        counts[session.id] = {
          present: presentRows?.length || 0,
          total: allRows?.length || 0,
        };
      })
    );
    setAttendanceCounts(counts);
  }, [sessions]);

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