// src/pages/GSTReport.jsx
import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { Printer, Download, FileText, IndianRupee } from "lucide-react";
import AdminLayout from "../layouts/AdminLayout";
import { supabase } from "../api/supabase";
import { getOrganization } from "../services/organizationService";
import toast from "react-hot-toast";

// ─── HELPERS ───────────────────────────────────────────────

function formatAmount(amount) {
  return Math.round((amount || 0) * 100) / 100;
}

function getRatePercent(taxRateName) {
  const match = String(taxRateName || "").match(/[\d.]+/);
  return match ? parseFloat(match[0]) : 0;
}

// ─── BUILD COMPLETE GSTR-1 JSON ──────────────────────────

function buildGSTR1JSON(invoices, org, startDate, endDate) {
  const gstin = org?.gstin || "";
  const fp = startDate.substring(0, 6); // YYYYMM
  const orgState = org?.state_code || "";

  // ── B2B Supplies (customers with GSTIN) ──
  const b2bInvoices = invoices.filter((inv) => inv.students?.gstin);
  const b2b = b2bInvoices.map((inv) => {
    const items = inv.invoice_items || [];
    const totalTaxable = items.reduce((s, i) => s + (i.taxable_amount || 0), 0);
    const totalCgst = items.reduce((s, i) => s + (i.cgst_amount || 0), 0);
    const totalSgst = items.reduce((s, i) => s + (i.sgst_amount || 0), 0);
    const totalIgst = items.reduce((s, i) => s + (i.igst_amount || 0), 0);

    return {
      inv_no: inv.invoice_number,
      inv_date: inv.invoice_date,
      pos: inv.place_of_supply || orgState,
      rchrg: inv.reverse_charge ? "Y" : "N",
      etin: inv.students?.gstin || "",
      typ: "regular",
      itms: items.map((item) => ({
        num: 1,
        itm_det: {
          txval: formatAmount(item.taxable_amount || 0),
          rt: getRatePercent(item.tax_rates?.name || ""),
          camt: formatAmount(item.cgst_amount || 0),
          samt: formatAmount(item.sgst_amount || 0),
          iamt: formatAmount(item.igst_amount || 0),
        },
      })),
      inv_typ: "R",
    };
  });

  // ── B2C Supplies (customers without GSTIN) ──
  const b2cInvoices = invoices.filter((inv) => !inv.students?.gstin);
  const b2cs = b2cInvoices.map((inv) => {
    const items = inv.invoice_items || [];
    const totalTaxable = items.reduce((s, i) => s + (i.taxable_amount || 0), 0);
    const totalCgst = items.reduce((s, i) => s + (i.cgst_amount || 0), 0);
    const totalSgst = items.reduce((s, i) => s + (i.sgst_amount || 0), 0);
    const totalIgst = items.reduce((s, i) => s + (i.igst_amount || 0), 0);

    // Determine if inter‑state
    const pos = inv.place_of_supply || orgState;
    const isInterState = pos !== orgState;

    return {
      sply_ty: isInterState ? "INTER" : "INTRA",
      pos,
      rchrg: inv.reverse_charge ? "Y" : "N",
      etin: "",
      typ: "regular",
      itms: items.map((item) => ({
        num: 1,
        itm_det: {
          txval: formatAmount(item.taxable_amount || 0),
          rt: getRatePercent(item.tax_rates?.name || ""),
          camt: formatAmount(item.cgst_amount || 0),
          samt: formatAmount(item.sgst_amount || 0),
          iamt: formatAmount(item.igst_amount || 0),
        },
      })),
    };
  });

  // ── HSN Summary ──
  const allItems = invoices.flatMap((inv) => inv.invoice_items || []);
  const hsnMap = {};
  allItems.forEach((item) => {
    const hsn = item.hsn_sac_code || "UNKNOWN";
    if (!hsnMap[hsn]) {
      hsnMap[hsn] = {
        hsn_sc: hsn,
        desc: item.description || "",
        uqc: item.inventory_items?.unit || "NOS",
        qty: 0,
        txval: 0,
        camt: 0,
        samt: 0,
        iamt: 0,
      };
    }
    hsnMap[hsn].qty += item.quantity || 0;
    hsnMap[hsn].txval += item.taxable_amount || 0;
    hsnMap[hsn].camt += item.cgst_amount || 0;
    hsnMap[hsn].samt += item.sgst_amount || 0;
    hsnMap[hsn].iamt += item.igst_amount || 0;
  });
  const hsn = Object.values(hsnMap).map((h) => ({
    ...h,
    txval: formatAmount(h.txval),
    camt: formatAmount(h.camt),
    samt: formatAmount(h.samt),
    iamt: formatAmount(h.iamt),
  }));

  // ── Nil / Exempt / Non‑GST Supplies (placeholder – can be enhanced) ──
  const nilSupplies = {
    sply_ty: "INTER",
    etin: "",
    typ: "regular",
    itms: [],
  };

  // ── Final JSON ──
  return {
    gstin,
    fp,
    version: "1.0.0",
    b2b: b2b.length > 0 ? b2b : [],
    b2cs: b2cs.length > 0 ? b2cs : [],
    b2cl: [], // B2C large > 2.5L (not currently tracked)
    nil: nilSupplies,
    hsn: hsn.length > 0 ? hsn : [],
    exp: [], // Exports (not currently tracked)
    cdnr: [], // Credit notes (not yet implemented)
  };
}

