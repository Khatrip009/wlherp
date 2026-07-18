import { useState } from "react";
import { Layout, Menu, Typography, message, Tabs } from "antd";
import { useQueryClient } from "@tanstack/react-query";
import {
  BookOutlined,
  BookFilled,
  FileTextOutlined,
  DollarOutlined,
  UserOutlined,
  TeamOutlined,
  ApartmentOutlined,
  PercentageOutlined,
  AppstoreOutlined,
} from "@ant-design/icons";

// ── Import services ──
import * as courseService from "../services/courseService";
import * as batchService from "../services/batchService";
import * as subjectService from "../services/subjectService";
import * as feeService from "../services/feeService";
import * as teacherService from "../services/teacherService";
import * as parentService from "../services/parentService";
import * as mediumService from "../services/mediumService";
import * as inventoryService from "../services/inventoryService";

// ── Import form components ──
import CourseForm from "../components/CourseForm";
import BatchForm from "../components/BatchForm";
import SubjectForm from "../components/SubjectForm";
import FeeStructureForm from "../components/FeeStructureForm";
import TeacherForm from "../components/TeacherForm";
import ParentForm from "../components/ParentForm";
import MediumForm from "../components/MediumForm";
import TaxRateForm from "../components/TaxRateForm";
import InventoryItemForm from "../components/InventoryItemForm";

// ── Import reusable components ──
import MasterTable from "../components/MasterTable";
import MasterFormModal from "../components/MasterFormModal";
import { useOrg } from "../context/OrganizationContext";

const { Content } = Layout;
const { Title } = Typography;

// ── Adapter for FeeStructureForm ──
function FeeStructureFormAdapter({ initialData, onSubmit, onClose, loading, queryClient, queryKey }) {
  const handleSuccess = () => {
    queryClient.invalidateQueries({ queryKey });
    onClose();
  };

  return (
    <FeeStructureForm
      isOpen={true}
      onClose={onClose}
      onSuccess={handleSuccess}
      initialData={initialData}
    />
  );
}

