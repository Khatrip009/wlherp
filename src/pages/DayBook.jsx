// src/pages/DayBook.jsx
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { Printer, Calendar, ChevronDown, ChevronRight, Mail } from "lucide-react";
import { supabase } from "../api/supabase";
import { useOrg } from "../context/OrganizationContext";
import { useTheme } from "../context/ThemeContext";
import { sendEmail } from "../services/emailService";

export default function DayBook() {
  const today = new Date().toISOString().split("T")[0];
  const [selectedDate, setSelectedDate] = useState(today);
  const [expandedVoucher, setExpandedVoucher] = useState(null);

  const { org, branch, selectedFinancialYear } = useOrg();
  const theme = useTheme();
  const branchId = branch?.id;
  const financialYearId = selectedFinancialYear?.id;

  const headingFont = theme?.font_heading || "Righteous";
  const bodyFont = theme?.font_body || "Montserrat";

  // ─── Helper: get admin emails ──────────────────────────────────────
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

  // ─── Query ──────────────────────────────────────────────────────────
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

  // ─── Send Report Email ─────────────────────────────────────────────
  const sendReportEmail = async () => {
    if (vouchers.length === 0) {
      alert("No vouchers found for this date.");
      return;
    }

    try {
      const adminEmails = await getAdminEmails();
      if (adminEmails.length === 0) {
        alert("No admin emails found.");
        return;
      }

      let voucherHtml = '';
      for (const [type, vouchs] of Object.entries(groupedVouchers)) {
        voucherHtml += `<h3 style="color:#0D47A1; margin:12px 0 5px;">${type}</h3>`;
        vouchs.forEach(v => {
          const lines = v.journal_entries?.journal_entry_lines || [];
          let linesHtml = lines.map(l => `
            <tr>
              <td style="padding:4px 8px;border:1px solid #ddd;">${l.chart_of_accounts?.account_name || "—"}</td>
              <td style="padding:4px 8px;border:1px solid #ddd;">${l.description || ""}</td>
              <td style="padding:4px 8px;border:1px solid #ddd;text-align:right;">${l.debit > 0 ? '₹' + Number(l.debit).toLocaleString('en-IN') : ''}</td>
              <td style="padding:4px 8px;border:1px solid #ddd;text-align:right;">${l.credit > 0 ? '₹' + Number(l.credit).toLocaleString('en-IN') : ''}</td>
            </tr>
          `).join('');

          voucherHtml += `
            <div style="border:1px solid #ddd;padding:8px;margin-bottom:8px;">
              <div style="font-weight:700;color:#0D47A1;margin-bottom:4px;">
                ${v.voucher_no} – ${v.reference || "—"}
                <span style="font-weight:normal;color:#666;"> (${v.description || ""})</span>
              </div>
              <table style="width:100%;border-collapse:collapse;font-size:11px;border:1px solid #ddd;">
                <thead>
                  <tr style="background:#e3f2fd;">
                    <th style="padding:4px 8px;border:1px solid #ddd;text-align:left;">Account</th>
                    <th style="padding:4px 8px;border:1px solid #ddd;text-align:left;">Description</th>
                    <th style="padding:4px 8px;border:1px solid #ddd;text-align:right;">Debit</th>
                    <th style="padding:4px 8px;border:1px solid #ddd;text-align:right;">Credit</th>
                  </tr>
                </thead>
                <tbody>
                  ${linesHtml}
                </tbody>
              </table>
            </div>
          `;
        });
      }

      const htmlBody = `
        <div style="font-family:Arial,sans-serif;max-width:800px;margin:0 auto;">
          <h2 style="color:#0D47A1;">Day Book</h2>
          <p><strong>Branch:</strong> ${branch?.branch_name || 'N/A'}</p>
          <p><strong>Date:</strong> ${selectedDate}</p>
          <p><strong>Total Vouchers:</strong> ${vouchers.length}</p>
          <div style="display:flex;gap:20px;margin:10px 0;">
            <div><strong>Total Debit:</strong> ₹ ${totalDebit.toLocaleString('en-IN')}</div>
            <div><strong>Total Credit:</strong> ₹ ${totalCredit.toLocaleString('en-IN')}</div>
          </div>
          <hr />
          ${voucherHtml}
          <p style="color:#888;font-size:10px;margin-top:20px;">Computer‑generated day book from ${org?.company_name || 'Academy'}</p>
        </div>
      `;

      await sendEmail({
        to: adminEmails,
        subject: `Day Book - ${selectedDate}`,
        html: htmlBody,
      });

      alert("Report sent to admins.");
    } catch (err) {
      console.error("Failed to send report:", err);
      alert("Failed to send report. Check console for details.");
    }
  };

  // ─── Print handler ─────────────────────────────────────────────────
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
          <h1 className="text-2xl sm:text-3xl font-bold text-primary" style={{ fontFamily: headingFont }}>
            Day Book
          </h1>
          <p className="text-sm text-primary-dark mt-1" style={{ fontFamily: bodyFont }}>
            View and print daily voucher entries
          </p>
        </div>
        <div className="flex gap-3">
          <button
            onClick={sendReportEmail}
            className="inline-flex items-center gap-2 px-4 py-2.5 bg-accent hover:bg-accent-dark text-white rounded-lg transition-colors text-sm font-medium"
            style={{ fontFamily: bodyFont }}
          >
            <Mail size={16} /> Send Report
          </button>
          <button
            onClick={handlePrint}
            className="inline-flex items-center gap-2 px-4 py-2.5 bg-primary hover:bg-primary-light text-white rounded-lg transition-colors text-sm font-medium"
            style={{ fontFamily: bodyFont }}
          >
            <Printer size={16} /> Print
          </button>
        </div>
      </div>

      {/* Date selector */}
      <div className="flex items-center gap-3">
        <Calendar size={18} className="text-primary" />
        <input
          type="date"
          value={selectedDate}
          onChange={(e) => setSelectedDate(e.target.value)}
          className="border border-primary-bg bg-white text-primary rounded-lg p-2.5 text-sm"
          style={{ fontFamily: bodyFont }}
        />
      </div>

      {/* Totals Summary */}
      {vouchers.length > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div className="bg-white rounded-xl p-4 shadow-sm border border-primary-bg text-center">
            <p className="text-xs text-primary-dark" style={{ fontFamily: bodyFont }}>
              Total Vouchers
            </p>
            <p className="text-xl font-bold text-primary" style={{ fontFamily: headingFont }}>
              {vouchers.length}
            </p>
          </div>
          <div className="bg-white rounded-xl p-4 shadow-sm border border-primary-bg text-center">
            <p className="text-xs text-primary-dark" style={{ fontFamily: bodyFont }}>
              Total Debit
            </p>
            <p className="text-xl font-bold text-accent" style={{ fontFamily: headingFont }}>
              ₹ {totalDebit.toLocaleString("en-IN")}
            </p>
          </div>
          <div className="bg-white rounded-xl p-4 shadow-sm border border-primary-bg text-center">
            <p className="text-xs text-primary-dark" style={{ fontFamily: bodyFont }}>
              Total Credit
            </p>
            <p className="text-xl font-bold text-accent-dark" style={{ fontFamily: headingFont }}>
              ₹ {totalCredit.toLocaleString("en-IN")}
            </p>
          </div>
        </div>
      )}

      {isLoading ? (
        <div className="text-center py-8 text-primary-dark/60" style={{ fontFamily: bodyFont }}>
          Loading day book…
        </div>
      ) : Object.keys(groupedVouchers).length === 0 ? (
        <div className="bg-white rounded-xl p-10 shadow-sm text-center text-primary-dark border border-primary-bg">
          <Calendar size={40} className="mx-auto mb-3 opacity-50 text-primary-dark/40" />
          <p className="text-lg" style={{ fontFamily: bodyFont }}>No vouchers for this date</p>
          <p className="text-sm" style={{ fontFamily: bodyFont }}>
            Select a different date or create new vouchers.
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {Object.entries(groupedVouchers).map(([type, vouchs]) => (
            <div key={type}>
              <h2 className="text-lg font-semibold mb-2 text-primary" style={{ fontFamily: headingFont }}>
                {type}
              </h2>
              {vouchs.map((v) => {
                const lines = v.journal_entries?.journal_entry_lines || [];
                const isExpanded = expandedVoucher === v.id;
                return (
                  <div
                    key={v.id}
                    className="bg-white rounded-xl shadow-sm border border-primary-bg mb-2 overflow-hidden"
                  >
                    <button
                      onClick={() => setExpandedVoucher(isExpanded ? null : v.id)}
                      className="w-full flex items-center justify-between p-4 hover:bg-primary-bg text-left transition-colors"
                    >
                      <div>
                        <span className="font-medium text-primary">
                          {v.voucher_no}
                        </span>
                        <span className="text-sm text-primary-dark ml-4">
                          {v.reference || "—"}
                        </span>
                        <span className="text-xs text-primary-dark/60 ml-2">
                          ({v.description || "No description"})
                        </span>
                      </div>
                      <div className="flex items-center gap-3">
                        <span className="text-sm text-primary-dark">
                          {lines.length} line{lines.length !== 1 ? "s" : ""}
                        </span>
                        {isExpanded ? <ChevronDown size={16} className="text-primary" /> : <ChevronRight size={16} className="text-primary" />}
                      </div>
                    </button>
                    {isExpanded && (
                      <div className="p-4 border-t border-primary-bg bg-primary-bg">
                        <table className="w-full text-sm">
                          <thead className="bg-primary-bg/50">
                            <tr>
                              <th className="p-2 text-left text-primary-dark">Account</th>
                              <th className="p-2 text-left text-primary-dark">Description</th>
                              <th className="p-2 text-right text-primary-dark">Debit</th>
                              <th className="p-2 text-right text-primary-dark">Credit</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-primary-bg">
                            {lines.map((line, idx) => (
                              <tr key={idx} className="hover:bg-primary-bg">
                                <td className="p-2 text-primary-dark">
                                  {line.chart_of_accounts?.account_name || "—"}
                                </td>
                                <td className="p-2 text-primary-dark">{line.description}</td>
                                <td className="p-2 text-right text-accent">
                                  {line.debit > 0 ? `₹ ${Number(line.debit).toLocaleString("en-IN")}` : ""}
                                </td>
                                <td className="p-2 text-right text-accent-dark">
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