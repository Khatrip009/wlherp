import { useEffect, useLayoutEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { useLocation, Link } from "react-router-dom";
import {
  User, Calendar, IndianRupee, Award, Clock, FileText,
  Phone, Mail, MapPin, School, Layers, Bell, BookOpen,
  ClipboardCheck, BarChart3, Video,
} from "lucide-react";
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer,
} from "recharts";

import { useAuth } from "../context/AuthContext";
import { useTheme } from "../context/ThemeContext";
import { supabase } from "../api/supabase";

export default function StudentDashboard() {
  const { user } = useAuth();

  // Theme
  const theme = useTheme();
  const headingFont = theme?.font_heading || "Righteous";
  const bodyFont = theme?.font_body || "Montserrat";
  const primaryColor = theme?.primary_color || "#0D47A1";
  const accentColor = theme?.accent_color || "#FF1070";

  // 1. Student info – using RPC to bypass RLS
  const { data: student, isLoading: studentLoading } = useQuery({
    queryKey: ["student-info", user?.id],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('get_my_student_record');
      if (error) throw error;
      return Array.isArray(data) && data.length > 0 ? data[0] : null;
    },
    enabled: !!user?.id,
    staleTime: 5 * 60 * 1000,
  });

  // ✅ Use student's own branch & financial year – NOT context
  const studentId = student?.id;
  const branchId = student?.branch_id ?? null;
  const financialYearId = student?.financial_year_id ?? null;

  // 2. Batches (active only)
  const { data: batches = [] } = useQuery({
    queryKey: ["student-batches", studentId, branchId],
    queryFn: async () => {
      if (!studentId) return [];
      let query = supabase
        .from("student_batches")
        .select(`batch_id, batches(batch_name, course_id, courses(course_name))`)
        .eq("student_id", studentId)
        .eq("status", "active");
      if (branchId) query = query.eq("branch_id", branchId);
      const { data } = await query;
      return data || [];
    },
    enabled: !!studentId,
    staleTime: 5 * 60 * 1000,
  });

  // Deduplicate batches (avoid React key warnings)
  const uniqueBatches = Array.from(
    new Map(batches.map(b => [b.batch_id, b])).values()
  );

  // 3. Attendance (case‑insensitive, uses student's own branch & FY)
  const { data: attendance = { percentage: 0, present: 0, total: 0, trend: [] } } = useQuery({
    queryKey: ["student-attendance", studentId, branchId, financialYearId],
    queryFn: async () => {
      if (!studentId) return { percentage: 0, present: 0, total: 0, trend: [] };

      // Get active batches
      let batchQuery = supabase
        .from("student_batches")
        .select("batch_id")
        .eq("student_id", studentId)
        .eq("status", "active");
      if (branchId) batchQuery = batchQuery.eq("branch_id", branchId);
      const { data: batchRows } = await batchQuery;
      const batchIds = (batchRows || []).map(b => b.batch_id).filter(Boolean);

      if (!batchIds.length) return { percentage: 0, present: 0, total: 0, trend: [] };

      // Last 10 sessions
      let sessionQuery = supabase
        .from("attendance_sessions")
        .select("id, attendance_date")
        .in("batch_id", batchIds)
        .order("attendance_date", { ascending: false })
        .limit(10);
      if (branchId) sessionQuery = sessionQuery.eq("branch_id", branchId);
      if (financialYearId) sessionQuery = sessionQuery.eq("financial_year_id", financialYearId);
      const { data: sessions } = await sessionQuery;

      if (!sessions?.length) return { percentage: 0, present: 0, total: 0, trend: [] };

      const sessionIds = sessions.map(s => s.id);

      // Attendance marks
      let marksQuery = supabase
        .from("student_attendance")
        .select("session_id, status")
        .in("session_id", sessionIds)
        .eq("student_id", studentId);
      if (branchId) marksQuery = marksQuery.eq("branch_id", branchId);
      const { data: marks } = await marksQuery;

      const total = sessionIds.length;
      const present = (marks || []).filter(m => m.status?.toLowerCase() === "present").length;

      const trend = [...sessions].reverse().map(session => ({
        date: session.attendance_date,
        present: (marks || []).some(m => m.session_id === session.id && m.status?.toLowerCase() === "present") ? 1 : 0,
      }));

      return {
        percentage: total ? ((present / total) * 100).toFixed(1) : 0,
        present,
        total,
        trend,
      };
    },
    enabled: !!studentId,
    staleTime: 2 * 60 * 1000,
  });

  // 4. Fees – latest record only
