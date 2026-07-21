import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import toast from "react-hot-toast";
import {
  ArrowLeft,
  Save,
  User,
  Hash,
  Calendar,
  Layers,
  FileText,
  CheckCircle,
  BookOpen,
  Mail,
} from "lucide-react";

import {
  getStudentsByBatch,
  getMarkedAttendance,
  saveAttendance,
} from "../services/attendanceService";
import { supabase } from "../api/supabase";
import { useOrg } from "../context/OrganizationContext";
import { sendEmail } from "../services/emailService";

export default function MarkAttendance() {
  const { sessionId } = useParams();
  const navigate = useNavigate();

  const { branch, selectedFinancialYear, org } = useOrg();
  const branchId = branch?.id;
  const financialYearId = selectedFinancialYear?.id;

  const [students, setStudents] = useState([]);
  const [attendance, setAttendance] = useState({});
  const [remarks, setRemarks] = useState({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [sendingReport, setSendingReport] = useState(false);
  const [sessionInfo, setSessionInfo] = useState(null);

  // ─── Helper: get admin emails ──────────────────────────────────────
  const getAdminEmails = async () => {
    if (!org?.id) return [];
    const { data, error } = await supabase
      .from("profiles")
      .select("email")
      .eq("organization_id", org.id)
      .in("role", ["admin", "super_admin", "organization_admin"])
      .eq("is_active", true);
    if (error) {
      console.error("Failed to fetch admin emails:", error);
      return [];
    }
    return data?.map(p => p.email).filter(Boolean) || [];
  };

  // ─── Send attendance report email ──────────────────────────────────
  const sendAttendanceReport = async () => {
    if (students.length === 0) {
      alert("No students to report.");
      return;
    }

    setSendingReport(true);
    try {
      const adminEmails = await getAdminEmails();
      if (adminEmails.length === 0) {
        alert("No admin emails found.");
        setSendingReport(false);
        return;
      }

      // Build HTML table rows
      let tableRows = students.map((student) => {
        const status = attendance[student.student_id] || "Present";
        const remark = remarks[student.student_id] || "";
        const statusColor = status === "Present" ? "#2e7d32" : "#c62828";
        const statusBg = status === "Present" ? "#e8f5e9" : "#ffebee";

        return `
          <tr>
            <td style="padding:4px 8px;border:1px solid #ddd;">${student.admission_no}</td>
            <td style="padding:4px 8px;border:1px solid #ddd;">${student.first_name} ${student.last_name}</td>
            <td style="padding:4px 8px;border:1px solid #ddd;text-align:center;">
              <span style="background:${statusBg};color:${statusColor};padding:2px 12px;border-radius:12px;font-size:10px;font-weight:600;">${status}</span>
            </td>
            <td style="padding:4px 8px;border:1px solid #ddd;">${remark || '—'}</td>
          </tr>
        `;
      }).join('');

      const presentCount = students.filter(
        (s) => (attendance[s.student_id] || "Present") === "Present"
      ).length;
      const absentCount = students.length - presentCount;

      const sessionBatch = sessionInfo?.batches?.batch_name || "N/A";
      const sessionDate = sessionInfo?.attendance_date || "N/A";
      const sessionTopic = sessionInfo?.topic_covered || "—";

      const htmlBody = `
        <div style="font-family:Arial,sans-serif;max-width:800px;margin:0 auto;">
          <h2 style="color:#0D47A1;">Attendance Report</h2>
          <p><strong>Batch:</strong> ${sessionBatch}</p>
          <p><strong>Date:</strong> ${sessionDate}</p>
          <p><strong>Topic:</strong> ${sessionTopic}</p>
          <p><strong>Total Students:</strong> ${students.length}</p>
          <p><strong>Present:</strong> ${presentCount} | <strong>Absent:</strong> ${absentCount}</p>
          <hr />
          <table style="width:100%;border-collapse:collapse;font-size:11px;border:1px solid #ddd;">
            <thead style="background:#e3f2fd;">
              <tr>
                <th style="padding:4px 8px;border:1px solid #ddd;text-align:left;">Admission No</th>
                <th style="padding:4px 8px;border:1px solid #ddd;text-align:left;">Student Name</th>
                <th style="padding:4px 8px;border:1px solid #ddd;text-align:center;">Status</th>
                <th style="padding:4px 8px;border:1px solid #ddd;text-align:left;">Remarks</th>
              </tr>
            </thead>
            <tbody>
              ${tableRows}
            </tbody>
          </table>
          <p style="color:#888;font-size:10px;margin-top:20px;">Computer‑generated report from ${org?.company_name || 'Academy'}</p>
        </div>
      `;

      await sendEmail({
        to: adminEmails,
        subject: `Attendance Report - ${sessionDate} (${sessionBatch})`,
        html: htmlBody,
        from: org?.email || undefined,
      });

      toast.success("Attendance report sent to admins.");
    } catch (err) {
      console.error("Email error:", err);
      toast.error("Failed to send report.");
    } finally {
      setSendingReport(false);
    }
  };

  // ─── Load data ──────────────────────────────────────────────────────
  useEffect(() => {
    if (branchId && financialYearId) {
      loadData();
    }
  }, [sessionId, branchId, financialYearId]);

  async function loadData() {
    setLoading(true);
    try {
      const { data: session } = await supabase
        .from("attendance_sessions")
        .select(
          `id, attendance_date, topic_covered, batch_id,
           batches(batch_name, medium_id, mediums(name))`
        )
        .eq("id", sessionId)
        .eq("branch_id", branchId)
        .eq("financial_year_id", financialYearId)
        .single();

      if (!session) {
        toast.error("Session not found");
        navigate("/attendance");
        return;
      }
      setSessionInfo(session);

      const studentList = await getStudentsByBatch(
        session.batch_id,
        branchId,
        financialYearId
      );

      const uniqueStudents = Array.from(
        new Map(studentList.map((s) => [s.student_id, s])).values()
      );
      setStudents(uniqueStudents);

      const marked = await getMarkedAttendance(
        sessionId,
        branchId,
        financialYearId
      );
      const initialAttendance = {};
      const initialRemarks = {};
      marked.forEach((m) => {
        initialAttendance[m.student_id] = m.status;
        initialRemarks[m.student_id] = m.remarks || "";
      });
      setAttendance(initialAttendance);
      setRemarks(initialRemarks);
    } catch (err) {
      toast.error("Failed to load attendance data");
    } finally {
      setLoading(false);
    }
  }

  function handleStatusChange(studentId, status) {
    setAttendance((prev) => ({ ...prev, [studentId]: status }));
  }

  function handleRemarkChange(studentId, value) {
    setRemarks((prev) => ({ ...prev, [studentId]: value }));
  }

  function markAllPresent() {
    const newAttendance = {};
    students.forEach((s) => (newAttendance[s.student_id] = "Present"));
    setAttendance(newAttendance);
  }

  async function handleSave() {
    const records = students.map((s) => ({
      student_id: s.student_id,
      status: attendance[s.student_id] || "Absent",
      remarks: remarks[s.student_id] || "",
    }));

    setSaving(true);
    try {
      await saveAttendance(sessionId, records, branchId, financialYearId);

      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        const { data: teacherData } = await supabase
          .from("teachers")
          .select("id")
          .eq("user_id", user.id)
          .eq("branch_id", branchId)
          .eq("financial_year_id", financialYearId)
          .single();

        if (teacherData?.id) {
          const { error: updateError } = await supabase
            .from("attendance_sessions")
            .update({
              teacher_id: teacherData.id,
              branch_id: branchId,
              financial_year_id: financialYearId,
            })
            .eq("id", sessionId)
            .eq("branch_id", branchId)
            .eq("financial_year_id", financialYearId)
            .is("teacher_id", null);

          if (updateError) {
            console.error("Failed to set teacher_id on session:", updateError);
          }
        }
      }

      toast.success("Attendance saved");
      navigate("/attendance");
    } catch (err) {
      toast.error("Failed to save attendance");
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <div className="p-8 text-center text-secondary font-montserrat">
        Loading attendance sheet…
      </div>
    );
  }

  return (
    <>
      {/* Back button & Header */}
      <div className="mb-6">
        <button
          onClick={() => navigate("/attendance")}
          className="flex items-center gap-2 text-secondary hover:text-primary-dark mb-2 font-montserrat text-sm transition"
        >
          <ArrowLeft size={18} />
          Back to Sessions
        </button>
        <h1 className="text-3xl font-righteous text-primary-dark">
          Mark Attendance
        </h1>
        {sessionInfo && (
          <div className="flex flex-wrap gap-2 mt-2 text-sm text-secondary-dark font-montserrat">
            <span className="flex items-center gap-1 bg-primary-bg text-primary px-3 py-1 rounded-full">
              <Layers size={14} /> {sessionInfo.batches?.batch_name}
            </span>
            {sessionInfo.batches?.mediums?.name && (
              <span className="flex items-center gap-1 bg-primary-bg text-primary px-3 py-1 rounded-full">
                <BookOpen size={14} /> {sessionInfo.batches.mediums.name}
              </span>
            )}
            <span className="flex items-center gap-1 bg-primary-bg text-primary px-3 py-1 rounded-full">
              <Calendar size={14} /> {sessionInfo.attendance_date}
            </span>
            {sessionInfo.topic_covered && (
              <span className="flex items-center gap-1 bg-primary-bg text-primary px-3 py-1 rounded-full">
                <FileText size={14} /> {sessionInfo.topic_covered}
              </span>
            )}
          </div>
        )}
      </div>

      {/* Students Table */}
      <div className="bg-white rounded-xl shadow-sm overflow-hidden">
        <div className="p-4 border-b border-secondary-light flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
          <h2 className="text-lg font-righteous text-primary-dark flex items-center gap-2">
            <User size={18} />
            Students ({students.length})
          </h2>
          <div className="flex gap-2">
            {/* 👇 Send Report button */}
            <button
              onClick={sendAttendanceReport}
              disabled={sendingReport}
              className="bg-green-600 hover:bg-green-700 text-white px-4 py-2 rounded-lg text-sm font-montserrat transition flex items-center gap-2 disabled:opacity-50"
            >
              <Mail size={16} />
              {sendingReport ? "Sending..." : "Send Report"}
            </button>
            <button
              onClick={markAllPresent}
              className="bg-green-100 text-green-700 px-4 py-2 rounded-lg text-sm font-montserrat hover:bg-green-200 transition flex items-center gap-2"
            >
              <CheckCircle size={16} />
              Mark All Present
            </button>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full min-w-[600px]">
            <thead className="bg-slate-50 border-b border-secondary-light">
              <tr>
                <th className="text-left p-3 text-sm font-montserrat text-secondary-dark">
                  <Hash size={14} className="inline mr-1" />
                  Admission No
                </th>
                <th className="text-left p-3 text-sm font-montserrat text-secondary-dark">
                  <User size={14} className="inline mr-1" />
                  Name
                </th>
                <th className="text-center p-3 text-sm font-montserrat text-secondary-dark w-40">
                  Status
                </th>
                <th className="text-left p-3 text-sm font-montserrat text-secondary-dark w-48">
                  Remarks
                </th>
              </tr>
            </thead>
            <tbody>
              {students.map((student) => (
                <tr
                  key={student.student_id}
                  className="border-b border-secondary-light hover:bg-primary-bg transition"
                >
                  <td className="p-3 text-sm">{student.admission_no}</td>
                  <td className="p-3 text-sm font-medium">
                    {student.first_name} {student.last_name}
                  </td>
                  <td className="p-3 text-center">
                    <div className="flex items-center justify-center gap-6">
                      <label className="flex items-center gap-1.5 cursor-pointer">
                        <input
                          type="radio"
                          name={`status-${student.student_id}`}
                          value="Present"
                          checked={
                            (attendance[student.student_id] || "Present") ===
                            "Present"
                          }
                          onChange={() =>
                            handleStatusChange(
                              student.student_id,
                              "Present"
                            )
                          }
                          className="w-4 h-4 text-green-600 accent-green-600"
                        />
                        <span className="text-sm text-green-700 font-medium">
                          Present
                        </span>
                      </label>

                      <label className="flex items-center gap-1.5 cursor-pointer">
                        <input
                          type="radio"
                          name={`status-${student.student_id}`}
                          value="Absent"
                          checked={
                            attendance[student.student_id] === "Absent"
                          }
                          onChange={() =>
                            handleStatusChange(
                              student.student_id,
                              "Absent"
                            )
                          }
                          className="w-4 h-4 text-red-600 accent-red-600"
                        />
                        <span className="text-sm text-red-700 font-medium">
                          Absent
                        </span>
                      </label>
                    </div>
                  </td>
                  <td className="p-3">
                    <input
                      type="text"
                      placeholder="Reason..."
                      value={remarks[student.student_id] || ""}
                      onChange={(e) =>
                        handleRemarkChange(student.student_id, e.target.value)
                      }
                      className="border border-secondary-light rounded p-2 w-full text-sm focus:ring-1 focus:ring-primary focus:border-primary outline-none"
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Action Buttons */}
        <div className="p-4 border-t border-secondary-light flex flex-col sm:flex-row justify-end gap-3">
          <button
            onClick={() => navigate("/attendance")}
            className="w-full sm:w-auto px-5 py-2.5 border border-secondary-light rounded-lg text-secondary-dark hover:bg-secondary-bg font-montserrat text-sm transition"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={saving}
            className="w-full sm:w-auto px-6 py-2.5 bg-primary hover:bg-primary-light text-white rounded-lg font-montserrat text-sm transition disabled:opacity-50 flex items-center justify-center gap-2"
          >
            <Save size={18} />
            {saving ? "Saving..." : "Save Attendance"}
          </button>
        </div>
      </div>
    </>
  );
}