import { useState } from "react";
import { Outlet, useLocation, Link } from "react-router-dom";
import { Layout, Menu, Breadcrumb, Button, theme } from "antd";
import {
  MenuFoldOutlined,
  MenuUnfoldOutlined,
  DashboardOutlined,
  UserOutlined,
  BookOutlined,
  DollarOutlined,
  SettingOutlined,
  CalendarOutlined,
  BellOutlined,
  PhoneOutlined,
  FormOutlined,
  TeamOutlined,
  BarChartOutlined,
  AppstoreOutlined,
  SlidersOutlined,
  BankOutlined,
  FileTextOutlined,
  ShoppingCartOutlined,
  WalletOutlined,
  PieChartOutlined,
  AccountBookOutlined,
  AuditOutlined,
  MessageOutlined,
  VideoCameraOutlined,  
} from "@ant-design/icons";
import { useAuth } from "../context/AuthContext";
import { useOrg } from "../context/OrganizationContext";
import GlobalSearch from "../components/GlobalSearch";
import NotificationBell from "../components/NotificationBell";
import UserMenu from "../components/UserMenu";

const { Header, Sider, Content } = Layout;

// ── Breadcrumb name map ──
const breadcrumbNameMap = {
  "/": "Dashboard",
  "/students": "Students",
  "/students/:id": "Student Details",
  "/inquiries": "Inquiries",
  "/accounting": "Accounting Hub",
  "/accounting/vouchers": "Vouchers",
  "/accounting/ledger": "Ledger",
  "/accounting/trial-balance": "Trial Balance",
  "/reports": "Reports Hub",
  "/communication-hub": "Communication Hub",
};
// ── Sidebar menu items ──
function getMenuItems(role) {
  if (role === "student") {
    return [
      { key: "/student", icon: <DashboardOutlined />, label: <Link to="/student">Dashboard</Link> },
      { key: "/student/fees", icon: <DollarOutlined />, label: <Link to="/student/fees">Fees</Link> },
    ];
  }
   if (role === "teacher") {
    return [
      { key: "/teacher", icon: <DashboardOutlined />, label: <Link to="/teacher">Dashboard</Link> },
      { key: "/teacher/salary", icon: <DollarOutlined />, label: <Link to="/teacher/salary">My Salary</Link> },
      { key: "/teacher/leaves", icon: <CalendarOutlined />, label: <Link to="/teacher/leaves">My Leaves</Link> },
      { key: "/teacher/timetable", icon: <CalendarOutlined />, label: <Link to="/teacher/timetable">My Timetable</Link> },
      
      // ─── NEW: Attendance, Exams, Results ───────────────────
      { key: "/teacher-attendance", icon: <CalendarOutlined />, label: <Link to="/teacher-attendance">Attendance</Link> },
      { key: "/exams", icon: <FormOutlined />, label: <Link to="/exams">Exams</Link> },
      { key: "/communication-hub", icon: <MessageOutlined />, label: <Link to="/communication-hub">Communication Hub</Link> },
      { key: "/online-classes", icon: <VideoCameraOutlined />, label: <Link to="/online-classes">Online Classes</Link> },
      { key: "/learning-resources", icon: <BookOutlined />, label: <Link to="/learning-resources">Learning Resources</Link> },
      { key: "/results", icon: <BarChartOutlined />, label: <Link to="/results">Results</Link> },

   

      // ─── Communication ────────────────────────────────────
      
      { key: "/teacher/profile", icon: <UserOutlined />, label: <Link to="/teacher/profile">My Profile</Link> },
    ];
  }
  // ── Admin / Super Admin / Organization Admin full menu ──
  return [
    {
      key: "dashboard",
      icon: <DashboardOutlined />,
      label: <Link to="/">Dashboard</Link>,
    },
    {
      key: "master-data",
      icon: <SettingOutlined />,
      label: "Master Data",
      children: [
        { key: "/courses", label: <Link to="/courses">Courses</Link> },
        { key: "/batches", label: <Link to="/batches">Batches</Link> },
        { key: "/subjects", label: <Link to="/subjects">Subjects</Link> },
        { key: "/teachers", label: <Link to="/teachers">Teachers</Link> },
        { key: "/parents", label: <Link to="/parents">Parents</Link> },
        { key: "/mediums", label: <Link to="/mediums">Mediums</Link> },
        { key: "/tax-settings", label: <Link to="/tax-settings">Tax Rates</Link> },
        { key: "/inventory-items", label: <Link to="/inventory-items">Inventory Items</Link> },
      ],
    },
    {
      key: "inquiries",
      icon: <PhoneOutlined />,
      label: <Link to="/inquiries">Inquiries</Link>,
    },
    {
      key: "students",
      icon: <UserOutlined />,
      label: "Students",
      children: [
        { key: "/students", label: <Link to="/students">All Students</Link> },
        { key: "/student-management", label: <Link to="/student-management">Student Hub</Link> },
        { key: "/fees", label: <Link to="/fees">Student Fees</Link> },
        { key: "/student-batches", label: <Link to="/student-batches">Batch Assignments</Link> },
        { key: "/student-documents", label: <Link to="/student-documents">Documents</Link> },
      ],
    },
    {
      key: "academics",
      icon: <BookOutlined />,
      label: "Academics",
      children: [
        { key: "/academics-hub", label: <Link to="/academics-hub">Academics Hub</Link> },
        { key: "/exams", label: <Link to="/exams">Exams</Link> },
        { key: "/results", label: <Link to="/results">Results</Link> },
        { key: "/homework", label: <Link to="/homework">Homework</Link> },
        { key: "/attendance", label: <Link to="/attendance">Attendance</Link> },
        { key: "/timetable", label: <Link to="/timetable">Master Timetable</Link> },
        { key: "/online-classes", label: <Link to="/online-classes">Online Classes</Link> },
        { key: "/progress", label: <Link to="/progress">Progress Evaluation</Link> },
      ],
    },
    // ─── NEW: Communication group ──────────────────────────
    {
      key: "communication",
      icon: <MessageOutlined />,
      label: "Communication",
      children: [
        { key: "/communication-hub", label: <Link to="/communication-hub">Communication Hub</Link> },
        { key: "/notifications", label: <Link to="/notifications">Notifications</Link> },
        { key: "/online-classes", label: <Link to="/online-classes">Online Classes</Link> },
        { key: "/learning-resources", label: <Link to="/learning-resources">Learning Resources</Link> },
      ],
    },
    {
      key: "hr",
      icon: <TeamOutlined />,
      label: "HR & Staff",
      children: [
        { key: "/hr-hub", label: <Link to="/hr-hub">HR Hub</Link> },
        { key: "/teachers", label: <Link to="/teachers">Employees</Link> },
        { key: "/teacher-attendance", label: <Link to="/teacher-attendance">Staff Attendance</Link> },
        { key: "/leave-management", label: <Link to="/leave-management">Leave Management</Link> },
        { key: "/salary-setup", label: <Link to="/salary-setup">Salary Setup</Link> },
        { key: "/generate-salaries", label: <Link to="/generate-salaries">Generate Salaries</Link> },
        { key: "/salary-payments", label: <Link to="/salary-payments">Salary Payments</Link> },
        { key: "/salary-report", label: <Link to="/salary-report">Salary Report</Link> },
      ],
    },
    {
      key: "accounting",
      icon: <BankOutlined />,
      label: "Accounting",
      children: [
        { key: "/accounting", label: <Link to="/accounting">Accounting Hub</Link> },
        { key: "/invoices", label: <Link to="/invoices">Invoices</Link> },
        { key: "/receipts", label: <Link to="/receipts">Receipts</Link> },
        { key: "/vouchers", label: <Link to="/vouchers">Vouchers</Link> },
        { key: "/ledger", label: <Link to="/ledger">Ledger</Link> },
        { key: "/trial-balance", label: <Link to="/trial-balance">Trial Balance</Link> },
        { key: "/profit-loss", label: <Link to="/profit-loss">Profit & Loss</Link> },
        { key: "/balance-sheet", label: <Link to="/balance-sheet">Balance Sheet</Link> },
        { key: "/cash-book", label: <Link to="/cash-book">Cash Book</Link> },
        { key: "/day-book", label: <Link to="/day-book">Day Book</Link> },
        { key: "/chart-of-accounts", label: <Link to="/chart-of-accounts">Chart of Accounts</Link> },
        { key: "/gst-report", label: <Link to="/gst-report">GST Reports</Link> },
        { key: "/gst-settings", label: <Link to="/gst-settings">GST Settings</Link> },
        { key: "/budgets", label: <Link to="/budgets">Budgets</Link> },
        { key: "/budget-vs-actual", label: <Link to="/budget-vs-actual">Budget vs Actual</Link> },
        { key: "/fixed-assets", label: <Link to="/fixed-assets">Fixed Assets</Link> },
        { key: "/bank-reconciliation", label: <Link to="/bank-reconciliation">Bank Reconciliation</Link> },
        { key: "/aged-receivables", label: <Link to="/aged-receivables">Aged Receivables</Link> },
        { key: "/bill-wise", label: <Link to="/bill-wise">Bill-wise Entries</Link> },
        { key: "/purchase-register", label: <Link to="/purchase-register">Purchase Register</Link> },
        { key: "/purchase-invoices", label: <Link to="/purchase-invoices">Purchase Invoices</Link> },
        { key: "/purchase-orders", label: <Link to="/purchase-orders">Purchase Orders</Link> },
        { key: "/vendors", label: <Link to="/vendors">Vendors</Link> },
        { key: "/inventory-items", label: <Link to="/inventory-items">Inventory Items</Link> },
        { key: "/add-stock", label: <Link to="/add-stock">Add Stock</Link> },
        { key: "/stock-dashboard", label: <Link to="/stock-dashboard">Stock Dashboard</Link> },
      ],
    },
    {
      key: "reports",
      icon: <BarChartOutlined />,
      label: <Link to="/reports">Reports Hub</Link>,
    },
    {
      key: "settings",
      icon: <SettingOutlined />,
      label: "Settings",
      children: [
        { key: "/settings-hub", label: <Link to="/settings-hub">Settings Hub</Link> },
        { key: "/organization-settings", label: <Link to="/organization-settings">Organization</Link> },
        { key: "/theme-settings", label: <Link to="/theme-settings">Theme</Link> },
        { key: "/branches", label: <Link to="/branches">Branches</Link> },
        { key: "/user-management", label: <Link to="/user-management">User Management</Link> },
        { key: "/activity-logs", label: <Link to="/activity-logs">Activity Logs</Link> },
      ],
    },
  ];
}