const { data: fees = { total: 0, paid: 0, pending: 0 } } = useQuery({
  queryKey: ["student-fees", studentId, branchId],
  queryFn: async () => {
    if (!studentId) return { total: 0, paid: 0, pending: 0 };

    // 1. Get the latest fee record for this student
    let feeQuery = supabase
      .from("student_fees")
      .select("id, final_fee, fee_payments(amount)")
      .eq("student_id", studentId)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (branchId) feeQuery = feeQuery.eq("branch_id", branchId);
    const { data: feeRecord } = await feeQuery;

    if (!feeRecord) return { total: 0, paid: 0, pending: 0 };

    // 2. Sum the tax‑inclusive due amounts from the fee components
    const { data: components } = await supabase
      .from("student_fee_components")
      .select("due_amount, paid_amount")
      .eq("student_fee_id", feeRecord.id);

    const totalDue = (components || []).reduce(
      (sum, c) => sum + Number(c.due_amount || 0),
      0
    );

    // 3. Sum all payments made against this fee record
    const totalPaid = (feeRecord.fee_payments || []).reduce(
      (sum, p) => sum + Number(p.amount || 0),
      0
    );

    const pending = totalDue - totalPaid;

    return { total: totalDue, paid: totalPaid, pending };
  },
  enabled: !!studentId,
  staleTime: 2 * 60 * 1000,
});

  // 5. Results
  const { data: results = [] } = useQuery({
    queryKey: ["student-results", studentId, branchId],
    queryFn: async () => {
      if (!studentId) return [];
      let query = supabase
        .from("student_results")
        .select("marks_obtained, remarks, exams(exam_name, total_marks, exam_date, subject_id, subjects(subject_name))")
        .eq("student_id", studentId)
        .order("exam_id", { ascending: false })
        .limit(5);
      if (branchId) query = query.eq("branch_id", branchId);
      const { data } = await query;
      return data || [];
    },
    enabled: !!studentId,
  });

  // 6. Homework
  const { data: homeworks = [] } = useQuery({
    queryKey: ["student-homeworks", studentId, branchId],
    queryFn: async () => {
      if (!studentId) return [];
      let batchQuery = supabase
        .from("student_batches")
        .select("batch_id")
        .eq("student_id", studentId)
        .eq("status", "active");
      if (branchId) batchQuery = batchQuery.eq("branch_id", branchId);
      const { data: batchRows } = await batchQuery;
      const batchIds = batchRows?.map((b) => b.batch_id) || [];
      if (!batchIds.length) return [];

      let hwQuery = supabase
        .from("homework")
        .select("title, due_date, subjects(subject_name)")
        .in("batch_id", batchIds)
        .order("due_date", { ascending: true })
        .limit(3);
      if (branchId) hwQuery = hwQuery.eq("branch_id", branchId);
      const { data } = await hwQuery;
      return data || [];
    },
    enabled: !!studentId,
  });

  // 7. Certificates
  const { data: certificateCount = 0 } = useQuery({
    queryKey: ["student-certificates", studentId, branchId],
    queryFn: async () => {
      if (!studentId) return 0;
      let query = supabase
        .from("certificates")
        .select("*", { count: "exact", head: true })
        .eq("student_id", studentId);
      if (branchId) query = query.eq("branch_id", branchId);
      const { count } = await query;
      return count || 0;
    },
    enabled: !!studentId,
  });

  // 8. Notifications
  const { data: unreadCount = 0 } = useQuery({
    queryKey: ["student-notifications-unread", user?.id, branchId],
    queryFn: async () => {
      if (!user?.id) return 0;
      let query = supabase
        .from("notifications")
        .select("*", { count: "exact", head: true })
        .eq("user_id", user.id)
        .eq("is_read", false);
      if (branchId) query = query.eq("branch_id", branchId);
      const { count } = await query;
      return count || 0;
    },
    enabled: !!user?.id,
  });

  // Scroll logic
  const location = useLocation();
  const scrollToSection = (sectionId) => {
    const container = document.getElementById("main-content") || window;
    const element = document.getElementById(sectionId);
    if (element) {
      const top =
        typeof container === "object" && container !== window
          ? element.getBoundingClientRect().top -
            container.getBoundingClientRect().top +
            container.scrollTop
          : element.getBoundingClientRect().top + window.scrollY;
      const scrollOptions = { top: top - 20, behavior: "smooth" };
      if (container !== window) container.scrollTo(scrollOptions);
      else window.scrollTo(scrollOptions);
    }
  };

  useLayoutEffect(() => {
    const hash = location.hash.replace("#", "");
    if (hash) setTimeout(() => scrollToSection(hash), 100);
  }, [location.hash]);

  useEffect(() => {
    window.studentScrollToSection = scrollToSection;
    return () => {
      delete window.studentScrollToSection;
    };
  }, []);

  if (studentLoading) {
    return (
      <div className="p-8 text-center text-primary-dark/60" style={{ fontFamily: bodyFont }}>
        Loading profile…
      </div>
    );
  }

  if (!student) {
    return (
      <div className="p-8 text-center text-accent-dark" style={{ fontFamily: bodyFont }}>
        No student record linked to your account. Contact the office.
      </div>
    );
  }

  const paidPercent = fees.total > 0 ? ((fees.paid / fees.total) * 100).toFixed(0) : 0;

  return (
    <>
      <div className="mb-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold text-primary" style={{ fontFamily: headingFont }}>
            Welcome, {student.first_name}!
          </h1>
          <p className="text-sm text-primary-dark mt-1" style={{ fontFamily: bodyFont }}>
            Your student dashboard
          </p>
        </div>
        {unreadCount > 0 && (
          <Link
            to="/student/notifications"
            className="flex items-center gap-2 bg-accent/10 text-accent border border-accent/30 px-4 py-2 rounded-lg text-sm font-medium hover:bg-accent/20 transition"
          >
            <Bell size={16} />
            {unreadCount} unread notification{unreadCount > 1 ? "s" : ""}
          </Link>
        )}
      </div>

      {/* Quick Actions */}
      <div className="grid grid-cols-3 sm:grid-cols-6 gap-3 mb-6">
        {[
          { to: "/student/attendance", icon: Calendar, label: "Attendance" },
          { to: "/student/fees", icon: IndianRupee, label: "Fees" },
          { to: "/student/homework", icon: FileText, label: "Homework" },
          { to: "/student/exams", icon: ClipboardCheck, label: "Exams" },
          { to: "/student/results", icon: BarChart3, label: "Results" },
          { to: "/student/certificates", icon: Award, label: "Certificates" },
        ].map(({ to, icon: Icon, label }) => (
          <Link
            key={to}
            to={to}
            className="flex flex-col items-center gap-1.5 bg-white rounded-xl p-3 shadow-sm border border-primary-bg hover:border-primary hover:shadow-md transition text-center"
          >
            <Icon size={20} className="text-primary" />
            <span className="text-xs font-medium text-primary-dark" style={{ fontFamily: bodyFont }}>
              {label}
            </span>
          </Link>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Profile */}
        <div id="profile" className="bg-white rounded-xl p-5 shadow-sm border border-primary-bg">
          <h2 className="text-lg font-bold text-primary mb-4 flex items-center gap-2" style={{ fontFamily: headingFont }}>
            <User size={18} /> Personal Details
          </h2>
          <div className="space-y-3 text-sm text-primary-dark" style={{ fontFamily: bodyFont }}>
            <p><strong>Admission No:</strong> {student.admission_no || "-"}</p>
            <p><strong>Name:</strong> {student.first_name} {student.last_name}</p>
            {student.gender && <p><strong>Gender:</strong> {student.gender}</p>}
            {student.dob && <p><strong>DOB:</strong> {student.dob}</p>}
            <p className="flex items-center gap-1"><Phone size={14} className="text-primary" /> {student.mobile}</p>
            {student.email && <p className="flex items-center gap-1"><Mail size={14} className="text-primary" /> {student.email}</p>}
            {student.address && (
              <p className="flex items-start gap-1"><MapPin size={14} className="text-primary mt-0.5" /> {student.address}, {student.city}, {student.state} {student.pincode}</p>
            )}
            <p className="flex items-center gap-1"><School size={14} className="text-primary" /> {student.school_name || "N/A"}</p>
            {student.joining_date && <p><strong>Joining:</strong> {student.joining_date}</p>}
            <Link to="/student/profile" className="text-primary hover:underline text-sm mt-2 inline-block">View Full Profile →</Link>
          </div>
        </div>

        {/* Batch & Attendance */}
        <div className="space-y-6">
          <div id="batch" className="bg-white rounded-xl p-5 shadow-sm border border-primary-bg">
            <h2 className="text-lg font-bold text-primary mb-4 flex items-center gap-2" style={{ fontFamily: headingFont }}>
              <Layers size={18} /> Current Batch
            </h2>
            {uniqueBatches.length === 0 ? (
              <p className="text-sm text-primary-dark/60" style={{ fontFamily: bodyFont }}>Not assigned to any batch</p>
            ) : (
              <ul className="list-disc list-inside text-sm space-y-1">
                {uniqueBatches.map((b, idx) => (
                  <li key={`${b.batch_id}-${idx}`} style={{ fontFamily: bodyFont }}>
                    {b.batches?.batch_name} – {b.batches?.courses?.course_name}
                  </li>
                ))}
              </ul>
            )}
            <Link to="/student/batch" className="text-primary hover:underline text-xs mt-2 inline-block">View details →</Link>
          </div>
          <div id="attendance" className="bg-white rounded-xl p-5 shadow-sm border border-primary-bg">
            <h2 className="text-lg font-bold text-primary mb-2 flex items-center gap-2" style={{ fontFamily: headingFont }}>
              <Calendar size={18} /> Attendance
            </h2>
            <div className="flex items-center gap-2 mb-2">
              <div className="w-full bg-primary-bg rounded-full h-3">
                <div className="bg-primary h-3 rounded-full" style={{ width: `${Math.min(attendance.percentage, 100)}%` }}></div>
              </div>
              <span className="font-bold text-sm text-primary" style={{ fontFamily: headingFont }}>{attendance.percentage}%</span>
            </div>
            <p className="text-xs text-primary-dark/60 mb-3" style={{ fontFamily: bodyFont }}>
              {attendance.present} present / {attendance.total} sessions
            </p>
            {attendance.trend.length > 0 && (
              <ResponsiveContainer width="100%" height={80}>
                <Bar
                  dataKey="present"
                  fill={primaryColor}
                  radius={[2, 2, 0, 0]}
                  name="Status"          // ← add a readable name
                />
                <Tooltip
                  formatter={(val) => (val ? "Present" : "Absent")}
                  labelFormatter={(date) => `Date: ${date}`}   // ← show the date, not the field name
                />
              </ResponsiveContainer>
            )}
            <Link to="/student/attendance" className="text-primary hover:underline text-xs mt-2 inline-block">Full report →</Link>
          </div>
        </div>

        {/* Fee Summary */}
        <div id="fees" className="bg-white rounded-xl p-5 shadow-sm border border-primary-bg">
          <h2 className="text-lg font-bold text-primary mb-4 flex items-center gap-2" style={{ fontFamily: headingFont }}>
            <IndianRupee size={18} /> Fee Summary
          </h2>
          <div className="space-y-2 text-sm" style={{ fontFamily: bodyFont }}>
            <div className="flex justify-between"><span>Total Fee</span><span className="font-medium">₹{fees.total.toLocaleString()}</span></div>
            <div className="flex justify-between"><span>Paid</span><span className="text-primary font-medium">₹{fees.paid.toLocaleString()}</span></div>
            <div className="flex justify-between"><span>Pending</span><span className="text-accent-dark font-medium">₹{fees.pending.toLocaleString()}</span></div>
            <div className="w-full bg-primary-bg rounded-full h-2 mt-2">
              <div className="bg-primary h-2 rounded-full" style={{ width: `${paidPercent}%` }}></div>
            </div>
            <p className="text-center text-xs text-primary-dark/60 mt-1" style={{ fontFamily: bodyFont }}>{paidPercent}% paid</p>
          </div>
          <Link to="/student/fees" className="text-primary hover:underline text-xs mt-3 inline-block">View receipts →</Link>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mt-6">
        {/* Recent Results */}
        <div id="results" className="bg-white rounded-xl p-5 shadow-sm border border-primary-bg">
          <h2 className="text-lg font-bold text-primary mb-4 flex items-center gap-2" style={{ fontFamily: headingFont }}>
            <Award size={18} /> Recent Results
          </h2>
          {results.length === 0 ? (
            <p className="text-sm text-primary-dark/60" style={{ fontFamily: bodyFont }}>No results yet.</p>
          ) : (
            <>
              <ul className="space-y-2 text-sm mb-3">
                {results.slice(0, 2).map((r, idx) => (
                  <li key={idx} className="flex justify-between" style={{ fontFamily: bodyFont }}>
                    <span>{r.exams?.subjects?.subject_name || r.exams?.exam_name}</span>
                    <span className="font-medium">{r.marks_obtained}/{r.exams?.total_marks}</span>
                  </li>
                ))}
              </ul>
              {results.length >= 2 && (
                <ResponsiveContainer width="100%" height={120}>
                  <BarChart data={results.map(r => ({ subject: r.exams?.subjects?.subject_name || r.exams?.exam_name, score: r.exams?.total_marks ? ((r.marks_obtained / r.exams.total_marks) * 100).toFixed(1) : 0 }))}>
                    <Bar dataKey="score" fill={accentColor} radius={[4, 4, 0, 0]} />
                    <XAxis dataKey="subject" fontSize={10} />
                    <YAxis unit="%" fontSize={10} />
                    <Tooltip />
                  </BarChart>
                </ResponsiveContainer>
              )}
            </>
          )}
          <Link to="/student/results" className="text-primary hover:underline text-xs mt-2 inline-block">All results →</Link>
        </div>

        {/* Upcoming Homework */}
        <div id="homework" className="bg-white rounded-xl p-5 shadow-sm border border-primary-bg">
          <h2 className="text-lg font-bold text-primary mb-4 flex items-center gap-2" style={{ fontFamily: headingFont }}>
            <Clock size={18} /> Upcoming Homework
          </h2>
          {homeworks.length === 0 ? (
            <p className="text-sm text-primary-dark/60" style={{ fontFamily: bodyFont }}>No upcoming homework.</p>
          ) : (
            <ul className="space-y-3">
              {homeworks.map((hw, idx) => (
                <li key={idx} className="border-b pb-2 last:border-0">
                  <p className="font-medium text-sm text-primary" style={{ fontFamily: headingFont }}>{hw.title}</p>
                  <p className="text-xs text-primary-dark/60" style={{ fontFamily: bodyFont }}>{hw.subjects?.subject_name} – Due: {hw.due_date}</p>
                </li>
              ))}
            </ul>
          )}
          <Link to="/student/homework" className="text-primary hover:underline text-xs mt-2 inline-block">All homework →</Link>
        </div>

        {/* Certificates + Resources */}
        <div className="space-y-4">
          <div id="certificates" className="bg-white rounded-xl p-5 shadow-sm border border-primary-bg">
            <h2 className="text-lg font-bold text-primary mb-3 flex items-center gap-2" style={{ fontFamily: headingFont }}>
              <FileText size={18} /> Certificates
            </h2>
            <div className="flex items-center justify-between">
              <div>
                <p className="text-3xl font-bold text-primary" style={{ fontFamily: headingFont }}>{certificateCount}</p>
                <p className="text-xs text-primary-dark/60" style={{ fontFamily: bodyFont }}>issued</p>
              </div>
              <Link to="/student/certificates" className="text-primary hover:underline text-xs">View all →</Link>
            </div>
          </div>
          <div className="bg-white rounded-xl p-5 shadow-sm border border-primary-bg">
            <h2 className="text-lg font-bold text-primary mb-3 flex items-center gap-2" style={{ fontFamily: headingFont }}>
              <BookOpen size={18} /> Quick Links
            </h2>
            <div className="space-y-2 text-sm">
              <Link to="/student/timetable" className="flex items-center gap-2 text-primary-dark hover:text-primary transition"><Calendar size={14} /> My Timetable</Link>
              <Link to="/student/resources" className="flex items-center gap-2 text-primary-dark hover:text-primary transition"><BookOpen size={14} /> Learning Resources</Link>
              <Link to="/online-classes" className="flex items-center gap-2 text-primary-dark hover:text-primary transition"><Video size={14} /> Online Classes</Link>
              <Link to="/student/notifications" className="flex items-center gap-2 text-primary-dark hover:text-primary transition">
                <Bell size={14} /> Notifications {unreadCount > 0 && <span className="bg-accent text-white text-xs px-1.5 py-0.5 rounded-full">{unreadCount}</span>}
              </Link>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}