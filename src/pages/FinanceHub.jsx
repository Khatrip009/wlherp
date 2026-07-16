// src/pages/FinanceHub.jsx
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Layout, Menu, Typography, Button } from "antd";
import {
  FileTextOutlined,
  DollarOutlined,
  SwapOutlined,
  BookOutlined,
  AccountBookOutlined,
  PieChartOutlined,
  PlusOutlined,
} from "@ant-design/icons";

import Invoices from "./Invoices";
import Receipts from "./Receipts";
import Vouchers from "./Vouchers";
import AccountingHub from "./AccountingHub";
import Ledger from "./Ledger";
import TrialBalance from "./TrialBalance";
import ProfitLoss from "./ProfitLoss";
import BalanceSheet from "./BalanceSheet";
import CashBook from "./CashBook";
import DayBook from "./DayBook";

const { Sider, Content } = Layout;
const { Title } = Typography;

const menuItems = [
  { key: "invoices", icon: <FileTextOutlined />, label: "Invoices", component: Invoices },
  { key: "receipts", icon: <FileTextOutlined />, label: "Receipts", component: Receipts },
  { key: "vouchers", icon: <SwapOutlined />, label: "Vouchers", component: Vouchers },
  { key: "accounting", icon: <AccountBookOutlined />, label: "Accounting Hub", component: AccountingHub },
  { key: "ledger", icon: <BookOutlined />, label: "Ledger", component: Ledger },
  { key: "trial-balance", icon: <PieChartOutlined />, label: "Trial Balance", component: TrialBalance },
  { key: "profit-loss", icon: <DollarOutlined />, label: "Profit & Loss", component: ProfitLoss },
  { key: "balance-sheet", icon: <DollarOutlined />, label: "Balance Sheet", component: BalanceSheet },
  { key: "cash-book", icon: <DollarOutlined />, label: "Cash Book", component: CashBook },
  { key: "day-book", icon: <DollarOutlined />, label: "Day Book", component: DayBook },
];

export default function FinanceHub() {
  const [activeKey, setActiveKey] = useState("invoices");
  const navigate = useNavigate();

  const currentItem = menuItems.find((item) => item.key === activeKey);
  const ComponentToRender = currentItem?.component || Invoices;

  const handleMenuClick = ({ key }) => setActiveKey(key);

  return (
    // Remove fixed white background; allow Ant Design tokens to control color.
    // Use a wrapper with tailwind classes for dark mode fallback if needed.
    <Layout style={{ minHeight: "100vh" }} className="bg-white dark:bg-gray-800">
      <Sider
        width={220}
        className="border-r border-gray-200 dark:border-gray-700"
        // Remove fixed background, rely on token configuration for dark/light
      >
        <div className="px-6 py-4">
          <Title level={5} className="!mb-2" style={{ fontFamily: "var(--font-heading)", color: "var(--color-primary)" }}>
            Finance Hub
          </Title>
        </div>
        <Menu
          mode="inline"
          selectedKeys={[activeKey]}
          onClick={handleMenuClick}
          items={menuItems.map((item) => ({
            key: item.key,
            icon: item.icon,
            label: item.label,
          }))}
        />
      </Sider>

      <Content className="p-6" style={{ fontFamily: "var(--font-body)" }}>
        <div className="flex justify-between items-center mb-4">
          <Title level={4} style={{ fontFamily: "var(--font-heading)", color: "var(--color-primary)" }}>
            {currentItem?.label || "Finance"}
          </Title>
          <div className="flex gap-2">
            {activeKey === "invoices" && (
              <Button type="primary" icon={<PlusOutlined />} onClick={() => navigate("/invoices/new")}>
                New Invoice
              </Button>
            )}
            {activeKey === "vouchers" && (
              <Button type="primary" icon={<PlusOutlined />} onClick={() => navigate("/vouchers/new")}>
                New Voucher
              </Button>
            )}
          </div>
        </div>

        <ComponentToRender noLayout={true} />
      </Content>
    </Layout>
  );
}