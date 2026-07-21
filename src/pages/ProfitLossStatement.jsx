// src/pages/ProfitLossStatement.jsx
import { useQuery } from "@tanstack/react-query";
import { Mail } from "lucide-react";

import { supabase } from "../api/supabase";
import { useOrg } from "../context/OrganizationContext";
import { sendEmail } from "../services/emailService";

export default function ProfitLossStatement() {
  const { branch, selectedFinancialYear, org } = useOrg();
  const branchId = branch?.id;
  const financialYearId = selectedFinancialYear?.id;

  // ─── Fetch data ─────────────────────────────────────────────────────
  const { data, isLoading } = useQuery({
    queryKey: ["profit-loss", branchId, financialYearId],
    queryFn: async () => {
      const { data } = await supabase.rpc("get_profit_loss", {
        p_branch_id: branchId,
        p_financial_year_id: financialYearId,
      });
      return data || [];
    },
    enabled: !!branchId && !!financialYearId,
  });

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

  // ─── Send report email ─────────────────────────────────────────────
  const sendReportEmail = async () => {
    if (!data || data.length === 0) {
      alert("No data to send.");
      return;
    }

    try {
      const adminEmails = await getAdminEmails();
      if (adminEmails.length === 0) {
        alert("No admin emails found.");
        return;
      }

      // Calculate totals
      let totalIncome = 0;
      let totalExpense = 0;
      data.forEach(row => {
        const bal = Number(row.balance) || 0;
        if (row.account_type === "income") totalIncome += bal;
        else if (row.account_type === "expense") totalExpense += bal;
      });
      const netProfit = totalIncome - totalExpense;

      // Build HTML table rows
      let tableRows = data.map(row => `
        <tr>
          <td style="padding:4px 8px;border:1px solid #ddd;">${row.account_name}</td>
          <td style="padding:4px 8px;border:1px solid #ddd;text-align:right;">₹ ${Number(row.balance).toLocaleString('en-IN')}</td>
          <td style="padding:4px 8px;border:1px solid #ddd;text-align:center;">${row.account_type}</td>
        </tr>
      `).join('');

      const isProfit = netProfit >= 0;
      const orgName = org?.company_name || "Academy";

      const htmlBody = `
        <div style="font-family:Arial,sans-serif;max-width:800px;margin:0 auto;">
          <h2 style="color:#0D47A1;">Profit & Loss Statement</h2>
          <p><strong>Organization:</strong> ${orgName}</p>
          <p><strong>Branch:</strong> ${branch?.branch_name || 'N/A'}</p>
          <p><strong>Financial Year:</strong> ${selectedFinancialYear?.name || 'N/A'}</p>
          <hr />
          <table style="width:100%;border-collapse:collapse;font-size:12px;border:1px solid #ddd;">
            <thead style="background:#e3f2fd;">
              <tr>
                <th style="padding:4px 8px;border:1px solid #ddd;text-align:left;">Account</th>
                <th style="padding:4px 8px;border:1px solid #ddd;text-align:right;">Balance</th>
                <th style="padding:4px 8px;border:1px solid #ddd;text-align:center;">Type</th>
              </tr>
            </thead>
            <tbody>
              ${tableRows}
            </tbody>
            <tfoot style="font-weight:bold;background:#f5f5f5;">
              <tr>
                <td style="padding:4px 8px;border:1px solid #ddd;text-align:right;">Total Income</td>
                <td style="padding:4px 8px;border:1px solid #ddd;text-align:right;">₹ ${totalIncome.toLocaleString('en-IN')}</td>
                <td></td>
              </tr>
              <tr>
                <td style="padding:4px 8px;border:1px solid #ddd;text-align:right;">Total Expenses</td>
                <td style="padding:4px 8px;border:1px solid #ddd;text-align:right;">₹ ${totalExpense.toLocaleString('en-IN')}</td>
                <td></td>
              </tr>
              <tr style="font-size:14px;background:${isProfit ? '#e8f5e9' : '#ffebee'};">
                <td style="padding:4px 8px;border:1px solid #ddd;text-align:right;color:${isProfit ? '#2e7d32' : '#c62828'};">
                  ${isProfit ? 'Net Profit' : 'Net Loss'}
                </td>
                <td style="padding:4px 8px;border:1px solid #ddd;text-align:right;color:${isProfit ? '#2e7d32' : '#c62828'};">
                  ₹ ${Math.abs(netProfit).toLocaleString('en-IN')}
                </td>
                <td></td>
              </tr>
            </tfoot>
          </table>
          <p style="color:#888;font-size:10px;margin-top:20px;">Computer‑generated report from ${orgName}</p>
        </div>
      `;

      await sendEmail({
        to: adminEmails,
        subject: `Profit & Loss Statement - ${selectedFinancialYear?.name || 'FY'}`,
        html: htmlBody,
       // from: org?.email || undefined,
      });

      alert("Report sent to admins.");
    } catch (err) {
      console.error("Failed to send report:", err);
      alert("Failed to send report. Check console for details.");
    }
  };

  return (
    <>
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-3xl font-righteous text-primary-dark">Profit & Loss Statement</h1>
        <button
          onClick={sendReportEmail}
          className="bg-green-600 hover:bg-green-700 text-white px-4 py-2 rounded-lg text-sm flex items-center gap-2"
        >
          <Mail size={16} /> Send Report
        </button>
      </div>

      {isLoading ? (
        <p className="text-center py-8">Loading…</p>
      ) : (
        <div className="bg-white rounded-xl shadow-sm p-6 max-w-xl">
          {data && data.length > 0 ? (
            data.map(row => (
              <div key={row.account_name} className="flex justify-between border-b py-2">
                <span>{row.account_name}</span>
                <span className="font-medium">₹{Number(row.balance).toLocaleString()}</span>
              </div>
            ))
          ) : (
            <p className="text-secondary text-center">No data available.</p>
          )}
        </div>
      )}
    </>
  );
}