// ─── COMPONENT ─────────────────────────────────────────────

export default function GSTReport() {
  const [startDate, setStartDate] = useState(
    new Date(new Date().getFullYear(), 0, 1).toISOString().split("T")[0]
  );
  const [endDate, setEndDate] = useState(new Date().toISOString().split("T")[0]);

  const { data: org } = useQuery({
    queryKey: ["organization"],
    queryFn: getOrganization,
  });

  // ── Fetch invoices with items, tax rates, students ──
  const { data: invoices = [], isLoading, refetch } = useQuery({
    queryKey: ["gst-invoices", startDate, endDate],
    queryFn: async () => {
      // 1. Fetch invoices
      // 1. Fetch invoices with student data (simple join)
const { data: invoiceData, error: invError } = await supabase
  .from("invoices")
  .select(`
    *,
    students:student_id(id, first_name, last_name, admission_no, gstin, state_code, legal_business_name)
  `)
  .gte("invoice_date", startDate)
  .lte("invoice_date", endDate)
  .eq("status", "Final");

if (invError) throw invError;

// 2. Fetch invoice items separately
const invoiceIds = invoiceData.map(inv => inv.id);
const { data: itemsData, error: itemsError } = await supabase
  .from("invoice_items")
  .select("*")
  .in("invoice_id", invoiceIds);

if (itemsError) throw itemsError;

// 3. Fetch tax rates for items
const taxRateIds = [...new Set(itemsData.map(item => item.tax_rate_id).filter(Boolean))];
let taxRates = [];
if (taxRateIds.length > 0) {
  const { data: trData } = await supabase
    .from("tax_rates")
    .select("id, name, rate")
    .in("id", taxRateIds);
  taxRates = trData || [];
}
const taxRateMap = Object.fromEntries(taxRates.map(tr => [tr.id, tr]));

// 4. Fetch inventory items for product items
const itemIds = itemsData.filter(item => item.item_type === 'product' && item.item_id).map(item => item.item_id);
let inventoryItems = [];
if (itemIds.length > 0) {
  const { data: invData } = await supabase
    .from("inventory_items")
    .select("id, item_name, unit")
    .in("id", itemIds);
  inventoryItems = invData || [];
}
const inventoryMap = Object.fromEntries(inventoryItems.map(inv => [inv.id, inv]));

// 5. Combine everything
const invoices = invoiceData.map(inv => ({
  ...inv,
  invoice_items: itemsData
    .filter(item => item.invoice_id === inv.id)
    .map(item => ({
      ...item,
      tax_rates: taxRateMap[item.tax_rate_id] || null,
      inventory_items: inventoryMap[item.item_id] || null,
    })),
}));

return invoices;
    },
    staleTime: 5 * 60 * 1000,
  });

  // ── Compute summaries ──
  const summaries = useMemo(() => {
    const b2bInvoices = invoices.filter((inv) => inv.students?.gstin);
    const b2cInvoices = invoices.filter((inv) => !inv.students?.gstin);

    const totalB2B = b2bInvoices.length;
    const totalB2C = b2cInvoices.length;
    const totalInvoices = invoices.length;

    const b2bTaxable = b2bInvoices.reduce((s, inv) => {
      return s + (inv.invoice_items || []).reduce((s2, it) => s2 + (it.taxable_amount || 0), 0);
    }, 0);
    const b2cTaxable = b2cInvoices.reduce((s, inv) => {
      return s + (inv.invoice_items || []).reduce((s2, it) => s2 + (it.taxable_amount || 0), 0);
    }, 0);
    const b2bGst = b2bInvoices.reduce((s, inv) => {
      return s + (inv.invoice_items || []).reduce(
        (s2, it) => s2 + (it.cgst_amount || 0) + (it.sgst_amount || 0) + (it.igst_amount || 0),
        0
      );
    }, 0);
    const b2cGst = b2cInvoices.reduce((s, inv) => {
      return s + (inv.invoice_items || []).reduce(
        (s2, it) => s2 + (it.cgst_amount || 0) + (it.sgst_amount || 0) + (it.igst_amount || 0),
        0
      );
    }, 0);

    const allItems = invoices.flatMap((inv) => inv.invoice_items || []);
    const hsnSummary = {};
    allItems.forEach((item) => {
      const hsn = item.hsn_sac_code || "UNKNOWN";
      if (!hsnSummary[hsn]) {
        hsnSummary[hsn] = {
          hsn_code: hsn,
          description: item.description || "",
          quantity: 0,
          unit: item.inventory_items?.unit || "NOS",
          taxable_value: 0,
          tax_amount: 0,
        };
      }
      hsnSummary[hsn].quantity += item.quantity || 0;
      hsnSummary[hsn].taxable_value += item.taxable_amount || 0;
      hsnSummary[hsn].tax_amount += (item.cgst_amount || 0) + (item.sgst_amount || 0) + (item.igst_amount || 0);
    });

    return {
      totalInvoices,
      totalB2B,
      totalB2C,
      b2bTaxable,
      b2cTaxable,
      totalTaxable: b2bTaxable + b2cTaxable,
      b2bGst,
      b2cGst,
      totalGst: b2bGst + b2cGst,
      hsnSummary: Object.values(hsnSummary),
    };
  }, [invoices]);

  // ── Handle JSON Download ──
  const handleDownloadJSON = () => {
    if (!org) {
      toast.error("Organization details not loaded");
      return;
    }
    if (invoices.length === 0) {
      toast.error("No finalized invoices found for the selected period");
      return;
    }
    const jsonData = buildGSTR1JSON(invoices, org, startDate, endDate);
    const blob = new Blob([JSON.stringify(jsonData, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `GSTR1_${startDate}_${endDate}.json`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success("GSTR-1 JSON downloaded");
  };

  // ── Handle Print ──
  const handlePrint = () => {
    const printContent = document.getElementById("gst-preview")?.outerHTML;
    if (!printContent) return;
    const logoUrl = org?.logo_dark_url || "/ShreeVidhyaDark.png";
    const orgName = org?.company_name || "ShreeVidhya Academy";
    const printWindow = window.open("", "_blank", "width=1100,height=750");
    printWindow.document.write(`
      <html><head><title>GST Report</title>
      <style>
        @page { size: A4; margin: 12mm; }
        body { font-family: Montserrat, sans-serif; color: #222; font-size: 11px; }
        .header { display: flex; align-items: center; border-bottom: 2px solid #0D47A1; padding-bottom: 8px; margin-bottom: 15px; }
        .header img { height: 40px; margin-right: 15px; }
        .org-name { font-size: 16px; font-weight: 700; color: #0D47A1; }
        .org-details { font-size: 8px; color: #555; }
        h1 { text-align: center; color: #0D47A1; margin: 10px 0; font-size: 14px; }
        .summary { display: flex; flex-wrap: wrap; gap: 15px; margin-bottom: 15px; }
        .summary-card { border: 1px solid #ddd; padding: 8px 16px; border-radius: 6px; background: #f9f9f9; }
        .summary-card .label { font-size: 8px; color: #888; }
        .summary-card .value { font-size: 14px; font-weight: 700; }
        table { width: 100%; border-collapse: collapse; border: 1px solid #bbb; font-size: 9px; }
        th, td { padding: 4px 6px; border: 1px solid #bbb; }
        th { background-color: #E3F2FD; }
        .text-right { text-align: right; }
        .footer { margin-top: 20px; font-size: 8px; color: #888; text-align: center; border-top: 1px solid #ddd; padding-top: 8px; }
        .badge { display: inline-block; padding: 1px 8px; border-radius: 12px; font-size: 8px; font-weight: 600; }
        .badge-b2b { background: #E3F2FD; color: #1565C0; }
        .badge-b2c { background: #FFF3E0; color: #E65100; }
      </style></head>
      <body>
        <div class="header"><img src="${logoUrl}" alt="Logo" onerror="this.style.display='none'"/><div><div class="org-name">${orgName}</div><div class="org-details">${org?.address||""}</div><div class="org-details">Ph: ${org?.phone||""} | Email: ${org?.email||""}</div><div class="org-details">GSTIN: ${org?.gstin||"Not Registered"}</div></div></div>
        <h1>GSTR-1 Report – ${startDate} to ${endDate}</h1>
        ${printContent}
        <div class="footer">Computer‑generated report – ${orgName}</div>
        <script>window.print();</script>
      </body></html>
    `);
    printWindow.document.close();
  };

  return (
    <AdminLayout>
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-6 gap-4">
        <h1 className="text-3xl font-righteous text-primary-dark">GST Report (GSTR‑1)</h1>
        <div className="flex flex-wrap gap-2">
          <button
            onClick={handlePrint}
            className="bg-primary text-white px-4 py-2 rounded-lg text-sm flex items-center gap-2"
          >
            <Printer size={16} /> Print
          </button>
          <button
            onClick={handleDownloadJSON}
            className="border border-primary text-primary px-4 py-2 rounded-lg text-sm flex items-center gap-2 hover:bg-primary/10 transition"
          >
            <Download size={16} /> Download JSON
          </button>
        </div>
      </div>

      {/* Filters */}
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
        <button
          onClick={() => refetch()}
          className="bg-primary text-white px-4 py-2 rounded-lg text-sm"
        >
          Refresh
        </button>
        {isLoading && <span className="text-secondary text-sm flex items-center">Loading...</span>}
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-6" id="gst-preview">
        <div className="bg-white rounded-xl shadow-sm p-4 border">
          <p className="text-xs text-secondary-light">Total Invoices</p>
          <p className="text-2xl font-bold text-primary-dark">{summaries.totalInvoices}</p>
          <div className="flex gap-2 mt-1 text-xs">
            <span className="text-blue-600">B2B: {summaries.totalB2B}</span>
            <span className="text-orange-600">B2C: {summaries.totalB2C}</span>
          </div>
        </div>
        <div className="bg-white rounded-xl shadow-sm p-4 border">
          <p className="text-xs text-secondary-light">Taxable Value</p>
          <p className="text-2xl font-bold text-primary-dark">
            ₹ {summaries.totalTaxable.toLocaleString("en-IN")}
          </p>
        </div>
        <div className="bg-white rounded-xl shadow-sm p-4 border">
          <p className="text-xs text-secondary-light">Total GST</p>
          <p className="text-2xl font-bold text-green-700">
            ₹ {summaries.totalGst.toLocaleString("en-IN")}
          </p>
        </div>
        <div className="bg-white rounded-xl shadow-sm p-4 border">
          <p className="text-xs text-secondary-light">Avg Tax Rate</p>
          <p className="text-2xl font-bold text-indigo-600">
            {summaries.totalTaxable > 0
              ? ((summaries.totalGst / summaries.totalTaxable) * 100).toFixed(1)
              : 0}%
          </p>
        </div>
      </div>

      {/* B2B & B2C Summary */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-6">
        <div className="bg-white rounded-xl shadow-sm p-4 border">
          <h3 className="font-semibold text-blue-700 flex items-center gap-2">
            <span className="badge-b2b px-2 py-0.5 rounded-full text-xs">B2B</span>
            Supplies ({summaries.totalB2B} invoices)
          </h3>
          <div className="flex justify-between mt-2 text-sm">
            <span>Taxable Value:</span>
            <span className="font-medium">₹ {summaries.b2bTaxable.toLocaleString("en-IN")}</span>
          </div>
          <div className="flex justify-between text-sm">
            <span>Total GST:</span>
            <span className="font-medium">₹ {summaries.b2bGst.toLocaleString("en-IN")}</span>
          </div>
        </div>
        <div className="bg-white rounded-xl shadow-sm p-4 border">
          <h3 className="font-semibold text-orange-700 flex items-center gap-2">
            <span className="badge-b2c px-2 py-0.5 rounded-full text-xs">B2C</span>
            Supplies ({summaries.totalB2C} invoices)
          </h3>
          <div className="flex justify-between mt-2 text-sm">
            <span>Taxable Value:</span>
            <span className="font-medium">₹ {summaries.b2cTaxable.toLocaleString("en-IN")}</span>
          </div>
          <div className="flex justify-between text-sm">
            <span>Total GST:</span>
            <span className="font-medium">₹ {summaries.b2cGst.toLocaleString("en-IN")}</span>
          </div>
        </div>
      </div>

      {/* HSN Summary Table */}
      <div className="bg-white rounded-xl shadow-sm overflow-hidden mb-6">
        <h2 className="text-lg font-semibold p-4 border-b bg-slate-50 flex items-center gap-2">
          <FileText size={18} /> HSN Summary
        </h2>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-slate-100">
              <tr>
                <th className="p-3 text-left text-sm">HSN/SAC</th>
                <th className="p-3 text-left text-sm">Description</th>
                <th className="p-3 text-right text-sm">Quantity</th>
                <th className="p-3 text-left text-sm">Unit</th>
                <th className="p-3 text-right text-sm">Taxable Value</th>
                <th className="p-3 text-right text-sm">Tax Amount</th>
              </tr>
            </thead>
            <tbody>
              {summaries.hsnSummary.length === 0 ? (
                <tr>
                  <td colSpan={6} className="p-4 text-center text-secondary">
                    No HSN data available
                  </td>
                </tr>
              ) : (
                summaries.hsnSummary.map((h, idx) => (
                  <tr key={idx} className="border-t hover:bg-gray-50">
                    <td className="p-3 text-sm font-mono">{h.hsn_code}</td>
                    <td className="p-3 text-sm">{h.description || "—"}</td>
                    <td className="p-3 text-sm text-right">{h.quantity}</td>
                    <td className="p-3 text-sm">{h.unit}</td>
                    <td className="p-3 text-sm text-right">₹ {h.taxable_value.toLocaleString("en-IN")}</td>
                    <td className="p-3 text-sm text-right">₹ {h.tax_amount.toLocaleString("en-IN")}</td>
                  </tr>
                ))
              )}
            </tbody>
            <tfoot className="bg-slate-50 border-t font-medium">
              <tr>
                <td colSpan={4} className="p-3 text-right">Total</td>
                <td className="p-3 text-right">
                  ₹ {summaries.hsnSummary.reduce((s, h) => s + h.taxable_value, 0).toLocaleString("en-IN")}
                </td>
                <td className="p-3 text-right">
                  ₹ {summaries.hsnSummary.reduce((s, h) => s + h.tax_amount, 0).toLocaleString("en-IN")}
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
      </div>

      {/* JSON Preview */}
      <div className="bg-gray-50 rounded-xl p-4 border">
        <h2 className="text-lg font-semibold text-primary-dark mb-3 flex items-center gap-2">
          <IndianRupee size={18} /> GSTR‑1 JSON Preview
        </h2>
        <pre className="text-xs bg-white p-3 rounded border max-h-80 overflow-auto">
          {isLoading
            ? "Loading invoice data..."
            : invoices.length === 0
            ? "No finalized invoices found for the selected period."
            : org
            ? JSON.stringify(buildGSTR1JSON(invoices, org, startDate, endDate), null, 2)
            : "Loading organization details..."}
        </pre>
        <p className="text-xs text-secondary-light mt-2">
          JSON follows the GST portal offline utility schema (v1.0.0). Contains B2B, B2C, and HSN summary.
        </p>
      </div>
    </AdminLayout>
  );
}