import React, { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { supabase } from "../api/supabase";
import { useAuth } from "../context/AuthContext";
import { useOrg } from "../context/OrganizationContext";
import { useTheme } from "../context/ThemeContext";            // ✅ dynamic theme
import JitsiMeeting from "../components/JitsiMeeting";
import toast from "react-hot-toast";
import { Video, ArrowLeft } from "lucide-react";

export default function JoinOnlineClass() {
  const { classId } = useParams();
  const { profile } = useAuth();
  const { branch, selectedFinancialYear } = useOrg();
  const theme = useTheme();                                    // ✅ theme hook
  const branchId = branch?.id;
  const financialYearId = selectedFinancialYear?.id;
  const navigate = useNavigate();
  const [classData, setClassData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [inMeeting, setInMeeting] = useState(false);
  const [studentId, setStudentId] = useState(null);
  const [teacherId, setTeacherId] = useState(null);
  const [error, setError] = useState(null);

  const headingFont = theme?.font_heading || "Righteous";
  const bodyFont = theme?.font_body || "Montserrat";

  const userRole = profile?.role?.toLowerCase();
  const isAdmin = userRole === "admin" || userRole === "super_admin";
  const isTeacher = userRole === "teacher";
  const isStudent = userRole === "student";

  // Fetch class details and student/teacher info – now scoped
  useEffect(() => {
    if (!profile?.id || !branchId || !financialYearId) return;

    const fetchData = async () => {
      try {
        const { data: classInfo, error: classError } = await supabase
          .from("online_classes")
          .select("*")
          .eq("id", classId)
          .eq("branch_id", branchId)
          .eq("financial_year_id", financialYearId)
          .maybeSingle();

        if (classError) throw classError;
        if (!classInfo) {
          throw new Error("Class not found");
        }
        setClassData(classInfo);

        if (isStudent) {
          const { data: student, error: studentError } = await supabase
            .from("students")
            .select("id")
            .eq("user_id", profile.id)
            .eq("branch_id", branchId)
            .eq("financial_year_id", financialYearId)
            .maybeSingle();
          if (studentError) throw studentError;
          if (student) setStudentId(student.id);
        } else if (isTeacher) {
          const { data: teacher } = await supabase
            .from("teachers")
            .select("id")
            .eq("user_id", profile.id)
            .eq("branch_id", branchId)
            .eq("financial_year_id", financialYearId)
            .maybeSingle();
          if (teacher) setTeacherId(teacher.id);
        }
      } catch (err) {
        console.error("Error fetching class data:", err);
        setError(err.message);
        toast.error(err.message);
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [classId, profile, isStudent, isTeacher, branchId, financialYearId]);

  // Record attendance when user joins – only for students
  const recordAttendance = async () => {
    if (!studentId || !branchId || !financialYearId) return;
    try {
      const { error } = await supabase
        .from("online_class_attendance")
        .insert({
          class_id: classId,
          student_id: studentId,
          joined_at: new Date().toISOString(),
          attended: true,
          branch_id: branchId,
          financial_year_id: financialYearId,
        });
      if (error) console.error("Attendance recording error:", error);
    } catch (err) {
      console.error("Attendance error:", err);
    }
  };

  const handleMeetingEnd = () => {
    setInMeeting(false);
    recordAttendance();
  };

  const handleJoin = () => {
    setInMeeting(true);
  };

  const handleStartClass = async () => {
    if (!branchId || !financialYearId) return;
    try {
      const { error } = await supabase
        .from("online_classes")
        .update({
          status: "live",
          branch_id: branchId,
          financial_year_id: financialYearId,
        })
        .eq("id", classId)
        .eq("branch_id", branchId)
        .eq("financial_year_id", financialYearId);
      if (error) throw error;
      toast.success("Class started! Students notified.");
      // Reload class data – scoped
      const { data: updated } = await supabase
        .from("online_classes")
        .select("*")
        .eq("id", classId)
        .eq("branch_id", branchId)
        .eq("financial_year_id", financialYearId)
        .single();
      setClassData(updated);
      setInMeeting(true);
    } catch (err) {
      toast.error(err.message);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto"></div>
          <p className="mt-4 text-primary-dark/60" style={{ fontFamily: bodyFont }}>Loading class...</p>
        </div>
      </div>
    );
  }

  if (error || !classData) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-center">
          <p className="text-accent-dark text-lg" style={{ fontFamily: bodyFont }}>
            ⚠️ {error || "Class not found"}
          </p>
          <button
            onClick={() => navigate("/online-classes")}
            className="mt-4 bg-primary hover:bg-primary-light text-white px-4 py-2 rounded transition-colors"
            style={{ fontFamily: bodyFont }}
          >
            Back to Classes
          </button>
        </div>
      </div>
    );
  }

  const displayName = profile?.full_name || "Student";
  const canStart = (isAdmin || (isTeacher && classData.teacher_id === teacherId)) && classData.status === "scheduled";

  return (
    <div className="h-full flex flex-col bg-primary-bg">
      {/* Class info bar */}
      <div className="bg-white px-6 py-3 shadow-sm flex justify-between items-center border-b border-primary-bg">
        <div>
          <h1 className="text-xl font-bold text-primary" style={{ fontFamily: headingFont }}>
            {classData.title}
          </h1>
          <p className="text-sm text-primary-dark" style={{ fontFamily: bodyFont }}>{classData.description}</p>
        </div>
        <button
          onClick={() => navigate("/online-classes")}
          className="text-primary-dark/60 hover:text-primary flex items-center gap-1"
        >
          <ArrowLeft size={18} /> Back
        </button>
      </div>

      {/* Meeting area */}
      <div className="flex-1 relative overflow-hidden">
        {!inMeeting ? (
          <div className="flex items-center justify-center h-full">
            <div className="text-center max-w-md px-4">
              <Video size={64} className="mx-auto text-primary" />
              <h2 className="text-2xl font-bold mt-4 text-primary" style={{ fontFamily: headingFont }}>Ready to join?</h2>
              <p className="text-primary-dark mt-2" style={{ fontFamily: bodyFont }}>
                You are about to join <strong>{classData.title}</strong>
              </p>
              <p className="text-sm text-primary-dark/60 mt-1" style={{ fontFamily: bodyFont }}>
                {new Date(classData.start_time).toLocaleString()}
              </p>
              <button
                onClick={handleJoin}
                className="mt-6 bg-primary hover:bg-primary-light text-white px-8 py-3 rounded-lg text-lg shadow-md transition"
                style={{ fontFamily: bodyFont }}
              >
                Join Class
              </button>
              {canStart && (
                <button
                  onClick={handleStartClass}
                  className="mt-4 bg-accent hover:bg-accent-dark text-white px-6 py-2 rounded-lg shadow-md transition ml-2"
                  style={{ fontFamily: bodyFont }}
                >
                  Start Class Now
                </button>
              )}
            </div>
          </div>
        ) : (
          <JitsiMeeting
            roomName={classData.room_name}
            displayName={displayName}
            onMeetingEnd={handleMeetingEnd}
          />
        )}
      </div>
    </div>
  );
}