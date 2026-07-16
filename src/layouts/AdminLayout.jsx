// src/layouts/AdminLayout.jsx
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
  PhoneOutlined,        // <-- added for Inquiries
  FormOutlined,         // alternative
} from "@ant-design/icons";
import { useAuth } from "../context/AuthContext";
import { useOrg } from "../context/OrganizationContext";
import ScopeSelector from "../components/ScopeSelector";
import GlobalSearch from "../components/GlobalSearch";
import NotificationBell from "../components/NotificationBell";
import UserMenu from "../components/UserMenu";

const { Header, Sider, Content } = Layout;

// ── Breadcrumb name map (fill in all your routes) ──
const breadcrumbNameMap = {
  "/": "Dashboard",
  "/students": "Students",
  "/students/:id": "Student Details",
  "/inquiries": "Inquiries",        // <-- added
  "/accounting": "Accounting Hub",
  "/accounting/vouchers": "Vouchers",
  "/accounting/ledger": "Ledger",
  "/accounting/trial-balance": "Trial Balance",
  // … add the rest of your routes as needed
};

// ── Sidebar menu items ──
function getMenuItems(role) {
  // Student menu
  if (role === "student") {
    return [
      { key: "/student", icon: <DashboardOutlined />, label: <Link to="/student">Dashboard</Link> },
      { key: "/student/fees", icon: <DollarOutlined />, label: <Link to="/student/fees">Fees</Link> },
      // … add all student links
    ];
  }

  // Teacher menu
  if (role === "teacher") {
    return [
      { key: "/teacher", icon: <DashboardOutlined />, label: <Link to="/teacher">Dashboard</Link> },
      { key: "/teacher/salary", icon: <DollarOutlined />, label: <Link to="/teacher/salary">My Salary</Link> },
      // … add all teacher links
    ];
  }

  // Admin / Super Admin menu (full access)
  return [
    { key: "/", icon: <DashboardOutlined />, label: <Link to="/">Dashboard</Link> },
    { key: "/master-data", icon: <SettingOutlined />, label: <Link to="/master-data">Master Data</Link>},
    { key: "/inquiries", icon: <PhoneOutlined />, label: <Link to="/inquiries">Inquiries</Link> },  // <-- added
    { key: "/students", icon: <UserOutlined />, label: <Link to="/students">Students</Link> },
    { key: "/student-management", icon: <UserOutlined />, label: <Link to="/student-management">Student Hub</Link> },
    { key: "/fees", icon: <DollarOutlined />, label: <Link to="/fees">Student Fees</Link> },
    { key: "/accounting", icon: <DollarOutlined />, label: <Link to="/accounting">Finance</Link> },
    { key: "/settings-hub", icon: <SettingOutlined />, label: <Link to="/settings-hub">Settings</Link> },
    // … add all admin links (hubs, reports, etc.)
  ];
}

export default function AdminLayout() {
  const [collapsed, setCollapsed] = useState(false);
  const location = useLocation();
  const { profile } = useAuth();
  const { org } = useOrg();
  const { token } = theme.useToken();

  const role = (profile?.role || "").toLowerCase().replace(/\s+/g, "_");
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

  // Active menu key (first path segment)
  const selectedKey = "/" + (pathSnippets[0] || "");

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
        {/* Logo */}
        <div
          style={{
            height: 64,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
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
        </div>

        {/* Navigation Menu */}
        <Menu
          theme="dark"
          mode="inline"
          selectedKeys={[selectedKey]}
          items={menuItems}
        />
      </Sider>

      {/* ── Main Layout (Header + Content) ── */}
      <Layout style={{ marginLeft: collapsed ? 0 : 200 }}>
        {/* Top Header */}
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

          <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
            <ScopeSelector />
            <NotificationBell />
            <UserMenu />
          </div>
        </Header>

        {/* Breadcrumb */}
        <div style={{ padding: "12px 24px 0", background: token.colorBgLayout }}>
          <Breadcrumb items={breadcrumbItems} />
        </div>

        {/* Page Content */}
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