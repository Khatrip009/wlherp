import { useQuery } from "@tanstack/react-query";
import { Calendar, CheckCircle, XCircle, BookOpen } from "lucide-react";
import AdminLayout from "../layouts/AdminLayout";
import BackButton from "../components/BackButton";

import { useStudentId } from "../hooks/useStudentId";
import { supabase } from "../api/supabase";
import { useOrg } from "../context/OrganizationContext";   // NEW

export default function StudentAttendancePage() {
  const { studentId, isLoading: idLoading } = useStudentId();

  // ── Branch & Financial Year context ──
  const { branch, selectedFinancialYear } = useOrg();   // NEW
  const branchId = branch?.id;
  const financialYearId = selectedFinancialYear?.id;

  const { data: sessions = [], isLoading } = useQuery({
    queryKey: ["student-attendance-detail", studentId, branchId, financialYearId],
    queryFn: async () => {
      if (!studentId) return [];

      // Get active batch IDs for this student – scoped to branch & FY
      let batchQuery = supabase
        .from("student_batches")
        .select("batch_id")
        .eq("student_id", studentId)
        .eq("status", "active");

      if (branchId) batchQuery = batchQuery.eq("branch_id", branchId);
      if (financialYearId) batchQuery = batchQuery.eq("financial_year_id", financialYearId);

      const { data: batchRows } = await batchQuery;
      const batchIds = batchRows?.map((b) => b.batch_id) || [];
      if (!batchIds.length) return [];

      // Fetch sessions for those batches – also scoped
      let sessionQuery = supabase
        .from("attendance_sessions")
        .select(`id, attendance_date, topic_covered, batches(batch_name, medium_id, mediums(name))`)
        .in("batch_id", batchIds)
        .order("attendance_date", { ascending: false });

      if (branchId) sessionQuery = sessionQuery.eq("branch_id", branchId);
      if (financialYearId) sessionQuery = sessionQuery.eq("financial_year_id", financialYearId);

      const { data: attendanceSessions } = await sessionQuery;

      // Get attendance marks – scoped
      const sessionIds = attendanceSessions?.map((s) => s.id) || [];
      let marksQuery = supabase
        .from("student_attendance")
        .select("session_id, status")
        .eq("student_id", studentId)
        .in("session_id", sessionIds);

      if (branchId) marksQuery = marksQuery.eq("branch_id", branchId);
      if (financialYearId) marksQuery = marksQuery.eq("financial_year_id", financialYearId);

      const { data: marks } = await marksQuery;

      const markMap = {};
      marks?.forEach((m) => {
        markMap[m.session_id] = m.status;
      });

      return (
        attendanceSessions?.map((s) => ({
          ...s,
          batch_name: s.batches?.batch_name,
          medium_name: s.batches?.mediums?.name || "",
          status: markMap[s.id] || "Absent",
        })) || []
      );
    },
    enabled: !!studentId && !!branchId && !!financialYearId,
    staleTime: 2 * 60 * 1000,
  });

  // Overall percentage
  const presentCount = sessions.filter((s) => s.status === "Present").length;
  const total = sessions.length;
  const percentage = total > 0 ? ((presentCount / total) * 100).toFixed(1) : 0;

  if (idLoading || isLoading) {
    return (
      <AdminLayout>
      <BackButton to="/student" label="My Dashboard" />
        <div className="p-8 text-center">Loading...</div>
      </AdminLayout>
    );
  }

  return (
    <AdminLayout>
      <h1 className="text-3xl font-righteous text-primary-dark mb-4">
        My Attendance
      </h1>

      {/* Summary card */}
      <div className="bg-white rounded-xl p-5 shadow-sm border border-secondary-light mb-6 flex items-center justify-between">
        <div>
          <p className="text-lg font-medium">Overall Attendance</p>
          <div className="flex items-center gap-2 mt-1">
            <div className="w-48 bg-gray-200 rounded-full h-3">
              <div
                className="bg-green-500 h-3 rounded-full"
                style={{ width: `${percentage}%` }}
              ></div>
            </div>
            <span className="font-bold">{percentage}%</span>
          </div>
          <p className="text-xs text-secondary mt-1">
            {presentCount} present / {total} sessions
          </p>
        </div>
      </div>

      {/* Attendance table */}
      <div className="bg-white rounded-xl shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[600px]">
            <thead className="bg-slate-100">
              <tr>
                <th className="p-3 text-left">Date</th>
                <th className="text-left">Batch</th>
                <th className="text-left">Medium</th>
                <th className="text-left">Topic</th>
                <th className="text-left">Status</th>
              </tr>
            </thead>
            <tbody>
              {sessions.length === 0 ? (
                <tr>
                  <td colSpan={5} className="p-4 text-center text-secondary">
                    No attendance records found.
                  </td>
                </tr>
              ) : (
                sessions.map((s) => (
                  <tr key={s.id} className="border-t">
                    <td className="p-3">{s.attendance_date}</td>
                    <td>{s.batch_name || "—"}</td>
                    <td>{s.medium_name || "—"}</td>
                    <td>{s.topic_covered || "—"}</td>
                    <td>
                      {s.status === "Present" ? (
                        <span className="text-green-600 flex items-center gap-1">
                          <CheckCircle size={16} /> Present
                        </span>
                      ) : (
                        <span className="text-red-600 flex items-center gap-1">
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
    </AdminLayout>
  );
}