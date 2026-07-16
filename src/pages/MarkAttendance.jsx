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
} from "lucide-react";

import {
  getStudentsByBatch,
  getMarkedAttendance,
  saveAttendance,
} from "../services/attendanceService";
import { supabase } from "../api/supabase";
import { useOrg } from "../context/OrganizationContext";

export default function MarkAttendance() {
  const { sessionId } = useParams();
  const navigate = useNavigate();

  // ── Organisation / Branch / Financial Year context ──
  const { branch, selectedFinancialYear } = useOrg();
  const branchId = branch?.id;
  const financialYearId = selectedFinancialYear?.id;

  const [students, setStudents] = useState([]);
  const [attendance, setAttendance] = useState({});
  const [remarks, setRemarks] = useState({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [sessionInfo, setSessionInfo] = useState(null);

  useEffect(() => {
    if (branchId && financialYearId) {
      loadData();
    }
  }, [sessionId, branchId, financialYearId]);

  async function loadData() {
    setLoading(true);
    try {
      // Fetch session info scoped to the current branch & financial year
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

      // Fetch students from the batch
      const studentList = await getStudentsByBatch(
        session.batch_id,
        branchId,
        financialYearId
      );

      // ── DEDUPLICATE students by student_id ──
      // This prevents duplicate keys if a student appears twice (e.g., in multiple batches)
      const uniqueStudents = Array.from(
        new Map(studentList.map((s) => [s.student_id, s])).values()
      );
      setStudents(uniqueStudents);

      // Fetch existing attendance for this session
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
      // Save attendance records with branch & financial year context
      await saveAttendance(sessionId, records, branchId, financialYearId);

      // Link the session to the current teacher (scoped)
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
          <button
            onClick={markAllPresent}
            className="bg-green-100 text-green-700 px-4 py-2 rounded-lg text-sm font-montserrat hover:bg-green-200 transition flex items-center gap-2"
          >
            <CheckCircle size={16} />
            Mark All Present
          </button>
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
                      {/* Present radio */}
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

                      {/* Absent radio */}
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