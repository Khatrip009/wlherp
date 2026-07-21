// src/pages/ProfitLoss.jsx
import { useState, useMemo, useRef } from "react";
import { useQuery } from "@tanstack/react-query";
import { Printer, Mail } from "lucide-react";
import html2canvas from "html2canvas";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
} from "recharts";

import { supabase } from "../api/supabase";
import { getOrganization } from "../services/organizationService";
import { useOrg } from "../context/OrganizationContext";
import { sendEmail } from "../services/emailService";

const GROUP_CONFIG = {
  "Direct Income": { parent: 4000, type: "income" },
  "Indirect Income": { parent: 4100, type: "income" },
  "Direct Expenses": { parent: 5000, type: "expense" },
  "Indirect Expenses": { parent: 5100, type: "expense" },
};

const COLORS = ["#0D47A1", "#FF1070", "#00C49F", "#FFBB28", "#0088FE", "#FF8042"];

export default function ProfitLoss() {
  const today = new Date().toISOString().split("T")[0];
  const firstOfMonth = new Date(new Date().getFullYear(), new Date().getMonth(), 1)
    .toISOString()
    .split("T")[0];

  const [startDate, setStartDate] = useState(firstOfMonth);
  const [endDate, setEndDate] = useState(today);

  const { org: currentOrg, branch, selectedFinancialYear } = useOrg();
  const branchId = branch?.id;
  const financialYearId = selectedFinancialYear?.id;

  const { data: org } = useQuery({
    queryKey: ["organization", currentOrg?.id],
    queryFn: () => getOrganization(currentOrg?.id),
    enabled: !!currentOrg?.id,
  });

  const chartRef = useRef(null);

  // ─── Profit & Loss data ─────────────────────────────────────────────
  const { data: accounts = [], isLoading } = useQuery({
    queryKey: ["profit-loss", startDate, endDate, branchId, financialYearId],
    queryFn: async () => {
      const { data } = await supabase.rpc("get_profit_loss", {
        start_date: startDate,
        end_date: endDate,
        p_branch_id: branchId,
        p_financial_year_id: financialYearId,
      });
      return data || [];
    },
    enabled: !!(startDate && endDate && branchId && financialYearId),
  });

  const groups = useMemo(() => {
    const result = {};
    for (const [name] of Object.entries(GROUP_CONFIG)) {
      result[name] = { items: [], total: 0 };
    }
    const otherIncome = { items: [], total: 0 };
    const otherExpenses = { items: [], total: 0 };

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
        if (a.account_type === "income") {
          otherIncome.items.push({ ...a, balance: bal });
          otherIncome.total += bal;
        } else if (a.account_type === "expense") {
          otherExpenses.items.push({ ...a, balance: bal });
          otherExpenses.total += bal;
        }
      }
    });

    if (otherIncome.items.length > 0) result["Other Income"] = otherIncome;
    if (otherExpenses.items.length > 0) result["Other Expenses"] = otherExpenses;

    return result;
  }, [accounts]);

  const totalIncome = Object.entries(groups)
    .filter(([name]) => name.toLowerCase().includes("income"))
    .reduce((s, [_, g]) => s + g.total, 0);
  const totalExpenses = Object.entries(groups)
    .filter(([name]) => name.toLowerCase().includes("expense"))
    .reduce((s, [_, g]) => s + g.total, 0);
  const netProfit = totalIncome - totalExpenses;

  const incomeVsExpenseData = [
    { name: "Income", value: totalIncome },
    { name: "Expenses", value: totalExpenses },
  ];

  const expenseBreakdown = Object.entries(groups)
    .filter(([name]) => name.toLowerCase().includes("expense"))
    .map(([name, group]) => ({ name, value: group.total }))
    .filter((item) => item.value > 0);

  const incomeBreakdown = Object.entries(groups)
    .filter(([name]) => name.toLowerCase().includes("income"))
    .map(([name, group]) => ({ name, value: group.total }))
    .filter((item) => item.value > 0);

  // ─── Helper: get admin emails ──────────────────────────────────────
  const getAdminEmails = async () => {
    if (!currentOrg?.id) return [];
    const { data, error } = await supabase
      .from("profiles")
      .select("email")
      .eq("organization_id", currentOrg.id)
      .in("role", ["admin", "super_admin", "organization_admin"])
      .eq("is_active", true);
    if (error) {
      console.error("Failed to fetch admin emails:", error);
      return [];
    }
    return data?.map(p => p.email).filter(Boolean) || [];
  };

  // ─── Send report email ─────────────────────────────────────────────
  const sendReportEmail = async () => {
    if (Object.keys(groups).length === 0) {
      alert("No data to send.");
      return;
    }

    try {
      const adminEmails = await getAdminEmails();
      if (adminEmails.length === 0) {
        alert("No admin emails found.");
        return;
      }

      // 1. Capture charts as images
      const chartsContainer = document.getElementById("pl-charts");
      let chartImage = null;
      if (chartsContainer) {
        const canvas = await html2canvas(chartsContainer, { scale: 1.5, useCORS: true });
        chartImage = canvas.toDataURL("image/png");
      }

      // 2. Build HTML for email
      const formatCurrency = (val) => `₹ ${Math.abs(val).toLocaleString("en-IN")}`;

      // Build income tables HTML
      let incomeHtml = "";
      Object.entries(groups)
        .filter(([name]) => name.toLowerCase().includes("income"))
        .forEach(([name, group]) => {
          incomeHtml += `
            <h4 style="margin:10px 0 4px;">${name}</h4>
            <table style="width:100%;border-collapse:collapse;font-size:11px;margin-bottom:8px;">
              <thead>
                <tr style="background:#f0f0f0;">
                  <th style="padding:4px 8px;border:1px solid #ddd;text-align:left;">Account</th>
                  <th style="padding:4px 8px;border:1px solid #ddd;text-align:right;">Amount</th>
                </tr>
              </thead>
              <tbody>
                ${group.items.map(item => `
                  <tr>
                    <td style="padding:4px 8px;border:1px solid #ddd;">${item.account_name}</td>
                    <td style="padding:4px 8px;border:1px solid #ddd;text-align:right;">${formatCurrency(item.balance)}</td>
                  </tr>
                `).join('')}
                <tr style="font-weight:bold;background:#e8f5e9;">
                  <td style="padding:4px 8px;border:1px solid #ddd;">Total ${name}</td>
                  <td style="padding:4px 8px;border:1px solid #ddd;text-align:right;">${formatCurrency(group.total)}</td>
                </tr>
              </tbody>
            </table>
          `;
        });

      // Build expense tables HTML
      let expenseHtml = "";
      Object.entries(groups)
        .filter(([name]) => name.toLowerCase().includes("expense"))
        .forEach(([name, group]) => {
          expenseHtml += `
            <h4 style="margin:10px 0 4px;">${name}</h4>
            <table style="width:100%;border-collapse:collapse;font-size:11px;margin-bottom:8px;">
              <thead>
                <tr style="background:#f0f0f0;">
                  <th style="padding:4px 8px;border:1px solid #ddd;text-align:left;">Account</th>
                  <th style="padding:4px 8px;border:1px solid #ddd;text-align:right;">Amount</th>
                </tr>
              </thead>
              <tbody>
                ${group.items.map(item => `
                  <tr>
                    <td style="padding:4px 8px;border:1px solid #ddd;">${item.account_name}</td>
                    <td style="padding:4px 8px;border:1px solid #ddd;text-align:right;">${formatCurrency(item.balance)}</td>
                  </tr>
                `).join('')}
                <tr style="font-weight:bold;background:#ffebee;">
                  <td style="padding:4px 8px;border:1px solid #ddd;">Total ${name}</td>
                  <td style="padding:4px 8px;border:1px solid #ddd;text-align:right;">${formatCurrency(group.total)}</td>
                </tr>
              </tbody>
            </table>
          `;
        });

      const orgName = org?.company_name || "Academy";
      const isProfit = netProfit >= 0;

      const htmlBody = `
        <div style="font-family:Arial,sans-serif;max-width:800px;margin:0 auto;">
          <h2 style="color:#0D47A1;">Profit & Loss Statement</h2>
          <p><strong>Organization:</strong> ${orgName}</p>
          <p><strong>Branch:</strong> ${branch?.branch_name || 'N/A'}</p>
          <p><strong>Period:</strong> ${startDate} – ${endDate}</p>
          <hr />
          ${chartImage ? `<div style="text-align:center;margin:15px 0;"><img src="${chartImage}" alt="Charts" style="max-width:100%;height:auto;"/></div>` : ''}
          <h3 style="color:#2e7d32;">Income</h3>
          ${incomeHtml}
          <div style="font-size:16px;font-weight:bold;border-top:2px solid #2e7d32;padding-top:6px;margin-top:12px;">
            Total Income: ${formatCurrency(totalIncome)}
          </div>
          <h3 style="color:#c62828;margin-top:20px;">Expenses</h3>
          ${expenseHtml}
          <div style="font-size:16px;font-weight:bold;border-top:2px solid #c62828;padding-top:6px;margin-top:12px;">
            Total Expenses: ${formatCurrency(totalExpenses)}
          </div>
          <div style="margin-top:20px;padding:16px;border-radius:8px;border:2px solid ${isProfit ? '#2e7d32' : '#c62828'};background:${isProfit ? '#e8f5e9' : '#ffebee'};text-align:center;">
            <p style="font-size:18px;font-weight:bold;color:${isProfit ? '#2e7d32' : '#c62828'};">
              ${isProfit ? 'Net Profit' : 'Net Loss'}: ${formatCurrency(netProfit)}
            </p>
          </div>
          <p style="color:#888;font-size:10px;margin-top:20px;">Computer‑generated report from ${orgName}</p>
        </div>
      `;

      await sendEmail({
        to: adminEmails,
        subject: `Profit & Loss Statement - ${startDate} to ${endDate}`,
        html: htmlBody,
       //// from: org?.email || undefined,
      });

      alert("Report sent to admins.");
    } catch (err) {
      console.error("Failed to send report:", err);
      alert("Failed to send report. Check console for details.");
    }
  };

  // ─── Print handler (unchanged) ─────────────────────────────────────
  const handlePrint = async () => {
    const printArea = document.getElementById("pl-print-area");
    if (!printArea) return;

    let chartImage = null;
    const chartsContainer = document.getElementById("pl-charts");
    if (chartsContainer) {
      const canvas = await html2canvas(chartsContainer, { scale: 2, useCORS: true });
      chartImage = canvas.toDataURL("image/png");
    }

    const logoUrl = org?.logo_dark_url || "/ShreeVidhyaDark.png";
    const orgName = org?.company_name || "ShreeVidhya Academy";
    const orgAddr = org?.address || "";
    const orgPhone = org?.phone || "";
    const orgEmail = org?.email || "";

    const printWindow = window.open("", "_blank", "width=1000,height=750");
    printWindow.document.write(`
      <html>
        <head>
          <title>Profit & Loss Statement</title>
          <style>
            @page { size: A4; margin: 12mm; }
            body { font-family: Montserrat, sans-serif; color: #222; font-size: 11px; }
            .header { display: flex; align-items: center; border-bottom: 2px solid #0D47A1; padding-bottom: 8px; margin-bottom: 15px; }
            .header img { height: 45px; margin-right: 15px; }
            .org-name { font-size: 18px; font-weight: 700; color: #0D47A1; }
            .org-details { font-size: 9px; color: #555; }
            h1 { text-align: center; color: #0D47A1; margin: 15px 0 5px; font-size: 16px; }
            .date { text-align: center; font-size: 10px; color: #666; margin-bottom: 15px; }
            table { width: 100%; border-collapse: collapse; border: 1px solid #bbb; margin-bottom: 12px; }
            th, td { padding: 5px 10px; border: 1px solid #bbb; }
            th { background-color: #E3F2FD; font-weight: 600; }
            .total-row td { font-weight: 700; background-color: #f0f4ff; border-top: 2px solid #0D47A1; }
            .grand-total { font-size: 13px; font-weight: 700; margin-top: 15px; border-top: 2px solid #0D47A1; border-bottom: 2px solid #0D47A1; padding: 8px 0; }
            .footer { margin-top: 25px; font-size: 9px; color: #888; text-align: center; border-top: 1px solid #ddd; padding-top: 8px; }
            .chart-section { text-align: center; margin: 20px 0; }
            .chart-section img { max-width: 100%; height: auto; }
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
          <h1>Profit & Loss Statement</h1>
          <div class="date">Period: ${startDate} – ${endDate}</div>
          ${chartImage ? `<div class="chart-section"><img src="${chartImage}" alt="Charts" /></div>` : ""}
          ${printArea.querySelector(".print-content")?.innerHTML || ""}
          <div class="footer">Computer‑generated financial statement – ${orgName}</div>
          <script>window.print();</script>
        </body>
      </html>
    `);
    printWindow.document.close();
  };

  const formatCurrency = (val) => `₹ ${Math.abs(val).toLocaleString("en-IN")}`;

  return (
    <>
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-3xl font-righteous text-primary-dark">Profit & Loss Statement</h1>
        <div className="flex gap-2">
          <button
            onClick={sendReportEmail}
            className="bg-green-600 hover:bg-green-700 text-white px-4 py-2 rounded-lg text-sm flex items-center gap-2"
          >
            <Mail size={16} /> Send Report
          </button>
          <button
            onClick={handlePrint}
            className="bg-primary text-white px-4 py-2 rounded-lg text-sm flex items-center gap-2"
          >
            <Printer size={16} /> Print
          </button>
        </div>
      </div>

      <div className="flex flex-wrap gap-4 mb-6">
        <div>
          <label className="text-sm font-medium mr-2">From:</label>
          <input
            type="date"
            value={startDate}
            onChange={(e) => setStartDate(e.target.value)}
            className="border rounded p-2 text-sm"
          />
        </div>
        <div>
          <label className="text-sm font-medium mr-2">To:</label>
          <input
            type="date"
            value={endDate}
            onChange={(e) => setEndDate(e.target.value)}
            className="border rounded p-2 text-sm"
          />
        </div>
      </div>

      {isLoading ? (
        <p className="text-center py-8">Loading…</p>
      ) : (
        <>
          {/* Charts Section */}
          <div id="pl-charts" className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
            <div className="bg-white rounded-xl p-5 shadow-sm border">
              <h3 className="font-semibold text-primary-dark mb-4">Income vs Expenses</h3>
              <ResponsiveContainer width="100%" height={250}>
                <BarChart data={incomeVsExpenseData}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="name" />
                  <YAxis />
                  <Tooltip />
                  <Legend />
                  <Bar dataKey="value" fill="#0D47A1" name="Amount" />
                </BarChart>
              </ResponsiveContainer>
            </div>

            <div className="bg-white rounded-xl p-5 shadow-sm border">
              <h3 className="font-semibold text-primary-dark mb-4">Expense Breakdown</h3>
              {expenseBreakdown.length === 0 ? (
                <p className="text-sm text-secondary text-center py-10">No expenses recorded</p>
              ) : (
                <ResponsiveContainer width="100%" height={250}>
                  <PieChart>
                    <Pie
                      data={expenseBreakdown}
                      dataKey="value"
                      nameKey="name"
                      cx="50%"
                      cy="50%"
                      outerRadius={80}
                      label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
                    >
                      {expenseBreakdown.map((_, index) => (
                        <Cell key={index} fill={COLORS[index % COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip />
                    <Legend />
                  </PieChart>
                </ResponsiveContainer>
              )}
            </div>
          </div>

          {/* Printable content */}
          <div id="pl-print-area" className="bg-white rounded-xl p-6 shadow-sm">
            <div className="print-content">
              {/* Income */}
              <h2 className="text-xl font-semibold text-green-700 mb-4 border-b pb-2">Income</h2>
              {Object.entries(groups)
                .filter(([name]) => name.toLowerCase().includes("income"))
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
                        <tr className="font-bold bg-green-50">
                          <td className="p-2 border">Total {name}</td>
                          <td className="p-2 border text-right">{formatCurrency(group.total)}</td>
                        </tr>
                      </tbody>
                    </table>
                  </div>
                ))}
              <div className="text-lg font-bold border-t-2 border-green-700 pt-3 mt-4 mb-8">
                Total Income: {formatCurrency(totalIncome)}
              </div>

              {/* Expenses */}
              <h2 className="text-xl font-semibold text-red-700 mb-4 border-b pb-2">Expenses</h2>
              {Object.entries(groups)
                .filter(([name]) => name.toLowerCase().includes("expense"))
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
                        <tr className="font-bold bg-red-50">
                          <td className="p-2 border">Total {name}</td>
                          <td className="p-2 border text-right">{formatCurrency(group.total)}</td>
                        </tr>
                      </tbody>
                    </table>
                  </div>
                ))}
              <div className="text-lg font-bold border-t-2 border-red-700 pt-3 mt-4 mb-8">
                Total Expenses: {formatCurrency(totalExpenses)}
              </div>

              {/* Net Profit / Loss */}
              <div
                className={`mt-6 p-4 rounded-lg border-2 ${
                  netProfit >= 0 ? "bg-green-50 border-green-700" : "bg-red-50 border-red-700"
                }`}
              >
                <div className="text-center">
                  <p className="text-sm text-secondary-dark mb-2">
                    {netProfit >= 0 ? "Net Profit" : "Net Loss"}
                  </p>
                  <p className="text-3xl font-bold text-primary-dark">{formatCurrency(netProfit)}</p>
                  <p className="text-xs text-secondary-dark mt-1">
                    ({netProfit >= 0 ? "Income exceeds Expenses" : "Expenses exceed Income"})
                  </p>
                </div>
              </div>
            </div>
          </div>
        </>
      )}
    </>
  );
}