// src/pages/GSTR3BSummary.jsx
import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "../api/supabase";
import { getOrganization } from "../services/organizationService";
import toast from "react-hot-toast";
import AdminLayout from "../layouts/AdminLayout";
import {
  IndianRupee,
  Calendar,
  Download,
  Printer,
  Loader,
  TrendingUp,
  TrendingDown,
} from "lucide-react";

export default function GSTR3BSummary() {
  const today = new Date();
  const firstDay = new Date(today.getFullYear(), today.getMonth(), 1);
  const [startDate, setStartDate] = useState(firstDay.toISOString().split("T")[0]);
  const [endDate, setEndDate] = useState(today.toISOString().split("T")[0]);

  const { data: org } = useQuery({
    queryKey: ["organization"],
    queryFn: getOrganization,
  });

  // ─── 1. Fetch outward supplies (from invoices) ──────────────
  const {
    data: outwardData,
    isLoading: loadingOutward,
    refetch: refetchOutward,
  } = useQuery({
    queryKey: ["gstr3b-outward", startDate, endDate],
    queryFn: async () => {
      // Get all finalized invoices in date range
      const { data: invoices, error } = await supabase
        .from("invoices")
        .select(`
          id,
          invoice_date,
          total_taxable_amount,
          total_gst_amount,
          invoice_items(
            taxable_amount,
            cgst_amount,
            sgst_amount,
            igst_amount,
            tax_rate_id,
            tax_rates(id, name, rate)
          )
        `)
        .gte("invoice_date", startDate)
        .lte("invoice_date", endDate)
        .eq("status", "Final");

      if (error) throw error;
      if (!invoices || invoices.length === 0)
        return { summary: { taxable: 0, cgst: 0, sgst: 0, igst: 0, totalTax: 0 }, byRate: [] };

      // Sum up all items
      const summary = {
        taxable: 0,
        cgst: 0,
        sgst: 0,
        igst: 0,
        totalTax: 0,
      };
      const rateMap = {};

      invoices.forEach((inv) => {
        (inv.invoice_items || []).forEach((item) => {
          const taxable = Number(item.taxable_amount) || 0;
          const cgst = Number(item.cgst_amount) || 0;
          const sgst = Number(item.sgst_amount) || 0;
          const igst = Number(item.igst_amount) || 0;
          summary.taxable += taxable;
          summary.cgst += cgst;
          summary.sgst += sgst;
          summary.igst += igst;
          summary.totalTax += cgst + sgst + igst;

          // Group by tax rate
          const rateId = item.tax_rate_id || "0";
          const rateName = item.tax_rates?.name || "No Tax";
          const ratePercent = item.tax_rates?.rate || 0;
          if (!rateMap[rateId]) {
            rateMap[rateId] = {
              rateName,
              ratePercent,
              taxable: 0,
              cgst: 0,
              sgst: 0,
              igst: 0,
              totalTax: 0,
            };
          }
          rateMap[rateId].taxable += taxable;
          rateMap[rateId].cgst += cgst;
          rateMap[rateId].sgst += sgst;
          rateMap[rateId].igst += igst;
          rateMap[rateId].totalTax += cgst + sgst + igst;
        });
      });

      // Sort by rate descending
      const byRate = Object.values(rateMap).sort((a, b) => b.ratePercent - a.ratePercent);

      return { summary, byRate };
    },
    staleTime: 2 * 60 * 1000,
  });

  // ─── 2. Fetch ITC claimed (from expenses) ──────────────────
  const {
    data: itcData,
    isLoading: loadingITC,
    refetch: refetchITC,
  } = useQuery({
    queryKey: ["gstr3b-itc", startDate, endDate],
    queryFn: async () => {
      const { data: expenses, error } = await supabase
        .from("expenses")
        .select("gst_amount, expense_date")
        .gte("expense_date", startDate)
        .lte("expense_date", endDate)
        .eq("itc_claimed", true);

      if (error) throw error;
      const totalITC = (expenses || []).reduce((sum, e) => sum + Number(e.gst_amount || 0), 0);
      return { totalITC, count: expenses?.length || 0 };
    },
    staleTime: 2 * 60 * 1000,
  });

  // ─── 3. Compute net liability ──────────────────────────────
  const netLiability = useMemo(() => {
    const outwardTax = outwardData?.summary?.totalTax || 0;
    const itc = itcData?.totalITC || 0;
    return Math.max(outwardTax - itc, 0);
  }, [outwardData, itcData]);

  // ─── 4. Handle Refresh ──────────────────────────────────────
  const handleRefresh = () => {
    refetchOutward();
    refetchITC();
    toast.success("Refreshed");
  };

  // ─── 5. Handle Export (simple CSV) ────────────────────────
  const handleExportCSV = () => {
    const rows = [
      ["Description", "Value"],
      ["Period", `${startDate} to ${endDate}`],
      ["Total Taxable Value", outwardData?.summary?.taxable || 0],
      ["CGST Collected", outwardData?.summary?.cgst || 0],
      ["SGST Collected", outwardData?.summary?.sgst || 0],
      ["IGST Collected", outwardData?.summary?.igst || 0],
      ["Total GST Collected", outwardData?.summary?.totalTax || 0],
      ["ITC Claimed", itcData?.totalITC || 0],
      ["Net GST Payable", netLiability],
    ];
    const csv = rows.map(row => row.join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `GSTR3B_${startDate}_${endDate}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  // ─── 6. Handle Print ────────────────────────────────────────
  const handlePrint = () => {
    const content = document.getElementById("gstr3b-content")?.innerHTML;
    if (!content) return;
    const win = window.open("", "_blank", "width=1000,height=750");
    win.document.write(`
      <html><head><title>GSTR-3B Summary</title>
      <style>
        body { font-family: Arial, sans-serif; margin: 40px; color: #222; }
        h1 { color: #0D47A1; }
        table { width: 100%; border-collapse: collapse; margin: 20px 0; }
        th, td { padding: 8px 12px; border: 1px solid #ccc; text-align: right; }
        th { background-color: #E3F2FD; text-align: left; }
        .summary-card { border: 1px solid #ddd; padding: 15px; margin: 10px 0; border-radius: 8px; }
        .text-right { text-align: right; }
        .footer { margin-top: 30px; font-size: 10px; color: #888; border-top: 1px solid #ddd; padding-top: 10px; text-align: center; }
      </style></head>
      <body>
        <h1>GSTR-3B Summary</h1>
        <p>Period: ${startDate} to ${endDate}</p>
        <div id="gstr3b-content">${content}</div>
        <div class="footer">Generated on ${new Date().toLocaleString()} – ${org?.company_name || ""}</div>
        <script>window.print();</script>
      </body></html>
    `);
    win.document.close();
  };

  return (
    <AdminLayout>
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-6 gap-4">
        <h1 className="text-3xl font-righteous text-primary-dark">GSTR‑3B Summary</h1>
        <div className="flex flex-wrap gap-2">
          <button
            onClick={handlePrint}
            className="bg-primary text-white px-4 py-2 rounded-lg text-sm flex items-center gap-2"
          >
            <Printer size={16} /> Print
          </button>
          <button
            onClick={handleExportCSV}
            className="border border-primary text-primary px-4 py-2 rounded-lg text-sm flex items-center gap-2 hover:bg-primary/10 transition"
          >
            <Download size={16} /> Export CSV
          </button>
          <button
            onClick={handleRefresh}
            disabled={loadingOutward || loadingITC}
            className="border px-4 py-2 rounded-lg text-sm flex items-center gap-2 hover:bg-gray-50 transition disabled:opacity-50"
          >
            <Loader size={16} className={loadingOutward || loadingITC ? "animate-spin" : ""} />
            Refresh
          </button>
        </div>
      </div>

      {/* Date Filters */}
      <div className="flex flex-wrap gap-4 mb-6 bg-white p-4 rounded-xl shadow-sm">
        <div>
          <label className="text-sm font-medium text-secondary-dark">From:</label>
          <input
            type="date"
            value={startDate}
            onChange={(e) => setStartDate(e.target.value)}
            className="ml-2 border rounded-lg p-2 text-sm focus:ring-1 focus:ring-primary"
          />
        </div>
        <div>
          <label className="text-sm font-medium text-secondary-dark">To:</label>
          <input
            type="date"
            value={endDate}
            onChange={(e) => setEndDate(e.target.value)}
            className="ml-2 border rounded-lg p-2 text-sm focus:ring-1 focus:ring-primary"
          />
        </div>
      </div>

      {/* Content for print */}
      <div id="gstr3b-content">
        {/* Summary Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
          <div className="bg-white rounded-xl shadow-sm p-5 border">
            <p className="text-xs text-secondary-light">Total Taxable Value</p>
            <p className="text-2xl font-bold text-primary-dark">
              ₹ {outwardData?.summary?.taxable?.toLocaleString("en-IN") || 0}
            </p>
          </div>
          <div className="bg-white rounded-xl shadow-sm p-5 border">
            <p className="text-xs text-secondary-light">Total GST Collected</p>
            <p className="text-2xl font-bold text-blue-700">
              ₹ {outwardData?.summary?.totalTax?.toLocaleString("en-IN") || 0}
            </p>
            <div className="text-xs text-secondary-light mt-1">
              CGST: ₹ {outwardData?.summary?.cgst?.toLocaleString("en-IN") || 0} &nbsp;|&nbsp;
              SGST: ₹ {outwardData?.summary?.sgst?.toLocaleString("en-IN") || 0} &nbsp;|&nbsp;
              IGST: ₹ {outwardData?.summary?.igst?.toLocaleString("en-IN") || 0}
            </div>
          </div>
          <div className="bg-white rounded-xl shadow-sm p-5 border border-green-200">
            <p className="text-xs text-secondary-light">ITC Claimed</p>
            <p className="text-2xl font-bold text-green-700">
              ₹ {itcData?.totalITC?.toLocaleString("en-IN") || 0}
            </p>
            <p className="text-xs text-secondary-light mt-1">From {itcData?.count || 0} expense entries</p>
          </div>
          <div className={`bg-white rounded-xl shadow-sm p-5 border ${netLiability > 0 ? 'border-red-200' : 'border-green-200'}`}>
            <p className="text-xs text-secondary-light">Net GST Payable</p>
            <p className={`text-2xl font-bold ${netLiability > 0 ? 'text-red-700' : 'text-green-700'}`}>
              ₹ {netLiability?.toLocaleString("en-IN") || 0}
            </p>
            <p className="text-xs text-secondary-light mt-1 flex items-center gap-1">
              {netLiability > 0 ? (
                <TrendingUp size={14} className="text-red-600" />
              ) : (
                <TrendingDown size={14} className="text-green-600" />
              )}
              {netLiability > 0 ? "Amount to pay" : "Excess ITC"}
            </p>
          </div>
        </div>

        {/* Tax Rate Breakdown */}
        <div className="bg-white rounded-xl shadow-sm overflow-hidden mb-6">
          <h2 className="text-lg font-semibold p-4 border-b bg-slate-50">Tax Rate Breakdown (Outward Supplies)</h2>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-slate-100">
                <tr>
                  <th className="p-3 text-left text-sm">Tax Rate</th>
                  <th className="p-3 text-right text-sm">Taxable Value</th>
                  <th className="p-3 text-right text-sm">CGST</th>
                  <th className="p-3 text-right text-sm">SGST</th>
                  <th className="p-3 text-right text-sm">IGST</th>
                  <th className="p-3 text-right text-sm">Total Tax</th>
                </tr>
              </thead>
              <tbody>
                {outwardData?.byRate?.length > 0 ? (
                  outwardData.byRate.map((rate, idx) => (
                    <tr key={idx} className="border-t hover:bg-gray-50">
                      <td className="p-3 text-sm">
                        {rate.rateName} ({rate.ratePercent}%)
                      </td>
                      <td className="p-3 text-sm text-right">₹ {rate.taxable.toLocaleString("en-IN")}</td>
                      <td className="p-3 text-sm text-right">₹ {rate.cgst.toLocaleString("en-IN")}</td>
                      <td className="p-3 text-sm text-right">₹ {rate.sgst.toLocaleString("en-IN")}</td>
                      <td className="p-3 text-sm text-right">₹ {rate.igst.toLocaleString("en-IN")}</td>
                      <td className="p-3 text-sm text-right font-medium">₹ {rate.totalTax.toLocaleString("en-IN")}</td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={6} className="p-4 text-center text-secondary">No outward supplies found</td>
                  </tr>
                )}
              </tbody>
              {outwardData?.byRate?.length > 0 && (
                <tfoot className="bg-slate-50 border-t font-medium">
                  <tr>
                    <td className="p-3">Total</td>
                    <td className="p-3 text-right">₹ {outwardData.summary.taxable.toLocaleString("en-IN")}</td>
                    <td className="p-3 text-right">₹ {outwardData.summary.cgst.toLocaleString("en-IN")}</td>
                    <td className="p-3 text-right">₹ {outwardData.summary.sgst.toLocaleString("en-IN")}</td>
                    <td className="p-3 text-right">₹ {outwardData.summary.igst.toLocaleString("en-IN")}</td>
                    <td className="p-3 text-right font-bold">₹ {outwardData.summary.totalTax.toLocaleString("en-IN")}</td>
                  </tr>
                </tfoot>
              )}
            </table>
          </div>
        </div>
      </div>

      {/* Loading state */}
      {(loadingOutward || loadingITC) && (
        <div className="fixed bottom-4 right-4 bg-white shadow-lg rounded-lg p-4 flex items-center gap-3 border">
          <Loader className="w-5 h-5 animate-spin text-primary" />
          <span className="text-sm text-secondary-dark">Fetching latest data...</span>
        </div>
      )}
    </AdminLayout>
  );
}