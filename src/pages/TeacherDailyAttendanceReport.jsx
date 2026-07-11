// src/pages/TeacherDailyAttendanceReport.jsx
import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "../api/supabase";
import { useAuth } from "../context/AuthContext";
import { generateDailyTeacherAttendancePDF } from "../utils/teacherDailyAttendancePdf";
import toast from "react-hot-toast";
import AdminLayout from "../layouts/AdminLayout";
import { Calendar, Download } from "lucide-react";
import { useOrg } from "../context/OrganizationContext";   // NEW

export default function TeacherDailyAttendanceReport() {
  const { profile } = useAuth();
  const isAdmin = profile?.role === "admin" || profile?.role === "super_admin";

  // ── Get current organization from context ──
  const { org: currentOrg } = useOrg();   // NEW

  const today = new Date().toISOString().split("T")[0];
  const [startDate, setStartDate] = useState(today);
  const [endDate, setEndDate] = useState(today);

  // Fetch teacher ID if user is a teacher
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

  // Fetch teachers (admin sees all, teacher sees only self)
  const { data: teachers = [] } = useQuery({
    queryKey: ["active-teachers-list", isAdmin, ownTeacherId],
    queryFn: async () => {
      let query = supabase
        .from("teachers")
        .select("id, first_name, last_name, employee_code")
        .eq("status", "active")
        .order("first_name");
      if (!isAdmin && ownTeacherId) query = query.eq("id", ownTeacherId);
      if (!isAdmin && !ownTeacherId) return [];
      const { data } = await query;
      return data || [];
    },
    enabled: isAdmin || !!ownTeacherId,
  });

  // Fetch attendance records for the selected date range
  const { data: attendance = [], isLoading } = useQuery({
    queryKey: ["teacher-attendance-range", startDate, endDate, isAdmin, ownTeacherId],
    queryFn: async () => {
      let query = supabase
        .from("teacher_attendance")
        .select("*")
        .gte("attendance_date", startDate)
        .lte("attendance_date", endDate)
        .order("attendance_date");

      if (!isAdmin && ownTeacherId) query = query.eq("teacher_id", ownTeacherId);

      const { data } = await query;
      return data || [];
    },
    enabled: !!startDate && !!endDate && (isAdmin || !!ownTeacherId),
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

  const handleExportPDF = async () => {
    if (reportData.length === 0) {
      toast.error("No data to export");
      return;
    }
    // Fetch organisation info for PDF header – now uses current org id
    const { data: org } = await supabase
      .from("organization")
      .select("*")
      .eq("id", currentOrg?.id)   // use current org id
      .single();

    const doc = await generateDailyTeacherAttendancePDF(reportData, startDate, endDate, org || {});
    doc.save(`Teacher_Daily_Attendance_${startDate}_to_${endDate}.pdf`);
    toast.success("PDF downloaded");
  };

  return (
    <AdminLayout>
      <div className="flex flex-col sm:flex-row sm:items-center justify-between mb-6">
        <h1 className="text-3xl font-righteous text-primary-dark">
          {isAdmin ? "Teacher Daily Attendance Report" : "My Daily Attendance"}
        </h1>
        <div className="flex flex-wrap gap-3 mt-2 sm:mt-0">
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
      ) : reportData.length === 0 ? (
        <div className="text-center py-8 text-secondary">No attendance records found for the selected period.</div>
      ) : (
        <div className="bg-white rounded-xl shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[600px]">
              <thead className="bg-slate-50 border-b">
                <tr>
                  <th className="px-4 py-3 text-left text-sm font-medium text-secondary-dark">Date</th>
                  <th className="px-4 py-3 text-left text-sm font-medium text-secondary-dark">Teacher</th>
                  <th className="px-4 py-3 text-left text-sm font-medium text-secondary-dark">Code</th>
                  <th className="px-4 py-3 text-left text-sm font-medium text-secondary-dark">Status</th>
                </tr>
              </thead>
              <tbody>
                {reportData.map((row, idx) => (
                  <tr key={idx} className="border-t hover:bg-gray-50 transition">
                    <td className="px-4 py-3 text-sm">{row.date}</td>
                    <td className="px-4 py-3 text-sm font-medium">{row.teacher_name}</td>
                    <td className="px-4 py-3 text-sm">{row.employee_code}</td>
                    <td className="px-4 py-3 text-sm">
                      <span
                        className={`inline-block px-2 py-0.5 rounded-full text-xs font-medium ${
                          row.status === "present"
                            ? "bg-green-100 text-green-700"
                            : row.status === "absent"
                            ? "bg-red-100 text-red-700"
                            : row.status === "leave"
                            ? "bg-yellow-100 text-yellow-700"
                            : row.status === "half_day"
                            ? "bg-orange-100 text-orange-700"
                            : "bg-gray-100 text-gray-700"
                        }`}
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
          <div className="px-4 py-2 text-xs text-secondary-light border-t">
            {reportData.length} records | {startDate} to {endDate}
          </div>
        </div>
      )}
    </AdminLayout>
  );
}