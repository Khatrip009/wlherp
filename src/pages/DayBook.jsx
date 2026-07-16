// src/pages/DayBook.jsx
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { Printer, Calendar, ChevronDown, ChevronRight } from "lucide-react";
import { supabase } from "../api/supabase";
import { getOrganization } from "../services/organizationService";
import { useOrg } from "../context/OrganizationContext";

export default function DayBook() {
  const today = new Date().toISOString().split("T")[0];
  const [selectedDate, setSelectedDate] = useState(today);
  const [expandedVoucher, setExpandedVoucher] = useState(null);

  const { org: currentOrg, branch, selectedFinancialYear } = useOrg();
  const branchId = branch?.id;
  const financialYearId = selectedFinancialYear?.id;

  const { data: org } = useQuery({
    queryKey: ["organization", currentOrg?.id],
    queryFn: () => getOrganization(currentOrg?.id),
    enabled: !!currentOrg?.id,
  });

  // Fetch vouchers for the selected date – scoped
  const { data: vouchers = [], isLoading } = useQuery({
    queryKey: ["day-book", selectedDate, branchId, financialYearId],
    queryFn: async () => {
      const { data: vouchList, error } = await supabase
        .from("vouchers")
        .select(
          `id,
           voucher_no,
           entry_date,
           reference,
           description,
           voucher_types(name, abbreviation),
           journal_entries!inner(
             id,
             journal_entry_lines(
               id,
               debit,
               credit,
               description,
               chart_of_accounts(account_name, account_code)
             )
           )`
        )
        .eq("entry_date", selectedDate)
        .eq("branch_id", branchId)
        .eq("financial_year_id", financialYearId)
        .order("voucher_no");

      if (error) throw error;
      return vouchList || [];
    },
    enabled: !!selectedDate && !!branchId && !!financialYearId,
  });

  // Group vouchers by type
  const groupedVouchers = vouchers.reduce((acc, v) => {
    const typeName = v.voucher_types?.name || "Other";
    if (!acc[typeName]) acc[typeName] = [];
    acc[typeName].push(v);
    return acc;
  }, {});

  const totalDebit = vouchers.reduce((s, v) => {
    return s + (v.journal_entries?.journal_entry_lines || []).reduce((sum, l) => sum + (parseFloat(l.debit) || 0), 0);
  }, 0);
  const totalCredit = vouchers.reduce((s, v) => {
    return s + (v.journal_entries?.journal_entry_lines || []).reduce((sum, l) => sum + (parseFloat(l.credit) || 0), 0);
  }, 0);

  const handlePrint = () => {
    const logoUrl = org?.logo_dark_url || "/ShreeVidhyaDark.png";
    const orgName = org?.company_name || "ShreeVidhya Academy";
    const orgAddr = org?.address || "";
    const orgPhone = org?.phone || "";
    const orgEmail = org?.email || "";

    let printHTML = `
      <html>
        <head>
          <title>Day Book - ${selectedDate}</title>
          <style>
            @page { size: A4; margin: 12mm; }
            body { font-family: Montserrat, sans-serif; color: #222; font-size: 10px; }
            .header { display: flex; align-items: center; border-bottom: 2px solid #0D47A1; padding-bottom: 8px; margin-bottom: 15px; }
            .header img { height: 40px; margin-right: 15px; }
            .org-name { font-size: 16px; font-weight: 700; color: #0D47A1; }
            .org-details { font-size: 8px; color: #555; }
            h1 { text-align: center; color: #0D47A1; margin: 10px 0; font-size: 14px; }
            .date { text-align: center; font-size: 10px; color: #666; margin-bottom: 15px; }
            .voucher-block { margin-bottom: 12px; border: 1px solid #ddd; padding: 8px; }
            .voucher-header { font-weight: 700; color: #0D47A1; margin-bottom: 5px; }
            table { width: 100%; border-collapse: collapse; border: 1px solid #bbb; font-size: 9px; margin-top: 5px; }
            th, td { padding: 3px 5px; border: 1px solid #bbb; }
            th { background-color: #E3F2FD; }
            .text-right { text-align: right; }
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
          <h1>Day Book</h1>
          <div class="date">Date: ${selectedDate}</div>
    `;

    for (const [type, vouchs] of Object.entries(groupedVouchers)) {
      printHTML += `<h2 style="color:#0D47A1; font-size:12px; margin:12px 0 5px;">${type}</h2>`;
      vouchs.forEach((v) => {
        const lines = v.journal_entries?.journal_entry_lines || [];
        printHTML += `
          <div class="voucher-block">
            <div class="voucher-header">
              ${v.voucher_no} – ${v.reference || "—"}
              <span style="font-weight:normal; color:#666;"> (${v.description || ""})</span>
            </div>
            <table>
              <thead><tr><th>Account</th><th>Description</th><th class="text-right">Debit</th><th class="text-right">Credit</th></tr></thead>
              <tbody>
                ${lines.map(l => `
                  <tr>
                    <td>${l.chart_of_accounts?.account_name || "—"}</td>
                    <td>${l.description || ""}</td>
                    <td class="text-right">${l.debit > 0 ? '₹' + Number(l.debit).toLocaleString('en-IN') : ''}</td>
                    <td class="text-right">${l.credit > 0 ? '₹' + Number(l.credit).toLocaleString('en-IN') : ''}</td>
                  </tr>`).join("")}
              </tbody>
            </table>
          </div>
        `;
      });
    }

    printHTML += `
          <div class="footer">Computer‑generated day book – ${orgName}</div>
          <script>window.print();</script>
        </body>
      </html>
    `;

    const printWindow = window.open("", "_blank", "width=1000,height=750");
    if (printWindow) {
      printWindow.document.write(printHTML);
      printWindow.document.close();
    }
  };

  return (
    <div className="space-y-6 px-4 sm:px-6 lg:px-0">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1
            className="text-2xl sm:text-3xl font-bold"
            style={{ fontFamily: "var(--font-heading)", color: "var(--color-primary)" }}
          >
            Day Book
          </h1>
          <p
            className="text-sm text-gray-600 dark:text-gray-400 mt-1"
            style={{ fontFamily: "var(--font-body)" }}
          >
            View and print daily voucher entries
          </p>
        </div>
        <button
          onClick={handlePrint}
          className="inline-flex items-center gap-2 px-4 py-2.5 bg-primary hover:bg-primary-light text-white rounded-lg transition-colors text-sm font-medium"
          style={{ fontFamily: "var(--font-body)" }}
        >
          <Printer size={16} /> Print
        </button>
      </div>

      {/* Date selector */}
      <div className="flex items-center gap-3">
        <Calendar size={18} className="text-primary dark:text-primary-light" />
        <input
          type="date"
          value={selectedDate}
          onChange={(e) => setSelectedDate(e.target.value)}
          className="border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 rounded-lg p-2.5 text-sm"
          style={{ fontFamily: "var(--font-body)" }}
        />
      </div>

      {/* Totals Summary */}
      {vouchers.length > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div className="bg-white dark:bg-gray-800 rounded-xl p-4 shadow-sm border border-gray-200 dark:border-gray-700 text-center">
            <p className="text-xs text-gray-500 dark:text-gray-400" style={{ fontFamily: "var(--font-body)" }}>
              Total Vouchers
            </p>
            <p className="text-xl font-bold" style={{ color: "var(--color-primary)" }}>
              {vouchers.length}
            </p>
          </div>
          <div className="bg-white dark:bg-gray-800 rounded-xl p-4 shadow-sm border border-gray-200 dark:border-gray-700 text-center">
            <p className="text-xs text-gray-500 dark:text-gray-400" style={{ fontFamily: "var(--font-body)" }}>
              Total Debit
            </p>
            <p className="text-xl font-bold text-green-600 dark:text-green-400">
              ₹ {totalDebit.toLocaleString("en-IN")}
            </p>
          </div>
          <div className="bg-white dark:bg-gray-800 rounded-xl p-4 shadow-sm border border-gray-200 dark:border-gray-700 text-center">
            <p className="text-xs text-gray-500 dark:text-gray-400" style={{ fontFamily: "var(--font-body)" }}>
              Total Credit
            </p>
            <p className="text-xl font-bold text-red-600 dark:text-red-400">
              ₹ {totalCredit.toLocaleString("en-IN")}
            </p>
          </div>
        </div>
      )}

      {isLoading ? (
        <div className="text-center py-8 text-gray-500 dark:text-gray-400">Loading day book…</div>
      ) : Object.keys(groupedVouchers).length === 0 ? (
        <div className="bg-white dark:bg-gray-800 rounded-xl p-10 shadow-sm text-center text-gray-500 dark:text-gray-400 border border-gray-200 dark:border-gray-700">
          <Calendar size={40} className="mx-auto mb-3 opacity-50" />
          <p className="text-lg">No vouchers for this date</p>
          <p className="text-sm">Select a different date or create new vouchers.</p>
        </div>
      ) : (
        <div className="space-y-4">
          {Object.entries(groupedVouchers).map(([type, vouchs]) => (
            <div key={type}>
              <h2
                className="text-lg font-semibold mb-2"
                style={{ fontFamily: "var(--font-heading)", color: "var(--color-primary)" }}
              >
                {type}
              </h2>
              {vouchs.map((v) => {
                const lines = v.journal_entries?.journal_entry_lines || [];
                const isExpanded = expandedVoucher === v.id;
                return (
                  <div
                    key={v.id}
                    className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 mb-2 overflow-hidden"
                  >
                    <button
                      onClick={() => setExpandedVoucher(isExpanded ? null : v.id)}
                      className="w-full flex items-center justify-between p-4 hover:bg-gray-50 dark:hover:bg-gray-700 text-left transition-colors"
                    >
                      <div>
                        <span className="font-medium" style={{ color: "var(--color-primary)" }}>
                          {v.voucher_no}
                        </span>
                        <span className="text-sm text-gray-600 dark:text-gray-300 ml-4">
                          {v.reference || "—"}
                        </span>
                        <span className="text-xs text-gray-500 dark:text-gray-400 ml-2">
                          ({v.description || "No description"})
                        </span>
                      </div>
                      <div className="flex items-center gap-3">
                        <span className="text-sm text-gray-500 dark:text-gray-400">
                          {lines.length} line{lines.length !== 1 ? "s" : ""}
                        </span>
                        {isExpanded ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
                      </div>
                    </button>
                    {isExpanded && (
                      <div className="p-4 border-t border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-700">
                        <table className="w-full text-sm">
                          <thead className="bg-gray-100 dark:bg-gray-600">
                            <tr>
                              <th className="p-2 text-left text-gray-600 dark:text-gray-200">Account</th>
                              <th className="p-2 text-left text-gray-600 dark:text-gray-200">Description</th>
                              <th className="p-2 text-right text-gray-600 dark:text-gray-200">Debit</th>
                              <th className="p-2 text-right text-gray-600 dark:text-gray-200">Credit</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-gray-200 dark:divide-gray-600">
                            {lines.map((line, idx) => (
                              <tr key={idx} className="hover:bg-gray-50 dark:hover:bg-gray-700">
                                <td className="p-2 text-gray-700 dark:text-gray-200">
                                  {line.chart_of_accounts?.account_name || "—"}
                                </td>
                                <td className="p-2 text-gray-700 dark:text-gray-200">{line.description}</td>
                                <td className="p-2 text-right text-green-600 dark:text-green-400">
                                  {line.debit > 0 ? `₹ ${Number(line.debit).toLocaleString("en-IN")}` : ""}
                                </td>
                                <td className="p-2 text-right text-red-600 dark:text-red-400">
                                  {line.credit > 0 ? `₹ ${Number(line.credit).toLocaleString("en-IN")}` : ""}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                        <div className="mt-3 text-right">
                          <Link
                            to={`/vouchers/${v.id}`}
                            className="text-primary hover:underline text-sm"
                          >
                            View full voucher →
                          </Link>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}