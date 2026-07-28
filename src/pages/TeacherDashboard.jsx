// src/pages/TeacherDashboard.jsx
import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import {
  Layers, CalendarCheck, BookOpen, Award, TrendingUp,
  Bell, Wallet, Plus, ClipboardCheck, Video,
} from "lucide-react";
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer,
} from "recharts";
import { Card, Statistic, Row, Col, List, Badge, Button, Space, Typography } from "antd";
import { useAuth } from "../context/AuthContext";
import { supabase } from "../api/supabase";
import { useOrg } from "../context/OrganizationContext";

const { Title, Text } = Typography;

export default function TeacherDashboard() {
  const { user, profile } = useAuth();
  const { branch, selectedFinancialYear, theme } = useOrg();  // theme may be inside useOrg or separate – adjust if needed

  // Fallback theme
  const primaryColor = theme?.primary_color || "#0D47A1";
  const accentColor = theme?.accent_color || "#D15839";
  const headingFont = theme?.font_heading || "var(--font-heading)";
  const bodyFont = theme?.font_body || "var(--font-body)";

  const branchId = branch?.id;
  const financialYearId = selectedFinancialYear?.id;

  // ── 1. Teacher ID ────────────────────────────────────────
  const { data: teacherId, isLoading: teacherLoading } = useQuery({
    queryKey: ["teacher-id", user?.id, branchId, financialYearId],
    queryFn: async () => {
      if (!user?.id || !branchId || !financialYearId) return null;
      const { data, error } = await supabase
        .from("teachers")
        .select("id")
        .eq("user_id", user.id)
        .eq("branch_id", branchId)
        .eq("financial_year_id", financialYearId)
        .maybeSingle();
      if (error) throw error;
      return data?.id || null;
    },
    enabled: !!user?.id && !!branchId && !!financialYearId,
    staleTime: 10 * 60 * 1000,
  });

  // ── 2. Assigned batches ──────────────────────────────────
  const { data: batches = [], isLoading: batchesLoading } = useQuery({
    queryKey: ["teacher-batches", teacherId, branchId, financialYearId],
    queryFn: async () => {
      if (!teacherId || !branchId || !financialYearId) return [];
      let btQuery = supabase
        .from("batch_teachers")
        .select(`id, batch_id, batches(id, batch_name, start_time, end_time, days, capacity, courses(course_name))`)
        .eq("teacher_id", teacherId);
      if (branchId) btQuery = btQuery.eq("branch_id", branchId);
      if (financialYearId) btQuery = btQuery.eq("financial_year_id", financialYearId);
      const { data } = await btQuery;
      return data || [];
    },
    enabled: !!teacherId && !!branchId && !!financialYearId,
    staleTime: 5 * 60 * 1000,
  });

  const batchIds = batches.map((b) => b.batch_id);
  const today = new Date().toISOString().split("T")[0];

  // ── 3. Today's sessions ──────────────────────────────────
  const { data: todaySessions = [] } = useQuery({
    queryKey: ["teacher-today-sessions", batchIds, today, branchId, financialYearId],
    queryFn: async () => {
      let query = supabase
        .from("attendance_sessions")
        .select(`id, attendance_date, topic_covered, batches(batch_name)`)
        .in("batch_id", batchIds)
        .eq("attendance_date", today);
      if (branchId) query = query.eq("branch_id", branchId);
      if (financialYearId) query = query.eq("financial_year_id", financialYearId);
      const { data } = await query;
      return data || [];
    },
    enabled: batchIds.length > 0 && !!branchId && !!financialYearId,
  });

  // ── 4. Upcoming homework ─────────────────────────────────
  const { data: homeworks = [] } = useQuery({
    queryKey: ["teacher-homeworks", batchIds, today, branchId, financialYearId],
    queryFn: async () => {
      let query = supabase
        .from("homework")
        .select(`id, title, due_date, batches(batch_name), subjects(subject_name)`)
        .in("batch_id", batchIds)
        .gte("due_date", today)
        .order("due_date", { ascending: true })
        .limit(5);
      if (branchId) query = query.eq("branch_id", branchId);
      if (financialYearId) query = query.eq("financial_year_id", financialYearId);
      const { data } = await query;
      return data || [];
    },
    enabled: batchIds.length > 0 && !!branchId && !!financialYearId,
  });

  // ── 5. Upcoming exams ────────────────────────────────────
  const { data: exams = [] } = useQuery({
    queryKey: ["teacher-exams", batchIds, today, branchId, financialYearId],
    queryFn: async () => {
      let query = supabase
        .from("exams")
        .select(`id, exam_name, exam_date, total_marks, batches(batch_name)`)
        .in("batch_id", batchIds)
        .gte("exam_date", today)
        .order("exam_date", { ascending: true })
        .limit(5);
      if (branchId) query = query.eq("branch_id", branchId);
      if (financialYearId) query = query.eq("financial_year_id", financialYearId);
      const { data } = await query;
      return data || [];
    },
    enabled: batchIds.length > 0 && !!branchId && !!financialYearId,
  });

  // ── 6. Attendance trend (last 30 days) ────────────────────
  const { data: attendanceTrend = [] } = useQuery({
    queryKey: ["teacher-attendance-trend", batchIds, branchId, financialYearId],
    queryFn: async () => {
      const thirtyDaysAgo = new Date();
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
      const startDate = thirtyDaysAgo.toISOString().split("T")[0];

      let sessionsQuery = supabase
        .from("attendance_sessions")
        .select(`id, attendance_date`)
        .in("batch_id", batchIds)
        .gte("attendance_date", startDate)
        .order("attendance_date", { ascending: true });
      if (branchId) sessionsQuery = sessionsQuery.eq("branch_id", branchId);
      if (financialYearId) sessionsQuery = sessionsQuery.eq("financial_year_id", financialYearId);
      const { data: sessions } = await sessionsQuery;
      if (!sessions?.length) return [];

      const sessionIds = sessions.map((s) => s.id);
      let marksQuery = supabase
        .from("student_attendance")
        .select("session_id, status")
        .in("session_id", sessionIds);
      if (branchId) marksQuery = marksQuery.eq("branch_id", branchId);
      if (financialYearId) marksQuery = marksQuery.eq("financial_year_id", financialYearId);
      const { data: marks } = await marksQuery;

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
    enabled: batchIds.length > 0 && !!branchId && !!financialYearId,
  });

  // ── 7. Unread notifications ──────────────────────────────
  const { data: unreadCount = 0 } = useQuery({
    queryKey: ["teacher-notifications-unread", user?.id, branchId, financialYearId],
    queryFn: async () => {
      if (!user?.id || !branchId || !financialYearId) return 0;
      let query = supabase
        .from("notifications")
        .select("*", { count: "exact", head: true })
        .eq("user_id", user.id)
        .eq("is_read", false);
      if (branchId) query = query.eq("branch_id", branchId);
      if (financialYearId) query = query.eq("financial_year_id", financialYearId);
      const { count } = await query;
      return count || 0;
    },
    enabled: !!user?.id && !!branchId && !!financialYearId,
  });

  // ── 8. Salary & leave summary ─────────────────────────────
  const { data: salaryInfo } = useQuery({
    queryKey: ["teacher-salary-info", teacherId, branchId, financialYearId],
    queryFn: async () => {
      if (!teacherId || !branchId || !financialYearId) return { lastSalary: null, lastSalaryDate: null, pendingLeaves: 0 };
      let paymentsQuery = supabase
        .from("salary_payments")
        .select("net_amount, payment_date")
        .eq("teacher_id", teacherId)
        .order("payment_date", { ascending: false })
        .limit(1);
      if (branchId) paymentsQuery = paymentsQuery.eq("branch_id", branchId);
      if (financialYearId) paymentsQuery = paymentsQuery.eq("financial_year_id", financialYearId);
      const { data: payments } = await paymentsQuery;

      let leavesQuery = supabase
        .from("leaves")
        .select("*", { count: "exact", head: true })
        .eq("teacher_id", teacherId)
        .eq("status", "Pending");
      if (branchId) leavesQuery = leavesQuery.eq("branch_id", branchId);
      if (financialYearId) leavesQuery = leavesQuery.eq("financial_year_id", financialYearId);
      const { count: pendingLeaves } = await leavesQuery;

      return {
        lastSalary: payments?.[0]?.net_amount || null,
        lastSalaryDate: payments?.[0]?.payment_date || null,
        pendingLeaves: pendingLeaves || 0,
      };
    },
    enabled: !!teacherId && !!branchId && !!financialYearId,
  });

  const isLoading = teacherLoading || batchesLoading;

  return (
    <div className="p-4 space-y-6">
      {/* Header */}
      <Row gutter={[16, 16]} align="middle" justify="space-between">
        <Col>
          <Title level={2} className="font-heading text-primary !mb-1">
            Welcome, {profile?.full_name || user?.email || "Teacher"}!
          </Title>
          <Text className="text-gray-500 dark:text-gray-400 font-body">
            Your teaching dashboard
          </Text>
        </Col>
        {unreadCount > 0 && (
          <Col>
            <Badge count={unreadCount} offset={[10, 0]}>
              <Link to="/notifications">
                <Button icon={<Bell size={16} />} className="border-accent text-accent font-body">
                  Notifications
                </Button>
              </Link>
            </Badge>
          </Col>
        )}
      </Row>

      {/* Quick Actions */}
      <Row gutter={[16, 16]} style={{ marginTop: 24 }}>
        <Col xs={12} sm={6}>
          <Link to="/attendance">
            <Card variant="outlined" className="border-primary/20 !p-4 flex items-center gap-3">
              <CalendarCheck size={24} className="text-primary" />
              <span className="font-body font-medium text-gray-700 dark:text-gray-200">Mark Attendance</span>
            </Card>
          </Link>
        </Col>
        <Col xs={12} sm={6}>
          <Link to="/homework">
            <Card variant="outlined" className="border-primary/20 !p-4 flex items-center gap-3">
              <Plus size={24} className="text-primary" />
              <span className="font-body font-medium text-gray-700 dark:text-gray-200">Add Homework</span>
            </Card>
          </Link>
        </Col>
        <Col xs={12} sm={6}>
          <Link to="/exams">
            <Card variant="outlined" className="border-primary/20 !p-4 flex items-center gap-3">
              <ClipboardCheck size={24} className="text-primary" />
              <span className="font-body font-medium text-gray-700 dark:text-gray-200">Create Exam</span>
            </Card>
          </Link>
        </Col>
        <Col xs={12} sm={6}>
          <Link to="/online-classes">
            <Card variant="outlined" className="border-primary/20 !p-4 flex items-center gap-3">
              <Video size={24} className="text-primary" />
              <span className="font-body font-medium text-gray-700 dark:text-gray-200">Online Classes</span>
            </Card>
          </Link>
        </Col>
      </Row>

      {/* Stats */}
      <Row gutter={[16, 16]}>
        <Col xs={12} sm={6}>
          <Card variant="outlined" className="border-primary/20">
            <Statistic
              title={<span className="font-body text-gray-500 dark:text-gray-400">My Batches</span>}
              value={isLoading ? '...' : batches.length}
              prefix={<Layers size={20} className="text-primary" />}
              valueStyle={{ color: primaryColor, fontFamily: headingFont }}
            />
          </Card>
        </Col>
        <Col xs={12} sm={6}>
          <Card variant="outlined" className="border-primary/20">
            <Statistic
              title={<span className="font-body text-gray-500 dark:text-gray-400">Today's Sessions</span>}
              value={isLoading ? '...' : todaySessions.length}
              prefix={<CalendarCheck size={20} className="text-primary" />}
              valueStyle={{ color: primaryColor, fontFamily: headingFont }}
            />
          </Card>
        </Col>
        <Col xs={12} sm={6}>
          <Card variant="outlined" className="border-primary/20">
            <Statistic
              title={<span className="font-body text-gray-500 dark:text-gray-400">Upcoming Homework</span>}
              value={isLoading ? '...' : homeworks.length}
              prefix={<BookOpen size={20} className="text-primary" />}
              valueStyle={{ color: primaryColor, fontFamily: headingFont }}
            />
          </Card>
        </Col>
        <Col xs={12} sm={6}>
          <Card variant="outlined" className="border-primary/20">
            <Statistic
              title={<span className="font-body text-gray-500 dark:text-gray-400">Upcoming Exams</span>}
              value={isLoading ? '...' : exams.length}
              prefix={<Award size={20} className="text-primary" />}
              valueStyle={{ color: primaryColor, fontFamily: headingFont }}
            />
          </Card>
        </Col>
      </Row>

      {/* Salary & Leave + Chart */}
      <Row gutter={[16, 16]}>
        <Col xs={24} lg={8}>
          <Card variant="outlined" className="border-primary/20" title={<span className="font-heading text-primary"><Wallet size={18} className="inline mr-2" /> Salary & Leave</span>}>
            <div className="font-body space-y-2">
              {salaryInfo?.lastSalary ? (
                <div className="flex justify-between text-sm">
                  <span className="text-gray-500 dark:text-gray-400">Last Salary</span>
                  <span className="font-semibold text-accent">₹{Number(salaryInfo.lastSalary).toLocaleString()}</span>
                </div>
              ) : (
                <p className="text-gray-500 dark:text-gray-400 text-sm">No salary records yet.</p>
              )}
              {salaryInfo?.lastSalaryDate && (
                <div className="flex justify-between text-sm">
                  <span className="text-gray-500 dark:text-gray-400">Paid On</span>
                  <span className="font-medium text-gray-700 dark:text-gray-200">{salaryInfo.lastSalaryDate}</span>
                </div>
              )}
              <div className="flex justify-between text-sm">
                <span className="text-gray-500 dark:text-gray-400">Pending Leaves</span>
                <span className={`font-semibold ${salaryInfo?.pendingLeaves > 0 ? 'text-accent' : 'text-accent'}`}>{salaryInfo?.pendingLeaves ?? 0}</span>
              </div>
              <Space className="mt-3">
                <Link to="/teacher/salary"><Button size="small" className="border-primary text-primary font-body">My Salary</Button></Link>
                <Link to="/teacher/leaves"><Button size="small" className="border-primary text-primary font-body">My Leaves</Button></Link>
              </Space>
            </div>
          </Card>
        </Col>
        <Col xs={24} lg={16}>
          <Card variant="outlined" className="border-primary/20" title={<span className="font-heading text-primary"><TrendingUp size={18} className="inline mr-2" /> Attendance Trend (Last 30 Days)</span>}>
            {attendanceTrend.length === 0 ? (
              <p className="text-center py-5 text-gray-500 dark:text-gray-400 font-body">No attendance data yet.</p>
            ) : (
              <ResponsiveContainer width="100%" height={200}>
                <LineChart data={attendanceTrend}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="date" fontSize={11} />
                  <YAxis domain={[0, 100]} fontSize={11} unit="%" />
                  <Tooltip formatter={(value) => `${value}%`} />
                  <Line type="monotone" dataKey="attendance" stroke={primaryColor} strokeWidth={2} dot={false} name="Attendance %" />
                </LineChart>
              </ResponsiveContainer>
            )}
          </Card>
        </Col>
      </Row>

      {/* Lists */}
      <Row gutter={[16, 16]}>
        <Col xs={24} lg={12}>
          <Card variant="outlined" className="border-primary/20" title={<span className="font-heading text-primary"><Layers size={18} className="inline mr-2" /> My Batches</span>}>
            {isLoading ? (
              <p className="font-body text-gray-500 dark:text-gray-400">Loading...</p>
            ) : batches.length === 0 ? (
              <p className="font-body text-gray-500 dark:text-gray-400">No batches assigned.</p>
            ) : (
              <List dataSource={batches} renderItem={(item) => (
                <List.Item>
                  <div className="flex justify-between w-full font-body text-sm text-gray-700 dark:text-gray-200">
                    <span>{item.batches?.batch_name} ({item.batches?.courses?.course_name})</span>
                    <span className="text-gray-500 dark:text-gray-400">{item.batches?.start_time} – {item.batches?.end_time}</span>
                  </div>
                </List.Item>
              )} />
            )}
          </Card>
        </Col>
        <Col xs={24} lg={12}>
          <Card variant="outlined" className="border-primary/20" title={<span className="font-heading text-primary"><CalendarCheck size={18} className="inline mr-2" /> Today's Sessions</span>}>
            {todaySessions.length === 0 ? (
              <p className="font-body text-gray-500 dark:text-gray-400">No sessions today.</p>
            ) : (
              <List dataSource={todaySessions} renderItem={(item) => (
                <List.Item actions={[<Link to={`/attendance/mark/${item.id}`} className="text-primary font-body">Mark</Link>]}>
                  <div className="font-body text-sm text-gray-700 dark:text-gray-200">{item.batches?.batch_name} – {item.topic_covered || "No topic"}</div>
                </List.Item>
              )} />
            )}
          </Card>
        </Col>
        <Col xs={24} lg={12}>
          <Card variant="outlined" className="border-primary/20" title={<span className="font-heading text-primary"><BookOpen size={18} className="inline mr-2" /> Upcoming Homework</span>} extra={<Link to="/homework" className="text-primary font-body text-xs">View all →</Link>}>
            {homeworks.length === 0 ? (
              <p className="font-body text-gray-500 dark:text-gray-400">No upcoming homework.</p>
            ) : (
              <List dataSource={homeworks} renderItem={(item) => (
                <List.Item>
                  <div className="font-body text-sm">
                    <div className="text-gray-800 dark:text-gray-100"><strong>{item.title}</strong> – {item.subjects?.subject_name} ({item.batches?.batch_name})</div>
                    <div className="text-gray-500 dark:text-gray-400 text-xs">Due: {item.due_date}</div>
                  </div>
                </List.Item>
              )} />
            )}
          </Card>
        </Col>
        <Col xs={24} lg={12}>
          <Card variant="outlined" className="border-primary/20" title={<span className="font-heading text-primary"><Award size={18} className="inline mr-2" /> Upcoming Exams</span>} extra={<Link to="/exams" className="text-primary font-body text-xs">View all →</Link>}>
            {exams.length === 0 ? (
              <p className="font-body text-gray-500 dark:text-gray-400">No upcoming exams.</p>
            ) : (
              <List dataSource={exams} renderItem={(item) => (
                <List.Item>
                  <div className="font-body text-sm">
                    <div className="text-gray-800 dark:text-gray-100"><strong>{item.exam_name}</strong> – {item.batches?.batch_name}</div>
                    <div className="text-gray-500 dark:text-gray-400 text-xs">{item.exam_date} | Total: {item.total_marks}</div>
                  </div>
                </List.Item>
              )} />
            )}
          </Card>
        </Col>
      </Row>
    </div>
  );
}