// src/pages/TeacherLectureCountReport.jsx
import { useState, useMemo, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "../api/supabase";
import { useAuth } from "../context/AuthContext";
import toast from "react-hot-toast";
import AdminLayout from "../layouts/AdminLayout";
import { Calendar, Download } from "lucide-react";
import { generateTeacherLectureCountPDF } from "../utils/teacherLectureCountPdf";
import { useOrg } from "../context/OrganizationContext";   // NEW

export default function TeacherLectureCountReport() {
  const { profile } = useAuth();
  const isAdmin = profile?.role === "admin" || profile?.role === "super_admin";

  // ── Get current organization from context ──
  const { org: currentOrg } = useOrg();   // NEW

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

  // Fetch all teachers (for admin dropdown)
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

  // If user is a teacher, get own teacher id
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

  // Auto‑select the teacher when user is a teacher
  useEffect(() => {
    if (!isAdmin && ownTeacherId) {
      setTeacherId(ownTeacherId);
    }
  }, [ownTeacherId, isAdmin]);

  // Fetch sessions where teacher_id matches for the selected month
  const { data: sessions = [], isLoading } = useQuery({
    queryKey: ["teacher-lectures", teacherId, startDate, endDate],
    queryFn: async () => {
      if (!teacherId) return [];
      const { data } = await supabase
        .from("attendance_sessions")
        .select("id, attendance_date")
        .eq("teacher_id", teacherId)
        .gte("attendance_date", startDate)
        .lte("attendance_date", endDate)
        .order("attendance_date");
      return data || [];
    },
    enabled: !!teacherId,
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
    // Fetch org info using the current org id from context
    const { data: org } = await supabase
      .from("organization")
      .select("*")
      .eq("id", currentOrg?.id)   // now uses current org
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
    <AdminLayout>
      <div className="flex flex-col sm:flex-row sm:items-center justify-between mb-6">
        <h1 className="text-3xl font-righteous text-primary-dark">
          Teacher Lecture Count
        </h1>
        <div className="flex flex-wrap gap-3 mt-2 sm:mt-0">
          {/* Admin teacher selector */}
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

          {/* Month/Year selectors */}
          <div className="flex items-center gap-2">
            <Calendar className="text-secondary-light w-4 h-4" />
            <select
              value={year}
              onChange={(e) => setYear(Number(e.target.value))}
              className="border rounded p-2 text-sm"
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
              className="border rounded p-2 text-sm"
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
            className="bg-primary text-white px-4 py-2 rounded-lg text-sm flex items-center gap-2"
          >
            <Download size={16} /> Export PDF
          </button>
        </div>
      </div>

      {isLoading ? (
        <div className="text-center py-8 text-secondary">Loading…</div>
      ) : !teacherId ? (
        <div className="text-center py-8 text-secondary">
          Please select a teacher.
        </div>
      ) : (
        <>
          {/* Summary Card */}
          <div className="bg-white rounded-lg shadow-sm p-4 mb-4 border flex items-center justify-between">
            <div>
              <p className="text-sm text-secondary-dark">
                {selectedTeacherName}
              </p>
              <p className="text-xs text-secondary-light">{monthLabel}</p>
            </div>
            <div className="text-right">
              <p className="text-2xl font-bold text-primary">
                {totalLectures}
              </p>
              <p className="text-xs text-secondary-light">Total Lectures</p>
            </div>
          </div>

          {/* Daily Breakdown */}
          {dailyCounts.length === 0 ? (
            <div className="text-center py-8 text-secondary">
              No lectures found for this month.
            </div>
          ) : (
            <div className="bg-white rounded-xl shadow-sm overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full min-w-[400px]">
                  <thead className="bg-slate-50 border-b">
                    <tr>
                      <th className="px-4 py-3 text-left text-sm font-medium text-secondary-dark">
                        Date
                      </th>
                      <th className="px-4 py-3 text-center text-sm font-medium text-secondary-dark">
                        Lectures
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {dailyCounts.map((d) => (
                      <tr key={d.date} className="border-t hover:bg-gray-50">
                        <td className="px-4 py-3 text-sm">{d.date}</td>
                        <td className="px-4 py-3 text-sm text-center font-medium">
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
    </AdminLayout>
  );
}