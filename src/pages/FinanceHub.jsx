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
    <Layout style={{ minHeight: "100vh", background: "#fff" }}>
      <Sider width={220} theme="light" style={{ borderRight: "1px solid #f0f0f0" }}>
        <div style={{ padding: "16px 0" }}>
          <Title level={5} style={{ paddingLeft: 24, marginBottom: 8 }}>
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

      <Content style={{ padding: 24, background: "#fff" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
          <Title level={4}>{currentItem?.label || "Finance"}</Title>
          <div>
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

        {/* ✅ Pass noLayout to all child components */}
        <ComponentToRender noLayout={true} />
      </Content>
    </Layout>
  );
}