// ── Tab configurations ──
const tabs = [
  {
    key: "courses",
    label: "Courses",
    icon: <BookOutlined />,
    queryKey: "courses",
    queryFn: ({ search, branchId, financialYearId }) =>
      courseService.getCourses({ search, branchId, financialYearId }),
    columns: [
      { title: "Course Name", dataIndex: "course_name" },
      { title: "Duration (months)", dataIndex: "duration_months" },
      { title: "Status", dataIndex: "status", render: (v) => (v ? "Active" : "Inactive") },
    ],
    FormComponent: CourseForm,
    createService: courseService.createCourse,
    updateService: courseService.updateCourse,
    deleteService: courseService.deleteCourse,
  },
  {
    key: "batches",
    label: "Batches",
    icon: <BookFilled />,
    queryKey: "batches",
    queryFn: ({ search, branchId, financialYearId }) =>
      batchService.getBatches({ search, branchId, financialYearId }),
    columns: [
      { title: "Batch Name", dataIndex: "batch_name" },
      { title: "Course", dataIndex: ["courses", "course_name"] },
      { title: "Start Date", dataIndex: "start_date" },
      { title: "Status", dataIndex: "status" },
    ],
    FormComponent: BatchForm,
    createService: batchService.createBatch,
    updateService: batchService.updateBatch,
    deleteService: batchService.deleteBatch,
  },
  {
    key: "subjects",
    label: "Subjects",
    icon: <FileTextOutlined />,
    queryKey: "subjects",
    queryFn: ({ search, branchId, financialYearId }) =>
      subjectService.getSubjects({ search, branchId, financialYearId }),
    columns: [
      { title: "Subject Name", dataIndex: "subject_name" },
      { title: "Course", dataIndex: ["courses", "course_name"] },
    ],
    FormComponent: SubjectForm,
    createService: subjectService.createSubject,
    updateService: subjectService.updateSubject,
    deleteService: subjectService.deleteSubject,
  },
  {
    key: "feeStructures",
    label: "Fee Structures",
    icon: <DollarOutlined />,
    queryKey: "feeStructures",
    queryFn: ({ search, branchId, financialYearId }) =>
      feeService.getFeeStructures({ search, branchId, financialYearId }),
    columns: [
      { title: "Course", dataIndex: ["courses", "course_name"] },
      { title: "Fee Amount", dataIndex: "fee_amount", render: (v) => `₹${v}` },
      {
        title: "Components",
        render: (_, record) => {
          const comps = record.fee_structure_components || [];
          if (comps.length === 0) return <span className="text-gray-400">No components</span>;
          return comps.map((c) => c.component_name).join(", ");
        },
      },
      { title: "Tax Inclusive", dataIndex: "tax_inclusive", render: (v) => (v ? "Yes" : "No") },
    ],
    FormComponent: FeeStructureFormAdapter,
    createService: null,
    updateService: null,
    deleteService: feeService.deleteFeeStructure,
  },
  {
    key: "teachers",
    label: "Teachers",
    icon: <UserOutlined />,
    queryKey: "teachers",
    queryFn: ({ search, branchId, financialYearId }) =>
      teacherService.getTeachers({ search, branchId, financialYearId }),
    columns: [
      { title: "Name", render: (_, r) => `${r.first_name} ${r.last_name}` },
      { title: "Employee Code", dataIndex: "employee_code" },
      { title: "Mobile", dataIndex: "mobile" },
      { title: "Status", dataIndex: "status" },
    ],
    FormComponent: TeacherForm,
    createService: teacherService.createTeacher,
    updateService: teacherService.updateTeacher,
    deleteService: teacherService.deleteTeacher,
  },
  {
    key: "parents",
    label: "Parents",
    icon: <TeamOutlined />,
    queryKey: "parents",
    queryFn: ({ search, branchId, financialYearId }) =>
      parentService.getParents({ search, branchId, financialYearId }),
    columns: [
      { title: "Father Name", dataIndex: "father_name" },
      { title: "Mother Name", dataIndex: "mother_name" },
      { title: "Mobile", dataIndex: "mobile" },
    ],
    FormComponent: ParentForm,
    createService: parentService.createParent,
    updateService: parentService.updateParent,
    deleteService: parentService.deleteParent,
  },
  {
    key: "mediums",
    label: "Mediums",
    icon: <ApartmentOutlined />,
    queryKey: "mediums",
    queryFn: ({ search, branchId, financialYearId }) =>
      mediumService.getMediums({ search, branchId, financialYearId }),
    columns: [{ title: "Medium Name", dataIndex: "name" }],
    FormComponent: MediumForm,
    createService: mediumService.createMedium,
    updateService: mediumService.updateMedium,
    deleteService: mediumService.deleteMedium,
  },
  {
    key: "taxRates",
    label: "Tax Rates",
    icon: <PercentageOutlined />,
    queryKey: "taxRates",
    queryFn: ({ search, branchId, financialYearId }) =>
      feeService.getTaxRates({ search, branchId, financialYearId }),
    columns: [
      { title: "Name", dataIndex: "name" },
      { title: "Rate (%)", dataIndex: "rate" },
      { title: "Type", dataIndex: "type" },
      { title: "Default", dataIndex: "is_default", render: (v) => (v ? "Yes" : "No") },
    ],
    FormComponent: TaxRateForm,
    createService: feeService.createTaxRate,
    updateService: feeService.updateTaxRate,
    deleteService: feeService.deleteTaxRate,
  },
  {
    key: "inventoryItems",
    label: "Inventory Items",
    icon: <AppstoreOutlined />,
    queryKey: "inventoryItems",
    queryFn: ({ search, branchId, financialYearId }) =>
      inventoryService.getInventoryItems({ search }, branchId, financialYearId),
    columns: [
      { title: "Item Name", dataIndex: "item_name" },
      { title: "Category", render: (_, r) => r.inventory_categories?.name || "—" },
      { title: "Unit", dataIndex: "unit" },
      { title: "Price", dataIndex: "unit_price", render: (v) => `₹${v}` },
      { title: "Stock", dataIndex: "current_stock" },
      { title: "Reorder Lvl", dataIndex: "reorder_level" },
    ],
    FormComponent: InventoryItemForm,
    createService: inventoryService.createInventoryItem,
    updateService: inventoryService.updateInventoryItem,
    deleteService: inventoryService.deleteInventoryItem,
  },
];

