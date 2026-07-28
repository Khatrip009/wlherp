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
import { useTheme } from "../context/ThemeContext";
import { sendEmail } from "../services/emailService";

export default function MarkAttendance() {
  const { sessionId } = useParams();
  const navigate = useNavigate();

  const { branch, selectedFinancialYear, org } = useOrg();
  const theme = useTheme();

  // Convert IDs to integers immediately
  const branchId = branch?.id ? Number(branch.id) : undefined;
  const financialYearId = selectedFinancialYear?.id
    ? Number(selectedFinancialYear.id)
    : undefined;
  const sessionIdNum = sessionId ? parseInt(sessionId, 10) : undefined;

  const headingFont = theme?.font_heading || "Righteous";
  const bodyFont = theme?.font_body || "Montserrat";

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

      let tableRows = students
        .map((student) => {
          const status =
            attendance[student.student_id] || "present"; // lowercase
          const remark = remarks[student.student_id] || "";
          const statusColor = status === "present" ? "#2e7d32" : "#c62828";
          const statusBg = status === "present" ? "#e8f5e9" : "#ffebee";

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
        })
        .join("");

      const presentCount = students.filter(
        (s) => (attendance[s.student_id] || "present") === "present"
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
    if (branchId !== undefined && financialYearId !== undefined && sessionIdNum) {
      loadData();
    }
  }, [sessionIdNum, branchId, financialYearId]);

  async function loadData() {
    setLoading(true);
    try {
      const { data: session } = await supabase
        .from("attendance_sessions")
        .select(
          `id, attendance_date, topic_covered, batch_id,
           batches(batch_name, medium_id, mediums(name))`
        )
        .eq("id", sessionIdNum)
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

      // Deduplicate students by student_id
      const uniqueStudents = Array.from(
        new Map(studentList.map((s) => [s.student_id, s])).values()
      );
      setStudents(uniqueStudents);

      const marked = await getMarkedAttendance(
        sessionIdNum,
        branchId,
        financialYearId
      );
      const initialAttendance = {};
      const initialRemarks = {};
      marked.forEach((m) => {
        // Normalize to lowercase
        const status = (m.status || "").toLowerCase();
        initialAttendance[m.student_id] =
          status === "absent" ? "absent" : "present";
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
    students.forEach((s) => (newAttendance[s.student_id] = "present"));
    setAttendance(newAttendance);
  }

  async function handleSave() {
    // Create records with lowercase statuses
    const records = students.map((s) => ({
      student_id: s.student_id,
      status: attendance[s.student_id] || "absent",   // lowercase
      remarks: remarks[s.student_id] || "",
    }));

    setSaving(true);
    try {
      await saveAttendance(sessionIdNum, records, branchId, financialYearId);

      // Update the session's teacher_id if not already set
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
            .eq("id", sessionIdNum)
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
      <div
        className="p-8 text-center text-primary-dark/60"
        style={{ fontFamily: bodyFont }}
      >
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
          className="flex items-center gap-2 text-primary-dark hover:text-primary mb-2 text-sm transition"
          style={{ fontFamily: bodyFont }}
        >
          <ArrowLeft size={18} />
          Back to Sessions
        </button>
        <h1
          className="text-3xl font-bold text-primary"
          style={{ fontFamily: headingFont }}
        >
          Mark Attendance
        </h1>
        {sessionInfo && (
          <div
            className="flex flex-wrap gap-2 mt-2 text-sm"
            style={{ fontFamily: bodyFont }}
          >
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
      <div className="bg-white rounded-xl shadow-sm overflow-hidden border border-primary-bg">
        <div className="p-4 border-b border-primary-bg flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
          <h2
            className="text-lg font-bold text-primary flex items-center gap-2"
            style={{ fontFamily: headingFont }}
          >
            <User size={18} />
            Students ({students.length})
          </h2>
          <div className="flex gap-2">
            <button
              onClick={sendAttendanceReport}
              disabled={sendingReport}
              className="bg-accent hover:bg-accent-dark text-white px-4 py-2 rounded-lg text-sm font-medium transition flex items-center gap-2 disabled:opacity-50"
              style={{ fontFamily: bodyFont }}
            >
              <Mail size={16} />
              {sendingReport ? "Sending..." : "Send Report"}
            </button>
            <button
              onClick={markAllPresent}
              className="bg-primary-bg text-primary-dark px-4 py-2 rounded-lg text-sm font-medium hover:bg-primary/10 transition flex items-center gap-2"
              style={{ fontFamily: bodyFont }}
            >
              <CheckCircle size={16} />
              Mark All Present
            </button>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full min-w-[600px]">
            <thead className="bg-primary-bg border-b border-primary-bg">
              <tr>
                <th
                  className="text-left p-3 text-sm font-medium text-primary-dark uppercase"
                  style={{ fontFamily: bodyFont }}
                >
                  <Hash size={14} className="inline mr-1" />
                  Admission No
                </th>
                <th
                  className="text-left p-3 text-sm font-medium text-primary-dark uppercase"
                  style={{ fontFamily: bodyFont }}
                >
                  <User size={14} className="inline mr-1" />
                  Name
                </th>
                <th
                  className="text-center p-3 text-sm font-medium text-primary-dark uppercase w-40"
                  style={{ fontFamily: bodyFont }}
                >
                  Status
                </th>
                <th
                  className="text-left p-3 text-sm font-medium text-primary-dark uppercase w-48"
                  style={{ fontFamily: bodyFont }}
                >
                  Remarks
                </th>
              </tr>
            </thead>
            <tbody>
              {students.map((student, index) => (
                <tr
                  key={student.student_id || student.id || index}
                  className="border-b border-primary-bg hover:bg-primary-bg transition"
                >
                  <td
                    className="p-3 text-sm text-primary-dark"
                    style={{ fontFamily: bodyFont }}
                  >
                    {student.admission_no}
                  </td>
                  <td
                    className="p-3 text-sm font-medium text-primary"
                    style={{ fontFamily: headingFont }}
                  >
                    {student.first_name} {student.last_name}
                  </td>
                  <td className="p-3 text-center">
                    <div className="flex items-center justify-center gap-6">
                      <label className="flex items-center gap-1.5 cursor-pointer">
                        <input
                          type="radio"
                          name={`status-${student.student_id}`}
                          value="present"
                          checked={
                            (attendance[student.student_id] || "present") ===
                            "present"
                          }
                          onChange={() =>
                            handleStatusChange(student.student_id, "present")
                          }
                          className="w-4 h-4 text-primary accent-primary"
                        />
                        <span
                          className="text-sm text-primary-dark font-medium"
                          style={{ fontFamily: bodyFont }}
                        >
                          present
                        </span>
                      </label>

                      <label className="flex items-center gap-1.5 cursor-pointer">
                        <input
                          type="radio"
                          name={`status-${student.student_id}`}
                          value="absent"
                          checked={
                            attendance[student.student_id] === "absent"
                          }
                          onChange={() =>
                            handleStatusChange(student.student_id, "absent")
                          }
                          className="w-4 h-4 text-accent accent-accent"
                        />
                        <span
                          className="text-sm text-accent-dark font-medium"
                          style={{ fontFamily: bodyFont }}
                        >
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
                      className="border border-primary-bg bg-white text-primary-dark rounded p-2 w-full text-sm focus:ring-1 focus:ring-primary focus:border-primary outline-none placeholder-primary-dark/40"
                      style={{ fontFamily: bodyFont }}
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Action Buttons */}
        <div className="p-4 border-t border-primary-bg flex flex-col sm:flex-row justify-end gap-3">
          <button
            onClick={() => navigate("/attendance")}
            className="w-full sm:w-auto px-5 py-2.5 border border-primary-bg rounded-lg text-primary-dark hover:bg-primary-bg transition text-sm"
            style={{ fontFamily: bodyFont }}
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={saving}
            className="w-full sm:w-auto px-6 py-2.5 bg-primary hover:bg-primary-light text-white rounded-lg transition text-sm font-medium disabled:opacity-50 flex items-center justify-center gap-2"
            style={{ fontFamily: bodyFont }}
          >
            <Save size={18} />
            {saving ? "Saving..." : "Save Attendance"}
          </button>
        </div>
      </div>
    </>
  );
}