import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import {
  Layers, CalendarCheck, BookOpen, Award, TrendingUp,
  Bell, Wallet, Calendar, Plus, ClipboardCheck, Video,
} from "lucide-react";
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, BarChart, Bar,
} from "recharts";
import AdminLayout from "../layouts/AdminLayout";
import { useAuth } from "../context/AuthContext";
import { supabase } from "../api/supabase";
import { useOrg } from "../context/OrganizationContext";   // NEW (for consistency)

export default function TeacherDashboard() {
  const { user, profile } = useAuth();
  // Context import – no writes on this page, included for consistency
  useOrg();
  // 1. Teacher record
  const { data: teacherId, isLoading: teacherLoading } = useQuery({
    queryKey: ["teacher-id", user?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("teachers")
        .select("id")
        .eq("user_id", user.id)
        .maybeSingle();
      if (error) throw error;
      return data?.id || null;
    },
    enabled: !!user?.id,
  });

  // 2. Assigned batches
  const { data: batches = [], isLoading: batchesLoading } = useQuery({
    queryKey: ["teacher-batches", teacherId],
    queryFn: async () => {
      const { data } = await supabase
        .from("batch_teachers")
        .select(`id, batch_id, batches(id, batch_name, start_time, end_time, days, capacity, courses(course_name))`)
        .eq("teacher_id", teacherId);
      return data || [];
    },
    enabled: !!teacherId,
  });

  const batchIds = batches.map((b) => b.batch_id);
  const today = new Date().toISOString().split("T")[0];

  // 3. Today's sessions
  const { data: todaySessions = [] } = useQuery({
    queryKey: ["teacher-today-sessions", batchIds, today],
    queryFn: async () => {
      const { data } = await supabase
        .from("attendance_sessions")
        .select(`id, attendance_date, topic_covered, batches(batch_name)`)
        .in("batch_id", batchIds)
        .eq("attendance_date", today);
      return data || [];
    },
    enabled: batchIds.length > 0,
  });

  // 4. Upcoming homework
  const { data: homeworks = [] } = useQuery({
    queryKey: ["teacher-homeworks", batchIds],
    queryFn: async () => {
      const { data } = await supabase
        .from("homework")
        .select(`id, title, due_date, batches(batch_name), subjects(subject_name)`)
        .in("batch_id", batchIds)
        .gte("due_date", today)
        .order("due_date", { ascending: true })
        .limit(5);
      return data || [];
    },
    enabled: batchIds.length > 0,
  });

  // 5. Upcoming exams
  const { data: exams = [] } = useQuery({
    queryKey: ["teacher-exams", batchIds],
    queryFn: async () => {
      const { data } = await supabase
        .from("exams")
        .select(`id, exam_name, exam_date, total_marks, batches(batch_name)`)
        .in("batch_id", batchIds)
        .gte("exam_date", today)
        .order("exam_date", { ascending: true })
        .limit(5);
      return data || [];
    },
    enabled: batchIds.length > 0,
  });

  // 6. Attendance trend (last 30 days)
  const { data: attendanceTrend = [] } = useQuery({
    queryKey: ["teacher-attendance-trend", batchIds],
    queryFn: async () => {
      const thirtyDaysAgo = new Date();
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
      const startDate = thirtyDaysAgo.toISOString().split("T")[0];

      const { data: sessions } = await supabase
        .from("attendance_sessions")
        .select(`id, attendance_date`)
        .in("batch_id", batchIds)
        .gte("attendance_date", startDate)
        .order("attendance_date", { ascending: true });

      if (!sessions?.length) return [];

      const sessionIds = sessions.map((s) => s.id);
      const { data: marks } = await supabase
        .from("student_attendance")
        .select("session_id, status")
        .in("session_id", sessionIds);

      const byDate = {};
      sessions.forEach((s) => { byDate[s.attendance_date] = { total: 0, present: 0 }; });
      marks?.forEach((m) => {
        const session = sessions.find((s) => s.id === m.session_id);
        if (!session) return;
        const date = session.attendance_date;
        if (byDate[date]) {
          byDate[date].total++;
          if (m.status === "Present") byDate[date].present++;
        }
      });

      return Object.entries(byDate).map(([date, stats]) => ({
        date,
        attendance: stats.total > 0 ? ((stats.present / stats.total) * 100).toFixed(1) : 0,
      }));
    },
    enabled: batchIds.length > 0,
  });

  // 7. Unread notifications
  const { data: unreadCount = 0 } = useQuery({
    queryKey: ["teacher-notifications-unread", user?.id],
    queryFn: async () => {
      const { count } = await supabase
        .from("notifications")
        .select("*", { count: "exact", head: true })
        .eq("user_id", user.id)
        .eq("is_read", false);
      return count || 0;
    },
    enabled: !!user?.id,
  });

  // 8. Salary & leave summary
  const { data: salaryInfo } = useQuery({
    queryKey: ["teacher-salary-info", teacherId],
    queryFn: async () => {
      const { data: payments } = await supabase
        .from("salary_payments")
        .select("net_amount, payment_date")
        .eq("teacher_id", teacherId)
        .order("payment_date", { ascending: false })
        .limit(1);

      const { count: pendingLeaves } = await supabase
        .from("teacher_leaves")
        .select("*", { count: "exact", head: true })
        .eq("teacher_id", teacherId)
        .eq("status", "Pending");

      return {
        lastSalary: payments?.[0]?.net_amount || null,
        lastSalaryDate: payments?.[0]?.payment_date || null,
        pendingLeaves: pendingLeaves || 0,
      };
    },
    enabled: !!teacherId,
  });

  if (teacherLoading || batchesLoading) {
    return <AdminLayout><div className="p-8 text-center">Loading…</div></AdminLayout>;
  }

  return (
    <AdminLayout>
      <div className="mb-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-righteous text-primary-dark">
            Welcome, {profile?.full_name || "Teacher"}!
          </h1>
          <p className="text-sm text-secondary-dark font-montserrat mt-1">Your teaching dashboard</p>
        </div>
        {unreadCount > 0 && (
          <Link
            to="/notifications"
            className="flex items-center gap-2 bg-accent/10 text-accent border border-accent/30 px-4 py-2 rounded-lg text-sm font-medium hover:bg-accent/20 transition"
          >
            <Bell size={16} />
            {unreadCount} unread notification{unreadCount > 1 ? "s" : ""}
          </Link>
        )}
      </div>

      {/* Quick Actions */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
        <Link
          to="/attendance"
          className="flex items-center gap-3 bg-primary text-white rounded-xl p-4 shadow-sm hover:bg-primary-light transition"
        >
          <CalendarCheck size={20} />
          <span className="text-sm font-medium">Mark Attendance</span>
        </Link>
        <Link
          to="/homework"
          className="flex items-center gap-3 bg-white rounded-xl p-4 shadow-sm border border-secondary-light hover:border-primary hover:shadow-md transition"
        >
          <Plus size={20} className="text-primary" />
          <span className="text-sm font-medium text-secondary-dark">Add Homework</span>
        </Link>
        <Link
          to="/exams"
          className="flex items-center gap-3 bg-white rounded-xl p-4 shadow-sm border border-secondary-light hover:border-primary hover:shadow-md transition"
        >
          <ClipboardCheck size={20} className="text-primary" />
          <span className="text-sm font-medium text-secondary-dark">Create Exam</span>
        </Link>
        <Link
          to="/online-classes"
          className="flex items-center gap-3 bg-white rounded-xl p-4 shadow-sm border border-secondary-light hover:border-primary hover:shadow-md transition"
        >
          <Video size={20} className="text-primary" />
          <span className="text-sm font-medium text-secondary-dark">Online Classes</span>
        </Link>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5 mb-8">
        <div className="bg-white rounded-xl p-5 shadow-sm border border-secondary-light">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-secondary">My Batches</p>
              <h3 className="text-2xl font-bold mt-1">{batches.length}</h3>
            </div>
            <Layers size={28} className="text-primary" />
          </div>
        </div>
        <div className="bg-white rounded-xl p-5 shadow-sm border border-secondary-light">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-secondary">Today's Sessions</p>
              <h3 className="text-2xl font-bold mt-1">{todaySessions.length}</h3>
            </div>
            <CalendarCheck size={28} className="text-primary" />
          </div>
        </div>
        <div className="bg-white rounded-xl p-5 shadow-sm border border-secondary-light">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-secondary">Upcoming Homework</p>
              <h3 className="text-2xl font-bold mt-1">{homeworks.length}</h3>
            </div>
            <BookOpen size={28} className="text-primary" />
          </div>
        </div>
        <div className="bg-white rounded-xl p-5 shadow-sm border border-secondary-light">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-secondary">Upcoming Exams</p>
              <h3 className="text-2xl font-bold mt-1">{exams.length}</h3>
            </div>
            <Award size={28} className="text-primary" />
          </div>
        </div>
      </div>

      {/* Salary & Leave Widget + Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-8">
        {/* Salary & Leave */}
        <div className="bg-white rounded-xl p-5 shadow-sm border border-secondary-light">
          <h2 className="text-lg font-righteous text-primary-dark mb-4 flex items-center gap-2">
            <Wallet size={18} /> Salary & Leave
          </h2>
          <div className="space-y-3 text-sm">
            {salaryInfo?.lastSalary ? (
              <div className="flex justify-between">
                <span className="text-secondary">Last Salary</span>
                <span className="font-semibold text-green-600">₹{Number(salaryInfo.lastSalary).toLocaleString()}</span>
              </div>
            ) : (
              <p className="text-secondary text-xs">No salary records yet.</p>
            )}
            {salaryInfo?.lastSalaryDate && (
              <div className="flex justify-between">
                <span className="text-secondary">Paid On</span>
                <span className="font-medium">{salaryInfo.lastSalaryDate}</span>
              </div>
            )}
            <div className="flex justify-between">
              <span className="text-secondary">Pending Leaves</span>
              <span className={`font-semibold ${salaryInfo?.pendingLeaves > 0 ? "text-yellow-600" : "text-green-600"}`}>
                {salaryInfo?.pendingLeaves ?? 0}
              </span>
            </div>
          </div>
          <div className="flex gap-3 mt-4">
            <Link to="/teacher/salary" className="flex-1 text-center text-xs bg-primary/10 text-primary px-3 py-2 rounded-lg hover:bg-primary/20 transition">
              My Salary
            </Link>
            <Link to="/teacher/leaves" className="flex-1 text-center text-xs bg-primary/10 text-primary px-3 py-2 rounded-lg hover:bg-primary/20 transition">
              My Leaves
            </Link>
          </div>
        </div>

        {/* Attendance Trend Chart */}
        <div className="lg:col-span-2 bg-white rounded-xl p-5 shadow-sm border border-secondary-light">
          <h2 className="text-lg font-righteous text-primary-dark mb-4 flex items-center gap-2">
            <TrendingUp size={18} /> Attendance Trend (Last 30 Days)
          </h2>
          {attendanceTrend.length === 0 ? (
            <p className="text-sm text-secondary text-center py-12">No attendance data yet.</p>
          ) : (
            <ResponsiveContainer width="100%" height={200}>
              <LineChart data={attendanceTrend}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="date" fontSize={11} />
                <YAxis domain={[0, 100]} fontSize={11} unit="%" />
                <Tooltip formatter={(value) => `${value}%`} />
                <Line type="monotone" dataKey="attendance" stroke="#0D47A1" strokeWidth={2} dot={false} name="Attendance %" />
              </LineChart>
            </ResponsiveContainer>
          )}
        </div>
      </div>

      {/* Lists Section */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* My Batches */}
        <div className="bg-white rounded-xl p-5 shadow-sm border border-secondary-light">
          <h2 className="text-lg font-righteous text-primary-dark mb-4 flex items-center gap-2">
            <Layers size={18} /> My Batches
          </h2>
          {batches.length === 0 ? (
            <p className="text-sm text-secondary">No batches assigned.</p>
          ) : (
            <ul className="space-y-2 text-sm">
              {batches.map((b) => (
                <li key={b.id} className="flex justify-between">
                  <span>{b.batches?.batch_name} ({b.batches?.courses?.course_name})</span>
                  <span className="text-secondary">{b.batches?.start_time} - {b.batches?.end_time}</span>
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* Today's Sessions */}
        <div className="bg-white rounded-xl p-5 shadow-sm border border-secondary-light">
          <h2 className="text-lg font-righteous text-primary-dark mb-4 flex items-center gap-2">
            <CalendarCheck size={18} /> Today's Sessions
          </h2>
          {todaySessions.length === 0 ? (
            <p className="text-sm text-secondary">No sessions today.</p>
          ) : (
            <ul className="space-y-2 text-sm">
              {todaySessions.map((s) => (
                <li key={s.id} className="flex justify-between">
                  <span>{s.batches?.batch_name} – {s.topic_covered || "No topic"}</span>
                  <Link to={`/attendance/mark/${s.id}`} className="text-primary hover:underline">Mark</Link>
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* Upcoming Homework */}
        <div className="bg-white rounded-xl p-5 shadow-sm border border-secondary-light">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-righteous text-primary-dark flex items-center gap-2">
              <BookOpen size={18} /> Upcoming Homework
            </h2>
            <Link to="/homework" className="text-xs text-primary hover:underline">View all →</Link>
          </div>
          {homeworks.length === 0 ? (
            <p className="text-sm text-secondary">No upcoming homework.</p>
          ) : (
            <ul className="space-y-2 text-sm">
              {homeworks.map((hw) => (
                <li key={hw.id}>
                  <span className="font-medium">{hw.title}</span> – {hw.subjects?.subject_name} ({hw.batches?.batch_name})
                  <br />
                  <span className="text-secondary text-xs">Due: {hw.due_date}</span>
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* Upcoming Exams */}
        <div className="bg-white rounded-xl p-5 shadow-sm border border-secondary-light">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-righteous text-primary-dark flex items-center gap-2">
              <Award size={18} /> Upcoming Exams
            </h2>
            <Link to="/exams" className="text-xs text-primary hover:underline">View all →</Link>
          </div>
          {exams.length === 0 ? (
            <p className="text-sm text-secondary">No upcoming exams.</p>
          ) : (
            <ul className="space-y-2 text-sm">
              {exams.map((ex) => (
                <li key={ex.id}>
                  <span className="font-medium">{ex.exam_name}</span> – {ex.batches?.batch_name}
                  <br />
                  <span className="text-secondary text-xs">{ex.exam_date} | Total: {ex.total_marks}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </AdminLayout>
  );
}
