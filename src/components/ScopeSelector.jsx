// src/components/ScopeSelector.jsx
import { useScope } from "../context/ScopeContext";
import { Building, Calendar } from "lucide-react";

export default function ScopeSelector() {
  const {
    branch,
    setBranch,
    branches,
    financialYears,
    selectedFinancialYear,
    switchFinancialYear,
  } = useScope();

  if (branches.length <= 1 && financialYears.length === 0) return null;

  return (
    <div className="space-y-3 text-white">
      {branches.length > 1 && (
        <div>
          <label className="flex items-center gap-1.5 text-xs font-medium text-gray-300 mb-1">
            <Building size={14} />
            Branch
          </label>
          <select
            value={branch?.id || ""}
            onChange={(e) => {
              const selected = branches.find((b) => b.id == e.target.value);
              if (selected) setBranch(selected);
            }}
            className="w-full rounded-lg border border-primary-dark bg-primary-light text-white px-3 py-1.5 text-sm focus:ring-2 focus:ring-white/30"
          >
            {branches.map((b) => (
              <option key={b.id} value={b.id} className="bg-primary text-white">
                {b.branch_name}
              </option>
            ))}
          </select>
        </div>
      )}

      {financialYears.length > 0 && (
        <div>
          <label className="flex items-center gap-1.5 text-xs font-medium text-gray-300 mb-1">
            <Calendar size={14} />
            Financial Year
          </label>
          {selectedFinancialYear ? (
            <select
              value={selectedFinancialYear.id}
              onChange={(e) => switchFinancialYear(Number(e.target.value))}
              className="w-full rounded-lg border border-primary-dark bg-primary-light text-white px-3 py-1.5 text-sm focus:ring-2 focus:ring-white/30"
            >
              {financialYears.map((fy) => (
                <option key={fy.id} value={fy.id} className="bg-primary text-white">
                  {fy.name}
                </option>
              ))}
            </select>
          ) : (
            <select
              onChange={(e) => {
                const id = Number(e.target.value);
                if (id) switchFinancialYear(id);
              }}
              className="w-full rounded-lg border border-primary-dark bg-primary-light text-white px-3 py-1.5 text-sm focus:ring-2 focus:ring-white/30"
              defaultValue=""
            >
              <option value="" disabled className="bg-primary text-white">
                Select FY
              </option>
              {financialYears.map((fy) => (
                <option key={fy.id} value={fy.id} className="bg-primary text-white">
                  {fy.name}
                </option>
              ))}
            </select>
          )}
        </div>
      )}
    </div>
  );
}