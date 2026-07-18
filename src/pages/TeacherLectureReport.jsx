import { useState, useMemo, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "../api/supabase";
import { useAuth } from "../context/AuthContext";
import { generateTeacherLectureReportPDF } from "../utils/teacherLectureReportPdf";
import toast from "react-hot-toast";
import { Calendar, Download } from "lucide-react";
import { useOrg } from "../context/OrganizationContext";
import { useTheme } from "../context/ThemeContext";          // NEW

export default function TeacherLectureReport() {
  const { profile } = useAuth();
  const isAdmin = profile?.role === "admin" || profile?.role === "super_admin";

  const { org: currentOrg, branch, selectedFinancialYear } = useOrg();
  const { theme } = useTheme();                            // NEW
  const branchId = branch?.id;
  const financialYearId = selectedFinancialYear?.id;

  const today = new Date().toISOString().split("T")[0];
  const [teacherId, setTeacherId] = useState("");
  const [startDate, setStartDate] = useState(today);
  const [endDate, setEndDate] = useState(today);

  // ... (all existing queries: teachers, ownTeacherId, teacherBatches, etc. remain exactly the same) ...

  // Fetch list of teachers – scoped
  const { data: teachers = [] } = useQuery({ /* ... unchanged ... */ });

  // If user is a teacher, automatically select their own ID – scoped
  const { data: ownTeacherId } = useQuery({ /* ... unchanged ... */ });
  useEffect(() => {
    if (!isAdmin && ownTeacherId) setTeacherId(ownTeacherId);
  }, [ownTeacherId, isAdmin]);

  // Fetch batches that the selected teacher is assigned to – scoped
  const { data: teacherBatches = [] } = useQuery({ /* ... unchanged ... */ });
  const batchIds = teacherBatches.map((bt) => bt.batch_id);

  // Fetch sessions for those batches within the date range – scoped
  const { data: sessions = [], isLoading } = useQuery({ /* ... unchanged ... */ });

  // Fetch attendance counts for each session – scoped
  const sessionIds = sessions.map((s) => s.id);
  const { data: attendanceCounts = {} } = useQuery({ /* ... unchanged ... */ });

  // Build report data (unchanged)
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

  // ── PDF Export – now uses context, no Supabase call ──
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
        { org: currentOrg, branch, theme }   // pass context values
      );
      doc.save(`Teacher_Lecture_Report_${startDate}_to_${endDate}.pdf`);
      toast.success("PDF downloaded");
    } catch (err) {
      toast.error("Failed to generate PDF");
      console.error(err);
    }
  };

  // ── Render (unchanged) ──
  return (
    <>
      <div className="flex flex-col sm:flex-row sm:items-center justify-between mb-6">
        <h1 className="text-3xl font-righteous text-primary-dark">Teacher Lecture Report</h1>
        <div className="flex flex-wrap gap-3 mt-2 sm:mt-0">
          {isAdmin && (
            <select value={teacherId} onChange={(e) => setTeacherId(e.target.value)} className="border rounded p-2 text-sm">
              <option value="">Select Teacher</option>
              {teachers.map((t) => (
                <option key={t.id} value={t.id}>{t.first_name} {t.last_name}</option>
              ))}
            </select>
          )}
          <div className="flex items-center gap-2">
            <Calendar className="text-secondary-light w-4 h-4" />
            <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} className="border rounded p-2 text-sm" />
            <span className="text-sm">to</span>
            <input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} className="border rounded p-2 text-sm" />
          </div>
          <button onClick={handleExportPDF} className="bg-primary text-white px-4 py-2 rounded-lg text-sm flex items-center gap-2">
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
    </>
  );
}