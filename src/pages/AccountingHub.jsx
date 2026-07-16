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

export default function AccountingHub() {
  const { branch, selectedFinancialYear, theme } = useOrg();
  const branchId = branch?.id;
  const financialYearId = selectedFinancialYear?.id;

  const primaryColor = theme?.primary_color || "#0D47A1";
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

  // ─── Quick Actions ──────────────────────────────────────
  const quickActions = [
    // ─── Core Accounting ──────────────────────────────────────
    {
      title: "Invoices",
      icon: FileText,
      link: "/invoices",
      color: "bg-blue-100 text-blue-700",
    },
    {
      title: "Receipts",
      icon: Receipt,
      link: "/receipts",
      color: "bg-green-100 text-green-700",
    },
    {
      title: "Vouchers",
      icon: Repeat,
      link: "/vouchers",
      color: "bg-purple-100 text-purple-700",
    },
    {
      title: "Ledger",
      icon: Book,
      link: "/ledger",
      color: "bg-indigo-100 text-indigo-700",
    },
    {
      title: "Trial Balance",
      icon: PieChart,
      link: "/trial-balance",
      color: "bg-orange-100 text-orange-700",
    },
    {
      title: "Profit & Loss",
      icon: DollarSign,
      link: "/profit-loss",
      color: "bg-pink-100 text-pink-700",
    },
    {
      title: "Balance Sheet",
      icon: BookOpen,
      link: "/balance-sheet",
      color: "bg-cyan-100 text-cyan-700",
    },
    {
      title: "Cash Book",
      icon: Wallet,
      link: "/cash-book",
      color: "bg-yellow-100 text-yellow-700",
    },
    {
      title: "Day Book",
      icon: Calendar,
      link: "/day-book",
      color: "bg-rose-100 text-rose-700",
    },
    {
      title: "Chart of Accounts",
      icon: Settings,
      link: "/chart-of-accounts",
      color: "bg-gray-100 text-gray-700",
    },
    {
      title: "GST Reports",
      icon: Calculator,
      link: "/gst-report",
      color: "bg-teal-100 text-teal-700",
    },
    {
      title: "Finance Hub",
      icon: BarChart2,
      link: "/Home/FinanceHub",
      color: "bg-amber-100 text-amber-700",
    },

    // ─── Purchases & Inventory ──────────────────────────────
    {
      title: "Vendors",
      icon: Users,
      link: "/vendors",
      color: "bg-slate-100 text-slate-700",
    },
    {
      title: "Purchase Invoices",
      icon: ShoppingCart,
      link: "/purchase-invoices",
      color: "bg-emerald-100 text-emerald-700",
    },
    {
      title: "Purchase Orders",
      icon: Package,
      link: "/purchase-orders",
      color: "bg-sky-100 text-sky-700",
    },
    {
      title: "Purchase Register",
      icon: ClipboardList,
      link: "/purchase-register",
      color: "bg-violet-100 text-violet-700",
    },
    {
      title: "Inventory Items",
      icon: Boxes,
      link: "/inventory-items",
      color: "bg-stone-100 text-stone-700",
    },
    {
      title: "Add Stock",
      icon: PlusCircle,
      link: "/add-stock",
      color: "bg-lime-100 text-lime-700",
    },
    {
      title: "Stock Dashboard",
      icon: BarChart,
      link: "/stock-dashboard",
      color: "bg-fuchsia-100 text-fuchsia-700",
    },
  ];

  // ─── Stats Cards ────────────────────────────────────────
  const stats = [
    {
      label: "Income (This Month)",
      value: incomeLoading ? "..." : `₹${incomeTotal.toLocaleString("en-IN")}`,
      icon: TrendingUp,
      color: "text-green-600",
    },
    {
      label: "Expenses (This Month)",
      value: expenseLoading ? "..." : `₹${expenseTotal.toLocaleString("en-IN")}`,
      icon: TrendingDown,
      color: "text-red-600",
    },
    {
      label: "Profit / Loss",
      value: expenseLoading || incomeLoading ? "..." : `₹${profit.toLocaleString("en-IN")}`,
      icon: IndianRupee,
      color: profit >= 0 ? "text-green-600" : "text-red-600",
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
            className="text-3xl"
            style={{ fontFamily: headingFont, color: primaryColor }}
          >
            Accounting Hub
          </h1>
          <p
            className="text-sm text-secondary-dark mt-1"
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
            className="bg-white rounded-xl shadow-sm p-5 border border-secondary-light"
          >
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs text-secondary-light" style={{ fontFamily: bodyFont }}>
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
          className="text-lg font-semibold mb-3"
          style={{ fontFamily: headingFont, color: primaryColor }}
        >
          Quick Actions
        </h2>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6 gap-3">
          {quickActions.map((action) => (
            <Link
              key={action.title}
              to={action.link}
              className="bg-white rounded-xl shadow-sm border border-secondary-light p-4 hover:shadow-md transition hover:border-primary group"
            >
              <div className="flex flex-col items-center text-center">
                <div
                  className={`p-3 rounded-full ${action.color} mb-2 group-hover:scale-105 transition`}
                >
                  <action.icon size={20} />
                </div>
                <span
                  className="text-sm font-medium text-secondary-dark"
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
        <div className="bg-white rounded-xl shadow-sm border border-secondary-light overflow-hidden">
          <div className="px-5 py-3 border-b border-secondary-light flex items-center justify-between">
            <h3
              className="font-semibold"
              style={{ fontFamily: headingFont, color: primaryColor }}
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
              <div className="text-center py-4 text-secondary">Loading...</div>
            ) : recentInvoices.length === 0 ? (
              <div className="text-center py-4 text-secondary">No invoices yet.</div>
            ) : (
              <div className="space-y-3">
                {recentInvoices.map((inv) => (
                  <div
                    key={inv.id}
                    className="flex items-center justify-between p-2 bg-gray-50 rounded-lg"
                  >
                    <div className="flex-1">
                      <p className="text-sm font-medium">{inv.invoice_number}</p>
                      <p className="text-xs text-secondary">
                        {inv.students?.first_name} {inv.students?.last_name}
                      </p>
                      <p className="text-xs text-secondary">{inv.invoice_date}</p>
                    </div>
                    <div className="text-right">
                      <p className="text-sm font-semibold text-primary">
                        ₹{Number(inv.grand_total).toLocaleString("en-IN")}
                      </p>
                      <span
                        className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                          inv.status === "Final"
                            ? "bg-green-100 text-green-700"
                            : inv.status === "Draft"
                            ? "bg-gray-100 text-gray-700"
                            : "bg-blue-100 text-blue-700"
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
        <div className="bg-white rounded-xl shadow-sm border border-secondary-light overflow-hidden">
          <div className="px-5 py-3 border-b border-secondary-light flex items-center justify-between">
            <h3
              className="font-semibold"
              style={{ fontFamily: headingFont, color: primaryColor }}
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
              <div className="text-center py-4 text-secondary">Loading...</div>
            ) : recentReceipts.length === 0 ? (
              <div className="text-center py-4 text-secondary">No receipts yet.</div>
            ) : (
              <div className="space-y-3">
                {recentReceipts.map((rec) => (
                  <div
                    key={rec.id}
                    className="flex items-center justify-between p-2 bg-gray-50 rounded-lg"
                  >
                    <div className="flex-1">
                      <p className="text-sm font-medium">{rec.receipt_no}</p>
                      <p className="text-xs text-secondary">
                        {rec.students?.first_name} {rec.students?.last_name}
                      </p>
                      <p className="text-xs text-secondary">{rec.receipt_date}</p>
                    </div>
                    <div className="text-right">
                      <p className="text-sm font-semibold text-green-700">
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