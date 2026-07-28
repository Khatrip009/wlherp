// src/pages/StudentProfile.jsx
import { useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Avatar,
  Card,
  Descriptions,
  Tag,
  Tabs,
  Table,
  Progress,
  Button,
  Space,
  Typography,
  Drawer,
  Select,
  message,
  Timeline,
  Tooltip,
  Row,
  Col,
  Statistic,
  Badge,
} from "antd";
import {
  UserOutlined,
  PhoneOutlined,
  MailOutlined,
  IdcardOutlined,
  EditOutlined,
  FileTextOutlined,
  DollarOutlined,
  SwapOutlined,
  CalendarOutlined,
  CheckCircleOutlined,
  CloseCircleOutlined,
  MessageOutlined,
} from "@ant-design/icons";
import { supabase } from "../api/supabase";
import StudentForm from "../components/StudentForm";
import FeeManagement from "../components/FeeManagement";
import { useAuth } from "../context/AuthContext";
import { useOrg } from "../context/OrganizationContext";
import { useTheme } from "../context/ThemeContext"; // 👈 import theme
import { assignStudentToBatch } from "../services/batchAssignmentService";
import BackButton from "../components/BackButton";
import { generateAdmissionPdf } from "../utils/admissionPdf";

const { Text, Title } = Typography;
const formatCurrency = (amount) => `₹${Number(amount).toLocaleString("en-IN")}`;