export default function MasterData() {
  const [activeTab, setActiveTab] = useState("courses");
  const [modalOpen, setModalOpen] = useState(false);
  const [editingItem, setEditingItem] = useState(null);
  const queryClient = useQueryClient();

  const { branch, selectedFinancialYear } = useOrg();
  const branchId = branch?.id;
  const financialYearId = selectedFinancialYear?.id;
  const ctx = { branchId, financialYearId };

  const currentTab = tabs.find((t) => t.key === activeTab);

  const handleAdd = () => {
    setEditingItem(null);
    setModalOpen(true);
  };

  const handleEdit = (record) => {
    setEditingItem(record);
    setModalOpen(true);
  };

  const handleModalSubmit = async (values) => {
    try {
      if (!branchId || !financialYearId) {
        message.error("Branch or Financial Year not selected. Please refresh.");
        return;
      }

      if (editingItem) {
        await currentTab.updateService(editingItem.id, values, ctx);
        message.success(`${currentTab.label} updated successfully`);
      } else {
        await currentTab.createService(values, ctx);
        message.success(`${currentTab.label} created successfully`);
      }

      setModalOpen(false);
      setEditingItem(null);
      queryClient.invalidateQueries({ queryKey: [currentTab.queryKey] });
    } catch (err) {
      console.error("Operation error:", err);
      message.error(err.message || "Operation failed");
    }
  };

  const handleDelete = async (id) => {
    try {
      await currentTab.deleteService(id, ctx);
      queryClient.invalidateQueries({ queryKey: [currentTab.queryKey] });
    } catch (err) {
      message.error(err.message || "Delete failed");
    }
  };

  const renderContent = () => {
    if (!currentTab) return <div>Tab not found</div>;

    const wrappedQueryFn = ({ search }) =>
      currentTab.queryFn({ search, branchId, financialYearId });

    return (
      <MasterTable
        queryKey={[currentTab.queryKey, branchId, financialYearId]}
        queryFn={wrappedQueryFn}
        columns={currentTab.columns}
        searchPlaceholder={`Search ${currentTab.label}...`}
        onAdd={handleAdd}
        onEdit={handleEdit}
        onDelete={handleDelete}
      />
    );
  };

  // ── For Fee Structures, use the adapter ──
  let FormComponent = currentTab?.FormComponent;
  let submitHandler = handleModalSubmit;

  if (activeTab === "feeStructures") {
    FormComponent = (props) => (
      <FeeStructureFormAdapter
        {...props}
        queryClient={queryClient}
        queryKey={[currentTab.queryKey]}
      />
    );
    submitHandler = null;
  }

  return (
    <div className="flex flex-col lg:flex-row gap-4 h-full">
      {/* ── Desktop sidebar ── */}
      <div className="hidden lg:block lg:w-[220px] lg:flex-shrink-0">
        <div className="sticky top-0 bg-white border-r border-gray-200 h-full">
          <div style={{ padding: "16px 0" }}>
            <Title level={5} style={{ paddingLeft: 24, marginBottom: 8 }}>
              Master Data
            </Title>
          </div>
          <Menu
            mode="inline"
            selectedKeys={[activeTab]}
            onClick={({ key }) => setActiveTab(key)}
            items={tabs.map((t) => ({
              key: t.key,
              icon: t.icon,
              label: t.label,
            }))}
          />
        </div>
      </div>

      {/* ── Mobile tabs ── */}
      <div className="lg:hidden">
        <Tabs
          activeKey={activeTab}
          onChange={setActiveTab}
          items={tabs.map((t) => ({
            key: t.key,
            label: (
              <span className="flex items-center gap-1 text-sm">
                {t.icon}
                {t.label}
              </span>
            ),
          }))}
          tabBarStyle={{ marginBottom: 12 }}
          size="small"
        />
      </div>

      {/* ── Content ── */}
      <div className="flex-1 bg-white p-4 sm:p-6 rounded-xl shadow-sm min-h-[400px]">
        <div className="mb-4">
          <Title level={4} className="text-lg sm:text-xl">
            {currentTab?.label}
          </Title>
        </div>
        {renderContent()}
      </div>

      {/* ── Modal ── */}
      <MasterFormModal
        open={modalOpen}
        onClose={() => {
          setModalOpen(false);
          setEditingItem(null);
        }}
        title={editingItem ? `Edit ${currentTab?.label}` : `Add ${currentTab?.label}`}
        formComponent={FormComponent}
        initialData={editingItem || {}}
        onSubmit={submitHandler}
      />
    </div>
  );
}