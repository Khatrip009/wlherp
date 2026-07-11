// src/pages/BudgetVsActual.jsx
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Printer, ArrowLeft } from "lucide-react";
import { Link } from "react-router-dom";
import AdminLayout from "../layouts/AdminLayout";
import { getBudgetVsActual } from "../services/budgetService";
import { getOrganization } from "../services/organizationService";
import { useOrg } from "../context/OrganizationContext";   // NEW

export default function BudgetVsActual() {
  const today = new Date().toISOString().split("T")[0];
  const firstOfMonth = new Date(new Date().getFullYear(), new Date().getMonth(), 1)
    .toISOString()
    .split("T")[0];

  const [startDate, setStartDate] = useState(firstOfMonth);
  const [endDate, setEndDate] = useState(today);

  // ── Get current organisation from context ──
  const { org: currentOrg } = useOrg();

  const { data: org } = useQuery({
    queryKey: ["organization", currentOrg?.id],
    queryFn: () => getOrganization(currentOrg?.id),
    enabled: !!currentOrg?.id,
  });

  const { data: report = [], isLoading } = useQuery({
    queryKey: ["budget-vs-actual", startDate, endDate],
    queryFn: () => getBudgetVsActual(startDate, endDate),
    enabled: !!(startDate && endDate),
  });

  const totalBudget = report.reduce((s, r) => s + r.budgeted, 0);
  const totalActual = report.reduce((s, r) => s + r.actual, 0);
  const totalVariance = totalActual - totalBudget;

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
    <AdminLayout>
      <Link to="/budgets" className="inline-flex items-center gap-2 text-secondary hover:text-primary-dark mb-4 text-sm">
        <ArrowLeft size={18} /> Back to Budgets
      </Link>

      <div className="flex justify-between items-center mb-6">
        <h1 className="text-3xl font-righteous text-primary-dark">Budget vs Actual</h1>
        <button onClick={handlePrint} className="bg-primary text-white px-4 py-2 rounded-lg text-sm flex items-center gap-2">
          <Printer size={16} /> Print
        </button>
      </div>

      <div className="flex gap-4 mb-6">
        <div>
          <label className="text-sm font-medium mr-2">From:</label>
          <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} className="border rounded p-2 text-sm" />
        </div>
        <div>
          <label className="text-sm font-medium mr-2">To:</label>
          <input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} className="border rounded p-2 text-sm" />
        </div>
      </div>

      <div className="grid grid-cols-3 gap-4 mb-6">
        <div className="bg-white rounded-xl p-4 shadow-sm border text-center">
          <p className="text-xs text-secondary-dark">Total Budgeted</p>
          <p className="text-xl font-bold text-primary-dark">₹ {totalBudget.toLocaleString("en-IN")}</p>
        </div>
        <div className="bg-white rounded-xl p-4 shadow-sm border text-center">
          <p className="text-xs text-secondary-dark">Total Actual</p>
          <p className="text-xl font-bold text-green-600">₹ {totalActual.toLocaleString("en-IN")}</p>
        </div>
        <div className={`bg-white rounded-xl p-4 shadow-sm border text-center ${totalVariance > 0 ? "border-red-300" : "border-green-300"}`}>
          <p className="text-xs text-secondary-dark">Variance</p>
          <p className={`text-xl font-bold ${totalVariance > 0 ? "text-red-600" : "text-green-600"}`}>
            {totalVariance > 0 ? "+" : ""}₹ {totalVariance.toLocaleString("en-IN")}
          </p>
        </div>
      </div>

      {isLoading ? (
        <p className="text-center py-8">Loading…</p>
      ) : report.length === 0 ? (
        <div className="bg-white rounded-xl p-10 text-center text-secondary">
          <p>No budget data for the selected period.</p>
        </div>
      ) : (
        <div className="bg-white rounded-xl shadow-sm overflow-hidden">
          <div id="bva-table">
            <table className="w-full text-sm">
              <thead className="bg-slate-100">
                <tr>
                  <th className="p-3 text-left">Account</th>
                  <th className="p-3 text-left">Period</th>
                  <th className="p-3 text-right">Budgeted</th>
                  <th className="p-3 text-right">Actual</th>
                  <th className="p-3 text-right">Variance</th>
                  <th className="p-3 text-right">Variance %</th>
                </tr>
              </thead>
              <tbody>
                {report.map((r) => (
                  <tr key={r.id} className="border-t hover:bg-gray-50">
                    <td className="p-3">{r.account_code} - {r.account_name}</td>
                    <td className="p-3 text-sm">
                      {r.period_start} → {r.period_end}
                    </td>
                    <td className="p-3 text-right">₹ {r.budgeted.toLocaleString("en-IN")}</td>
                    <td className="p-3 text-right">₹ {r.actual.toLocaleString("en-IN")}</td>
                    <td className={`p-3 text-right font-medium ${r.variance > 0 ? "text-red-600" : "text-green-600"}`}>
                      {r.variance > 0 ? "+" : ""}₹ {r.variance.toLocaleString("en-IN")}
                    </td>
                    <td className={`p-3 text-right ${r.variance > 0 ? "text-red-600" : "text-green-600"}`}>
                      {r.variancePercent}%
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </AdminLayout>
  );
}