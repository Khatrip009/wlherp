// src/pages/CashBook.jsx
import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { Printer } from "lucide-react";
import AdminLayout from "../layouts/AdminLayout";
import { supabase } from "../api/supabase";
import { getOrganization } from "../services/organizationService";
import { useOrg } from "../context/OrganizationContext";

export default function CashBook() {
  const today = new Date().toISOString().split("T")[0];
  const firstOfMonth = new Date(new Date().getFullYear(), new Date().getMonth(), 1)
    .toISOString()
    .split("T")[0];

  const [startDate, setStartDate] = useState(firstOfMonth);
  const [endDate, setEndDate] = useState(today);
  const [selectedAccount, setSelectedAccount] = useState("all");

  // ── Current organisation, branch, and financial year ──
  const { org: currentOrg, branch, selectedFinancialYear } = useOrg();
  const branchId = branch?.id;
  const financialYearId = selectedFinancialYear?.id;

  // Fetch organization details
  const { data: org } = useQuery({
    queryKey: ["organization", currentOrg?.id],
    queryFn: () => getOrganization(currentOrg?.id),
    enabled: !!currentOrg?.id,
  });

  // Cash/bank accounts – scoped
  const { data: cashBankAccounts = [] } = useQuery({
    queryKey: ["cash-bank-accounts", branchId, financialYearId],
    queryFn: async () => {
      const { data } = await supabase
        .from("chart_of_accounts")
        .select("id, account_code, account_name")
        .in("account_code", ["1001", "1002", "1006"])
        .eq("branch_id", branchId)
        .eq("financial_year_id", financialYearId)
        .order("account_code");
      return data || [];
    },
    enabled: !!branchId && !!financialYearId,
    staleTime: Infinity,
  });

  // Compute account IDs based on filter
  const getAccountIds = useMemo(() => {
    if (selectedAccount === "all") return cashBankAccounts.map((a) => a.id);
    if (selectedAccount === "cash")
      return cashBankAccounts.filter((a) => a.account_code === "1001").map((a) => a.id);
    if (selectedAccount === "bank")
      return cashBankAccounts.filter((a) => a.account_code === "1002").map((a) => a.id);
    return [parseInt(selectedAccount)];
  }, [selectedAccount, cashBankAccounts]);

  // Opening balance – fully scoped (lines + journal entry)
  const { data: openingBalance = 0 } = useQuery({
    queryKey: ["cash-book-opening", startDate, selectedAccount, branchId, financialYearId],
    queryFn: async () => {
      const accountIds = getAccountIds;
      if (accountIds.length === 0) return 0;

      let query = supabase
        .from("journal_entry_lines")
        .select("debit, credit, journal_entries!inner(entry_date)")
        .in("account_id", accountIds)
        .eq("branch_id", branchId)
        .eq("financial_year_id", financialYearId)
        .eq("journal_entries.branch_id", branchId)         // ← scoped inner table
        .eq("journal_entries.financial_year_id", financialYearId) // ← scoped inner table
        .lt("journal_entries.entry_date", startDate);

      const { data } = await query;
      const totalDebit = data?.reduce((s, r) => s + parseFloat(r.debit), 0) || 0;
      const totalCredit = data?.reduce((s, r) => s + parseFloat(r.credit), 0) || 0;
      return totalDebit - totalCredit;
    },
    enabled: !!startDate && cashBankAccounts.length > 0 && !!branchId && !!financialYearId,
  });

  // Main entries for the period – fully scoped (lines + journal entry)
  const { data: entries = [], isLoading } = useQuery({
    queryKey: ["cash-book-entries", startDate, endDate, selectedAccount, branchId, financialYearId],
    queryFn: async () => {
      const accountIds = getAccountIds;
      if (accountIds.length === 0) return [];

      let query = supabase
        .from("journal_entry_lines")
        .select(`
          debit,
          credit,
          description,
          account_id,
          journal_entries!inner(entry_date, reference, id)
        `)
        .in("account_id", accountIds)
        .eq("branch_id", branchId)
        .eq("financial_year_id", financialYearId)
        .eq("journal_entries.branch_id", branchId)         // ← scoped inner table
        .eq("journal_entries.financial_year_id", financialYearId) // ← scoped inner table
        .gte("journal_entries.entry_date", startDate)
        .lte("journal_entries.entry_date", endDate)
        .order("journal_entries(entry_date)", { ascending: true })
        .order("id", { ascending: true });

      const { data } = await query;
      return data || [];
    },
    enabled: !!startDate && !!endDate && cashBankAccounts.length > 0 && !!branchId && !!financialYearId,
  });

  // Fetch voucher numbers – scoped
  const journalEntryIds = useMemo(
    () => entries.map((e) => e.journal_entries?.id).filter(Boolean),
    [entries]
  );

  const { data: vouchersMap = {} } = useQuery({
    queryKey: ["vouchers-for-entries", journalEntryIds, branchId, financialYearId],
    queryFn: async () => {
      if (journalEntryIds.length === 0) return {};
      let query = supabase
        .from("vouchers")
        .select("voucher_no, journal_entry_id")
        .in("journal_entry_id", journalEntryIds)
        .eq("branch_id", branchId)
        .eq("financial_year_id", financialYearId);
      const { data } = await query;
      const map = {};
      data?.forEach((v) => { map[v.journal_entry_id] = v.voucher_no; });
      return map;
    },
    enabled: journalEntryIds.length > 0 && !!branchId && !!financialYearId,
  });

  // Running balance
  const ledgerWithBalance = useMemo(() => {
    let running = openingBalance;
    return entries.map((entry) => {
      const debit = parseFloat(entry.debit) || 0;
      const credit = parseFloat(entry.credit) || 0;
      running = running + debit - credit;
      return {
        ...entry,
        balance: running,
        voucherNo: vouchersMap[entry.journal_entries?.id] || null,
      };
    });
  }, [entries, openingBalance, vouchersMap]);

  const closingBalance =
    ledgerWithBalance.length > 0
      ? ledgerWithBalance[ledgerWithBalance.length - 1].balance
      : openingBalance;

  const totalReceipts = entries.reduce((s, e) => s + (parseFloat(e.debit) || 0), 0);
  const totalPayments = entries.reduce((s, e) => s + (parseFloat(e.credit) || 0), 0);

  // Print
  const handlePrint = () => {
    const printContent = document.getElementById("cash-book-table")?.outerHTML;
    if (!printContent) return;

    const logoUrl = org?.logo_dark_url || "/ShreeVidhyaDark.png";
    const orgName = org?.company_name || "ShreeVidhya Academy";
    const orgAddr = org?.address || "";
    const orgPhone = org?.phone || "";
    const orgEmail = org?.email || "";

    const printWindow = window.open("", "_blank", "width=1000,height=750");
    printWindow.document.write(`
      <html>
        <head>
          <title>Cash/Bank Book</title>
          <style>
            @page { size: A4 landscape; margin: 12mm; }
            body { font-family: Montserrat, sans-serif; color: #222; font-size: 10px; }
            .header { display: flex; align-items: center; border-bottom: 2px solid #0D47A1; padding-bottom: 8px; margin-bottom: 15px; }
            .header img { height: 40px; margin-right: 15px; }
            .org-name { font-size: 16px; font-weight: 700; color: #0D47A1; }
            .org-details { font-size: 8px; color: #555; }
            h1 { text-align: center; color: #0D47A1; margin: 15px 0 5px; font-size: 14px; }
            .date { text-align: center; font-size: 9px; color: #666; margin-bottom: 15px; }
            table { width: 100%; border-collapse: collapse; border: 1px solid #bbb; font-size: 9px; }
            th, td { padding: 4px 6px; border: 1px solid #bbb; }
            th { background-color: #E3F2FD; font-weight: 600; }
            .text-right { text-align: right; }
            .summary { margin-top: 15px; display: flex; justify-content: space-between; font-weight: 700; font-size: 10px; }
            .footer { margin-top: 20px; font-size: 8px; color: #888; text-align: center; border-top: 1px solid #ddd; padding-top: 8px; }
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
          <h1>Cash / Bank Book</h1>
          <div class="date">Period: ${startDate} – ${endDate}</div>
          ${printContent}
          <div class="summary">
            <span>Opening Balance: ₹ ${openingBalance.toLocaleString("en-IN")}</span>
            <span>Total Receipts: ₹ ${totalReceipts.toLocaleString("en-IN")}</span>
            <span>Total Payments: ₹ ${totalPayments.toLocaleString("en-IN")}</span>
            <span>Closing Balance: ₹ ${closingBalance.toLocaleString("en-IN")}</span>
          </div>
          <div class="footer">Computer‑generated report – ${orgName}</div>
          <script>window.print();</script>
        </body>
      </html>
    `);
    printWindow.document.close();
  };

  return (
    <AdminLayout>
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-3xl font-righteous text-primary-dark">Cash / Bank Book</h1>
        <button
          onClick={handlePrint}
          className="bg-primary text-white px-4 py-2 rounded-lg text-sm flex items-center gap-2"
        >
          <Printer size={16} /> Print
        </button>
      </div>

      <div className="flex flex-wrap gap-4 mb-6">
        <div>
          <label className="text-sm font-medium mr-2">From:</label>
          <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} className="border rounded p-2 text-sm" />
        </div>
        <div>
          <label className="text-sm font-medium mr-2">To:</label>
          <input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} className="border rounded p-2 text-sm" />
        </div>
        <div>
          <label className="text-sm font-medium mr-2">Account:</label>
          <select value={selectedAccount} onChange={(e) => setSelectedAccount(e.target.value)} className="border rounded p-2 text-sm">
            <option value="all">All Cash & Bank</option>
            <option value="cash">Cash in Hand Only</option>
            <option value="bank">Bank Account Only</option>
            {cashBankAccounts.map((acc) => (
              <option key={acc.id} value={acc.id}>{acc.account_name}</option>
            ))}
          </select>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-6">
        <div className="bg-white rounded-xl p-4 shadow-sm border text-center">
          <p className="text-xs text-secondary-dark">Opening Balance</p>
          <p className="text-xl font-bold text-primary-dark">₹ {openingBalance.toLocaleString("en-IN")}</p>
        </div>
        <div className="bg-white rounded-xl p-4 shadow-sm border text-center">
          <p className="text-xs text-secondary-dark">Total Receipts</p>
          <p className="text-xl font-bold text-green-600">₹ {totalReceipts.toLocaleString("en-IN")}</p>
        </div>
        <div className="bg-white rounded-xl p-4 shadow-sm border text-center">
          <p className="text-xs text-secondary-dark">Total Payments</p>
          <p className="text-xl font-bold text-red-600">₹ {totalPayments.toLocaleString("en-IN")}</p>
        </div>
        <div className="bg-white rounded-xl p-4 shadow-sm border text-center">
          <p className="text-xs text-secondary-dark">Closing Balance</p>
          <p className="text-xl font-bold text-primary-dark">₹ {closingBalance.toLocaleString("en-IN")}</p>
        </div>
      </div>

      {/* Table */}
      {isLoading ? (
        <p className="text-center py-8">Loading…</p>
      ) : (
        <div className="bg-white rounded-xl shadow-sm overflow-hidden">
          <div id="cash-book-table">
            <table className="w-full text-sm">
              <thead className="bg-slate-100">
                <tr>
                  <th className="p-3 text-left">Date</th>
                  <th className="p-3 text-left">Voucher No</th>
                  <th className="p-3 text-left">Reference</th>
                  <th className="p-3 text-left">Description</th>
                  <th className="p-3 text-right">Receipt (₹)</th>
                  <th className="p-3 text-right">Payment (₹)</th>
                  <th className="p-3 text-right">Balance (₹)</th>
                </tr>
              </thead>
              <tbody>
                {ledgerWithBalance.length === 0 ? (
                  <tr><td colSpan={7} className="p-6 text-center text-secondary">No transactions found for this period.</td></tr>
                ) : (
                  ledgerWithBalance.map((entry, idx) => (
                    <tr key={idx} className="border-t hover:bg-gray-50">
                      <td className="p-3">{entry.journal_entries?.entry_date}</td>
                      <td className="p-3 text-sm font-medium">{entry.voucherNo || "—"}</td>
                      <td className="p-3">{entry.journal_entries?.reference || "—"}</td>
                      <td className="p-3">{entry.description}</td>
                      <td className="p-3 text-right text-green-600">
                        {entry.debit > 0 ? `₹ ${Number(entry.debit).toLocaleString("en-IN")}` : "—"}
                      </td>
                      <td className="p-3 text-right text-red-600">
                        {entry.credit > 0 ? `₹ ${Number(entry.credit).toLocaleString("en-IN")}` : "—"}
                      </td>
                      <td className="p-3 text-right font-medium">
                        ₹ {entry.balance.toLocaleString("en-IN")}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </AdminLayout>
  );
}