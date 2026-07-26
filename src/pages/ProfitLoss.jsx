// src/pages/ProfitLoss.jsx
import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { Printer } from "lucide-react";
import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
  PieChart, Pie, Cell,
} from "recharts";

import { supabase } from "../api/supabase";
import { useOrg } from "../context/OrganizationContext";

/* ─── Group config (parent IDs from YOUR chart) ─────────────── */
const GROUP_CONFIG = {
  "Direct Income":   { parent_id: 39, type: "income" },
  "Indirect Income": { parent_id: 40, type: "income" },
  "Direct Expenses":  { parent_id: 41, type: "expense" },
  "Indirect Expenses":{ parent_id: 42, type: "expense" },
};

const COLORS = ["#0D47A1", "#FF1070", "#00C49F", "#FFBB28", "#0088FE", "#FF8042"];

/* ─── PDF helpers ──────────────────────────────────────────── */
async function loadImageAsBase64(url) {
  if (!url) return null;
  try {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const blob = await res.blob();
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve(reader.result);
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
  } catch { return null; }
}

function createRupeeSymbolImage() {
  const canvas = document.createElement("canvas");
  canvas.width = 30; canvas.height = 30;
  const ctx = canvas.getContext("2d");
  ctx.font = "bold 24px sans-serif"; ctx.fillStyle = "#000";
  ctx.textAlign = "center"; ctx.textBaseline = "middle";
  ctx.fillText("₹", 15, 15);
  return canvas.toDataURL("image/png");
}
let rupeeImage = null;
function getRupeeImage() { if (!rupeeImage) rupeeImage = createRupeeSymbolImage(); return rupeeImage; }

function drawCurrency(doc, amount, x, y, fontSize = 10, align = "left", color = "#000") {
  const img = getRupeeImage();
  doc.setFont("helvetica", "normal");
  doc.setFontSize(fontSize);
  doc.setTextColor(color);
  const amountText = amount.toLocaleString("en-IN");
  if (align === "left") {
    doc.addImage(img, "PNG", x, y - fontSize * 0.35, 4, 4);
    doc.text(amountText, x + 5, y);
  } else {
    const textWidth = doc.getTextWidth(amountText);
    doc.addImage(img, "PNG", x - textWidth - 5, y - fontSize * 0.35, 4, 4);
    doc.text(amountText, x - textWidth, y);
  }
}

