// src/pages/CashBook.jsx
import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { Printer, Mail } from "lucide-react"; // 👈 Added Mail
import { supabase } from "../api/supabase";
import { getOrganization } from "../services/organizationService";
import { useOrg } from "../context/OrganizationContext";
import { sendEmail } from "../services/emailService"; // 👈 Import

export default function CashBook() {
  const today = new Date().toISOString().split("T")[0];
  const firstOfMonth = new Date(new Date().getFullYear(), new Date().getMonth(), 1)
    .toISOString()
    .split("T")[0];

  const [startDate, setStartDate] = useState(firstOfMonth);
  const [endDate, setEndDate] = useState(today);
  const [selectedAccount, setSelectedAccount] = useState("all");

  const { org: currentOrg, branch, selectedFinancialYear } = useOrg();
  const branchId = branch?.id;
  const financialYearId = selectedFinancialYear?.id;

  const { data: org } = useQuery({
    queryKey: ["organization", currentOrg?.id],
    queryFn: () => getOrganization(currentOrg?.id),
    enabled: !!currentOrg?.id,
  });

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

  const getAccountIds = useMemo(() => {
    if (selectedAccount === "all") return cashBankAccounts.map((a) => a.id);
    if (selectedAccount === "cash")
      return cashBankAccounts.filter((a) => a.account_code === "1001").map((a) => a.id);
    if (selectedAccount === "bank")
      return cashBankAccounts.filter((a) => a.account_code === "1002").map((a) => a.id);
    return [parseInt(selectedAccount)];
  }, [selectedAccount, cashBankAccounts]);

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
        .eq("journal_entries.branch_id", branchId)
        .eq("journal_entries.financial_year_id", financialYearId)
        .lt("journal_entries.entry_date", startDate);

      const { data } = await query;
      const totalDebit = data?.reduce((s, r) => s + parseFloat(r.debit), 0) || 0;
      const totalCredit = data?.reduce((s, r) => s + parseFloat(r.credit), 0) || 0;
      return totalDebit - totalCredit;
    },
    enabled: !!startDate && cashBankAccounts.length > 0 && !!branchId && !!financialYearId,
  });

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
        .eq("journal_entries.branch_id", branchId)
        .eq("journal_entries.financial_year_id", financialYearId)
        .gte("journal_entries.entry_date", startDate)
        .lte("journal_entries.entry_date", endDate)
        .order("journal_entries(entry_date)", { ascending: true })
        .order("id", { ascending: true });

      const { data } = await query;
      return data || [];
    },
    enabled: !!startDate && !!endDate && cashBankAccounts.length > 0 && !!branchId && !!financialYearId,
  });

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

  // ─── Send Report Email ─────────────────────────────────────────────
  const sendReportEmail = async () => {
    if (entries.length === 0) {
      alert("No transactions found for the selected period.");
      return;
    }

    try {
      const adminEmails = await getAdminEmails();
      if (adminEmails.length === 0) {
        alert("No admin emails found to send the report.");
        return;
      }

      // Build HTML table rows
      let tableRows = ledgerWithBalance.map((entry) => {
        const date = entry.journal_entries?.entry_date || "";
        const ref = entry.journal_entries?.reference || "—";
        const desc = entry.description || "";
        const debit = entry.debit > 0 ? `₹ ${Number(entry.debit).toLocaleString('en-IN')}` : "—";
        const credit = entry.credit > 0 ? `₹ ${Number(entry.credit).toLocaleString('en-IN')}` : "—";
        const balance = `₹ ${entry.balance.toLocaleString('en-IN')}`;
        return `
          <tr>
            <td style="padding:4px 8px;border:1px solid #ddd;">${date}</td>
            <td style="padding:4px 8px;border:1px solid #ddd;">${entry.voucherNo || "—"}</td>
            <td style="padding:4px 8px;border:1px solid #ddd;">${ref}</td>
            <td style="padding:4px 8px;border:1px solid #ddd;">${desc}</td>
            <td style="padding:4px 8px;border:1px solid #ddd;text-align:right;">${debit}</td>
            <td style="padding:4px 8px;border:1px solid #ddd;text-align:right;">${credit}</td>
            <td style="padding:4px 8px;border:1px solid #ddd;text-align:right;font-weight:bold;">${balance}</td>
          </tr>
        `;
      }).join('');

      const accountLabel = selectedAccount === "all" ? "All Cash & Bank" :
                           selectedAccount === "cash" ? "Cash in Hand" :
                           selectedAccount === "bank" ? "Bank Accounts" :
                           cashBankAccounts.find(a => a.id == selectedAccount)?.account_name || "Selected Account";

      const htmlBody = `
        <div style="font-family:Arial,sans-serif;max-width:800px;margin:0 auto;">
          <h2 style="color:#0D47A1;">Cash / Bank Book</h2>
          <p><strong>Branch:</strong> ${branch?.branch_name || 'N/A'}</p>
          <p><strong>Period:</strong> ${startDate} – ${endDate}</p>
          <p><strong>Account:</strong> ${accountLabel}</p>
          <hr />
          <div style="display:flex;justify-content:space-around;margin-bottom:20px;flex-wrap:wrap;">
            <div><strong>Opening Balance:</strong> ₹ ${openingBalance.toLocaleString('en-IN')}</div>
            <div><strong>Total Receipts:</strong> ₹ ${totalReceipts.toLocaleString('en-IN')}</div>
            <div><strong>Total Payments:</strong> ₹ ${totalPayments.toLocaleString('en-IN')}</div>
            <div><strong>Closing Balance:</strong> ₹ ${closingBalance.toLocaleString('en-IN')}</div>
          </div>
          <h3>Transaction Details</h3>
          <table style="width:100%;border-collapse:collapse;font-size:11px;">
            <thead>
              <tr style="background:#e3f2fd;">
                <th style="padding:4px 8px;border:1px solid #ddd;text-align:left;">Date</th>
                <th style="padding:4px 8px;border:1px solid #ddd;text-align:left;">Voucher No</th>
                <th style="padding:4px 8px;border:1px solid #ddd;text-align:left;">Reference</th>
                <th style="padding:4px 8px;border:1px solid #ddd;text-align:left;">Description</th>
                <th style="padding:4px 8px;border:1px solid #ddd;text-align:right;">Receipt (₹)</th>
                <th style="padding:4px 8px;border:1px solid #ddd;text-align:right;">Payment (₹)</th>
                <th style="padding:4px 8px;border:1px solid #ddd;text-align:right;">Balance (₹)</th>
              </tr>
            </thead>
            <tbody>
              ${tableRows}
            </tbody>
          </table>
          <p style="color:#888;font-size:10px;margin-top:20px;">Computer‑generated report from ${org?.company_name || 'Academy'}</p>
        </div>
      `;

      await sendEmail({
        to: adminEmails,
        subject: `Cash/Bank Book Report - ${new Date().toLocaleDateString()}`,
        html: htmlBody,
        from: org?.email || undefined,
      });

      alert("Report sent to admins.");
    } catch (err) {
      console.error("Failed to send report:", err);
      alert("Failed to send report. Check console for details.");
    }
  };

  // ─── Print handler ─────────────────────────────────────────────────
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
    <div className="space-y-6 px-4 sm:px-6 lg:px-0">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold" style={{ fontFamily: "var(--font-heading)", color: "var(--color-primary)" }}>
            Cash / Bank Book
          </h1>
          <p className="text-sm text-gray-600 dark:text-gray-400 mt-1" style={{ fontFamily: "var(--font-body)" }}>
            Day‑wise cash and bank transaction summary
          </p>
        </div>
        <div className="flex gap-3">
          <button
            onClick={sendReportEmail}
            className="inline-flex items-center gap-2 px-4 py-2.5 bg-green-600 hover:bg-green-700 text-white rounded-lg transition-colors text-sm font-medium"
            style={{ fontFamily: "var(--font-body)" }}
          >
            <Mail size={16} /> Send Report
          </button>
          <button
            onClick={handlePrint}
            className="inline-flex items-center gap-2 px-4 py-2.5 bg-primary hover:bg-primary-light text-white rounded-lg transition-colors text-sm font-medium"
            style={{ fontFamily: "var(--font-body)" }}
          >
            <Printer size={16} /> Print
          </button>
        </div>
      </div>

      {/* Controls */}
      <div className="flex flex-wrap gap-4 items-end">
        <div>
          <label className="text-sm font-medium text-gray-700 dark:text-gray-300 mr-2" style={{ fontFamily: "var(--font-body)" }}>
            From:
          </label>
          <input
            type="date"
            value={startDate}
            onChange={(e) => setStartDate(e.target.value)}
            className="border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 rounded-lg p-2.5 text-sm"
          />
        </div>
        <div>
          <label className="text-sm font-medium text-gray-700 dark:text-gray-300 mr-2" style={{ fontFamily: "var(--font-body)" }}>
            To:
          </label>
          <input
            type="date"
            value={endDate}
            onChange={(e) => setEndDate(e.target.value)}
            className="border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 rounded-lg p-2.5 text-sm"
          />
        </div>
        <div>
          <label className="text-sm font-medium text-gray-700 dark:text-gray-300 mr-2" style={{ fontFamily: "var(--font-body)" }}>
            Account:
          </label>
          <select
            value={selectedAccount}
            onChange={(e) => setSelectedAccount(e.target.value)}
            className="border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 rounded-lg p-2.5 text-sm"
          >
            <option value="all">All Cash & Bank</option>
            <option value="cash">Cash in Hand Only</option>
            <option value="bank">Bank Account Only</option>
            {cashBankAccounts.map((acc) => (
              <option key={acc.id} value={acc.id}>
                {acc.account_name}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <div className="bg-white dark:bg-gray-800 rounded-xl p-4 shadow-sm border border-gray-200 dark:border-gray-700 text-center">
          <p className="text-xs text-gray-500 dark:text-gray-400" style={{ fontFamily: "var(--font-body)" }}>
            Opening Balance
          </p>
          <p className="text-xl font-bold" style={{ color: "var(--color-primary)" }}>
            ₹ {openingBalance.toLocaleString("en-IN")}
          </p>
        </div>
        <div className="bg-white dark:bg-gray-800 rounded-xl p-4 shadow-sm border border-gray-200 dark:border-gray-700 text-center">
          <p className="text-xs text-gray-500 dark:text-gray-400" style={{ fontFamily: "var(--font-body)" }}>
            Total Receipts
          </p>
          <p className="text-xl font-bold text-green-600 dark:text-green-400">
            ₹ {totalReceipts.toLocaleString("en-IN")}
          </p>
        </div>
        <div className="bg-white dark:bg-gray-800 rounded-xl p-4 shadow-sm border border-gray-200 dark:border-gray-700 text-center">
          <p className="text-xs text-gray-500 dark:text-gray-400" style={{ fontFamily: "var(--font-body)" }}>
            Total Payments
          </p>
          <p className="text-xl font-bold text-red-600 dark:text-red-400">
            ₹ {totalPayments.toLocaleString("en-IN")}
          </p>
        </div>
        <div className="bg-white dark:bg-gray-800 rounded-xl p-4 shadow-sm border border-gray-200 dark:border-gray-700 text-center">
          <p className="text-xs text-gray-500 dark:text-gray-400" style={{ fontFamily: "var(--font-body)" }}>
            Closing Balance
          </p>
          <p className="text-xl font-bold" style={{ color: "var(--color-primary)" }}>
            ₹ {closingBalance.toLocaleString("en-IN")}
          </p>
        </div>
      </div>

      {/* Table */}
      {isLoading ? (
        <div className="text-center py-8 text-gray-500 dark:text-gray-400">Loading…</div>
      ) : (
        <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 overflow-hidden">
          <div id="cash-book-table" className="overflow-x-auto">
            <table className="w-full min-w-[800px] text-sm">
              <thead className="bg-gray-50 dark:bg-gray-700">
                <tr>
                  <th className="p-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Date</th>
                  <th className="p-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Voucher No</th>
                  <th className="p-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Reference</th>
                  <th className="p-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Description</th>
                  <th className="p-3 text-right text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Receipt (₹)</th>
                  <th className="p-3 text-right text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Payment (₹)</th>
                  <th className="p-3 text-right text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Balance (₹)</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
                {ledgerWithBalance.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="p-6 text-center text-gray-500 dark:text-gray-400">
                      No transactions found for this period.
                    </td>
                  </tr>
                ) : (
                  ledgerWithBalance.map((entry, idx) => (
                    <tr key={idx} className="hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors">
                      <td className="p-3 text-gray-700 dark:text-gray-200">
                        {entry.journal_entries?.entry_date}
                      </td>
                      <td className="p-3 text-sm font-medium text-gray-800 dark:text-gray-100">
                        {entry.voucherNo || "—"}
                      </td>
                      <td className="p-3 text-gray-700 dark:text-gray-200">
                        {entry.journal_entries?.reference || "—"}
                      </td>
                      <td className="p-3 text-gray-700 dark:text-gray-200">{entry.description}</td>
                      <td className="p-3 text-right text-green-600 dark:text-green-400">
                        {entry.debit > 0 ? `₹ ${Number(entry.debit).toLocaleString("en-IN")}` : "—"}
                      </td>
                      <td className="p-3 text-right text-red-600 dark:text-red-400">
                        {entry.credit > 0 ? `₹ ${Number(entry.credit).toLocaleString("en-IN")}` : "—"}
                      </td>
                      <td className="p-3 text-right font-medium text-gray-800 dark:text-gray-100">
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
    </div>
  );
}