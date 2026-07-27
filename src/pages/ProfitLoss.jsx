// src/pages/ProfitLoss.jsx
import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { Printer } from "lucide-react";
import { generateProfitLossPdf } from "../utils/profitLossPdf"; // ✅ only one import
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

export default function ProfitLoss() {
  const today = new Date().toISOString().split("T")[0];
  const firstOfMonth = new Date(new Date().getFullYear(), new Date().getMonth(), 1)
    .toISOString().split("T")[0];
  const [startDate, setStartDate] = useState(firstOfMonth);
  const [endDate, setEndDate] = useState(today);

  const { org, branch, selectedFinancialYear } = useOrg();
  const branchId = branch?.id;
  const financialYearId = selectedFinancialYear?.id;

  /* ─── Data fetching ──────────── */
  const { data: accounts = [], isLoading } = useQuery({
    queryKey: ["profit-loss", startDate, endDate, branchId, financialYearId, org?.id],
    queryFn: async () => {
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

      const totals = {};
      for (const l of lines || []) {
        const aid = l.account_id;
        if (!totals[aid]) totals[aid] = { debit: 0, credit: 0 };
        totals[aid].debit += Number(l.debit) || 0;
        totals[aid].credit += Number(l.credit) || 0;
      }

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
      return results;
    },
    enabled: !!(startDate && endDate && org?.id),
  });

  /* ─── Grouping ────────────────── */
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

  /* ─── PDF Export ──────────────── */
  const handlePrintPDF = async () => {
    if (!org?.id) {
      console.error("Organization not loaded");
      return;
    }

    const summary = {
      totalIncome,
      totalExpense: totalExpenses,
      profit: netProfit,
    };
    const periodLabel = `${startDate} to ${endDate}`;

    try {
      await generateProfitLossPdf({
        groups,
        summary,
        startDate,
        endDate,
        periodLabel,
        orgId: org.id,
      });
    } catch (error) {
      console.error("Failed to generate PDF:", error);
    }
  };

  /* ─── Charts & UI ─────────────── */
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
            className="bg-gray-900 hover:bg-accent text-white px-4 py-2 rounded-lg text-sm flex items-center gap-2 transition"
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