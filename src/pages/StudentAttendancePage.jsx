// src/pages/StudentAttendancePage.jsx
import { useQuery } from "@tanstack/react-query";
import { Calendar, CheckCircle, XCircle, BookOpen } from "lucide-react";
import BackButton from "../components/BackButton";
import { useStudentId } from "../hooks/useStudentId";
import { supabase } from "../api/supabase";
import { useTheme } from "../context/ThemeContext";

export default function StudentAttendancePage({
  studentId: propStudentId = null,
  standalone = true,
}) {
  // ── Use provided studentId or resolve via hook ──
  const { studentId: hookStudentId, isLoading: idLoadingHook } = useStudentId();
  const effectiveStudentId = propStudentId || hookStudentId;
  const idLoading = !propStudentId && idLoadingHook;

  const theme = useTheme();
  const headingFont = theme?.font_heading || "Righteous";
  const bodyFont = theme?.font_body || "Montserrat";

  // 🔥 Fetch the student's branch & FY from their own record (not from org context)
  const { data: studentRecord } = useQuery({
    queryKey: ["student-branch-fy", effectiveStudentId],
    queryFn: async () => {
      if (!effectiveStudentId) return null;
      const { data, error } = await supabase
        .from("students")
        .select("branch_id, financial_year_id")
        .eq("id", effectiveStudentId)
        .single();
      if (error) throw error;
      return data;
    },
    enabled: !!effectiveStudentId,
    staleTime: 5 * 60 * 1000,
  });

  const branchId = studentRecord?.branch_id ?? null;
  const financialYearId = studentRecord?.financial_year_id ?? null;

  const { data: sessions = [], isLoading } = useQuery({
    queryKey: ["student-attendance-detail", effectiveStudentId, branchId, financialYearId],
    queryFn: async () => {
      if (!effectiveStudentId) return [];

      // Get active batch IDs for this student
      let batchQuery = supabase
        .from("student_batches")
        .select("batch_id")
        .eq("student_id", effectiveStudentId)
        .eq("status", "active");

      if (branchId) batchQuery = batchQuery.eq("branch_id", branchId);
      if (financialYearId) batchQuery = batchQuery.eq("financial_year_id", financialYearId);

      const { data: batchRows } = await batchQuery;
      const batchIds = (batchRows || []).map((b) => b.batch_id).filter(Boolean);
      if (!batchIds.length) return [];

      // Fetch sessions for those batches
      let sessionQuery = supabase
        .from("attendance_sessions")
        .select(
          `id, attendance_date, topic_covered, batches(batch_name, medium_id, mediums(name))`
        )
        .in("batch_id", batchIds)
        .order("attendance_date", { ascending: false });

      if (branchId) sessionQuery = sessionQuery.eq("branch_id", branchId);
      if (financialYearId) sessionQuery = sessionQuery.eq("financial_year_id", financialYearId);

      const { data: attendanceSessions } = await sessionQuery;

      // Get attendance marks for this student
      const sessionIds = (attendanceSessions || []).map((s) => s.id);
      if (!sessionIds.length) return attendanceSessions || [];

      let marksQuery = supabase
        .from("student_attendance")
        .select("session_id, status")
        .eq("student_id", effectiveStudentId)
        .in("session_id", sessionIds);

      if (branchId) marksQuery = marksQuery.eq("branch_id", branchId);
      if (financialYearId) marksQuery = marksQuery.eq("financial_year_id", financialYearId);

      const { data: marks } = await marksQuery;

      // Build a map of session_id → status (normalised to title‑case for display)
      const markMap = {};
      (marks || []).forEach((m) => {
        markMap[m.session_id] = m.status
          ? m.status.charAt(0).toUpperCase() + m.status.slice(1).toLowerCase()
          : "Absent";
      });

      return (attendanceSessions || []).map((s) => ({
        ...s,
        batch_name: s.batches?.batch_name,
        medium_name: s.batches?.mediums?.name || "",
        status: markMap[s.id] || "Absent",
      }));
    },
    enabled: !!effectiveStudentId && branchId !== null && financialYearId !== null,
    staleTime: 2 * 60 * 1000,
  });

  // Overall percentage – case‑insensitive
  const presentCount = sessions.filter(
    (s) => s.status?.toLowerCase() === "present"
  ).length;
  const total = sessions.length;
  const percentage = total > 0 ? ((presentCount / total) * 100).toFixed(1) : 0;

  // ── Loading state ──
  if (idLoading || isLoading) {
    if (!standalone) {
      return (
        <div className="p-8 text-center text-primary-dark/60" style={{ fontFamily: bodyFont }}>
          Loading...
        </div>
      );
    }
    return (
      <>
        <BackButton to="/student" label="My Dashboard" />
        <div className="p-8 text-center text-primary-dark/60" style={{ fontFamily: bodyFont }}>
          Loading...
        </div>
      </>
    );
  }

  // ── Content ──
  const content = (
    <>
      <h1 className="text-3xl font-bold text-primary mb-4" style={{ fontFamily: headingFont }}>
        My Attendance
      </h1>

      {/* Summary card */}
      <div className="bg-white rounded-xl p-5 shadow-sm border border-primary-bg mb-6 flex items-center justify-between">
        <div>
          <p className="text-lg font-medium text-primary-dark" style={{ fontFamily: bodyFont }}>
            Overall Attendance
          </p>
          <div className="flex items-center gap-2 mt-1">
            <div className="w-48 bg-primary-bg rounded-full h-3">
              <div
                className="bg-primary h-3 rounded-full"
                style={{ width: `${Math.min(percentage, 100)}%` }}
              ></div>
            </div>
            <span className="font-bold text-primary" style={{ fontFamily: headingFont }}>
              {percentage}%
            </span>
          </div>
          <p className="text-xs text-primary-dark/60 mt-1" style={{ fontFamily: bodyFont }}>
            {presentCount} present / {total} sessions
          </p>
        </div>
      </div>

      {/* Attendance table */}
      <div className="bg-white rounded-xl shadow-sm overflow-hidden border border-primary-bg">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[600px]">
            <thead className="bg-primary-bg">
              <tr>
                <th className="p-3 text-left text-sm font-medium text-primary-dark uppercase" style={{ fontFamily: bodyFont }}>
                  Date
                </th>
                <th className="text-left text-sm font-medium text-primary-dark uppercase" style={{ fontFamily: bodyFont }}>
                  Batch
                </th>
                <th className="text-left text-sm font-medium text-primary-dark uppercase" style={{ fontFamily: bodyFont }}>
                  Medium
                </th>
                <th className="text-left text-sm font-medium text-primary-dark uppercase" style={{ fontFamily: bodyFont }}>
                  Topic
                </th>
                <th className="text-left text-sm font-medium text-primary-dark uppercase" style={{ fontFamily: bodyFont }}>
                  Status
                </th>
              </tr>
            </thead>
            <tbody>
              {sessions.length === 0 ? (
                <tr>
                  <td colSpan={5} className="p-4 text-center text-primary-dark/60" style={{ fontFamily: bodyFont }}>
                    No attendance records found.
                  </td>
                </tr>
              ) : (
                sessions.map((s) => (
                  <tr key={s.id} className="border-t border-primary-bg hover:bg-primary-bg">
                    <td className="p-3 text-primary-dark" style={{ fontFamily: bodyFont }}>
                      {s.attendance_date}
                    </td>
                    <td className="p-3 text-primary-dark" style={{ fontFamily: bodyFont }}>
                      {s.batch_name || "—"}
                    </td>
                    <td className="p-3 text-primary-dark" style={{ fontFamily: bodyFont }}>
                      {s.medium_name || "—"}
                    </td>
                    <td className="p-3 text-primary-dark" style={{ fontFamily: bodyFont }}>
                      {s.topic_covered || "—"}
                    </td>
                    <td>
                      {s.status?.toLowerCase() === "present" ? (
                        <span className="text-primary flex items-center gap-1" style={{ fontFamily: bodyFont }}>
                          <CheckCircle size={16} /> Present
                        </span>
                      ) : (
                        <span className="text-accent-dark flex items-center gap-1" style={{ fontFamily: bodyFont }}>
                          <XCircle size={16} /> Absent
                        </span>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );

  if (!standalone) {
    return <div>{content}</div>;
  }

  return (
    <div>
      <BackButton to="/student" label="My Dashboard" />
      {content}
    </div>
  );
}