// src/components/ScopeSelector.jsx
import { Select, Space, Typography } from "antd";
import { useOrg } from "../context/OrganizationContext";

const { Text } = Typography;

export default function ScopeSelector() {
  const {
    branches,
    branch,
    setBranch,
    financialYears,
    selectedFinancialYear,
    switchFinancialYear,
  } = useOrg();

  // Only show when there's something to select
  if (branches.length <= 1 && financialYears.length === 0) return null;

  return (
    <Space size="middle" style={{ whiteSpace: "nowrap" }}>
      {branches.length > 1 && (
        <Space size={4}>
          <Text type="secondary" style={{ fontSize: 12 }}>Branch</Text>
          <Select
            value={branch?.id}
            onChange={(id) => {
              const selected = branches.find((b) => b.id === id);
              if (selected) setBranch(selected);
            }}
            size="small"
            style={{ minWidth: 130 }}
          >
            {branches.map((b) => (
              <Select.Option key={b.id} value={b.id}>
                {b.branch_name}
              </Select.Option>
            ))}
          </Select>
        </Space>
      )}
      {financialYears.length > 0 && (
        <Space size={4}>
          <Text type="secondary" style={{ fontSize: 12 }}>FY</Text>
          <Select
            value={selectedFinancialYear?.id}
            onChange={(id) => switchFinancialYear(Number(id))}
            size="small"
            style={{ minWidth: 110 }}
          >
            {financialYears.map((fy) => (
              <Select.Option key={fy.id} value={fy.id}>
                {fy.name}
              </Select.Option>
            ))}
          </Select>
        </Space>
      )}
    </Space>
  );
}