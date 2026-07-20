import { Dropdown, Avatar, Typography, Space } from "antd";
import {
  UserOutlined,
  LogoutOutlined,
  SettingOutlined,
} from "@ant-design/icons";
import { useAuth } from "../context/AuthContext";
import { useNavigate } from "react-router-dom";

const { Text } = Typography;

export default function UserMenu() {
  const { profile, signOut } = useAuth();          // 👈 use context's signOut
  const navigate = useNavigate();

  const handleLogout = async () => {
    await signOut();                                // clears everything + cache
    navigate("/login", { replace: true });
  };

  const handleMenuClick = ({ key }) => {
    if (key === "profile") {
      const role = (profile?.role || "").toLowerCase().replace(/\s+/g, "_");
      if (role === "student") navigate("/student/profile");
      else if (role === "teacher") navigate("/teacher/profile");
      else navigate("/settings");
    } else if (key === "settings") {
      navigate("/settings");
    } else if (key === "logout") {
      handleLogout();
    }
  };

  const menuItems = [
    {
      key: "profile",
      icon: <UserOutlined />,
      label: "Profile",
    },
    {
      key: "settings",
      icon: <SettingOutlined />,
      label: "Settings",
    },
    { type: "divider" },
    {
      key: "logout",
      icon: <LogoutOutlined />,
      label: "Logout",
      danger: true,
    },
  ];

  return (
    <Dropdown
      menu={{ items: menuItems, onClick: handleMenuClick }}
      placement="bottomRight"
      trigger={["click"]}
    >
      <Space size={8} style={{ cursor: "pointer" }}>
        <Avatar
          size={28}
          src={profile?.avatar_url || undefined}
          icon={!profile?.avatar_url && <UserOutlined />}
        />
        <span style={{ lineHeight: 1.2 }}>
          <Text strong style={{ fontSize: 12, display: "block" }}>
            {profile?.full_name || "User"}
          </Text>
          <Text type="secondary" style={{ fontSize: 10, display: "block" }}>
            {profile?.role || "Admin"}
          </Text>
        </span>
      </Space>
    </Dropdown>
  );
}