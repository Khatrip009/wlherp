// src/components/ScopeSelector.jsx
import { Select, Space, Typography } from "antd";
import { useOrg } from "../context/OrganizationContext";
import { useTheme } from "../context/ThemeContext"; // ✅ dynamic theme

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

  const theme = useTheme();                                     // ✅ theme hook
  const bodyFont = theme?.font_body || "Montserrat";            // ✅ dynamic font

  // Only show when there's something to select
  if (branches.length <= 1 && financialYears.length === 0) return null;

  return (
    <Space size="middle" style={{ whiteSpace: "nowrap" }}>
      {branches.length > 1 && (
        <Space size={4}>
          {/* Replace antd Text with styled span for theme consistency */}
          <span
            className="text-primary-dark/60 text-xs"
            style={{ fontFamily: bodyFont }}
          >
            Branch
          </span>
          <Select
            value={branch?.id}
            onChange={(id) => {
              const selected = branches.find((b) => b.id === id);
              if (selected) setBranch(selected);
            }}
            size="small"
            style={{ minWidth: 130, fontFamily: bodyFont }}
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
          <span
            className="text-primary-dark/60 text-xs"
            style={{ fontFamily: bodyFont }}
          >
            FY
          </span>
          <Select
            value={selectedFinancialYear?.id}
            onChange={(id) => switchFinancialYear(Number(id))}
            size="small"
            style={{ minWidth: 110, fontFamily: bodyFont }}
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