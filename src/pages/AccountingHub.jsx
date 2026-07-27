import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import {
  FileText,
  Receipt,
  Repeat,
  Book,
  PieChart,
  DollarSign,
  BookOpen,
  Plus,
  ChevronRight,
  TrendingUp,
  TrendingDown,
  IndianRupee,
  CreditCard,
  Wallet,
  Calculator,
  BarChart2,
  Settings,
  Calendar,
  Users,
  ShoppingCart,
  Package,
  ClipboardList,
  Boxes,
  PlusCircle,
  BarChart,
} from "lucide-react";
import { supabase } from "../api/supabase";
import { useOrg } from "../context/OrganizationContext";
import { useTheme } from "../context/ThemeContext";

export default function AccountingHub() {
  const { branch, selectedFinancialYear } = useOrg();
  const theme = useTheme();
  const branchId = branch?.id;
  const financialYearId = selectedFinancialYear?.id;

  const headingFont = theme?.font_heading || "Righteous";
  const bodyFont = theme?.font_body || "Montserrat";

  // ─── 1. Total Income (current month) ──────────────────
  const today = new Date();
  const monthStart = new Date(today.getFullYear(), today.getMonth(), 1)
    .toISOString()
    .split("T")[0];
  const monthEnd = new Date(today.getFullYear(), today.getMonth() + 1, 0)
    .toISOString()
    .split("T")[0];

  const { data: incomeTotal = 0, isLoading: incomeLoading } = useQuery({
    queryKey: ["income-total-month", monthStart, monthEnd, branchId, financialYearId],
    queryFn: async () => {
      let query = supabase
        .from("income")
        .select("amount")
        .gte("income_date", monthStart)
        .lte("income_date", monthEnd);
      if (branchId) query = query.eq("branch_id", branchId);
      if (financialYearId) query = query.eq("financial_year_id", financialYearId);
      const { data } = await query;
      return data.reduce((sum, row) => sum + Number(row.amount || 0), 0);
    },
    enabled: !!branchId && !!financialYearId,
    staleTime: 5 * 60 * 1000,
  });

  // ─── 2. Total Expenses (current month) ────────────────
  const { data: expenseTotal = 0, isLoading: expenseLoading } = useQuery({
    queryKey: ["expense-total-month", monthStart, monthEnd, branchId, financialYearId],
    queryFn: async () => {
      let query = supabase
        .from("expenses")
        .select("amount")
        .gte("expense_date", monthStart)
        .lte("expense_date", monthEnd);
      if (branchId) query = query.eq("branch_id", branchId);
      if (financialYearId) query = query.eq("financial_year_id", financialYearId);
      const { data } = await query;
      return data.reduce((sum, row) => sum + Number(row.amount || 0), 0);
    },
    enabled: !!branchId && !!financialYearId,
    staleTime: 5 * 60 * 1000,
  });

  const profit = incomeTotal - expenseTotal;

  // ─── 3. Pending Invoices ──────────────────────────────
  const { data: pendingInvoices = 0, isLoading: invoicesLoading } = useQuery({
    queryKey: ["pending-invoices-count", branchId, financialYearId],
    queryFn: async () => {
      let query = supabase
        .from("invoices")
        .select("id", { count: "exact", head: true })
        .eq("status", "Draft");
      if (branchId) query = query.eq("branch_id", branchId);
      if (financialYearId) query = query.eq("financial_year_id", financialYearId);
      const { count } = await query;
      return count || 0;
    },
    enabled: !!branchId && !!financialYearId,
    staleTime: 5 * 60 * 1000,
  });

  // ─── 4. Recent Invoices (last 5) ──────────────────────
  const { data: recentInvoices = [], isLoading: recentInvoicesLoading } = useQuery({
    queryKey: ["recent-invoices", branchId, financialYearId],
    queryFn: async () => {
      let query = supabase
        .from("invoices")
        .select(
          `
          id, invoice_number, invoice_date, grand_total, status,
          students(first_name, last_name)
        `
        )
        .order("invoice_date", { ascending: false })
        .limit(5);
      if (branchId) query = query.eq("branch_id", branchId);
      if (financialYearId) query = query.eq("financial_year_id", financialYearId);
      const { data } = await query;
      return data || [];
    },
    enabled: !!branchId && !!financialYearId,
    staleTime: 2 * 60 * 1000,
  });

  // ─── 5. Recent Receipts (last 5) ──────────────────────
  const { data: recentReceipts = [], isLoading: recentReceiptsLoading } = useQuery({
    queryKey: ["recent-receipts", branchId, financialYearId],
    queryFn: async () => {
      let query = supabase
        .from("receipts")
        .select(
          `
          id, receipt_no, receipt_date, amount,
          students(first_name, last_name)
        `
        )
        .order("receipt_date", { ascending: false })
        .limit(5);
      if (branchId) query = query.eq("branch_id", branchId);
      if (financialYearId) query = query.eq("financial_year_id", financialYearId);
      const { data } = await query;
      return data || [];
    },
    enabled: !!branchId && !!financialYearId,
    staleTime: 2 * 60 * 1000,
  });

  // ─── Quick Actions (all colours replaced with theme primary) ─────────────────
  const quickActions = [
    {
      title: "Invoices",
      icon: FileText,
      link: "/invoices",
    },
    {
      title: "Receipts",
      icon: Receipt,
      link: "/receipts",
    },
    {
      title: "Vouchers",
      icon: Repeat,
      link: "/vouchers",
    },
    {
      title: "Ledger",
      icon: Book,
      link: "/ledger",
    },
    {
      title: "Trial Balance",
      icon: PieChart,
      link: "/trial-balance",
    },
    {
      title: "Profit & Loss",
      icon: DollarSign,
      link: "/profit-loss",
    },
    {
      title: "Balance Sheet",
      icon: BookOpen,
      link: "/balance-sheet",
    },
    {
      title: "Cash Book",
      icon: Wallet,
      link: "/cash-book",
    },
    {
      title: "Day Book",
      icon: Calendar,
      link: "/day-book",
    },
    {
      title: "Chart of Accounts",
      icon: Settings,
      link: "/chart-of-accounts",
    },
    {
      title: "GST Reports",
      icon: Calculator,
      link: "/gst-report",
    },
    {
      title: "Finance Hub",
      icon: BarChart2,
      link: "/Home/FinanceHub",
    },
    {
      title: "Vendors",
      icon: Users,
      link: "/vendors",
    },
    {
      title: "Purchase Invoices",
      icon: ShoppingCart,
      link: "/purchase-invoices",
    },
    {
      title: "Purchase Orders",
      icon: Package,
      link: "/purchase-orders",
    },
    {
      title: "Purchase Register",
      icon: ClipboardList,
      link: "/purchase-register",
    },
    {
      title: "Inventory Items",
      icon: Boxes,
      link: "/inventory-items",
    },
    {
      title: "Add Stock",
      icon: PlusCircle,
      link: "/add-stock",
    },
    {
      title: "Stock Dashboard",
      icon: BarChart,
      link: "/stock-dashboard",
    },
  ];

  // ─── Stats Cards (theme colours) ────────────────────────────────────────
  const stats = [
    {
      label: "Income (This Month)",
      value: incomeLoading ? "..." : `₹${incomeTotal.toLocaleString("en-IN")}`,
      icon: TrendingUp,
      color: "text-accent",
    },
    {
      label: "Expenses (This Month)",
      value: expenseLoading ? "..." : `₹${expenseTotal.toLocaleString("en-IN")}`,
      icon: TrendingDown,
      color: "text-primary-dark",
    },
    {
      label: "Profit / Loss",
      value: expenseLoading || incomeLoading ? "..." : `₹${profit.toLocaleString("en-IN")}`,
      icon: IndianRupee,
      color: profit >= 0 ? "text-accent" : "text-primary-dark",
    },
    {
      label: "Pending Invoices",
      value: invoicesLoading ? "..." : pendingInvoices,
      icon: FileText,
      color: "text-primary",
    },
  ];

  return (
    <>
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between mb-6">
        <div>
          <h1
            className="text-3xl text-primary"
            style={{ fontFamily: headingFont }}
          >
            Accounting Hub
          </h1>
          <p
            className="text-sm text-primary-dark mt-1"
            style={{ fontFamily: bodyFont }}
          >
            Complete financial management – sales, purchases, inventory & reports
          </p>
        </div>
        <div className="flex gap-2 mt-2 sm:mt-0">
          <Link
            to="/invoices/new"
            className="bg-primary hover:bg-primary-light text-white px-5 py-2.5 rounded-lg transition flex items-center gap-2 text-sm"
            style={{ fontFamily: bodyFont }}
          >
            <Plus size={18} /> New Invoice
          </Link>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        {stats.map((stat, idx) => (
          <div
            key={idx}
            className="bg-white rounded-xl shadow-sm p-5 border border-primary-bg"
          >
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs text-primary-dark" style={{ fontFamily: bodyFont }}>
                  {stat.label}
                </p>
                <p
                  className={`text-2xl font-bold mt-1 ${stat.color}`}
                  style={{ fontFamily: headingFont }}
                >
                  {stat.value}
                </p>
              </div>
              <stat.icon size={32} className={`opacity-60 ${stat.color}`} />
            </div>
          </div>
        ))}
      </div>

      {/* Quick Actions Grid */}
      <div className="mb-6">
        <h2
          className="text-lg font-semibold text-primary mb-3"
          style={{ fontFamily: headingFont }}
        >
          Quick Actions
        </h2>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6 gap-3">
          {quickActions.map((action) => (
            <Link
              key={action.title}
              to={action.link}
              className="bg-white rounded-xl shadow-sm border border-primary-bg p-4 hover:shadow-md transition hover:border-primary group"
            >
              <div className="flex flex-col items-center text-center">
                <div className="p-3 rounded-full bg-primary-bg text-primary mb-2 group-hover:scale-105 transition">
                  <action.icon size={20} />
                </div>
                <span
                  className="text-sm font-medium text-primary-dark"
                  style={{ fontFamily: bodyFont }}
                >
                  {action.title}
                </span>
              </div>
            </Link>
          ))}
        </div>
      </div>

      {/* Two-column: Recent Invoices + Recent Receipts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Recent Invoices */}
        <div className="bg-white rounded-xl shadow-sm border border-primary-bg overflow-hidden">
          <div className="px-5 py-3 border-b border-primary-bg flex items-center justify-between">
            <h3
              className="font-semibold text-primary"
              style={{ fontFamily: headingFont }}
            >
              Recent Invoices
            </h3>
            <Link
              to="/invoices"
              className="text-sm text-primary hover:underline flex items-center gap-1"
            >
              View All <ChevronRight size={16} />
            </Link>
          </div>
          <div className="p-3 max-h-72 overflow-y-auto">
            {recentInvoicesLoading ? (
              <div className="text-center py-4 text-primary-dark">Loading...</div>
            ) : recentInvoices.length === 0 ? (
              <div className="text-center py-4 text-primary-dark">No invoices yet.</div>
            ) : (
              <div className="space-y-3">
                {recentInvoices.map((inv) => (
                  <div
                    key={inv.id}
                    className="flex items-center justify-between p-2 bg-primary-bg rounded-lg"
                  >
                    <div className="flex-1">
                      <p className="text-sm font-medium">{inv.invoice_number}</p>
                      <p className="text-xs text-primary-dark">
                        {inv.students?.first_name} {inv.students?.last_name}
                      </p>
                      <p className="text-xs text-primary-dark">{inv.invoice_date}</p>
                    </div>
                    <div className="text-right">
                      <p className="text-sm font-semibold text-primary">
                        ₹{Number(inv.grand_total).toLocaleString("en-IN")}
                      </p>
                      <span
                        className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                          inv.status === "Final"
                            ? "bg-accent-bg text-accent-dark"
                            : inv.status === "Draft"
                            ? "bg-primary-bg text-primary-dark"
                            : "bg-accent-bg text-accent"
                        }`}
                      >
                        {inv.status}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Recent Receipts */}
        <div className="bg-white rounded-xl shadow-sm border border-primary-bg overflow-hidden">
          <div className="px-5 py-3 border-b border-primary-bg flex items-center justify-between">
            <h3
              className="font-semibold text-primary"
              style={{ fontFamily: headingFont }}
            >
              Recent Receipts
            </h3>
            <Link
              to="/receipts"
              className="text-sm text-primary hover:underline flex items-center gap-1"
            >
              View All <ChevronRight size={16} />
            </Link>
          </div>
          <div className="p-3 max-h-72 overflow-y-auto">
            {recentReceiptsLoading ? (
              <div className="text-center py-4 text-primary-dark">Loading...</div>
            ) : recentReceipts.length === 0 ? (
              <div className="text-center py-4 text-primary-dark">No receipts yet.</div>
            ) : (
              <div className="space-y-3">
                {recentReceipts.map((rec) => (
                  <div
                    key={rec.id}
                    className="flex items-center justify-between p-2 bg-primary-bg rounded-lg"
                  >
                    <div className="flex-1">
                      <p className="text-sm font-medium">{rec.receipt_no}</p>
                      <p className="text-xs text-primary-dark">
                        {rec.students?.first_name} {rec.students?.last_name}
                      </p>
                      <p className="text-xs text-primary-dark">{rec.receipt_date}</p>
                    </div>
                    <div className="text-right">
                      <p className="text-sm font-semibold text-accent-dark">
                        ₹{Number(rec.amount).toLocaleString("en-IN")}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </>
  );
}