/* ─── Main component ──────────────────────────────────────── */
export default function ProfitLoss() {
  const today = new Date().toISOString().split("T")[0];
  const firstOfMonth = new Date(new Date().getFullYear(), new Date().getMonth(), 1)
    .toISOString().split("T")[0];
  const [startDate, setStartDate] = useState(firstOfMonth);
  const [endDate, setEndDate] = useState(today);

  const { org, branch, selectedFinancialYear } = useOrg();
  const branchId = branch?.id;
  const financialYearId = selectedFinancialYear?.id;

  /* ─── Data fetching (SINGLE QUERY, reliable) ──────────── */
  const { data: accounts = [], isLoading } = useQuery({
    queryKey: ["profit-loss", startDate, endDate, branchId, financialYearId, org?.id],
    queryFn: async () => {
      // 1. Fetch all accounts for this org / branch / FY
      let acctQuery = supabase
        .from("chart_of_accounts")
        .select("id, account_code, account_name, account_type, parent_id")
        .eq("organization_id", org?.id)
        .order("account_code");

      if (branchId) acctQuery = acctQuery.eq("branch_id", branchId);
      if (financialYearId) acctQuery = acctQuery.eq("financial_year_id", financialYearId);

      const { data: accts, error: acctErr } = await acctQuery;
      if (acctErr) throw acctErr;
      if (!accts?.length) return [];

      // 2. Fetch ALL journal lines for the period in ONE query
      let lineQuery = supabase
        .from("journal_entry_lines")
        .select("account_id, debit, credit, journal_entries!inner(entry_date)")
        .gte("journal_entries.entry_date", startDate)
        .lte("journal_entries.entry_date", endDate);

      if (branchId) {
        lineQuery = lineQuery.or(`branch_id.eq.${branchId},branch_id.is.null`);
      }

      const { data: lines, error: lineErr } = await lineQuery;
      if (lineErr) throw lineErr;

      // 3. Aggregate per account
      const totals = {};
      for (const l of lines || []) {
        const aid = l.account_id;
        if (!totals[aid]) totals[aid] = { debit: 0, credit: 0 };
        totals[aid].debit += Number(l.debit) || 0;
        totals[aid].credit += Number(l.credit) || 0;
      }

      // 4. Merge with accounts and calculate balance
      const results = [];
      for (const a of accts) {
        const t = totals[a.id];
        if (!t) continue;
        let balance = 0;
        if (a.account_type === "income") {
          balance = t.credit - t.debit;
        } else if (a.account_type === "expense") {
          balance = t.debit - t.credit;
        }
        if (balance !== 0) {
          results.push({ ...a, balance });
        }
      }

      console.log("✅ P&L accounts with balances:", results);
      return results;
    },
    enabled: !!(startDate && endDate && org?.id),
  });

  /* ─── Grouping ────────────────────────────────────────── */
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
        if (a.parent_id === cfg.parent_id && a.account_type === cfg.type) {
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

  /* ─── PDF Export (fully working) ───────────────────────── */
// ─── PDF Export (overlap & formatting fixed) ──────────────────
const handlePrintPDF = async () => {
  if (Object.keys(groups).length === 0) return;

  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const margin = 12;
  let y = margin;

  // Logo
  let logoBase64 = null;
  if (org?.logo_dark_url) {
    logoBase64 = await loadImageAsBase64(org.logo_dark_url);
  }

  // Header
  const logoWidth = 30, logoHeight = 12;
  if (logoBase64) {
    doc.addImage(logoBase64, "PNG", margin, y, logoWidth, logoHeight);
  }
  const textX = margin + (logoBase64 ? logoWidth + 4 : 0);
  const textY = y + 1;

  doc.setFont("helvetica", "bold");
  doc.setFontSize(14);
  doc.setTextColor("#000000");
  doc.text(org?.company_name || "Academy", textX, textY);

  doc.setFont("helvetica", "normal");
  doc.setFontSize(7);
  doc.setTextColor("#000000");
  let detailY = textY + 4.5;
  if (org?.address) {
    const addrLines = doc.splitTextToSize(org.address, pageWidth - textX - margin - 10);
    doc.text(addrLines, textX, detailY);
    detailY += addrLines.length * 3.5 + 1;
  }
  if (org?.gstin) { doc.text(`GSTIN: ${org.gstin}`, textX, detailY); detailY += 4; }
  if (org?.phone) { doc.text(`Phone: ${org.phone}`, textX, detailY); detailY += 4; }
  if (org?.email) { doc.text(`Email: ${org.email}`, textX, detailY); detailY += 4; }

  const headerHeight = Math.max(logoHeight + 4, detailY - textY + 4);
  y += headerHeight + 2;
  doc.setDrawColor("#000000");
  doc.line(margin, y, pageWidth - margin, y);
  y += 6;

  // Title
  doc.setFontSize(16);
  doc.setFont("helvetica", "bold");
  doc.setTextColor("#000000");
  doc.text("Profit & Loss Statement", pageWidth / 2, y, { align: "center" });
  y += 8;
  doc.setFontSize(10);
  doc.setFont("helvetica", "normal");
  doc.text(`Period: ${startDate} – ${endDate}`, pageWidth / 2, y, { align: "center" });
  y += 10;

  // ─── Helper: round and format numbers ───────────────────
  const formatAmount = (val) => Math.round((val || 0) * 100) / 100;

  // ─── Income Section ──────────────────────────────────────
  doc.setFontSize(12);
  doc.setFont("helvetica", "bold");
  doc.text("Income", margin, y);
  y += 8;

  const incomeGroups = Object.entries(groups).filter(([name]) => name.toLowerCase().includes("income"));
  for (const [name, group] of incomeGroups) {
    if (group.items.length === 0) continue;
    doc.setFontSize(10);
    doc.setFont("helvetica", "bold");
    doc.text(name, margin, y);
    y += 5;

    const rows = group.items.map((item) => [item.account_name, formatAmount(item.balance)]);
    autoTable(doc, {
      startY: y,
      head: [["Account", "Amount"]],
      body: rows,
      theme: "plain",
      styles: { fontSize: 9, textColor: [0,0,0], fillColor: [255,255,255], lineColor: [0,0,0], lineWidth: 0.2 },
      headStyles: { fillColor: [255,255,255], textColor: [0,0,0], fontStyle: "bold", lineWidth: 0.2, lineColor: [0,0,0] },
      columnStyles: {
        0: { cellWidth: 120, halign: "left" },
        1: { cellWidth: 50, halign: "right" },   // ✅ wider column
      },
      margin: { left: margin, right: margin },
      willDrawCell: (data) => {
        if (data.column.index === 1 && typeof data.cell.raw === "number") {
          data.cell.text = [];   // clear default text to avoid overlap
        }
      },
      didDrawCell: (data) => {
        if (data.column.index === 1 && typeof data.cell.raw === "number") {
          const x = data.cell.x + data.cell.width - 2;
          const yPos = data.cell.y + data.cell.height / 2 + 1.5;
          drawCurrency(doc, data.cell.raw, x, yPos, 9, "right", "#000");
        }
      },
    });
    y = doc.lastAutoTable.finalY + 4;

    doc.setFont("helvetica", "bold");
    doc.setFontSize(9);
    drawCurrency(doc, formatAmount(group.total), margin + 170, y, 9, "right", "#000");
    doc.text(`Total ${name}`, margin, y);
    y += 8;
  }

  doc.setFontSize(11);
  doc.setFont("helvetica", "bold");
  doc.text("Total Income", margin, y);
  drawCurrency(doc, formatAmount(totalIncome), margin + 170, y, 11, "right", "#000");
  y += 10;

  // ─── Expense Section ────────────────────────────────────
  doc.setFontSize(12);
  doc.text("Expenses", margin, y);
  y += 8;

  const expenseGroups = Object.entries(groups).filter(([name]) => name.toLowerCase().includes("expense"));
  for (const [name, group] of expenseGroups) {
    if (group.items.length === 0) continue;
    doc.setFontSize(10);
    doc.setFont("helvetica", "bold");
    doc.text(name, margin, y);
    y += 5;

    const rows = group.items.map((item) => [item.account_name, formatAmount(item.balance)]);
    autoTable(doc, {
      startY: y,
      head: [["Account", "Amount"]],
      body: rows,
      theme: "plain",
      styles: { fontSize: 9, textColor: [0,0,0], fillColor: [255,255,255], lineColor: [0,0,0], lineWidth: 0.2 },
      headStyles: { fillColor: [255,255,255], textColor: [0,0,0], fontStyle: "bold", lineWidth: 0.2, lineColor: [0,0,0] },
      columnStyles: {
        0: { cellWidth: 120, halign: "left" },
        1: { cellWidth: 50, halign: "right" },
      },
      margin: { left: margin, right: margin },
      willDrawCell: (data) => {
        if (data.column.index === 1 && typeof data.cell.raw === "number") {
          data.cell.text = [];
        }
      },
      didDrawCell: (data) => {
        if (data.column.index === 1 && typeof data.cell.raw === "number") {
          const x = data.cell.x + data.cell.width - 2;
          const yPos = data.cell.y + data.cell.height / 2 + 1.5;
          drawCurrency(doc, data.cell.raw, x, yPos, 9, "right", "#000");
        }
      },
    });
    y = doc.lastAutoTable.finalY + 4;

    doc.setFont("helvetica", "bold");
    doc.setFontSize(9);
    drawCurrency(doc, formatAmount(group.total), margin + 170, y, 9, "right", "#000");
    doc.text(`Total ${name}`, margin, y);
    y += 8;
  }

  doc.setFontSize(11);
  doc.setFont("helvetica", "bold");
  doc.text("Total Expenses", margin, y);
  drawCurrency(doc, formatAmount(totalExpenses), margin + 170, y, 11, "right", "#000");
  y += 10;

  // ─── Net Profit / Loss ──────────────────────────────────
  doc.setFontSize(13);
  const netLabel = netProfit >= 0 ? "Net Profit" : "Net Loss";
  doc.text(netLabel, margin, y);
  drawCurrency(doc, formatAmount(Math.abs(netProfit)), margin + 170, y, 13, "right", "#000");
  y += 15;

  // Footer
  const footerY = pageHeight - margin - 5;
  doc.setFontSize(7);
  doc.setTextColor("#000000");
  doc.setFont("helvetica", "italic");
  doc.text(`Generated on ${new Date().toLocaleString()}`, margin, footerY);
  doc.text(`© ${org?.company_name || "Academy"}`, pageWidth / 2, footerY, { align: "center" });

  doc.save(`Profit_Loss_${startDate}_${endDate}.pdf`);
};

  /* ─── Charts & UI ──────────────────────────────────────── */
  const incomeVsExpenseData = [
    { name: "Income", value: totalIncome },
    { name: "Expenses", value: totalExpenses },
  ];
  const expenseBreakdown = Object.entries(groups)
    .filter(([name]) => name.toLowerCase().includes("expense"))
    .map(([name, group]) => ({ name, value: group.total }))
    .filter((item) => item.value > 0);

  const formatCurrency = (val) => `₹ ${Math.abs(val).toLocaleString("en-IN")}`;

  return (
    <>
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-3xl font-righteous text-gray-900">Profit & Loss Statement</h1>
        <div className="flex gap-2">
          <button
            onClick={handlePrintPDF}
            className="bg-gray-900 hover:bg-gray-800 text-white px-4 py-2 rounded-lg text-sm flex items-center gap-2 transition"
          >
            <Printer size={16} /> Print PDF
          </button>
        </div>
      </div>

      <div className="flex flex-wrap gap-4 mb-6">
        <div>
          <label className="text-sm font-medium mr-2">From:</label>
          <input type="date" value={startDate} onChange={e => setStartDate(e.target.value)} className="border rounded p-2 text-sm" />
        </div>
        <div>
          <label className="text-sm font-medium mr-2">To:</label>
          <input type="date" value={endDate} onChange={e => setEndDate(e.target.value)} className="border rounded p-2 text-sm" />
        </div>
      </div>

      {isLoading ? (
        <p className="text-center py-8">Loading…</p>
      ) : (
        <>
          {/* Charts */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
            <div className="bg-white rounded-xl p-5 shadow-sm border">
              <h3 className="font-semibold text-gray-900 mb-4">Income vs Expenses</h3>
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
              <h3 className="font-semibold text-gray-900 mb-4">Expense Breakdown</h3>
              {expenseBreakdown.length === 0 ? (
                <p className="text-sm text-gray-500 text-center py-10">No expenses recorded</p>
              ) : (
                <ResponsiveContainer width="100%" height={250}>
                  <PieChart>
                    <Pie data={expenseBreakdown} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={80}
                      label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}>
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

          {/* Tables */}
          <div className="bg-white rounded-xl p-6 shadow-sm">
            <h2 className="text-xl font-semibold text-green-700 mb-4 border-b pb-2">Income</h2>
            {Object.entries(groups).filter(([name]) => name.toLowerCase().includes("income")).map(([name, group]) => (
              <div key={name} className="mb-4">
                <h3 className="font-bold text-sm text-gray-900 mb-2">{name}</h3>
                <table className="w-full text-sm border">
                  <thead><tr className="bg-slate-50"><th className="p-2 text-left border">Account</th><th className="p-2 text-right border w-32">Amount</th></tr></thead>
                  <tbody>
                    {group.items.map(item => (
                      <tr key={item.account_code}><td className="p-2 border">{item.account_name}</td><td className="p-2 border text-right">{formatCurrency(item.balance)}</td></tr>
                    ))}
                    <tr className="font-bold bg-green-50"><td className="p-2 border">Total {name}</td><td className="p-2 border text-right">{formatCurrency(group.total)}</td></tr>
                  </tbody>
                </table>
              </div>
            ))}
            <div className="text-lg font-bold border-t-2 border-green-700 pt-3 mt-4 mb-8">Total Income: {formatCurrency(totalIncome)}</div>

            <h2 className="text-xl font-semibold text-red-700 mb-4 border-b pb-2">Expenses</h2>
            {Object.entries(groups).filter(([name]) => name.toLowerCase().includes("expense")).map(([name, group]) => (
              <div key={name} className="mb-4">
                <h3 className="font-bold text-sm text-gray-900 mb-2">{name}</h3>
                <table className="w-full text-sm border">
                  <thead><tr className="bg-slate-50"><th className="p-2 text-left border">Account</th><th className="p-2 text-right border w-32">Amount</th></tr></thead>
                  <tbody>
                    {group.items.map(item => (
                      <tr key={item.account_code}><td className="p-2 border">{item.account_name}</td><td className="p-2 border text-right">{formatCurrency(item.balance)}</td></tr>
                    ))}
                    <tr className="font-bold bg-red-50"><td className="p-2 border">Total {name}</td><td className="p-2 border text-right">{formatCurrency(group.total)}</td></tr>
                  </tbody>
                </table>
              </div>
            ))}
            <div className="text-lg font-bold border-t-2 border-red-700 pt-3 mt-4 mb-8">Total Expenses: {formatCurrency(totalExpenses)}</div>

            <div className={`mt-6 p-4 rounded-lg border-2 ${netProfit >= 0 ? "bg-green-50 border-green-700" : "bg-red-50 border-red-700"}`}>
              <div className="text-center">
                <p className="text-sm text-gray-600 mb-2">{netProfit >= 0 ? "Net Profit" : "Net Loss"}</p>
                <p className="text-3xl font-bold text-gray-900">{formatCurrency(netProfit)}</p>
                <p className="text-xs text-gray-600 mt-1">({netProfit >= 0 ? "Income exceeds Expenses" : "Expenses exceed Income"})</p>
              </div>
            </div>
          </div>
        </>
      )}
    </>
  );
}