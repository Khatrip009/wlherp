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
  BarChartOutlined,   // <-- added for Reports
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
  "/reports": "Reports Hub",        // <-- added
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
    ];
  }
  return [
    { key: "/", icon: <DashboardOutlined />, label: <Link to="/">Dashboard</Link> },
    { key: "/master-data", icon: <SettingOutlined />, label: <Link to="/master-data">Master Data</Link> },
    { key: "/inquiries", icon: <PhoneOutlined />, label: <Link to="/inquiries">Inquiries</Link> },
    { key: "/students", icon: <UserOutlined />, label: <Link to="/students">Students</Link> },
    { key: "/student-management", icon: <UserOutlined />, label: <Link to="/student-management">Student Hub</Link> },
    { key: "/academics-hub", icon: <BookOutlined />, label: <Link to="/academics-hub">Academics</Link> },
    { key: "/hr-hub", icon: <TeamOutlined />, label: <Link to="/hr-hub">HR Hub</Link> },
    { key: "/fees", icon: <DollarOutlined />, label: <Link to="/fees">Student Fees</Link> },
    { key: "/accounting", icon: <DollarOutlined />, label: <Link to="/accounting">Accounting</Link> },
    // ─── NEW: Reports link ────────────────
    { key: "/reports", icon: <BarChartOutlined />, label: <Link to="/reports">Reports</Link> },
    { key: "/settings-hub", icon: <SettingOutlined />, label: <Link to="/settings-hub">Settings</Link> },
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

  const selectedKey = "/" + (pathSnippets[0] || "");

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
      {/* ── Sidebar ── */}
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
          items={menuItems}
        />
      </Sider>

      {/* ── Main Layout ── */}
      <Layout style={{ marginLeft: collapsed ? 0 : 200 }}>
        {/* Header */}
        <Header
          style={{
            padding: "0 24px",
            background: token.colorBgContainer,
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            boxShadow: "0 1px 4px rgba(0,0,0,0.06)",
            zIndex: 1,
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
            <Button
              type="text"
              icon={collapsed ? <MenuUnfoldOutlined /> : <MenuFoldOutlined />}
              onClick={() => setCollapsed(!collapsed)}
              style={{ fontSize: 16, width: 40, height: 40 }}
            />
            <GlobalSearch />
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            {/* ─── Branch selector ──────────────────────────── */}
            {!isStudent && (
              <select
                value={branch?.id || ""}
                onChange={handleBranchChange}
                className="border border-gray-300 rounded px-2 py-1.5 text-sm focus:ring-1 focus:ring-primary focus:border-primary outline-none bg-white dark:bg-gray-700 dark:text-white dark:border-gray-600"
              >
                {branches.length === 0 ? (
                  <option value="" disabled>Loading branches...</option>
                ) : (
                  branches.map((b) => (
                    <option key={b.id} value={b.id}>
                      {b.branch_name}
                    </option>
                  ))
                )}
              </select>
            )}

            {/* ─── Financial Year selector ──────────────────── */}
            {!isStudent && (
              <select
                value={selectedFinancialYear?.id || ""}
                onChange={handleFinancialYearChange}
                className="border border-gray-300 rounded px-2 py-1.5 text-sm focus:ring-1 focus:ring-primary focus:border-primary outline-none bg-white dark:bg-gray-700 dark:text-white dark:border-gray-600"
              >
                {financialYears.length === 0 ? (
                  <option value="" disabled>Loading FY...</option>
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

        {/* Breadcrumb */}
        <div style={{ padding: "12px 24px 0", background: token.colorBgLayout }}>
          <Breadcrumb items={breadcrumbItems} />
        </div>

        {/* Content */}
        <Content
          style={{
            margin: "16px 24px",
            padding: 24,
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