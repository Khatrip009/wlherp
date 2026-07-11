import AdminLayout from "../layouts/AdminLayout";
import HubCard from "../components/HubCard";
import {
  BookOpen, FileText, BarChart3, IndianRupee, ArrowLeftRight,
  Receipt, ClipboardList, Wallet, Calendar, AlertCircle,
  CheckCircle, Monitor, Box, ShoppingCart, CreditCard,
  FileSpreadsheet, List, Building, PlusCircle, Settings, Percent,
} from "lucide-react";

const groups = [
  {
    label: "Core Accounting",
    items: [
      { to: "/chart-of-accounts", icon: BookOpen, label: "Chart of Accounts", desc: "Manage account codes and types" },
      { to: "/vouchers", icon: FileText, label: "All Vouchers", desc: "View all transaction vouchers" },
      { to: "/payment-voucher", icon: IndianRupee, label: "Payment Voucher", desc: "Record expenses and payments" },
      { to: "/receipt-voucher", icon: Receipt, label: "Receipt Voucher", desc: "Record incomes and receipts" },
      { to: "/contra-voucher", icon: ArrowLeftRight, label: "Contra Voucher", desc: "Bank ↔ Cash transfers" },
      { to: "/journal-entry", icon: PlusCircle, label: "Journal Entry", desc: "Manual double-entry vouchers" },
    ],
  },
  {
    label: "Fee & Finance",
    items: [
      { to: "/fees/structures", icon: IndianRupee, label: "Fee Structures", desc: "Define fee plans with components" },
      { to: "/fees", icon: IndianRupee, label: "Student Fees", desc: "Assign and manage student fee records" },
      { to: "/receipts", icon: FileText, label: "Receipts", desc: "View all payment receipts" },
      { to: "/income", icon: IndianRupee, label: "Income", desc: "Record other income entries" },
      { to: "/expenses", icon: IndianRupee, label: "Expenses", desc: "Record expense entries" },
    ],
  },
  {
    label: "Financial Reports",
    items: [
      { to: "/ledger", icon: BookOpen, label: "Ledger", desc: "Account-wise transaction entries" },
      { to: "/trial-balance", icon: BarChart3, label: "Trial Balance", desc: "Summary of all accounts" },
      { to: "/balance-sheet", icon: BarChart3, label: "Balance Sheet", desc: "Assets, liabilities and equity" },
      { to: "/profit-loss", icon: BarChart3, label: "Profit & Loss", desc: "Income and expense summary" },
      { to: "/cash-book", icon: Wallet, label: "Cash / Bank Book", desc: "Daily cash and bank transactions" },
      { to: "/day-book", icon: Calendar, label: "Day Book", desc: "Chronological transaction log" },
      { to: "/aged-receivables", icon: AlertCircle, label: "Aged Receivables", desc: "Outstanding student fees" },
      { to: "/bank-reconciliation", icon: CheckCircle, label: "Bank Reconciliation", desc: "Match bank statements" },
      { to: "/budgets", icon: BarChart3, label: "Budgets", desc: "Create and manage budgets" },
      { to: "/budget-vs-actual", icon: BarChart3, label: "Budget vs Actual", desc: "Compare actuals to budgets" },
      { to: "/fixed-assets", icon: Monitor, label: "Fixed Assets", desc: "Track depreciation and assets" },
      { to: "/bill-wise", icon: FileText, label: "Bill-wise Payables", desc: "Track vendor bills" },
    ],
  },
  {
    label: "Fee Reports",
    items: [
      { to: "/reports/fee_collection", icon: BarChart3, label: "Fee Collection", desc: "Payments collected in a date range" },
      { to: "/reports/pending_fees", icon: AlertCircle, label: "Pending Fees", desc: "Students with outstanding balance" },
      { to: "/reports/fee_instalments", icon: FileText, label: "Instalment Tracking", desc: "Status of all fee instalments" },
      { to: "/reports/fee_aging_analysis", icon: AlertCircle, label: "Fee Aging Analysis", desc: "Outstanding balances by age bucket" },
      { to: "/reports/payment_mode_summary", icon: BarChart3, label: "Payment Mode Summary", desc: "Collections grouped by payment mode" },
      { to: "/reports/daily_cashbook", icon: Calendar, label: "Daily Cashbook", desc: "Daily inflow, outflow and net movement" },
      { to: "/reports/receipts_journal", icon: Receipt, label: "Receipts Journal", desc: "All receipts in a date range" },
      { to: "/reports/income_statement", icon: BarChart3, label: "Income Statement", desc: "Income records with tax breakdown" },
      { to: "/reports/expense_statement", icon: BarChart3, label: "Expense Statement", desc: "Expenses by category and date" },
      { to: "/reports/expense_category_summary", icon: BarChart3, label: "Expense Category Summary", desc: "Spend grouped by category" },
      { to: "/reports/profit_loss_summary", icon: BarChart3, label: "P&L Summary", desc: "Total income vs expenses" },
    ],
  },
  {
    label: "GST & Tax",
    items: [
      { to: "/gst-report", icon: FileText, label: "GSTR-1 Report", desc: "GSTR-1 JSON export and HSN summary" },
      { to: "/gstr-3b-summary", icon: FileSpreadsheet, label: "GSTR-3B Summary", desc: "Outward tax, ITC and net liability" },
      { to: "/reports/tax_collected", icon: BarChart3, label: "Tax Collected", desc: "Tax amounts from fees and income" },
      { to: "/tax-settings", icon: Settings, label: "Tax Settings", desc: "Configure tax rates" },
      { to: "/gst-settings", icon: Percent, label: "GST Settings", desc: "GST registration and configuration" },
    ],
  },
  {
    label: "Invoicing",
    items: [
      { to: "/invoices", icon: FileText, label: "Sales Invoices", desc: "Create and manage GST invoices" },
      { to: "/vendors", icon: Building, label: "Vendors", desc: "Manage vendor / supplier records" },
      { to: "/purchase-invoices", icon: ShoppingCart, label: "Purchase Invoices", desc: "Vendor bills with GST and ITC" },
      { to: "/purchase-register", icon: FileText, label: "Purchase Register", desc: "Inward supply report" },
      { to: "/credit-notes", icon: CreditCard, label: "Credit Notes", desc: "Issue credit against invoices" },
      { to: "/debit-notes", icon: CreditCard, label: "Debit Notes", desc: "Issue debit against invoices" },
    ],
  },
  {
    label: "Inventory & Stock",
    items: [
      { to: "/inventory-items", icon: Box, label: "Inventory Items", desc: "Manage products and stock items" },
      { to: "/stock-dashboard", icon: BarChart3, label: "Stock Dashboard", desc: "Stock levels overview" },
      { to: "/add-stock", icon: PlusCircle, label: "Add Stock", desc: "Record stock additions" },
      { to: "/inventory-transactions", icon: List, label: "Transactions", desc: "Full stock movement log" },
      { to: "/inventory-issue", icon: Building, label: "Issue to Student", desc: "Issue inventory items to students" },
      { to: "/purchase-orders", icon: ClipboardList, label: "Purchase Orders", desc: "Create and manage POs" },
    ],
  },
  {
    label: "Printable Documents",
    items: [
      { to: "/reports/fee_receipt", icon: Receipt, label: "Fee Receipt", desc: "Print individual fee payment receipts" },
      { to: "/reports/expense_receipt", icon: FileText, label: "Expense Voucher", desc: "Print expense receipts" },
      { to: "/reports/income_receipt", icon: FileText, label: "Income Receipt", desc: "Print income receipts" },
      { to: "/reports/salary_slip", icon: FileText, label: "Salary Slip", desc: "Print monthly salary slips" },
    ],
  },
];

export default function AccountingHub() {
  return (
    <AdminLayout>
      <div className="mb-6">
        <h1 className="text-3xl font-righteous text-primary-dark">Accounting & Finance Hub</h1>
        <p className="text-sm text-secondary-dark mt-1">
          All accounting, finance, fees, tax, invoicing, inventory and reports
        </p>
      </div>
      <div className="space-y-8">
        {groups.map((g) => (
          <div key={g.label}>
            <h2 className="text-sm font-semibold uppercase tracking-wider text-secondary-light border-b pb-2 mb-4">{g.label}</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
              {g.items.map((m) => <HubCard key={m.to} {...m} />)}
            </div>
          </div>
        ))}
      </div>
    </AdminLayout>
  );
}
