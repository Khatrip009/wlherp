// src/pages/CashBook.jsx
import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { Printer, Mail } from "lucide-react";
import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";
import { supabase } from "../api/supabase";
import { useOrg } from "../context/OrganizationContext";
import { sendEmail } from "../services/emailService";

/* ─── PDF helpers (identical to other reports) ─────────────── */
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

export default function CashBook() {
  const today = new Date().toISOString().split("T")[0];
  const firstOfMonth = new Date(new Date().getFullYear(), new Date().getMonth(), 1)
    .toISOString().split("T")[0];

  const [startDate, setStartDate] = useState(firstOfMonth);
  const [endDate, setEndDate] = useState(today);
  const [selectedAccount, setSelectedAccount] = useState("all");

  const { org, branch, selectedFinancialYear } = useOrg();
  const branchId = branch?.id;
  const financialYearId = selectedFinancialYear?.id;

  // Fetch cash/bank accounts scoped to organisation & branch
  const { data: cashBankAccounts = [] } = useQuery({
    queryKey: ["cash-bank-accounts", org?.id, branchId, financialYearId],
    queryFn: async () => {
      let query = supabase
        .from("chart_of_accounts")
        .select("id, account_code, account_name")
        .in("account_code", ["1001", "1002", "1006"])
        .eq("organization_id", org?.id)
        .order("account_code");

      if (branchId) {
        query = query.eq("branch_id", branchId);
      }
      if (financialYearId) {
        query = query.eq("financial_year_id", financialYearId);
      }
      const { data } = await query;
      return data || [];
    },
    enabled: !!org?.id,
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

  // Opening balance (same pattern as Ledger)
  const { data: openingBalance = 0 } = useQuery({
    queryKey: ["cash-book-opening", startDate, selectedAccount, org?.id, branchId, financialYearId],
    queryFn: async () => {
      const accountIds = getAccountIds;
      if (accountIds.length === 0) return 0;

      let query = supabase
        .from("journal_entry_lines")
        .select("debit, credit, journal_entries!inner(entry_date)")
        .in("account_id", accountIds)
        .lt("journal_entries.entry_date", startDate);

      if (branchId) {
        query = query.or(`branch_id.eq.${branchId},branch_id.is.null`);
      }

      const { data } = await query;
      const totalDebit = data?.reduce((s, r) => s + parseFloat(r.debit), 0) || 0;
      const totalCredit = data?.reduce((s, r) => s + parseFloat(r.credit), 0) || 0;
      return totalDebit - totalCredit;
    },
    enabled: !!startDate && cashBankAccounts.length > 0 && !!org?.id,
  });

  // Transactions
  const { data: entries = [], isLoading } = useQuery({
    queryKey: ["cash-book-entries", startDate, endDate, selectedAccount, org?.id, branchId, financialYearId],
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
        .gte("journal_entries.entry_date", startDate)
        .lte("journal_entries.entry_date", endDate)
        .order("journal_entries(entry_date)", { ascending: true })
        .order("id", { ascending: true });

      if (branchId) {
        query = query.or(`branch_id.eq.${branchId},branch_id.is.null`);
      }

      const { data } = await query;
      return data || [];
    },
    enabled: !!startDate && !!endDate && cashBankAccounts.length > 0 && !!org?.id,
  });

  // Voucher numbers (optional, kept for completeness)
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
        .in("journal_entry_id", journalEntryIds);
      if (branchId) query = query.eq("branch_id", branchId);
      if (financialYearId) query = query.eq("financial_year_id", financialYearId);
      const { data } = await query;
      const map = {};
      data?.forEach((v) => { map[v.journal_entry_id] = v.voucher_no; });
      return map;
    },
    enabled: journalEntryIds.length > 0 && !!branchId && !!financialYearId,
  });

  // Build ledger with running balance
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

  // ─── Email report (adapted to use org directly) ────────────
  const getAdminEmails = async () => {
    if (!org?.id) return [];
    const { data, error } = await supabase
      .from("profiles")
      .select("email")
      .eq("organization_id", org.id)
      .in("role", ["admin", "super_admin", "organization_admin"])
      .eq("is_active", true);
    if (error) {
      console.error("Failed to fetch admin emails:", error);
      return [];
    }
    return data?.map(p => p.email).filter(Boolean) || [];
  };

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
      // ... (same email body as before, just use org?.company_name)
      // The existing email building code is fine, we'll just replace `org` references.
      // For brevity, I'll assume the original email code is present; if not, I can provide it.
      // We'll keep it as is since it's not broken.
      // But to avoid duplication, I'll note that you should replace `org` with `org?.company_name` etc.
      // We'll just call the original function – it should work now that `org` is available.
      // However, the original email function used `getOrganization`, which is removed.
      // We'll rewrite the email sending part inline to use the context `org`.

      const accountLabel = selectedAccount === "all" ? "All Cash & Bank" :
        selectedAccount === "cash" ? "Cash in Hand" :
        selectedAccount === "bank" ? "Bank Accounts" :
        cashBankAccounts.find(a => a.id == selectedAccount)?.account_name || "Selected Account";

      const rowsHtml = ledgerWithBalance.map(entry => `
        <tr>
          <td style="padding:4px 8px;border:1px solid #ddd;">${entry.journal_entries?.entry_date || ''}</td>
          <td style="padding:4px 8px;border:1px solid #ddd;">${entry.voucherNo || '—'}</td>
          <td style="padding:4px 8px;border:1px solid #ddd;">${entry.journal_entries?.reference || '—'}</td>
          <td style="padding:4px 8px;border:1px solid #ddd;">${entry.description || ''}</td>
          <td style="padding:4px 8px;border:1px solid #ddd;text-align:right;">${entry.debit > 0 ? `₹ ${Number(entry.debit).toLocaleString('en-IN')}` : '—'}</td>
          <td style="padding:4px 8px;border:1px solid #ddd;text-align:right;">${entry.credit > 0 ? `₹ ${Number(entry.credit).toLocaleString('en-IN')}` : '—'}</td>
          <td style="padding:4px 8px;border:1px solid #ddd;text-align:right;font-weight:bold;">₹ ${entry.balance.toLocaleString('en-IN')}</td>
        </tr>
      `).join('');

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
              ${rowsHtml}
            </tbody>
          </table>
          <p style="color:#888;font-size:10px;margin-top:20px;">Computer‑generated report from ${org?.company_name || 'Academy'}</p>
        </div>
      `;

      await sendEmail({
        to: adminEmails,
        subject: `Cash/Bank Book Report - ${new Date().toLocaleDateString()}`,
        html: htmlBody,
      });
      alert("Report sent to admins.");
    } catch (err) {
      console.error("Failed to send report:", err);
      alert("Failed to send report. Check console for details.");
    }
  };

  // ─── Professional PDF Export ──────────────────────────────
  const handlePrintPDF = async () => {
    if (entries.length === 0) return;

    const doc = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4" });
    const pageWidth = doc.internal.pageSize.getWidth();
    const pageHeight = doc.internal.pageSize.getHeight();
    const margin = 10;
    let y = margin;

    // Logo
    let logoBase64 = null;
    if (org?.logo_dark_url) {
      logoBase64 = await loadImageAsBase64(org.logo_dark_url);
    }

    // Header
    const logoWidth = 35, logoHeight = 14;
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

    // Title & Account
    const accountLabel = selectedAccount === "all" ? "All Cash & Bank" :
      selectedAccount === "cash" ? "Cash in Hand" :
      selectedAccount === "bank" ? "Bank Accounts" :
      cashBankAccounts.find(a => a.id == selectedAccount)?.account_name || "Selected Account";

    doc.setFontSize(16);
    doc.setFont("helvetica", "bold");
    doc.setTextColor("#000000");
    doc.text("Cash / Bank Book", pageWidth / 2, y, { align: "center" });
    y += 7;
    doc.setFontSize(10);
    doc.setFont("helvetica", "normal");
    doc.text(`Period: ${startDate} – ${endDate}  |  Account: ${accountLabel}`, pageWidth / 2, y, { align: "center" });
    y += 10;

    // Summary boxes
    const boxWidth = (pageWidth - 2 * margin - 30) / 4;
    const boxHeight = 16;
    const boxY = y;
    const summaryItems = [
      { label: "Opening Balance", value: openingBalance },
      { label: "Total Receipts", value: totalReceipts },
      { label: "Total Payments", value: totalPayments },
      { label: "Closing Balance", value: closingBalance },
    ];

    summaryItems.forEach((item, i) => {
      const x = margin + i * (boxWidth + 10);
      doc.setDrawColor("#000000");
      doc.setFillColor(255, 255, 255);
      doc.rect(x, boxY, boxWidth, boxHeight, "FD");
      doc.setFontSize(8);
      doc.setFont("helvetica", "normal");
      doc.setTextColor("#000000");
      doc.text(item.label, x + 2, boxY + 5);
      drawCurrency(doc, item.value, x + 2, boxY + 13, 8, "left", "#000");
    });
    y += boxHeight + 10;

    // Build table rows
    const tableRows = ledgerWithBalance.map((entry) => [
      entry.journal_entries?.entry_date || "",
      entry.voucherNo || "—",
      entry.journal_entries?.reference || "—",
      entry.description || "",
      entry.debit > 0 ? entry.debit : "",
      entry.credit > 0 ? entry.credit : "",
      entry.balance,
    ]);

    // Totals row
    tableRows.push(["", "", "", "TOTAL", totalReceipts, totalPayments, ""]);

    autoTable(doc, {
      startY: y,
      head: [["Date", "Voucher", "Reference", "Description", "Receipt", "Payment", "Balance"]],
      body: tableRows,
      theme: "plain",
      styles: { fontSize: 8, cellPadding: 2, textColor: [0,0,0], fillColor: [255,255,255], lineColor: [0,0,0], lineWidth: 0.2 },
      headStyles: { fillColor: [255,255,255], textColor: [0,0,0], fontStyle: "bold", lineWidth: 0.2, lineColor: [0,0,0] },
      columnStyles: {
        0: { cellWidth: 28 },
        1: { cellWidth: 30 },
        2: { cellWidth: 30 },
        3: { cellWidth: 60, halign: "left" },
        4: { cellWidth: 30, halign: "right" },
        5: { cellWidth: 30, halign: "right" },
        6: { cellWidth: 30, halign: "right" },
      },
      margin: { left: margin, right: margin },
      willDrawCell: (data) => {
        if ([4,5,6].includes(data.column.index) && typeof data.cell.raw === "number") {
          data.cell.text = [];
        }
      },
      didDrawCell: (data) => {
        if ([4,5,6].includes(data.column.index) && typeof data.cell.raw === "number") {
          drawCurrency(doc, data.cell.raw, data.cell.x + data.cell.width - 2, data.cell.y + data.cell.height / 2 + 1.5, 8, "right", "#000");
        }
        if (data.row.index === tableRows.length - 1) {
          data.cell.styles.fontStyle = "bold";
        }
      },
    });

    y = doc.lastAutoTable.finalY + 10;

    // Footer
    const footerY = pageHeight - margin - 5;
    doc.setFontSize(7);
    doc.setTextColor("#000000");
    doc.setFont("helvetica", "italic");
    doc.text(`Generated on ${new Date().toLocaleString()}`, margin, footerY);
    doc.text(`© ${org?.company_name || "Academy"}`, pageWidth / 2, footerY, { align: "center" });

    doc.save(`Cash_Book_${startDate}_${endDate}.pdf`);
  };

  const formatCurrency = (val) => `₹ ${Math.abs(val).toLocaleString("en-IN")}`;

  return (
    <div className="space-y-6 px-4 sm:px-6 lg:px-0">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold text-gray-900">Cash / Bank Book</h1>
          <p className="text-sm text-gray-600 mt-1">Day‑wise cash and bank transaction summary</p>
        </div>
        <div className="flex gap-3">
          <button
            onClick={sendReportEmail}
            className="inline-flex items-center gap-2 px-4 py-2.5 bg-green-600 hover:bg-green-700 text-white rounded-lg transition-colors text-sm font-medium"
          >
            <Mail size={16} /> Send Report
          </button>
          <button
            onClick={handlePrintPDF}
            className="inline-flex items-center gap-2 px-4 py-2.5 bg-primary hover:bg-accent text-white rounded-lg transition-colors text-sm font-medium"
          >
            <Printer size={16} /> Print PDF
          </button>
        </div>
      </div>

      <div className="flex flex-wrap gap-4 items-end">
        <div>
          <label className="text-sm font-medium text-gray-700 mr-2">From:</label>
          <input type="date" value={startDate} onChange={e => setStartDate(e.target.value)} className="border rounded p-2 text-sm" />
        </div>
        <div>
          <label className="text-sm font-medium text-gray-700 mr-2">To:</label>
          <input type="date" value={endDate} onChange={e => setEndDate(e.target.value)} className="border rounded p-2 text-sm" />
        </div>
        <div>
          <label className="text-sm font-medium text-gray-700 mr-2">Account:</label>
          <select value={selectedAccount} onChange={e => setSelectedAccount(e.target.value)} className="border rounded p-2 text-sm">
            <option value="all">All Cash & Bank</option>
            <option value="cash">Cash in Hand Only</option>
            <option value="bank">Bank Account Only</option>
            {cashBankAccounts.map(acc => (
              <option key={acc.id} value={acc.id}>{acc.account_name}</option>
            ))}
          </select>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <div className="bg-white rounded-xl p-4 shadow-sm border text-center">
          <p className="text-xs text-gray-500">Opening Balance</p>
          <p className="text-xl font-bold text-gray-900">₹ {openingBalance.toLocaleString("en-IN")}</p>
        </div>
        <div className="bg-white rounded-xl p-4 shadow-sm border text-center">
          <p className="text-xs text-gray-500">Total Receipts</p>
          <p className="text-xl font-bold text-green-700">₹ {totalReceipts.toLocaleString("en-IN")}</p>
        </div>
        <div className="bg-white rounded-xl p-4 shadow-sm border text-center">
          <p className="text-xs text-gray-500">Total Payments</p>
          <p className="text-xl font-bold text-red-700">₹ {totalPayments.toLocaleString("en-IN")}</p>
        </div>
        <div className="bg-white rounded-xl p-4 shadow-sm border text-center">
          <p className="text-xs text-gray-500">Closing Balance</p>
          <p className="text-xl font-bold text-gray-900">₹ {closingBalance.toLocaleString("en-IN")}</p>
        </div>
      </div>

      {isLoading ? (
        <div className="text-center py-8 text-gray-500">Loading…</div>
      ) : (
        <div className="bg-white rounded-xl shadow-sm border overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[800px] text-sm">
              <thead className="bg-gray-50">
                <tr>
                  <th className="p-3 text-left text-xs font-medium text-gray-500 uppercase">Date</th>
                  <th className="p-3 text-left text-xs font-medium text-gray-500 uppercase">Voucher No</th>
                  <th className="p-3 text-left text-xs font-medium text-gray-500 uppercase">Reference</th>
                  <th className="p-3 text-left text-xs font-medium text-gray-500 uppercase">Description</th>
                  <th className="p-3 text-right text-xs font-medium text-gray-500 uppercase">Receipt (₹)</th>
                  <th className="p-3 text-right text-xs font-medium text-gray-500 uppercase">Payment (₹)</th>
                  <th className="p-3 text-right text-xs font-medium text-gray-500 uppercase">Balance (₹)</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {ledgerWithBalance.length === 0 ? (
                  <tr><td colSpan={7} className="p-6 text-center text-gray-500">No transactions found for this period.</td></tr>
                ) : (
                  ledgerWithBalance.map((entry, idx) => (
                    <tr key={idx} className="hover:bg-gray-50">
                      <td className="p-3 text-gray-900">{entry.journal_entries?.entry_date}</td>
                      <td className="p-3 text-gray-900">{entry.voucherNo || "—"}</td>
                      <td className="p-3 text-gray-900">{entry.journal_entries?.reference || "—"}</td>
                      <td className="p-3 text-gray-900">{entry.description}</td>
                      <td className="p-3 text-right text-green-700">{entry.debit > 0 ? `₹ ${Number(entry.debit).toLocaleString("en-IN")}` : "—"}</td>
                      <td className="p-3 text-right text-red-700">{entry.credit > 0 ? `₹ ${Number(entry.credit).toLocaleString("en-IN")}` : "—"}</td>
                      <td className="p-3 text-right font-medium text-gray-900">₹ {entry.balance.toLocaleString("en-IN")}</td>
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