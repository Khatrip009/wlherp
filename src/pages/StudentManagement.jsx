// src/pages/StudentManagement.jsx
import { useState, useEffect } from "react";
import { Tabs, Card, Row, Col, Select, message, Button } from "antd";
import { MailOutlined } from "@ant-design/icons";
import { useOrg } from "../context/OrganizationContext";
import { supabase } from "../api/supabase";
import { sendEmail } from "../services/emailService";

// ── Import existing pages ──
import StudentFees from "./StudentFees";
import StudentBatches from "./StudentBatches";
import Attendance from "./Attendance";
import StudentDocuments from "./StudentDocuments";
import StudentExamsPage from "./StudentExamsPage";
import StudentHomeworkPage from "./StudentHomeworkPage";
import StudentResultsPage from "./StudentResultsPage";
import StudentProgressPage from "./StudentProgressPage";
import StudentProfile from "./StudentProfile";
import IssueInventoryModal from "../components/IssueInventoryModal";
import InventoryTransactions from "../pages/InventoryTransactions";

const { TabPane } = Tabs;

export default function StudentManagement() {
  const { branch, selectedFinancialYear, org } = useOrg();
  const branchId = branch?.id;
  const financialYearId = selectedFinancialYear?.id;

  const [selectedStudentId, setSelectedStudentId] = useState(null);
  const [students, setStudents] = useState([]);
  const [activeTab, setActiveTab] = useState("profile");
  const [inventoryModalOpen, setInventoryModalOpen] = useState(false);
  const [sendingReport, setSendingReport] = useState(false);

  // ─── Helper: get student/parent email ──────────────────────────────
  const getStudentParentEmail = async (studentId) => {
    // Fetch student email
    const { data: student, error: studentError } = await supabase
      .from("students")
      .select("email, first_name, last_name")
      .eq("id", studentId)
      .single();
    if (studentError) return null;

    // Try to find parent email
    const { data: parent, error: parentError } = await supabase
      .from("student_parents")
      .select("parents!inner(email, father_name, mother_name)")
      .eq("student_id", studentId)
      .maybeSingle();

    if (!parentError && parent && parent.parents?.email) {
      return {
        email: parent.parents.email,
        name: parent.parents.father_name || parent.parents.mother_name || `${student.first_name} ${student.last_name}`,
      };
    }
    return {
      email: student.email,
      name: `${student.first_name} ${student.last_name}`.trim(),
    };
  };

  // ─── Send Student Report Email ─────────────────────────────────────
  const sendStudentReport = async () => {
    if (!selectedStudentId) {
      message.warning("Please select a student first.");
      return;
    }

    setSendingReport(true);
    try {
      const recipient = await getStudentParentEmail(selectedStudentId);
      if (!recipient || !recipient.email) {
        message.error("No email found for this student or parent.");
        setSendingReport(false);
        return;
      }

      // 1. Fetch student profile
      const { data: profile, error: profileError } = await supabase
        .from("students")
        .select("*")
        .eq("id", selectedStudentId)
        .single();
      if (profileError) throw profileError;

      // 2. Fetch fee records
      const { data: fees, error: feesError } = await supabase
        .from("student_fees")
        .select(`
          *,
          fee_structures(courses(course_name))
        `)
        .eq("student_id", selectedStudentId)
        .eq("branch_id", branchId)
        .eq("financial_year_id", financialYearId);
      if (feesError) throw feesError;

      // 3. Fetch batch assignments
      const { data: batches, error: batchesError } = await supabase
        .from("student_batches")
        .select(`
          *,
          batches(batch_name, mediums(name), courses(course_name))
        `)
        .eq("student_id", selectedStudentId)
        .eq("branch_id", branchId)
        .eq("financial_year_id", financialYearId);
      if (batchesError) throw batchesError;

      // 4. Fetch attendance summary (compute from student_attendance)
      const { data: attendanceData, error: attError } = await supabase
        .from("student_attendance")
        .select(`
          status,
          attendance_sessions(attendance_date)
        `)
        .eq("student_id", selectedStudentId)
        .eq("branch_id", branchId)
        .eq("financial_year_id", financialYearId);
      if (attError) throw attError;
      const totalSessions = attendanceData.length;
      const presentCount = attendanceData.filter(a => a.status === "Present").length;
      const attendancePct = totalSessions > 0 ? ((presentCount / totalSessions) * 100).toFixed(1) : 0;

      // 5. Fetch exam results
      const { data: results, error: resultsError } = await supabase
        .from("student_results")
        .select(`
          marks_obtained,
          exams(exam_name, exam_date, total_marks, subjects(subject_name))
        `)
        .eq("student_id", selectedStudentId)
        .eq("branch_id", branchId)
        .eq("financial_year_id", financialYearId);
      if (resultsError) throw resultsError;

      // 6. Fetch homework submissions
      const { data: homeworkSubs, error: hwError } = await supabase
        .from("homework_submissions")
        .select(`
          homework_id,
          status,
          homework(title, assigned_date, due_date)
        `)
        .eq("student_id", selectedStudentId)
        .eq("branch_id", branchId)
        .eq("financial_year_id", financialYearId);
      if (hwError) throw hwError;

      // 7. Fetch progress evaluations
      const { data: progress, error: progError } = await supabase
        .from("student_progress")
        .select(`
          evaluation_date,
          attendance_percentage,
          performance_score,
          teacher_remarks,
          batches(batch_name)
        `)
        .eq("student_id", selectedStudentId)
        .eq("branch_id", branchId)
        .eq("financial_year_id", financialYearId);
      if (progError) throw progError;

      // 8. Fetch documents
      const { data: documents, error: docError } = await supabase
        .from("student_documents")
        .select("document_type, file_name, uploaded_at")
        .eq("student_id", selectedStudentId)
        .eq("branch_id", branchId)
        .eq("financial_year_id", financialYearId);
      if (docError) throw docError;

      // ─── Build HTML Report ──────────────────────────────────────────

      const orgName = org?.company_name || "Academy";

      // Fee summary
      let feeHtml = '';
      if (fees && fees.length) {
        const totalFee = fees.reduce((s, f) => s + Number(f.final_fee), 0);
        const totalPaid = fees.reduce((s, f) => s + Number(f.total_paid || 0), 0);
        const totalPending = fees.reduce((s, f) => s + Number(f.pending || 0), 0);
        feeHtml = `
          <h4 style="margin:8px 0 2px;">Fee Summary</h4>
          <div style="display:flex;gap:16px;font-size:12px;flex-wrap:wrap;">
            <span><strong>Total Fee:</strong> ₹ ${totalFee.toLocaleString('en-IN')}</span>
            <span><strong>Total Paid:</strong> ₹ ${totalPaid.toLocaleString('en-IN')}</span>
            <span><strong>Total Pending:</strong> ₹ ${totalPending.toLocaleString('en-IN')}</span>
          </div>
          <table style="width:100%;border-collapse:collapse;font-size:11px;margin-top:4px;">
            <thead><tr style="background:#f0f0f0;">
              <th style="padding:4px 8px;border:1px solid #ddd;text-align:left;">Course</th>
              <th style="padding:4px 8px;border:1px solid #ddd;text-align:right;">Final Fee</th>
              <th style="padding:4px 8px;border:1px solid #ddd;text-align:right;">Paid</th>
              <th style="padding:4px 8px;border:1px solid #ddd;text-align:right;">Pending</th>
              <th style="padding:4px 8px;border:1px solid #ddd;text-align:left;">Status</th>
            </tr></thead>
            <tbody>
              ${fees.map(f => `
                <tr>
                  <td style="padding:4px 8px;border:1px solid #ddd;">${f.fee_structures?.courses?.course_name || 'N/A'}</td>
                  <td style="padding:4px 8px;border:1px solid #ddd;text-align:right;">₹ ${Number(f.final_fee).toLocaleString('en-IN')}</td>
                  <td style="padding:4px 8px;border:1px solid #ddd;text-align:right;">₹ ${Number(f.total_paid || 0).toLocaleString('en-IN')}</td>
                  <td style="padding:4px 8px;border:1px solid #ddd;text-align:right;">₹ ${Number(f.pending || 0).toLocaleString('en-IN')}</td>
                  <td style="padding:4px 8px;border:1px solid #ddd;">${f.status}</td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        `;
      }

      // Batches
      let batchHtml = '';
      if (batches && batches.length) {
        batchHtml = `
          <h4 style="margin:8px 0 2px;">Batch Assignments</h4>
          <table style="width:100%;border-collapse:collapse;font-size:11px;margin-top:4px;">
            <thead><tr style="background:#f0f0f0;">
              <th style="padding:4px 8px;border:1px solid #ddd;text-align:left;">Batch</th>
              <th style="padding:4px 8px;border:1px solid #ddd;text-align:left;">Medium</th>
              <th style="padding:4px 8px;border:1px solid #ddd;text-align:left;">Course</th>
              <th style="padding:4px 8px;border:1px solid #ddd;text-align:left;">Enrollment</th>
              <th style="padding:4px 8px;border:1px solid #ddd;text-align:left;">Status</th>
            </tr></thead>
            <tbody>
              ${batches.map(b => `
                <tr>
                  <td style="padding:4px 8px;border:1px solid #ddd;">${b.batches?.batch_name || '—'}</td>
                  <td style="padding:4px 8px;border:1px solid #ddd;">${b.batches?.mediums?.name || '—'}</td>
                  <td style="padding:4px 8px;border:1px solid #ddd;">${b.batches?.courses?.course_name || '—'}</td>
                  <td style="padding:4px 8px;border:1px solid #ddd;">${b.enrollment_date || '—'}</td>
                  <td style="padding:4px 8px;border:1px solid #ddd;">${b.status}</td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        `;
      }

      // Attendance
      const attendanceHtml = `
        <h4 style="margin:8px 0 2px;">Attendance Summary</h4>
        <div style="display:flex;gap:16px;font-size:12px;">
          <span><strong>Total Sessions:</strong> ${totalSessions}</span>
          <span><strong>Present:</strong> ${presentCount}</span>
          <span><strong>Attendance %:</strong> ${attendancePct}%</span>
        </div>
      `;

      // Exam Results
      let examHtml = '';
      if (results && results.length) {
        examHtml = `
          <h4 style="margin:8px 0 2px;">Exam Results</h4>
          <table style="width:100%;border-collapse:collapse;font-size:11px;margin-top:4px;">
            <thead><tr style="background:#f0f0f0;">
              <th style="padding:4px 8px;border:1px solid #ddd;text-align:left;">Exam</th>
              <th style="padding:4px 8px;border:1px solid #ddd;text-align:left;">Subject</th>
              <th style="padding:4px 8px;border:1px solid #ddd;text-align:right;">Marks</th>
              <th style="padding:4px 8px;border:1px solid #ddd;text-align:right;">Total</th>
              <th style="padding:4px 8px;border:1px solid #ddd;text-align:left;">Date</th>
            </tr></thead>
            <tbody>
              ${results.map(r => `
                <tr>
                  <td style="padding:4px 8px;border:1px solid #ddd;">${r.exams?.exam_name || '—'}</td>
                  <td style="padding:4px 8px;border:1px solid #ddd;">${r.exams?.subjects?.subject_name || '—'}</td>
                  <td style="padding:4px 8px;border:1px solid #ddd;text-align:right;">${r.marks_obtained}</td>
                  <td style="padding:4px 8px;border:1px solid #ddd;text-align:right;">${r.exams?.total_marks || '—'}</td>
                  <td style="padding:4px 8px;border:1px solid #ddd;">${r.exams?.exam_date || '—'}</td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        `;
      }

      // Homework
      let hwHtml = '';
      if (homeworkSubs && homeworkSubs.length) {
        const pending = homeworkSubs.filter(h => h.status === "Pending").length;
        const submitted = homeworkSubs.filter(h => h.status !== "Pending").length;
        hwHtml = `
          <h4 style="margin:8px 0 2px;">Homework</h4>
          <div style="display:flex;gap:16px;font-size:12px;">
            <span><strong>Total:</strong> ${homeworkSubs.length}</span>
            <span><strong>Submitted:</strong> ${submitted}</span>
            <span><strong>Pending:</strong> ${pending}</span>
          </div>
        `;
      }

      // Progress
      let progHtml = '';
      if (progress && progress.length) {
        progHtml = `
          <h4 style="margin:8px 0 2px;">Progress Evaluations</h4>
          <table style="width:100%;border-collapse:collapse;font-size:11px;margin-top:4px;">
            <thead><tr style="background:#f0f0f0;">
              <th style="padding:4px 8px;border:1px solid #ddd;text-align:left;">Date</th>
              <th style="padding:4px 8px;border:1px solid #ddd;text-align:left;">Batch</th>
              <th style="padding:4px 8px;border:1px solid #ddd;text-align:center;">Attendance %</th>
              <th style="padding:4px 8px;border:1px solid #ddd;text-align:center;">Score</th>
              <th style="padding:4px 8px;border:1px solid #ddd;text-align:left;">Remarks</th>
            </tr></thead>
            <tbody>
              ${progress.map(p => `
                <tr>
                  <td style="padding:4px 8px;border:1px solid #ddd;">${p.evaluation_date}</td>
                  <td style="padding:4px 8px;border:1px solid #ddd;">${p.batches?.batch_name || '—'}</td>
                  <td style="padding:4px 8px;border:1px solid #ddd;text-align:center;">${p.attendance_percentage || '—'}</td>
                  <td style="padding:4px 8px;border:1px solid #ddd;text-align:center;">${p.performance_score || '—'}</td>
                  <td style="padding:4px 8px;border:1px solid #ddd;">${p.teacher_remarks || '—'}</td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        `;
      }

      // Documents
      let docHtml = '';
      if (documents && documents.length) {
        docHtml = `
          <h4 style="margin:8px 0 2px;">Documents</h4>
          <ul style="margin:0;padding-left:20px;font-size:12px;">
            ${documents.map(d => `<li>${d.document_type || 'Document'} – ${d.file_name} (${d.uploaded_at || '—'})</li>`).join('')}
          </ul>
        `;
      }

      const htmlBody = `
        <div style="font-family:Arial,sans-serif;max-width:700px;margin:0 auto;">
          <h2 style="color:#0D47A1;">Student Report</h2>
          <p><strong>Student:</strong> ${recipient.name}</p>
          <p><strong>Admission No:</strong> ${profile.admission_no || 'N/A'}</p>
          <p><strong>Organization:</strong> ${orgName}</p>
          <p><strong>Branch:</strong> ${branch?.branch_name || 'N/A'}</p>
          <p><strong>Email:</strong> ${profile.email || 'N/A'}</p>
          <p><strong>Mobile:</strong> ${profile.mobile || 'N/A'}</p>
          <hr />
          ${feeHtml}
          ${batchHtml}
          ${attendanceHtml}
          ${examHtml}
          ${hwHtml}
          ${progHtml}
          ${docHtml}
          <p style="color:#888;font-size:10px;margin-top:20px;">Computer‑generated student report from ${orgName}</p>
        </div>
      `;

      await sendEmail({
        to: recipient.email,
        subject: `Student Report - ${recipient.name}`,
        html: htmlBody,
        from: org?.email || undefined,
      });

      message.success(`Report sent to ${recipient.email}`);
    } catch (err) {
      console.error("Failed to send report:", err);
      message.error("Failed to send report.");
    } finally {
      setSendingReport(false);
    }
  };

  // ─── Fetch students list ────────────────────────────────────────────
  useEffect(() => {
    if (!branchId || !financialYearId) return;
    const fetchStudents = async () => {
      const { data, error } = await supabase
        .from("students")
        .select("id, first_name, last_name, admission_no")
        .eq("branch_id", branchId)
        .eq("financial_year_id", financialYearId)
        .order("first_name");
      if (error) {
        message.error("Failed to load students");
        return;
      }
      setStudents(data || []);
      if (data?.length && !selectedStudentId) {
        setSelectedStudentId(data[0].id);
      }
    };
    fetchStudents();
  }, [branchId, financialYearId]);

  const handleStudentChange = (value) => {
    setSelectedStudentId(value);
  };

  const selectedStudent = students.find(s => s.id === selectedStudentId);
  const studentFullName = selectedStudent ? `${selectedStudent.first_name} ${selectedStudent.last_name}` : "";

  return (
    <div style={{ padding: 16 }}>
      <Row gutter={[16, 16]} align="middle">
        <Col>
          <Select
            showSearch
            placeholder="Select Student"
            value={selectedStudentId}
            onChange={handleStudentChange}
            style={{ width: 350 }}
            optionFilterProp="label"
            options={students.map((s) => ({
              label: `${s.first_name} ${s.last_name} (${s.admission_no})`,
              value: s.id,
            }))}
          />
        </Col>
        <Col>
          <Button
            type="primary"
            icon={<MailOutlined />}
            onClick={sendStudentReport}
            loading={sendingReport}
            disabled={!selectedStudentId}
          >
            Send Student Report
          </Button>
        </Col>
      </Row>

      <Card style={{ marginTop: 16 }}>
        <Tabs activeKey={activeTab} onChange={setActiveTab} type="card">
          <TabPane tab="Profile" key="profile">
            <StudentProfile studentId={selectedStudentId} standalone={false} />
          </TabPane>
          <TabPane tab="Fees" key="fees">
            <StudentFees studentId={selectedStudentId} standalone={false} />
          </TabPane>
          <TabPane tab="Batches" key="batches">
            <StudentBatches studentId={selectedStudentId} standalone={false} />
          </TabPane>
          <TabPane tab="Attendance" key="attendance">
            <Attendance studentId={selectedStudentId} standalone={false} />
          </TabPane>
          <TabPane tab="Documents" key="documents">
            <StudentDocuments studentId={selectedStudentId} standalone={false} />
          </TabPane>
          <TabPane tab="Exams" key="exams">
            <StudentExamsPage studentId={selectedStudentId} standalone={false} />
          </TabPane>
          <TabPane tab="Homework" key="homework">
            <StudentHomeworkPage studentId={selectedStudentId} standalone={false} />
          </TabPane>
          <TabPane tab="Results" key="results">
            <StudentResultsPage studentId={selectedStudentId} standalone={false} />
          </TabPane>
          <TabPane tab="Progress" key="progress">
            <StudentProgressPage studentId={selectedStudentId} standalone={false} />
          </TabPane>
          <TabPane tab="Inventory" key="inventory">
            <div className="mb-4">
              <Button type="primary" onClick={() => setInventoryModalOpen(true)}>
                Issue Item to Student
              </Button>
            </div>
            <InventoryTransactions studentId={selectedStudentId} standalone={false} />
          </TabPane>
        </Tabs>
      </Card>

      {/* ── Issue Inventory Modal ── */}
      {inventoryModalOpen && selectedStudentId && (
        <IssueInventoryModal
          studentId={selectedStudentId}
          studentName={studentFullName}
          onClose={() => setInventoryModalOpen(false)}
        />
      )}
    </div>
  );
}