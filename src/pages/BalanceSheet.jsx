// src/pages/BalanceSheet.jsx
import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { Printer } from "lucide-react";
import AdminLayout from "../layouts/AdminLayout";
import { supabase } from "../api/supabase";
import { getOrganization } from "../services/organizationService";
import { useOrg } from "../context/OrganizationContext";   // NEW

const GROUP_CONFIG = {
  "Current Assets": { parent: 1000, type: "asset" },
  "Fixed Assets": { parent: 1100, type: "asset" },
  "Current Liabilities": { parent: 2000, type: "liability" },
  "Long‑Term Liabilities": { parent: 2100, type: "liability" },
  "Equity": { parent: 3000, type: "equity" },
};

export default function BalanceSheet() {
  const [asOfDate, setAsOfDate] = useState(new Date().toISOString().split("T")[0]);
  const { org: currentOrg } = useOrg();                  // NEW

  // Pass current org id to getOrganization
  const { data: org } = useQuery({
    queryKey: ["organization", currentOrg?.id],
    queryFn: () => getOrganization(currentOrg?.id),
    enabled: !!currentOrg?.id,
  });

  const { data: accounts = [], isLoading } = useQuery({
    queryKey: ["balance-sheet", asOfDate],
    queryFn: async () => {
      const { data } = await supabase.rpc("get_balance_sheet", { as_of_date: asOfDate });
      return data || [];
    },
    enabled: !!asOfDate,
  });

  // Group accounts by parent (unchanged)
  const groups = useMemo(() => {
    const result = {};
    for (const [name] of Object.entries(GROUP_CONFIG)) {
      result[name] = { items: [], total: 0 };
    }

    const otherAssets = { items: [], total: 0 };
    const otherLiabilities = { items: [], total: 0 };
    const otherEquity = { items: [], total: 0 };

    accounts.forEach((a) => {
      const bal = parseFloat(a.balance) || 0;
      if (bal === 0) return;

      let placed = false;
      for (const [name, cfg] of Object.entries(GROUP_CONFIG)) {
        if (a.parent_id === cfg.parent && a.account_type === cfg.type) {
          result[name].items.push({ ...a, balance: bal });
          result[name].total += bal;
          placed = true;
          break;
        }
      }

      if (!placed) {
        if (a.account_type === "asset") {
          otherAssets.items.push({ ...a, balance: bal });
          otherAssets.total += bal;
        } else if (a.account_type === "liability") {
          otherLiabilities.items.push({ ...a, balance: bal });
          otherLiabilities.total += bal;
        } else if (a.account_type === "equity") {
          otherEquity.items.push({ ...a, balance: bal });
          otherEquity.total += bal;
        }
      }
    });

    if (otherAssets.items.length > 0) result["Other Assets"] = otherAssets;
    if (otherLiabilities.items.length > 0) result["Other Liabilities"] = otherLiabilities;
    if (otherEquity.items.length > 0) result["Other Equity"] = otherEquity;

    return result;
  }, [accounts]);

  const totalAssets = Object.entries(groups)
    .filter(([name]) => name.toLowerCase().includes("asset"))
    .reduce((s, [_, g]) => s + g.total, 0);

  const totalLiabilities = Object.entries(groups)
    .filter(([name]) => name.toLowerCase().includes("liabilit"))
    .reduce((s, [_, g]) => s + g.total, 0);

  const totalEquity = Object.entries(groups)
    .filter(([name]) => name.toLowerCase().includes("equity"))
    .reduce((s, [_, g]) => s + g.total, 0);

  // ── Professional Print ──────────────────────────────────
  const handlePrint = () => {
    const printArea = document.getElementById("balance-sheet-print")?.innerHTML;
    if (!printArea) return;

    const logoUrl = org?.logo_dark_url || "/ShreeVidhyaDark.png";
    const orgName = org?.company_name || "ShreeVidhya Academy";
    const orgAddr = org?.address || "";
    const orgPhone = org?.phone || "";
    const orgEmail = org?.email || "";

    const printWindow = window.open("", "_blank", "width=1000,height=750");
    printWindow.document.write(`
      <html>
        <head>
          <title>Balance Sheet</title>
          <style>
            @page { size: A4; margin: 12mm; }
            body { font-family: Montserrat, sans-serif; color: #222; font-size: 11px; }
            .header { display: flex; align-items: center; border-bottom: 2px solid #0D47A1; padding-bottom: 8px; margin-bottom: 15px; }
            .header img { height: 45px; margin-right: 15px; }
            .org-name { font-size: 18px; font-weight: 700; color: #0D47A1; }
            .org-details { font-size: 9px; color: #555; }
            h1 { text-align: center; color: #0D47A1; margin: 15px 0 5px; font-size: 16px; }
            .date { text-align: center; font-size: 10px; color: #666; margin-bottom: 15px; }
            .section { margin-bottom: 15px; }
            .section-title { font-weight: 700; font-size: 12px; color: #0D47A1; border-bottom: 1px solid #0D47A1; padding-bottom: 3px; margin-bottom: 5px; }
            table { width: 100%; border-collapse: collapse; border: 1px solid #bbb; }
            th, td { padding: 5px 10px; border: 1px solid #bbb; }
            th { background-color: #E3F2FD; font-weight: 600; }
            .total-row td { font-weight: 700; background-color: #f0f4ff; border-top: 2px solid #0D47A1; }
            .grand-total { font-size: 13px; font-weight: 700; margin-top: 15px; border-top: 2px solid #0D47A1; border-bottom: 2px solid #0D47A1; padding: 8px 0; }
            .footer { margin-top: 25px; font-size: 9px; color: #888; text-align: center; border-top: 1px solid #ddd; padding-top: 8px; }
            @media print { body { -webkit-print-color-adjust: exact; print-color-adjust: exact; } }
          </style>
        </head>
        <body>
          <div class="header">
            <img src="${logoUrl}" alt="Logo" onerror="this.style.display='none'" />
            <div>
              <div class="org-name">${orgName}</div>
              <div class="org-details">${orgAddr}</div>
              <div class="org-details">Ph: ${orgPhone}  |  Email: ${orgEmail}</div>
            </div>
          </div>
          <h1>Balance Sheet</h1>
          <div class="date">As of ${asOfDate}</div>
          ${printArea}
          <div class="footer">Computer‑generated financial statement – ${orgName}</div>
          <script>window.print();</script>
        </body>
      </html>
    `);
    printWindow.document.close();
  };

  const formatCurrency = (val) => `₹ ${Math.abs(val).toLocaleString("en-IN")}`;

  return (
    <AdminLayout>
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-3xl font-righteous text-primary-dark">Balance Sheet</h1>
        <button
          onClick={handlePrint}
          className="bg-primary text-white px-4 py-2 rounded-lg text-sm flex items-center gap-2"
        >
          <Printer size={16} /> Print
        </button>
      </div>

      <div className="mb-4">
        <label className="text-sm font-medium mr-2">As of Date:</label>
        <input
          type="date"
          value={asOfDate}
          onChange={(e) => setAsOfDate(e.target.value)}
          className="border rounded p-2 text-sm"
        />
      </div>

      {isLoading ? (
        <p className="text-center py-8">Loading balance sheet…</p>
      ) : (
        <div id="balance-sheet-print" className="bg-white rounded-xl p-6 shadow-sm">
          {/* ── Assets ── */}
          <h2 className="text-xl font-semibold text-primary-dark mb-4 border-b pb-2">Assets</h2>
          {Object.entries(groups)
            .filter(([name]) => name.toLowerCase().includes("asset"))
            .map(([name, group]) => (
              <div key={name} className="mb-4">
                <h3 className="font-bold text-sm text-primary-dark mb-2">{name}</h3>
                <table className="w-full text-sm border">
                  <thead>
                    <tr className="bg-slate-50">
                      <th className="p-2 text-left border">Account</th>
                      <th className="p-2 text-right border w-32">Amount</th>
                    </tr>
                  </thead>
                  <tbody>
                    {group.items.map((item) => (
                      <tr key={item.account_code}>
                        <td className="p-2 border">{item.account_name}</td>
                        <td className="p-2 border text-right">{formatCurrency(item.balance)}</td>
                      </tr>
                    ))}
                    <tr className="font-bold bg-blue-50">
                      <td className="p-2 border">Total {name}</td>
                      <td className="p-2 border text-right">{formatCurrency(group.total)}</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            ))}
          <div className="text-lg font-bold border-t-2 border-primary-dark pt-3 mt-4 mb-8">
            Total Assets: {formatCurrency(totalAssets)}
          </div>

          {/* ── Liabilities ── */}
          <h2 className="text-xl font-semibold text-primary-dark mb-4 border-b pb-2">Liabilities</h2>
          {Object.entries(groups)
            .filter(([name]) => name.toLowerCase().includes("liabilit"))
            .map(([name, group]) => (
              <div key={name} className="mb-4">
                <h3 className="font-bold text-sm text-primary-dark mb-2">{name}</h3>
                <table className="w-full text-sm border">
                  <thead>
                    <tr className="bg-slate-50">
                      <th className="p-2 text-left border">Account</th>
                      <th className="p-2 text-right border w-32">Amount</th>
                    </tr>
                  </thead>
                  <tbody>
                    {group.items.map((item) => (
                      <tr key={item.account_code}>
                        <td className="p-2 border">{item.account_name}</td>
                        <td className="p-2 border text-right">{formatCurrency(item.balance)}</td>
                      </tr>
                    ))}
                    <tr className="font-bold bg-blue-50">
                      <td className="p-2 border">Total {name}</td>
                      <td className="p-2 border text-right">{formatCurrency(group.total)}</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            ))}
          <div className="text-lg font-bold border-t-2 border-primary-dark pt-3 mt-4 mb-8">
            Total Liabilities: {formatCurrency(totalLiabilities)}
          </div>

          {/* ── Equity ── */}
          <h2 className="text-xl font-semibold text-primary-dark mb-4 border-b pb-2">Equity</h2>
          {Object.entries(groups)
            .filter(([name]) => name.toLowerCase().includes("equity"))
            .map(([name, group]) => (
              <div key={name} className="mb-4">
                <h3 className="font-bold text-sm text-primary-dark mb-2">{name}</h3>
                <table className="w-full text-sm border">
                  <thead>
                    <tr className="bg-slate-50">
                      <th className="p-2 text-left border">Account</th>
                      <th className="p-2 text-right border w-32">Amount</th>
                    </tr>
                  </thead>
                  <tbody>
                    {group.items.map((item) => (
                      <tr key={item.account_code}>
                        <td className="p-2 border">{item.account_name}</td>
                        <td className="p-2 border text-right">{formatCurrency(item.balance)}</td>
                      </tr>
                    ))}
                    <tr className="font-bold bg-blue-50">
                      <td className="p-2 border">Total {name}</td>
                      <td className="p-2 border text-right">{formatCurrency(group.total)}</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            ))}
          <div className="text-lg font-bold border-t-2 border-primary-dark pt-3 mt-4 mb-8">
            Total Equity: {formatCurrency(totalEquity)}
          </div>

          {/* ── Grand Total ── */}
          <div className="mt-6 p-4 bg-blue-50 rounded-lg border-2 border-primary-dark">
            <div className="grid grid-cols-2 gap-4 text-center">
              <div>
                <p className="text-sm text-secondary-dark">Total Liabilities + Equity</p>
                <p className="text-2xl font-bold text-primary-dark">{formatCurrency(totalLiabilities + totalEquity)}</p>
              </div>
              <div>
                <p className="text-sm text-secondary-dark">Total Assets</p>
                <p className="text-2xl font-bold text-primary-dark">{formatCurrency(totalAssets)}</p>
              </div>
            </div>
            <div className="text-center mt-3">
              {Math.abs(totalAssets - (totalLiabilities + totalEquity)) < 0.01 ? (
                <span className="inline-block px-4 py-1 bg-green-100 text-green-700 rounded-full text-sm font-medium">
                  ✅ Balanced
                </span>
              ) : (
                <span className="inline-block px-4 py-1 bg-red-100 text-red-700 rounded-full text-sm font-medium">
                  ⚠️ Difference: {formatCurrency(totalAssets - (totalLiabilities + totalEquity))}
                </span>
              )}
            </div>
          </div>
        </div>
      )}
    </AdminLayout>
  );
}