export default function AdminLayout() {
  const [collapsed, setCollapsed] = useState(false);
  const location = useLocation();
  const { profile } = useAuth();
  const { org, branch, setBranch, branches, financialYears, selectedFinancialYear, switchFinancialYear } = useOrg();
  const { token } = theme.useToken();

  const role = (profile?.role || "").toLowerCase().replace(/\s+/g, "_");
  const isStudent = role === "student";
  const menuItems = getMenuItems(role);

  // ── Breadcrumb generation ──
  const pathSnippets = location.pathname.split("/").filter((i) => i);
  const breadcrumbItems = [
    { title: <Link to="/">Home</Link> },
    ...pathSnippets.map((_, index) => {
      const url = `/${pathSnippets.slice(0, index + 1).join("/")}`;
      const name = breadcrumbNameMap[url] || url.split("/").pop();
      return { title: <Link to={url}>{name}</Link> };
    }),
  ];

  // Determine selected key
  const selectedKey = pathSnippets.length === 0 ? "/" : "/" + pathSnippets[0];

  // ── Branch / FY change handlers ──
  const handleBranchChange = (e) => {
    const selected = branches.find((b) => b.id == e.target.value);
    if (selected) {
      setBranch(selected);
    }
  };

  const handleFinancialYearChange = (e) => {
    const fyId = Number(e.target.value);
    if (fyId) {
      switchFinancialYear(fyId);
    }
  };

  return (
    <Layout style={{ minHeight: "100vh" }}>
      <Sider
        collapsible
        collapsed={collapsed}
        onCollapse={setCollapsed}
        breakpoint="lg"
        collapsedWidth={0}
        trigger={null}
        style={{
          overflow: "auto",
          height: "100vh",
          position: "fixed",
          left: 0,
          top: 0,
          bottom: 0,
          zIndex: 10,
        }}
      >
        <Link
          to="/"
          style={{
            height: 64,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            textDecoration: "none",
          }}
        >
          <img
            src={org?.logo_light_url || "/logo.png"}
            alt="Logo"
            style={{
              height: collapsed ? 32 : 48,
              transition: "height 0.3s",
            }}
          />
        </Link>

        <Menu
          theme="dark"
          mode="inline"
          selectedKeys={[selectedKey]}
          defaultOpenKeys={["master-data", "students", "academics", "communication", "hr", "accounting", "settings"]}
          items={menuItems}
        />
      </Sider>

      <Layout style={{ marginLeft: collapsed ? 0 : 200 }}>
        <Header
          style={{
            padding: "0 12px sm:0 24px",
            background: token.colorBgContainer,
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            boxShadow: "0 1px 4px rgba(0,0,0,0.06)",
            zIndex: 1,
            flexWrap: "wrap",
            gap: "8px",
            minHeight: "56px",
            height: "auto",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <Button
              type="text"
              icon={collapsed ? <MenuUnfoldOutlined /> : <MenuFoldOutlined />}
              onClick={() => setCollapsed(!collapsed)}
              style={{ fontSize: 16, width: 40, height: 40 }}
              className="lg:hidden"
            />
            <div className="hidden sm:block">
              <p className="text-xs sm:text-sm text-secondary-dark font-montserrat whitespace-nowrap">
                {new Date().toLocaleDateString("en-IN", {
                  weekday: "short",
                  year: "numeric",
                  month: "short",
                  day: "numeric",
                })}
              </p>
            </div>
          </div>

          <div style={{ flex: "1 1 160px", minWidth: "120px", margin: "0 8px" }}>
            <GlobalSearch />
          </div>

          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 6,
              flexWrap: "wrap",
              justifyContent: "flex-end",
            }}
          >
            {!isStudent && (
              <select
                value={branch?.id || ""}
                onChange={handleBranchChange}
                className="border border-gray-300 rounded px-1.5 py-1 text-xs sm:text-sm focus:ring-1 focus:ring-primary focus:border-primary outline-none bg-white dark:bg-gray-700 dark:text-white dark:border-gray-600 max-w-[100px] sm:max-w-[140px] truncate"
              >
                {branches.length === 0 ? (
                  <option value="" disabled>Loading...</option>
                ) : (
                  branches.map((b) => (
                    <option key={b.id} value={b.id}>
                      {b.branch_name}
                    </option>
                  ))
                )}
              </select>
            )}

            {!isStudent && (
              <select
                value={selectedFinancialYear?.id || ""}
                onChange={handleFinancialYearChange}
                className="border border-gray-300 rounded px-1.5 py-1 text-xs sm:text-sm focus:ring-1 focus:ring-primary focus:border-primary outline-none bg-white dark:bg-gray-700 dark:text-white dark:border-gray-600 max-w-[80px] sm:max-w-[120px] truncate"
              >
                {financialYears.length === 0 ? (
                  <option value="" disabled>Loading...</option>
                ) : selectedFinancialYear ? (
                  financialYears.map((fy) => (
                    <option key={fy.id} value={fy.id}>
                      {fy.name}
                    </option>
                  ))
                ) : (
                  <>
                    <option value="" disabled>Select FY</option>
                    {financialYears.map((fy) => (
                      <option key={fy.id} value={fy.id}>
                        {fy.name}
                      </option>
                    ))}
                  </>
                )}
              </select>
            )}

            <NotificationBell />
            <UserMenu />
          </div>
        </Header>

        <div style={{ padding: "8px 16px 0", background: token.colorBgLayout }}>
          <Breadcrumb items={breadcrumbItems} />
        </div>

        <Content
          style={{
            margin: "12px 16px",
            padding: 16,
            background: token.colorBgContainer,
            borderRadius: token.borderRadiusLG,
            minHeight: 280,
          }}
        >
          <Outlet />
        </Content>
      </Layout>
    </Layout>
  );
}