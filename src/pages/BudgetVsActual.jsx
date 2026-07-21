// src/pages/BudgetVsActual.jsx
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Printer, ArrowLeft, Mail } from "lucide-react"; // 👈 Added Mail
import { Link } from "react-router-dom";
import { getBudgetVsActual } from "../services/budgetService";
import { getOrganization } from "../services/organizationService";
import { useOrg } from "../context/OrganizationContext";
import { supabase } from "../api/supabase";
import { sendEmail } from "../services/emailService"; // 👈 Import

export default function BudgetVsActual() {
  const today = new Date().toISOString().split("T")[0];
  const firstOfMonth = new Date(new Date().getFullYear(), new Date().getMonth(), 1)
    .toISOString()
    .split("T")[0];

  const [startDate, setStartDate] = useState(firstOfMonth);
  const [endDate, setEndDate] = useState(today);

  const { org: currentOrg, branch, selectedFinancialYear } = useOrg();
  const branchId = branch?.id;
  const financialYearId = selectedFinancialYear?.id;

  const { data: org } = useQuery({
    queryKey: ["organization", currentOrg?.id],
    queryFn: () => getOrganization(currentOrg?.id),
    enabled: !!currentOrg?.id,
  });

  const { data: report = [], isLoading } = useQuery({
    queryKey: ["budget-vs-actual", startDate, endDate, branchId, financialYearId],
    queryFn: () => getBudgetVsActual(startDate, endDate, branchId, financialYearId),
    enabled: !!(startDate && endDate && branchId && financialYearId),
  });

  const totalBudget = report.reduce((s, r) => s + r.budgeted, 0);
  const totalActual = report.reduce((s, r) => s + r.actual, 0);
  const totalVariance = totalActual - totalBudget;

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
    if (report.length === 0) {
      alert("No data to send. Please adjust the date range.");
      return;
    }

    try {
      const adminEmails = await getAdminEmails();
      if (adminEmails.length === 0) {
        alert("No admin emails found to send the report.");
        return;
      }

      // Build HTML table rows
      let tableRows = report.map((r) => {
        const varianceColor = r.variance > 0 ? "#dc2626" : "#16a34a";
        return `
          <tr>
            <td style="padding:4px 8px;border:1px solid #ddd;">${r.account_code} - ${r.account_name}</td>
            <td style="padding:4px 8px;border:1px solid #ddd;">${r.period_start} → ${r.period_end}</td>
            <td style="padding:4px 8px;border:1px solid #ddd;text-align:right;">₹ ${r.budgeted.toLocaleString('en-IN')}</td>
            <td style="padding:4px 8px;border:1px solid #ddd;text-align:right;">₹ ${r.actual.toLocaleString('en-IN')}</td>
            <td style="padding:4px 8px;border:1px solid #ddd;text-align:right;font-weight:bold;color:${varianceColor};">${r.variance > 0 ? '+' : ''}₹ ${r.variance.toLocaleString('en-IN')}</td>
            <td style="padding:4px 8px;border:1px solid #ddd;text-align:right;color:${varianceColor};">${r.variancePercent}%</td>
          </tr>
        `;
      }).join('');

      const varianceTotalColor = totalVariance > 0 ? "#dc2626" : "#16a34a";

      const htmlBody = `
        <div style="font-family:Arial,sans-serif;max-width:800px;margin:0 auto;">
          <h2 style="color:#0D47A1;">Budget vs Actual Report</h2>
          <p><strong>Branch:</strong> ${branch?.branch_name || 'N/A'}</p>
          <p><strong>Period:</strong> ${startDate} – ${endDate}</p>
          <hr />
          <div style="display:flex;justify-content:space-around;margin-bottom:20px;">
            <div><strong>Total Budgeted:</strong> ₹ ${totalBudget.toLocaleString('en-IN')}</div>
            <div><strong>Total Actual:</strong> ₹ ${totalActual.toLocaleString('en-IN')}</div>
            <div><strong style="color:${varianceTotalColor};">Variance:</strong> ${totalVariance > 0 ? '+' : ''}₹ ${totalVariance.toLocaleString('en-IN')}</div>
          </div>
          <h3>Account-wise Breakdown</h3>
          <table style="width:100%;border-collapse:collapse;font-size:12px;">
            <thead>
              <tr style="background:#e3f2fd;">
                <th style="padding:4px 8px;border:1px solid #ddd;text-align:left;">Account</th>
                <th style="padding:4px 8px;border:1px solid #ddd;text-align:left;">Period</th>
                <th style="padding:4px 8px;border:1px solid #ddd;text-align:right;">Budgeted</th>
                <th style="padding:4px 8px;border:1px solid #ddd;text-align:right;">Actual</th>
                <th style="padding:4px 8px;border:1px solid #ddd;text-align:right;">Variance</th>
                <th style="padding:4px 8px;border:1px solid #ddd;text-align:right;">Variance %</th>
              </tr>
            </thead>
            <tbody>
              ${tableRows}
            </tbody>
            <tfoot>
              <tr style="font-weight:bold;background:#f5f5f5;">
                <td colspan="2" style="padding:4px 8px;border:1px solid #ddd;text-align:right;">Totals</td>
                <td style="padding:4px 8px;border:1px solid #ddd;text-align:right;">₹ ${totalBudget.toLocaleString('en-IN')}</td>
                <td style="padding:4px 8px;border:1px solid #ddd;text-align:right;">₹ ${totalActual.toLocaleString('en-IN')}</td>
                <td style="padding:4px 8px;border:1px solid #ddd;text-align:right;color:${varianceTotalColor};">${totalVariance > 0 ? '+' : ''}₹ ${totalVariance.toLocaleString('en-IN')}</td>
                <td style="padding:4px 8px;border:1px solid #ddd;text-align:right;">${totalBudget ? ((totalVariance / totalBudget) * 100).toFixed(1) : '0'}%</td>
              </tr>
            </tfoot>
          </table>
          <p style="color:#888;font-size:10px;margin-top:20px;">Computer‑generated report from ${org?.company_name || 'Academy'}</p>
        </div>
      `;

      await sendEmail({
        to: adminEmails,
        subject: `Budget vs Actual Report - ${new Date().toLocaleDateString()}`,
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
    const printContent = document.getElementById("bva-table")?.outerHTML;
    if (!printContent) return;
    const logoUrl = org?.logo_dark_url || "/ShreeVidhyaDark.png";
    const orgName = org?.company_name || "ShreeVidhya Academy";
    const orgAddr = org?.address || "";
    const orgPhone = org?.phone || "";
    const orgEmail = org?.email || "";
    const printWindow = window.open("", "_blank", "width=1100,height=750");
    printWindow.document.write(`
      <html><head><title>Budget vs Actual</title>
      <style>
        @page { size: A4 landscape; margin: 12mm; }
        body { font-family: Montserrat, sans-serif; color: #222; font-size: 10px; }
        .header { display: flex; align-items: center; border-bottom: 2px solid #0D47A1; padding-bottom: 8px; margin-bottom: 15px; }
        .header img { height: 40px; margin-right: 15px; }
        .org-name { font-size: 16px; font-weight: 700; color: #0D47A1; }
        .org-details { font-size: 8px; color: #555; }
        h1 { text-align: center; color: #0D47A1; margin: 10px 0; font-size: 14px; }
        table { width: 100%; border-collapse: collapse; border: 1px solid #bbb; font-size: 9px; }
        th, td { padding: 4px 6px; border: 1px solid #bbb; }
        th { background-color: #E3F2FD; }
        .text-right { text-align: right; }
        .footer { margin-top: 20px; font-size: 8px; color: #888; text-align: center; border-top: 1px solid #ddd; padding-top: 8px; }
        .over-budget { color: #dc2626; font-weight: 600; }
        .under-budget { color: #16a34a; font-weight: 600; }
      </style></head>
      <body>
        <div class="header"><img src="${logoUrl}" alt="Logo" onerror="this.style.display='none'"/><div><div class="org-name">${orgName}</div><div class="org-details">${orgAddr}</div><div class="org-details">Ph: ${orgPhone} | Email: ${orgEmail}</div></div></div>
        <h1>Budget vs Actual Report</h1>
        <div class="text-center text-xs mb-4">Period: ${startDate} – ${endDate}</div>
        ${printContent}
        <div class="footer">Computer‑generated report – ${orgName}</div>
        <script>window.print();</script>
      </body></html>
    `);
    printWindow.document.close();
  };

  return (
    <div className="space-y-6 px-4 sm:px-6 lg:px-0">
      {/* Back to Budgets */}
      <Link
        to="/budgets"
        className="inline-flex items-center gap-2 text-gray-600 dark:text-gray-400 hover:text-primary dark:hover:text-primary-light text-sm"
        style={{ fontFamily: "var(--font-body)" }}
      >
        <ArrowLeft size={18} /> Back to Budgets
      </Link>

      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold" style={{ fontFamily: "var(--font-heading)", color: "var(--color-primary)" }}>
            Budget vs Actual
          </h1>
          <p className="text-sm text-gray-600 dark:text-gray-400 mt-1" style={{ fontFamily: "var(--font-body)" }}>
            Compare budgeted amounts against actual spending
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

      {/* Date selectors */}
      <div className="flex flex-wrap gap-4">
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
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-white dark:bg-gray-800 rounded-xl p-4 shadow-sm border border-gray-200 dark:border-gray-700 text-center">
          <p className="text-xs text-gray-500 dark:text-gray-400" style={{ fontFamily: "var(--font-body)" }}>
            Total Budgeted
          </p>
          <p className="text-xl font-bold" style={{ color: "var(--color-primary)" }}>
            ₹ {totalBudget.toLocaleString("en-IN")}
          </p>
        </div>
        <div className="bg-white dark:bg-gray-800 rounded-xl p-4 shadow-sm border border-gray-200 dark:border-gray-700 text-center">
          <p className="text-xs text-gray-500 dark:text-gray-400" style={{ fontFamily: "var(--font-body)" }}>
            Total Actual
          </p>
          <p className="text-xl font-bold text-green-600 dark:text-green-400">
            ₹ {totalActual.toLocaleString("en-IN")}
          </p>
        </div>
        <div className={`bg-white dark:bg-gray-800 rounded-xl p-4 shadow-sm border text-center ${
          totalVariance > 0 ? "border-red-300 dark:border-red-700" : "border-green-300 dark:border-green-700"
        }`}>
          <p className="text-xs text-gray-500 dark:text-gray-400" style={{ fontFamily: "var(--font-body)" }}>
            Variance
          </p>
          <p className={`text-xl font-bold ${totalVariance > 0 ? "text-red-600 dark:text-red-400" : "text-green-600 dark:text-green-400"}`}>
            {totalVariance > 0 ? "+" : ""}₹ {totalVariance.toLocaleString("en-IN")}
          </p>
        </div>
      </div>

      {/* Report Table */}
      {isLoading ? (
        <p className="text-center py-8 text-gray-500 dark:text-gray-400">Loading…</p>
      ) : report.length === 0 ? (
        <div className="bg-white dark:bg-gray-800 rounded-xl p-10 text-center text-gray-500 dark:text-gray-400 border border-gray-200 dark:border-gray-700">
          <p>No budget data for the selected period.</p>
        </div>
      ) : (
        <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 overflow-hidden">
          <div id="bva-table" className="overflow-x-auto">
            <table className="w-full min-w-[700px] text-sm">
              <thead className="bg-gray-50 dark:bg-gray-700">
                <tr>
                  <th className="p-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Account</th>
                  <th className="p-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Period</th>
                  <th className="p-3 text-right text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Budgeted</th>
                  <th className="p-3 text-right text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Actual</th>
                  <th className="p-3 text-right text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Variance</th>
                  <th className="p-3 text-right text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Variance %</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
                {report.map((r) => (
                  <tr key={r.id} className="hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors">
                    <td className="p-3 text-gray-700 dark:text-gray-200">{r.account_code} - {r.account_name}</td>
                    <td className="p-3 text-sm text-gray-700 dark:text-gray-200">
                      {r.period_start} → {r.period_end}
                    </td>
                    <td className="p-3 text-right text-gray-700 dark:text-gray-200">₹ {r.budgeted.toLocaleString("en-IN")}</td>
                    <td className="p-3 text-right text-gray-700 dark:text-gray-200">₹ {r.actual.toLocaleString("en-IN")}</td>
                    <td className={`p-3 text-right font-medium ${
                      r.variance > 0 ? "text-red-600 dark:text-red-400" : "text-green-600 dark:text-green-400"
                    }`}>
                      {r.variance > 0 ? "+" : ""}₹ {r.variance.toLocaleString("en-IN")}
                    </td>
                    <td className={`p-3 text-right ${
                      r.variance > 0 ? "text-red-600 dark:text-red-400" : "text-green-600 dark:text-green-400"
                    }`}>
                      {r.variancePercent}%
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}