export default function StudentProfile({ studentId: propStudentId = null, standalone = true }) {
  const { id: urlId } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const queryClient = useQueryClient();

  const { branch, selectedFinancialYear } = useOrg();
  const theme = useTheme(); // 👈 get theme colours
  const branchId = branch?.id;
  const financialYearId = selectedFinancialYear?.id;
  const ctx = { branchId, financialYearId };

  // ── local UI state ──
  const [editingStudent, setEditingStudent] = useState(null);
  const [feeDrawerOpen, setFeeDrawerOpen] = useState(false);
  const [batchDrawerOpen, setBatchDrawerOpen] = useState(false);
  const [selectedBatchId, setSelectedBatchId] = useState(null);
  const [assigningBatch, setAssigningBatch] = useState(false);

  // ── Hook: resolve student ID ──
  const { data: resolvedStudentId, isLoading: resolving } = useQuery({
    queryKey: ["resolve-student-id", urlId, user?.id, branchId, financialYearId, propStudentId],
    queryFn: async () => {
      if (propStudentId) return propStudentId;
      if (urlId) return urlId;
      if (!user?.id || !branchId || !financialYearId) return null;
      const { data, error } = await supabase
        .from("students")
        .select("id")
        .eq("user_id", user.id)
        .eq("branch_id", branchId)
        .eq("financial_year_id", financialYearId)
        .maybeSingle();
      if (error) {
        console.error("Error resolving student ID:", error);
        return null;
      }
      return data?.id || null;
    },
    enabled: (!!user?.id || !!urlId || !!propStudentId) && !!branchId && !!financialYearId,
    staleTime: 5 * 60 * 1000,
  });

  const targetId = resolvedStudentId;

  // ── Hook: fetch student data ──
  const {
    data: student,
    isLoading: studentLoading,
    error: studentError,
  } = useQuery({
    queryKey: ["student", targetId, branchId, financialYearId],
    queryFn: async () => {
      if (!targetId) return null;
      let query = supabase.from("students").select("*").eq("id", targetId);
      if (branchId) query = query.eq("branch_id", branchId);
      if (financialYearId) query = query.eq("financial_year_id", financialYearId);
      const { data, error } = await query.maybeSingle();
      if (error) throw error;
      return data;
    },
    enabled: !!targetId && !!branchId && !!financialYearId,
    retry: false,
  });

  // ── Hook: parents ──
  const { data: parents = [] } = useQuery({
    queryKey: ["student-parents", targetId, branchId, financialYearId],
    queryFn: async () => {
      let query = supabase
        .from("student_parents")
        .select("relation, parents(*)")
        .eq("student_id", targetId);
      if (branchId) query = query.eq("branch_id", branchId);
      if (financialYearId) query = query.eq("financial_year_id", financialYearId);
      const { data, error } = await query;
      if (error) throw error;
      return (data || [])
        .filter((item) => item.parents !== null)
        .map((item) => item.parents);
    },
    enabled: !!targetId && !!branchId && !!financialYearId,
  });

  // ── Hook: batches ──
  const { data: batches = [] } = useQuery({
    queryKey: ["student-batches", targetId, branchId, financialYearId],
    queryFn: async () => {
      let query = supabase
        .from("student_batches")
        .select(`batch_id, enrollment_date, batches(batch_name, course_id, courses(course_name))`)
        .eq("student_id", targetId)
        .eq("status", "active");
      if (branchId) query = query.eq("branch_id", branchId);
      if (financialYearId) query = query.eq("financial_year_id", financialYearId);
      const { data, error } = await query;
      if (error) throw error;
      return data || [];
    },
    enabled: !!targetId && !!branchId && !!financialYearId,
  });

  // ── Hook: fee summary ──
  const { data: feeSummary = { totalFee: 0, totalPaid: 0, pending: 0 } } = useQuery({
    queryKey: ["student-fee-summary", targetId, branchId, financialYearId],
    queryFn: async () => {
      let feesQuery = supabase
        .from("student_fees")
        .select("id, final_fee")
        .eq("student_id", targetId);
      if (branchId) feesQuery = feesQuery.eq("branch_id", branchId);
      if (financialYearId) feesQuery = feesQuery.eq("financial_year_id", financialYearId);
      const { data: fees, error } = await feesQuery;
      if (error) throw error;

      let totalFee = 0, totalPaid = 0;
      for (const fee of fees || []) {
        totalFee += Number(fee.final_fee);
        let paymentsQuery = supabase
          .from("fee_payments")
          .select("amount")
          .eq("student_fee_id", fee.id);
        if (branchId) paymentsQuery = paymentsQuery.eq("branch_id", branchId);
        if (financialYearId) paymentsQuery = paymentsQuery.eq("financial_year_id", financialYearId);
        const { data: payments } = await paymentsQuery;
        totalPaid += payments?.reduce((sum, p) => sum + Number(p.amount), 0) || 0;
      }
      const pending = Math.max(totalFee - totalPaid, 0);
      return { totalFee, totalPaid, pending };
    },
    enabled: !!targetId && !!branchId && !!financialYearId,
  });

  // ── Hook: attendance ──
  const { data: attendanceStats = { percentage: 0, totalSessions: 0, presentCount: 0 } } = useQuery({
    queryKey: ["student-attendance", targetId, branchId, financialYearId],
    queryFn: async () => {
      let batchQuery = supabase
        .from("student_batches")
        .select("batch_id")
        .eq("student_id", targetId)
        .eq("status", "active");
      if (branchId) batchQuery = batchQuery.eq("branch_id", branchId);
      if (financialYearId) batchQuery = batchQuery.eq("financial_year_id", financialYearId);
      const { data: batchRows } = await batchQuery;
      if (!batchRows?.length) return { percentage: 0, totalSessions: 0, presentCount: 0 };
      const batchIds = batchRows.map((r) => r.batch_id);
      let sessionQuery = supabase
        .from("attendance_sessions")
        .select("id")
        .in("batch_id", batchIds);
      if (branchId) sessionQuery = sessionQuery.eq("branch_id", branchId);
      if (financialYearId) sessionQuery = sessionQuery.eq("financial_year_id", financialYearId);
      const { data: sessions } = await sessionQuery;
      if (!sessions?.length) return { percentage: 0, totalSessions: 0, presentCount: 0 };
      const sessionIds = sessions.map((s) => s.id);
      let marksQuery = supabase
        .from("student_attendance")
        .select("status")
        .eq("student_id", targetId)
        .in("session_id", sessionIds);
      if (branchId) marksQuery = marksQuery.eq("branch_id", branchId);
      if (financialYearId) marksQuery = marksQuery.eq("financial_year_id", financialYearId);
      const { data: marks } = await marksQuery;
      const total = sessionIds.length;
      const present = marks?.filter((m) => m.status === "Present").length || 0;
      const percentage = total > 0 ? ((present / total) * 100).toFixed(1) : 0;
      return { percentage, totalSessions: total, presentCount: present };
    },
    enabled: !!targetId && !!branchId && !!financialYearId,
  });

  // ── Hook: recent results ──
  const { data: recentResults = [] } = useQuery({
    queryKey: ["student-results", targetId, branchId, financialYearId],
    queryFn: async () => {
      let query = supabase
        .from("student_results")
        .select(`marks_obtained, remarks, exams(exam_name, exam_date, total_marks)`)
        .eq("student_id", targetId)
        .order("exam_id", { ascending: false })
        .limit(3);
      if (branchId) query = query.eq("branch_id", branchId);
      if (financialYearId) query = query.eq("financial_year_id", financialYearId);
      const { data } = await query;
      return data || [];
    },
    enabled: !!targetId && !!branchId && !!financialYearId,
  });

  // ── Hook: progress evaluations ──
  const { data: progressEvaluations = [] } = useQuery({
    queryKey: ["student-progress", targetId, branchId, financialYearId],
    queryFn: async () => {
      let query = supabase
        .from("student_progress")
        .select("evaluation_date, performance_score, teacher_remarks")
        .eq("student_id", targetId)
        .order("evaluation_date", { ascending: false })
        .limit(3);
      if (branchId) query = query.eq("branch_id", branchId);
      if (financialYearId) query = query.eq("financial_year_id", financialYearId);
      const { data } = await query;
      return data || [];
    },
    enabled: !!targetId && !!branchId && !!financialYearId,
  });

  // ── Hook: document count ──
  const { data: documentCount = 0 } = useQuery({
    queryKey: ["student-documents-count", targetId, branchId, financialYearId],
    queryFn: async () => {
      let query = supabase
        .from("student_documents")
        .select("*", { count: "exact", head: true })
        .eq("student_id", targetId);
      if (branchId) query = query.eq("branch_id", branchId);
      if (financialYearId) query = query.eq("financial_year_id", financialYearId);
      const { count } = await query;
      return count || 0;
    },
    enabled: !!targetId && !!branchId && !!financialYearId,
  });

  // ── Hook: recent activities ──
  const { data: recentActivities = [] } = useQuery({
    queryKey: ["student-activities", targetId, branchId, financialYearId],
    queryFn: async () => {
      if (!targetId) return [];

      // 1. Fetch recent payments
      let payments = [];
      const { data: feeIds } = await supabase
        .from("student_fees")
        .select("id")
        .eq("student_id", targetId);
      const feeIdList = feeIds?.map(f => f.id) || [];

      if (feeIdList.length > 0) {
        let paymentQuery = supabase
          .from("fee_payments")
          .select("payment_date, amount, receipt_number")
          .in("student_fee_id", feeIdList)
          .order("payment_date", { ascending: false })
          .limit(3);
        if (branchId) paymentQuery = paymentQuery.eq("branch_id", branchId);
        if (financialYearId) paymentQuery = paymentQuery.eq("financial_year_id", financialYearId);
        const { data } = await paymentQuery;
        payments = data || [];
      }

      // 2. Fetch recent attendance
      let attendance = [];
      const { data: batchRows } = await supabase
        .from("student_batches")
        .select("batch_id")
        .eq("student_id", targetId)
        .eq("status", "active");
      const batchIds = batchRows?.map(b => b.batch_id) || [];
      let sessionIds = [];
      if (batchIds.length > 0) {
        let sessionQuery = supabase
          .from("attendance_sessions")
          .select("id, attendance_date")
          .in("batch_id", batchIds);
        if (branchId) sessionQuery = sessionQuery.eq("branch_id", branchId);
        if (financialYearId) sessionQuery = sessionQuery.eq("financial_year_id", financialYearId);
        const { data: sessions } = await sessionQuery;
        const sessionDateMap = {};
        sessions?.forEach(s => { sessionDateMap[s.id] = s.attendance_date; });
        sessionIds = sessions?.map(s => s.id) || [];
      }

      if (sessionIds.length > 0) {
        let attendanceQuery = supabase
          .from("student_attendance")
          .select("session_id, status")
          .eq("student_id", targetId)
          .in("session_id", sessionIds)
          .limit(3);
        if (branchId) attendanceQuery = attendanceQuery.eq("branch_id", branchId);
        if (financialYearId) attendanceQuery = attendanceQuery.eq("financial_year_id", financialYearId);
        const { data } = await attendanceQuery;
        attendance = data || [];
      }

      const activities = [];
      payments.forEach(p => {
        activities.push({
          date: p.payment_date,
          description: `Fee payment of ${formatCurrency(p.amount)} received`,
          icon: <DollarOutlined style={{ color: theme.accent_color }} />,
        });
      });
      attendance?.forEach(a => {
        const date = sessionDateMap?.[a.session_id] || null;
        activities.push({
          date: date || new Date().toISOString().split('T')[0],
          description: `Attendance marked as ${a.status}`,
          icon: a.status === 'Present' ? <CheckCircleOutlined style={{ color: theme.accent_color }} /> : <CloseCircleOutlined style={{ color: theme.accent_dark_color }} />,
        });
      });

      activities.sort((a, b) => new Date(b.date) - new Date(a.date));
      return activities.slice(0, 5);
    },
    enabled: !!targetId && !!branchId && !!financialYearId,
  });

  // ── Hook: available batches ──
  const { data: availableBatches = [] } = useQuery({
    queryKey: ["available-batches", branchId, financialYearId],
    queryFn: async () => {
      let query = supabase
        .from("batches")
        .select("id, batch_name")
        .eq("status", "active")
        .order("batch_name");
      if (branchId) query = query.eq("branch_id", branchId);
      if (financialYearId) query = query.eq("financial_year_id", financialYearId);
      const { data } = await query;
      return data || [];
    },
    enabled: !!branchId && !!financialYearId,
  });

  // ── Now the render logic ──
  const isLoading = resolving || studentLoading;
  const isError = studentError;

  if (standalone && !isLoading && !targetId && !urlId) {
    return (
      <div style={{ textAlign: "center", padding: 40 }} className="text-gray-700 dark:text-gray-300">
        <h2 className="text-primary font-heading">No Student Selected</h2>
        <p>Please select a student from the list to view their profile.</p>
        <Button type="primary" className="bg-primary hover:bg-primary-light" onClick={() => navigate("/students")}>
          Go to Students
        </Button>
      </div>
    );
  }

  if (!standalone && !targetId) {
    return (
      <div style={{ textAlign: "center", padding: 40 }} className="text-gray-500 dark:text-gray-400">
        <Text type="secondary" className="text-gray-500 dark:text-gray-400">
          Select a student from the dropdown above.
        </Text>
      </div>
    );
  }

  if (isLoading) {
    return <div style={{ textAlign: "center", padding: 40 }} className="text-gray-500 dark:text-gray-400">Loading…</div>;
  }

  if (isError) {
    return <div style={{ textAlign: "center", padding: 40 }} className="text-accent-dark">Error loading student: {studentError?.message}</div>;
  }

  if (!student) {
    return <div style={{ textAlign: "center", padding: 40 }} className="text-gray-500 dark:text-gray-400">Student not found.</div>;
  }

  // ── Batch assignment handler ──
  const handleBatchAssign = async () => {
    if (!selectedBatchId) return;
    setAssigningBatch(true);
    try {
      await assignStudentToBatch(
        { student_id: targetId, batch_id: selectedBatchId },
        ctx
      );
      message.success("Batch assigned");
      queryClient.invalidateQueries({ queryKey: ["student-batches", targetId] });
      queryClient.invalidateQueries({ queryKey: ["student-batches"] });
      setBatchDrawerOpen(false);
      setSelectedBatchId(null);
    } catch (err) {
      message.error(err.message || "Failed to assign batch");
    } finally {
      setAssigningBatch(false);
    }
  };

  // ── Quick Actions ──
  const quickActions = [
    {
      label: "Collect Fee",
      icon: <DollarOutlined />,
      onClick: () => setFeeDrawerOpen(true),
      className: "bg-accent hover:bg-accent-light",
    },
    {
      label: "Mark Attendance",
      icon: <CalendarOutlined />,
      onClick: () => navigate(`/attendance/mark?student=${targetId}`),
      className: "bg-primary hover:bg-primary-light",
    },
    {
      label: "Send Message",
      icon: <MessageOutlined />,
      onClick: () => message.info("Send message feature coming soon"),
      className: "bg-primary-dark hover:bg-primary-dark",
    },
    {
      label: "Edit Profile",
      icon: <EditOutlined />,
      onClick: () => setEditingStudent(student),
      className: "bg-accent-dark hover:bg-accent-dark",
    },
    {
      label: "Admission Form",
      icon: <FileTextOutlined />,
      onClick: () => generateAdmissionPdf(student.id),
      className: "bg-primary hover:bg-primary-light",
    },
  ];

  // ── Tab items ──
  const tabItems = [
    {
      key: "personal",
      label: "Personal Info",
      children: (
        <div>
          <Row gutter={[16, 16]}>
            <Col span={24}>
              <Card title="Basic Details" size="small" className="bg-white dark:bg-accent border-gray-200 dark:border-gray-700">
                <Descriptions bordered column={{ xs: 1, sm: 2 }} size="small">
                  <Descriptions.Item label="Gender">{student.gender || "—"}</Descriptions.Item>
                  <Descriptions.Item label="Date of Birth">{student.dob || "—"}</Descriptions.Item>
                  <Descriptions.Item label="Mobile"><PhoneOutlined /> {student.mobile || "—"}</Descriptions.Item>
                  {student.whatsapp && <Descriptions.Item label="WhatsApp">{student.whatsapp}</Descriptions.Item>}
                  <Descriptions.Item label="Email"><MailOutlined /> {student.email || "—"}</Descriptions.Item>
                  <Descriptions.Item label="Address">
                    {[student.address, student.city, student.state, student.pincode].filter(Boolean).join(", ") || "—"}
                  </Descriptions.Item>
                  <Descriptions.Item label="School">{student.school_name || "—"}</Descriptions.Item>
                  <Descriptions.Item label="Board">{student.board || "—"}</Descriptions.Item>
                  <Descriptions.Item label="Joining Date">{student.joining_date || "—"}</Descriptions.Item>
                </Descriptions>
              </Card>
            </Col>
            <Col span={24}>
              <Card title="Parents / Guardians" size="small" className="bg-white dark:bg-accent border-gray-200 dark:border-gray-700">
                {parents.length ? (
                  <Descriptions bordered size="small">
                    {parents.map((p, idx) => (
                      <Descriptions.Item key={idx} label="Name">
                        {p.father_name || p.mother_name || "—"} <br />
                        {p.mobile && <PhoneOutlined />} {p.mobile} {p.email && `| ${p.email}`}
                      </Descriptions.Item>
                    ))}
                  </Descriptions>
                ) : (
                  <Text type="secondary" className="text-gray-500 dark:text-gray-400">No parents linked</Text>
                )}
              </Card>
            </Col>
          </Row>
          <Card title="Recent Activity" size="small" style={{ marginTop: 16 }} className="bg-white dark:bg-accent border-gray-200 dark:border-gray-700">
            {recentActivities.length ? (
              <Timeline
                items={recentActivities.map((act) => ({
                  dot: act.icon || <CalendarOutlined style={{ color: theme.primary_color }} />,
                  children: (
                    <div>
                      <Text strong>{act.description}</Text>
                      <br />
                      <Text type="secondary" style={{ fontSize: 12 }} className="text-gray-500 dark:text-gray-400">
                        {new Date(act.date).toLocaleDateString("en-IN", {
                          day: "numeric",
                          month: "short",
                          year: "numeric",
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                      </Text>
                    </div>
                  ),
                }))}
              />
            ) : (
              <Text type="secondary" className="text-gray-500 dark:text-gray-400">No recent activity</Text>
            )}
          </Card>
        </div>
      ),
    },
    {
      key: "academics",
      label: "Academics",
      children: (
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
          <Card
            title="Current Batches"
            size="small"
            extra={
              <Button type="link" icon={<SwapOutlined />} onClick={() => setBatchDrawerOpen(true)} className="text-primary">
                Change
              </Button>
            }
            className="bg-white dark:bg-accent border-gray-200 dark:border-gray-700"
          >
            {batches.length ? (
              <ul style={{ paddingLeft: 18 }}>
                {batches.map((b) => (
                  <li key={b.batch_id}>
                    {b.batches?.batch_name} ({b.batches?.courses?.course_name})
                  </li>
                ))}
              </ul>
            ) : (
              <Text type="secondary" className="text-gray-500 dark:text-gray-400">Not assigned</Text>
            )}
          </Card>
          <Card title="Attendance" size="small" className="bg-white dark:bg-accent border-gray-200 dark:border-gray-700">
            <Progress
              percent={Number(attendanceStats.percentage)}
              size="small"
              status={Number(attendanceStats.percentage) > 75 ? "active" : "exception"}
            />
            <Text type="secondary" className="text-gray-500 dark:text-gray-400">
              {attendanceStats.presentCount} present / {attendanceStats.totalSessions} sessions
            </Text>
          </Card>
          <Card title="Recent Results" size="small" className="bg-white dark:bg-accent border-gray-200 dark:border-gray-700">
            {recentResults.length ? (
              <Table
                dataSource={recentResults}
                rowKey={(record) => record.id || Math.random()}
                columns={[
                  { title: "Exam", dataIndex: ["exams", "exam_name"] },
                  { title: "Date", dataIndex: ["exams", "exam_date"] },
                  { title: "Marks", render: (_, r) => `${r.marks_obtained}${r.exams?.total_marks ? `/${r.exams.total_marks}` : ""}` },
                  { title: "Remarks", dataIndex: "remarks" },
                ]}
                pagination={false}
                size="small"
              />
            ) : <Text type="secondary" className="text-gray-500 dark:text-gray-400">No exam results yet</Text>}
          </Card>
          <Card title="Progress Evaluations" size="small" className="bg-white dark:bg-accent border-gray-200 dark:border-gray-700">
            {progressEvaluations.length ? (
              <Table
                dataSource={progressEvaluations}
                rowKey={(record) => record.id || Math.random()}
                columns={[
                  { title: "Date", dataIndex: "evaluation_date" },
                  { title: "Score", dataIndex: "performance_score" },
                  { title: "Remarks", dataIndex: "teacher_remarks" },
                ]}
                pagination={false}
                size="small"
              />
            ) : <Text type="secondary" className="text-gray-500 dark:text-gray-400">No evaluations yet</Text>}
          </Card>
        </div>
      ),
    },
    {
      key: "finance",
      label: "Finance",
      children: (
        <div>
          <Card
            title="Fee Summary"
            size="small"
            extra={
              <Button type="link" icon={<DollarOutlined />} onClick={() => setFeeDrawerOpen(true)} className="text-primary">
                Manage
              </Button>
            }
            className="bg-white dark:bg-accent border-gray-200 dark:border-gray-700"
          >
            <Row gutter={16}>
              <Col span={8}>
                <Statistic title="Total Fee" value={feeSummary.totalFee} prefix="₹" />
              </Col>
              <Col span={8}>
                <Statistic
                  title="Paid"
                  value={feeSummary.totalPaid}
                  prefix="₹"
                  valueStyle={{ color: theme.accent_color }}
                />
              </Col>
              <Col span={8}>
                <Statistic
                  title="Pending"
                  value={feeSummary.pending}
                  prefix="₹"
                  valueStyle={{ color: theme.accent_dark_color }}
                />
              </Col>
            </Row>
            <div style={{ marginTop: 16 }}>
              <Button type="primary" className="bg-primary hover:bg-primary-light" onClick={() => setFeeDrawerOpen(true)}>View Full Details</Button>
            </div>
          </Card>
        </div>
      ),
    },
    {
      key: "documents",
      label: "Documents",
      children: (
        <div style={{ textAlign: "center", padding: 20 }} className="bg-white dark:bg-accent border-gray-200 dark:border-gray-700 rounded-xl">
          <FileTextOutlined style={{ fontSize: 48, color: theme.primary_color }} />
          <p style={{ marginTop: 8 }} className="text-gray-700 dark:text-gray-300">{documentCount} files uploaded</p>
          <Button type="primary" className="bg-primary hover:bg-primary-light" onClick={() => navigate(`/student-documents?student=${targetId}`)}>
            Manage Documents
          </Button>
        </div>
      ),
    },
  ];

  return (
    <div>
      {standalone && <BackButton to="/students" label="Students" />}

      <Card style={{ marginBottom: 16 }} bodyStyle={{ padding: 16 }} className="bg-white dark:bg-accent border-gray-200 dark:border-gray-700">
        <Row align="middle" gutter={[16, 16]}>
          <Col>
            <Badge
              count={student.status === "active" ? "Active" : "Inactive"}
              style={{
                backgroundColor: student.status === "active" ? theme.accent_color : theme.accent_dark_color,
              }}
              offset={[-10, 80]}
            >
              <Avatar size={80} src={student.photo_url} icon={!student.photo_url && <UserOutlined />} />
            </Badge>
          </Col>
          <Col flex="auto">
            <div>
              <Title level={4} style={{ margin: 0 }} className="text-primary font-heading">
                {student.first_name} {student.last_name}
              </Title>
              <Space wrap style={{ marginTop: 4 }}>
                {student.admission_no && <Tag icon={<IdcardOutlined />} color="blue">{student.admission_no}</Tag>}
                {batches.length > 0 && (
                  <Tag color="cyan">{batches[0].batches?.batch_name}</Tag>
                )}
                <Tag color={student.status === "active" ? "green" : "default"}>
                  {student.status || "active"}
                </Tag>
              </Space>
              <div style={{ marginTop: 8 }}>
                <Text><PhoneOutlined /> {student.mobile || "—"}</Text>
                {student.email && <Text style={{ marginLeft: 16 }}><MailOutlined /> {student.email}</Text>}
              </div>
            </div>
          </Col>
          <Col>
            <Space wrap>
              {quickActions.map((action) => (
                <Tooltip title={action.label} key={action.label}>
                  <button
                    onClick={action.onClick}
                    className={`w-10 h-10 rounded-full flex items-center justify-center text-white ${action.className}`}
                  >
                    {action.icon}
                  </button>
                </Tooltip>
              ))}
            </Space>
          </Col>
        </Row>
      </Card>

      <Card className="bg-white dark:bg-accent border-gray-200 dark:border-gray-700">
        <Tabs defaultActiveKey="personal" items={tabItems} />
      </Card>

      <FeeManagement
        studentId={targetId}
        open={feeDrawerOpen}
        onClose={() => setFeeDrawerOpen(false)}
      />

      <Drawer
        title="Assign Batch"
        open={batchDrawerOpen}
        onClose={() => setBatchDrawerOpen(false)}
        destroyOnClose
        footer={
          <Space style={{ float: "right" }}>
            <Button onClick={() => setBatchDrawerOpen(false)}>Cancel</Button>
            <Button type="primary" className="bg-primary hover:bg-primary-light" onClick={handleBatchAssign} loading={assigningBatch} disabled={!selectedBatchId}>
              Assign
            </Button>
          </Space>
        }
      >
        <Select
          showSearch
          placeholder="Select batch"
          value={selectedBatchId}
          onChange={setSelectedBatchId}
          style={{ width: "100%" }}
          options={availableBatches.map((b) => ({ label: b.batch_name, value: b.id }))}
          filterOption={(input, option) => (option?.label ?? "").toLowerCase().includes(input.toLowerCase())}
        />
      </Drawer>

      {editingStudent && (
        <StudentForm
          initialData={editingStudent}
          onSuccess={() => {
            queryClient.invalidateQueries({ queryKey: ["student", targetId] });
            queryClient.invalidateQueries({ queryKey: ["students"] });
            setEditingStudent(null);
          }}
          onClose={() => setEditingStudent(null)}
        />
      )}
    </div>
  );
}