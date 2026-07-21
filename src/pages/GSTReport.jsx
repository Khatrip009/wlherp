// src/pages/GSTReport.jsx
import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { Printer, Download, FileText, IndianRupee, Mail } from "lucide-react"; // 👈 Added Mail
import { supabase } from "../api/supabase";
import { getOrganization } from "../services/organizationService";
import toast from "react-hot-toast";
import { useOrg } from "../context/OrganizationContext";
import { sendEmail } from "../services/emailService"; // 👈 Import

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

  // ── Nil / Exempt / Non‑GST Supplies (placeholder) ──
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
    b2cl: [],
    nil: nilSupplies,
    hsn: hsn.length > 0 ? hsn : [],
    exp: [],
    cdnr: [],
  };
}

// ─── COMPONENT ─────────────────────────────────────────────

export default function GSTReport() {
  const [startDate, setStartDate] = useState(
    new Date(new Date().getFullYear(), 0, 1).toISOString().split("T")[0]
  );
  const [endDate, setEndDate] = useState(new Date().toISOString().split("T")[0]);

  // ── Branch & FY context for scoping ──
  const { branch, selectedFinancialYear, org: currentOrg } = useOrg(); // 👈 Added currentOrg
  const branchId = branch?.id;
  const financialYearId = selectedFinancialYear?.id;

  // ── Fetch organisation details with ID 3 – direct Supabase query ──
  const {
    data: org,
    isLoading: orgLoading,
    error: orgError,
  } = useQuery({
    queryKey: ["organization", 3],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("organization")
        .select("*")
        .eq("id", 3)
        .single();
      if (error) throw error;
      return data;
    },
    staleTime: 10 * 60 * 1000,
  });

  // ── Fetch invoices with items, tax rates, students – scoped ──
  const { data: invoices = [], isLoading, refetch } = useQuery({
    queryKey: ["gst-invoices", startDate, endDate, branchId, financialYearId],
    queryFn: async () => {
      if (!branchId || !financialYearId) return [];

      let invQuery = supabase
        .from("invoices")
        .select(
          `*,
          students:student_id(id, first_name, last_name, admission_no, gstin, state_code, legal_business_name)`
        )
        .gte("invoice_date", startDate)
        .lte("invoice_date", endDate)
        .eq("status", "Final")
        .eq("branch_id", branchId)
        .eq("financial_year_id", financialYearId);

      const { data: invoiceData, error: invError } = await invQuery;
      if (invError) throw invError;

      if (!invoiceData.length) return [];

      const invoiceIds = invoiceData.map((inv) => inv.id);
      let itemsQuery = supabase
        .from("invoice_items")
        .select("*")
        .in("invoice_id", invoiceIds);

      if (branchId) itemsQuery = itemsQuery.eq("branch_id", branchId);
      if (financialYearId) itemsQuery = itemsQuery.eq("financial_year_id", financialYearId);

      const { data: itemsData, error: itemsError } = await itemsQuery;
      if (itemsError) throw itemsError;

      const taxRateIds = [...new Set(itemsData.map((item) => item.tax_rate_id).filter(Boolean))];
      let taxRates = [];
      if (taxRateIds.length > 0) {
        let taxQuery = supabase
          .from("tax_rates")
          .select("id, name, rate")
          .in("id", taxRateIds);
        if (branchId) taxQuery = taxQuery.eq("branch_id", branchId);
        if (financialYearId) taxQuery = taxQuery.eq("financial_year_id", financialYearId);
        const { data: trData } = await taxQuery;
        taxRates = trData || [];
      }
      const taxRateMap = Object.fromEntries(taxRates.map((tr) => [tr.id, tr]));

      const productItemIds = itemsData
        .filter((item) => item.item_type === "product" && item.item_id)
        .map((item) => item.item_id);
      let inventoryItems = [];
      if (productItemIds.length > 0) {
        let invItemQuery = supabase
          .from("inventory_items")
          .select("id, item_name, unit")
          .in("id", productItemIds);
        if (branchId) invItemQuery = invItemQuery.eq("branch_id", branchId);
        if (financialYearId) invItemQuery = invItemQuery.eq("financial_year_id", financialYearId);
        const { data: invData } = await invItemQuery;
        inventoryItems = invData || [];
      }
      const inventoryMap = Object.fromEntries(inventoryItems.map((inv) => [inv.id, inv]));

      return invoiceData.map((inv) => ({
        ...inv,
        invoice_items: itemsData
          .filter((item) => item.invoice_id === inv.id)
          .map((item) => ({
            ...item,
            tax_rates: taxRateMap[item.tax_rate_id] || null,
            inventory_items: inventoryMap[item.item_id] || null,
          })),
      }));
    },
    enabled: !!branchId && !!financialYearId,
    staleTime: 5 * 60 * 1000,
  });

  // ── Compute summaries ──
  const summaries = useMemo(() => {
    const b2bInvoices = invoices.filter((inv) => inv.students?.gstin);
    const b2cInvoices = invoices.filter((inv) => !inv.students?.gstin);

    const totalB2B = b2bInvoices.length;
    const totalB2C = b2cInvoices.length;
    const totalInvoices = invoices.length;

    const b2bTaxable = b2bInvoices.reduce(
      (s, inv) => s + (inv.invoice_items || []).reduce((s2, it) => s2 + (it.taxable_amount || 0), 0),
      0
    );
    const b2cTaxable = b2cInvoices.reduce(
      (s, inv) => s + (inv.invoice_items || []).reduce((s2, it) => s2 + (it.taxable_amount || 0), 0),
      0
    );
    const b2bGst = b2bInvoices.reduce(
      (s, inv) =>
        s +
        (inv.invoice_items || []).reduce(
          (s2, it) => s2 + (it.cgst_amount || 0) + (it.sgst_amount || 0) + (it.igst_amount || 0),
          0
        ),
      0
    );
    const b2cGst = b2cInvoices.reduce(
      (s, inv) =>
        s +
        (inv.invoice_items || []).reduce(
          (s2, it) => s2 + (it.cgst_amount || 0) + (it.sgst_amount || 0) + (it.igst_amount || 0),
          0
        ),
      0
    );

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
      hsnSummary[hsn].tax_amount +=
        (item.cgst_amount || 0) + (item.sgst_amount || 0) + (item.igst_amount || 0);
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
    if (invoices.length === 0) {
      alert("No invoices found for the selected period.");
      return;
    }

    try {
      const adminEmails = await getAdminEmails();
      if (adminEmails.length === 0) {
        alert("No admin emails found.");
        return;
      }

      // Build HSN table rows
      let hsnRows = summaries.hsnSummary.map((h) => `
        <tr>
          <td style="padding:4px 8px;border:1px solid #ddd;font-family:monospace;">${h.hsn_code}</td>
          <td style="padding:4px 8px;border:1px solid #ddd;">${h.description || "—"}</td>
          <td style="padding:4px 8px;border:1px solid #ddd;text-align:right;">${h.quantity}</td>
          <td style="padding:4px 8px;border:1px solid #ddd;">${h.unit}</td>
          <td style="padding:4px 8px;border:1px solid #ddd;text-align:right;">₹ ${h.taxable_value.toLocaleString('en-IN')}</td>
          <td style="padding:4px 8px;border:1px solid #ddd;text-align:right;">₹ ${h.tax_amount.toLocaleString('en-IN')}</td>
        </tr>
      `).join('');

      const totalHsnTaxable = summaries.hsnSummary.reduce((s, h) => s + h.taxable_value, 0);
      const totalHsnTax = summaries.hsnSummary.reduce((s, h) => s + h.tax_amount, 0);

      const orgName = org?.company_name || "Academy";
      const gstin = org?.gstin || "Not Registered";

      const htmlBody = `
        <div style="font-family:Arial,sans-serif;max-width:800px;margin:0 auto;">
          <h2 style="color:#0D47A1;">GSTR-1 Report</h2>
          <p><strong>Organization:</strong> ${orgName}</p>
          <p><strong>GSTIN:</strong> ${gstin}</p>
          <p><strong>Branch:</strong> ${branch?.branch_name || 'N/A'}</p>
          <p><strong>Period:</strong> ${startDate} – ${endDate}</p>
          <hr />
          <div style="display:flex;flex-wrap:wrap;gap:12px;margin-bottom:15px;">
            <div style="border:1px solid #ddd;padding:8px 16px;border-radius:6px;background:#f9f9f9;">
              <div style="font-size:10px;color:#888;">Total Invoices</div>
              <div style="font-size:18px;font-weight:700;">${summaries.totalInvoices}</div>
              <div style="font-size:10px;">B2B: ${summaries.totalB2B} | B2C: ${summaries.totalB2C}</div>
            </div>
            <div style="border:1px solid #ddd;padding:8px 16px;border-radius:6px;background:#f9f9f9;">
              <div style="font-size:10px;color:#888;">Taxable Value</div>
              <div style="font-size:18px;font-weight:700;">₹ ${summaries.totalTaxable.toLocaleString('en-IN')}</div>
            </div>
            <div style="border:1px solid #ddd;padding:8px 16px;border-radius:6px;background:#f9f9f9;">
              <div style="font-size:10px;color:#888;">Total GST</div>
              <div style="font-size:18px;font-weight:700;color:#2e7d32;">₹ ${summaries.totalGst.toLocaleString('en-IN')}</div>
            </div>
            <div style="border:1px solid #ddd;padding:8px 16px;border-radius:6px;background:#f9f9f9;">
              <div style="font-size:10px;color:#888;">Avg Tax Rate</div>
              <div style="font-size:18px;font-weight:700;color:#283593;">
                ${summaries.totalTaxable > 0 ? ((summaries.totalGst / summaries.totalTaxable) * 100).toFixed(1) : 0}%
              </div>
            </div>
          </div>

          <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:15px;">
            <div style="border:1px solid #ddd;padding:8px 16px;border-radius:6px;background:#f9f9f9;">
              <div style="font-weight:600;color:#1565C0;">B2B Supplies (${summaries.totalB2B} invoices)</div>
              <div>Taxable Value: ₹ ${summaries.b2bTaxable.toLocaleString('en-IN')}</div>
              <div>GST: ₹ ${summaries.b2bGst.toLocaleString('en-IN')}</div>
            </div>
            <div style="border:1px solid #ddd;padding:8px 16px;border-radius:6px;background:#f9f9f9;">
              <div style="font-weight:600;color:#E65100;">B2C Supplies (${summaries.totalB2C} invoices)</div>
              <div>Taxable Value: ₹ ${summaries.b2cTaxable.toLocaleString('en-IN')}</div>
              <div>GST: ₹ ${summaries.b2cGst.toLocaleString('en-IN')}</div>
            </div>
          </div>

          <h3 style="color:#0D47A1;">HSN Summary</h3>
          <table style="width:100%;border-collapse:collapse;font-size:11px;border:1px solid #ddd;">
            <thead style="background:#e3f2fd;">
              <tr>
                <th style="padding:4px 8px;border:1px solid #ddd;text-align:left;">HSN/SAC</th>
                <th style="padding:4px 8px;border:1px solid #ddd;text-align:left;">Description</th>
                <th style="padding:4px 8px;border:1px solid #ddd;text-align:right;">Qty</th>
                <th style="padding:4px 8px;border:1px solid #ddd;text-align:left;">Unit</th>
                <th style="padding:4px 8px;border:1px solid #ddd;text-align:right;">Taxable Value</th>
                <th style="padding:4px 8px;border:1px solid #ddd;text-align:right;">Tax</th>
              </tr>
            </thead>
            <tbody>
              ${hsnRows || '<tr><td colspan="6" style="padding:8px;text-align:center;">No HSN data</td></tr>'}
            </tbody>
            <tfoot style="font-weight:bold;background:#f5f5f5;">
              <tr>
                <td colspan="4" style="padding:4px 8px;border:1px solid #ddd;text-align:right;">Total</td>
                <td style="padding:4px 8px;border:1px solid #ddd;text-align:right;">₹ ${totalHsnTaxable.toLocaleString('en-IN')}</td>
                <td style="padding:4px 8px;border:1px solid #ddd;text-align:right;">₹ ${totalHsnTax.toLocaleString('en-IN')}</td>
              </tr>
            </tfoot>
          </table>
          <p style="color:#888;font-size:10px;margin-top:20px;">Computer‑generated GSTR-1 report from ${orgName}</p>
        </div>
      `;

      await sendEmail({
        to: adminEmails,
        subject: `GSTR-1 Report - ${startDate} to ${endDate}`,
        html: htmlBody,
        from: org?.email || undefined,
      });

      alert("Report sent to admins.");
    } catch (err) {
      console.error("Failed to send report:", err);
      alert("Failed to send report. Check console for details.");
    }
  };

  // ─── Handle JSON Download ───────────────────────────────────────────
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

  // ─── Handle Print ──────────────────────────────────────────────────
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

  // ── Loading / Error states ──
  if (orgLoading) {
    return (
      <div className="flex items-center justify-center p-12 text-gray-500 dark:text-gray-400">
        <div className="text-center">
          <div className="animate-spin w-8 h-8 border-4 border-primary border-t-transparent rounded-full mx-auto mb-3"></div>
          <p>Loading organisation details...</p>
        </div>
      </div>
    );
  }

  if (orgError) {
    return (
      <div className="p-8 text-center text-red-600 dark:text-red-400">
        <p>Failed to load organisation details: {orgError.message}</p>
        <button
          onClick={() => window.location.reload()}
          className="mt-3 bg-primary text-white px-4 py-2 rounded-lg text-sm"
        >
          Retry
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-6 px-4 sm:px-6 lg:px-0">
      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1
            className="text-2xl sm:text-3xl font-bold"
            style={{ fontFamily: "var(--font-heading)", color: "var(--color-primary)" }}
          >
            GST Report (GSTR‑1)
          </h1>
          <p
            className="text-sm text-gray-600 dark:text-gray-400 mt-1"
            style={{ fontFamily: "var(--font-body)" }}
          >
            Generate GST return JSON and summaries
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {/* 👇 NEW Send Report button */}
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
          <button
            onClick={handleDownloadJSON}
            className="inline-flex items-center gap-2 px-4 py-2.5 border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-200 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors text-sm"
            style={{ fontFamily: "var(--font-body)" }}
          >
            <Download size={16} /> Download JSON
          </button>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-4 bg-white dark:bg-gray-800 p-4 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700">
        <div className="flex items-center">
          <label
            className="text-sm font-medium text-gray-700 dark:text-gray-300 mr-2"
            style={{ fontFamily: "var(--font-body)" }}
          >
            From:
          </label>
          <input
            type="date"
            value={startDate}
            onChange={(e) => setStartDate(e.target.value)}
            className="border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 rounded-lg p-2 text-sm"
          />
        </div>
        <div className="flex items-center">
          <label
            className="text-sm font-medium text-gray-700 dark:text-gray-300 mr-2"
            style={{ fontFamily: "var(--font-body)" }}
          >
            To:
          </label>
          <input
            type="date"
            value={endDate}
            onChange={(e) => setEndDate(e.target.value)}
            className="border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 rounded-lg p-2 text-sm"
          />
        </div>
        <button
          onClick={() => refetch()}
          className="inline-flex items-center px-4 py-2.5 bg-primary hover:bg-primary-light text-white rounded-lg text-sm font-medium transition-colors"
          style={{ fontFamily: "var(--font-body)" }}
        >
          Refresh
        </button>
        {isLoading && (
          <span className="text-sm text-gray-500 dark:text-gray-400 flex items-center">Loading...</span>
        )}
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-6" id="gst-preview">
        <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm p-4 border border-gray-200 dark:border-gray-700">
          <p className="text-xs text-gray-500 dark:text-gray-400" style={{ fontFamily: "var(--font-body)" }}>
            Total Invoices
          </p>
          <p className="text-2xl font-bold" style={{ fontFamily: "var(--font-heading)", color: "var(--color-primary)" }}>
            {summaries.totalInvoices}
          </p>
          <div className="flex gap-2 mt-1 text-xs">
            <span className="text-blue-600 dark:text-blue-400">B2B: {summaries.totalB2B}</span>
            <span className="text-orange-600 dark:text-orange-400">B2C: {summaries.totalB2C}</span>
          </div>
        </div>
        <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm p-4 border border-gray-200 dark:border-gray-700">
          <p className="text-xs text-gray-500 dark:text-gray-400" style={{ fontFamily: "var(--font-body)" }}>
            Taxable Value
          </p>
          <p className="text-2xl font-bold" style={{ fontFamily: "var(--font-heading)", color: "var(--color-primary)" }}>
            ₹ {summaries.totalTaxable.toLocaleString("en-IN")}
          </p>
        </div>
        <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm p-4 border border-gray-200 dark:border-gray-700">
          <p className="text-xs text-gray-500 dark:text-gray-400" style={{ fontFamily: "var(--font-body)" }}>
            Total GST
          </p>
          <p className="text-2xl font-bold text-green-700 dark:text-green-400">
            ₹ {summaries.totalGst.toLocaleString("en-IN")}
          </p>
        </div>
        <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm p-4 border border-gray-200 dark:border-gray-700">
          <p className="text-xs text-gray-500 dark:text-gray-400" style={{ fontFamily: "var(--font-body)" }}>
            Avg Tax Rate
          </p>
          <p className="text-2xl font-bold text-indigo-600 dark:text-indigo-400">
            {summaries.totalTaxable > 0
              ? ((summaries.totalGst / summaries.totalTaxable) * 100).toFixed(1)
              : 0}%
          </p>
        </div>
      </div>

      {/* B2B & B2C Summary */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-6">
        <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm p-4 border border-gray-200 dark:border-gray-700">
          <h3 className="font-semibold text-blue-700 dark:text-blue-400 flex items-center gap-2" style={{ fontFamily: "var(--font-heading)" }}>
            <span className="px-2 py-0.5 rounded-full text-xs bg-blue-100 dark:bg-blue-900 text-blue-700 dark:text-blue-200">
              B2B
            </span>
            Supplies ({summaries.totalB2B} invoices)
          </h3>
          <div className="flex justify-between mt-2 text-sm text-gray-700 dark:text-gray-200">
            <span>Taxable Value:</span>
            <span className="font-medium">₹ {summaries.b2bTaxable.toLocaleString("en-IN")}</span>
          </div>
          <div className="flex justify-between text-sm text-gray-700 dark:text-gray-200">
            <span>Total GST:</span>
            <span className="font-medium">₹ {summaries.b2bGst.toLocaleString("en-IN")}</span>
          </div>
        </div>
        <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm p-4 border border-gray-200 dark:border-gray-700">
          <h3 className="font-semibold text-orange-700 dark:text-orange-400 flex items-center gap-2" style={{ fontFamily: "var(--font-heading)" }}>
            <span className="px-2 py-0.5 rounded-full text-xs bg-orange-100 dark:bg-orange-900 text-orange-700 dark:text-orange-200">
              B2C
            </span>
            Supplies ({summaries.totalB2C} invoices)
          </h3>
          <div className="flex justify-between mt-2 text-sm text-gray-700 dark:text-gray-200">
            <span>Taxable Value:</span>
            <span className="font-medium">₹ {summaries.b2cTaxable.toLocaleString("en-IN")}</span>
          </div>
          <div className="flex justify-between text-sm text-gray-700 dark:text-gray-200">
            <span>Total GST:</span>
            <span className="font-medium">₹ {summaries.b2cGst.toLocaleString("en-IN")}</span>
          </div>
        </div>
      </div>

      {/* HSN Summary Table */}
      <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 overflow-hidden mb-6">
        <h2
          className="text-lg font-semibold p-4 border-b border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-700 flex items-center gap-2"
          style={{ fontFamily: "var(--font-heading)", color: "var(--color-primary)" }}
        >
          <FileText size={18} /> HSN Summary
        </h2>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[600px]">
            <thead className="bg-gray-50 dark:bg-gray-700">
              <tr>
                <th className="p-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                  HSN/SAC
                </th>
                <th className="p-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                  Description
                </th>
                <th className="p-3 text-right text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                  Quantity
                </th>
                <th className="p-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                  Unit
                </th>
                <th className="p-3 text-right text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                  Taxable Value
                </th>
                <th className="p-3 text-right text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                  Tax Amount
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
              {summaries.hsnSummary.length === 0 ? (
                <tr>
                  <td colSpan={6} className="p-4 text-center text-gray-500 dark:text-gray-400">
                    No HSN data available
                  </td>
                </tr>
              ) : (
                summaries.hsnSummary.map((h, idx) => (
                  <tr key={idx} className="hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors">
                    <td className="p-3 text-sm text-gray-700 dark:text-gray-200 font-mono">
                      {h.hsn_code}
                    </td>
                    <td className="p-3 text-sm text-gray-700 dark:text-gray-200">
                      {h.description || "—"}
                    </td>
                    <td className="p-3 text-sm text-right text-gray-700 dark:text-gray-200">
                      {h.quantity}
                    </td>
                    <td className="p-3 text-sm text-gray-700 dark:text-gray-200">{h.unit}</td>
                    <td className="p-3 text-sm text-right text-gray-700 dark:text-gray-200">
                      ₹ {h.taxable_value.toLocaleString("en-IN")}
                    </td>
                    <td className="p-3 text-sm text-right text-gray-700 dark:text-gray-200">
                      ₹ {h.tax_amount.toLocaleString("en-IN")}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
            <tfoot className="bg-gray-50 dark:bg-gray-700 border-t border-gray-200 dark:border-gray-600 font-medium">
              <tr>
                <td colSpan={4} className="p-3 text-right text-gray-800 dark:text-gray-100">
                  Total
                </td>
                <td className="p-3 text-right text-gray-800 dark:text-gray-100">
                  ₹{" "}
                  {summaries.hsnSummary
                    .reduce((s, h) => s + h.taxable_value, 0)
                    .toLocaleString("en-IN")}
                </td>
                <td className="p-3 text-right text-gray-800 dark:text-gray-100">
                  ₹{" "}
                  {summaries.hsnSummary
                    .reduce((s, h) => s + h.tax_amount, 0)
                    .toLocaleString("en-IN")}
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
      </div>

      {/* JSON Preview */}
      <div className="bg-gray-50 dark:bg-gray-800 rounded-xl p-4 border border-gray-200 dark:border-gray-700">
        <h2
          className="text-lg font-semibold mb-3 flex items-center gap-2"
          style={{ fontFamily: "var(--font-heading)", color: "var(--color-primary)" }}
        >
          <IndianRupee size={18} /> GSTR‑1 JSON Preview
        </h2>
        <pre className="text-xs bg-white dark:bg-gray-700 p-3 rounded border border-gray-200 dark:border-gray-600 max-h-80 overflow-auto text-gray-800 dark:text-gray-200">
          {isLoading
            ? "Loading invoice data..."
            : invoices.length === 0
            ? "No finalized invoices found for the selected period."
            : org
            ? JSON.stringify(buildGSTR1JSON(invoices, org, startDate, endDate), null, 2)
            : "Organization details not loaded. Please refresh."}
        </pre>
        <p
          className="text-xs text-gray-500 dark:text-gray-400 mt-2"
          style={{ fontFamily: "var(--font-body)" }}
        >
          JSON follows the GST portal offline utility schema (v1.0.0). Contains B2B, B2C, and HSN summary.
        </p>
      </div>
    </div>
  );
}