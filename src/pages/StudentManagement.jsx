// src/pages/StudentManagement.jsx
import { useState, useEffect } from "react";
import { Tabs, Card, Row, Col, Select, message, Button } from "antd";
import { useOrg } from "../context/OrganizationContext";
import { supabase } from "../api/supabase";

// ── Import existing pages ──
import StudentFees from "./StudentFees";
import StudentBatches from "./StudentBatches";
import Attendance from "./Attendance";          // full attendance page
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
  const { branch, selectedFinancialYear } = useOrg();
  const branchId = branch?.id;
  const financialYearId = selectedFinancialYear?.id;

  const [selectedStudentId, setSelectedStudentId] = useState(null);
  const [students, setStudents] = useState([]);
  const [activeTab, setActiveTab] = useState("profile");
  const [inventoryModalOpen, setInventoryModalOpen] = useState(false);

  // Fetch students list
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

  // Get selected student name for the modal
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