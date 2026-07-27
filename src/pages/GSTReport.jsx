// src/pages/GSTReport.jsx
import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { Printer, Download, FileText, IndianRupee, Mail } from "lucide-react";
import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";
import { supabase } from "../api/supabase";
import toast from "react-hot-toast";
import { useOrg } from "../context/OrganizationContext";
import { useTheme } from "../context/ThemeContext"; // 👈 import theme
import { sendEmail } from "../services/emailService";

/* ─── PDF helpers (unchanged) ────────────────────────────── */
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
  } catch {
    return null;
  }
}

function createRupeeSymbolImage() {
  const canvas = document.createElement("canvas");
  canvas.width = 30;
  canvas.height = 30;
  const ctx = canvas.getContext("2d");
  ctx.font = "bold 24px sans-serif";
  ctx.fillStyle = "#000";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText("₹", 15, 15);
  return canvas.toDataURL("image/png");
}
let rupeeImage = null;
function getRupeeImage() {
  if (!rupeeImage) rupeeImage = createRupeeSymbolImage();
  return rupeeImage;
}

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

function formatAmount(amount) {
  return Math.round((amount || 0) * 100) / 100;
}

function getRatePercent(taxRateName) {
  const match = String(taxRateName || "").match(/[\d.]+/);
  return match ? parseFloat(match[0]) : 0;
}

/* ─── GSTR‑1 JSON Builder (unchanged) ────────────────────── */
function buildGSTR1JSON(invoices, org, startDate, endDate) {
  const gstin = org?.gstin || "";
  const fp = startDate.substring(0, 6);
  const orgState = org?.state_code || "";

  const b2bInvoices = invoices.filter((inv) => inv.students?.gstin);
  const b2b = b2bInvoices.map((inv) => {
    const items = inv.invoice_items || [];
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

  const b2cInvoices = invoices.filter((inv) => !inv.students?.gstin);
  const b2cs = b2cInvoices.map((inv) => {
    const items = inv.invoice_items || [];
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

  const nilSupplies = {
    sply_ty: "INTER",
    etin: "",
    typ: "regular",
    itms: [],
  };

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

/* ─── Main Component ──────────────────────────────────────── */
export default function GSTReport() {
  const [startDate, setStartDate] = useState(
    new Date(new Date().getFullYear(), 0, 1).toISOString().split("T")[0]
  );
  const [endDate, setEndDate] = useState(new Date().toISOString().split("T")[0]);

  const { org, branch, selectedFinancialYear } = useOrg();
  const theme = useTheme(); // 👈 get theme colours
  const branchId = branch?.id;
  const financialYearId = selectedFinancialYear?.id;

  // Fetch invoices – includes both Final and Paid statuses
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
        .in("status", ["Final", "Paid"])
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

  // Summaries
  const summaries = useMemo(() => {
    const b2bInvoices = invoices.filter((inv) => inv.students?.gstin);
    const b2cInvoices = invoices.filter((inv) => !inv.students?.gstin);

    const totalB2B = b2bInvoices.length;
    const totalB2C = b2cInvoices.length;
    const totalInvoices = invoices.length;

    const b2bTaxable = b2bInvoices.reduce(
      (s, inv) => s + (inv.invoice_items || []).reduce((s2, it) => s2 + (it.taxable_amount || 0), 0), 0
    );
    const b2cTaxable = b2cInvoices.reduce(
      (s, inv) => s + (inv.invoice_items || []).reduce((s2, it) => s2 + (it.taxable_amount || 0), 0), 0
    );
    const b2bGst = b2bInvoices.reduce(
      (s, inv) => s + (inv.invoice_items || []).reduce((s2, it) => s2 + (it.cgst_amount || 0) + (it.sgst_amount || 0) + (it.igst_amount || 0), 0), 0
    );
    const b2cGst = b2cInvoices.reduce(
      (s, inv) => s + (inv.invoice_items || []).reduce((s2, it) => s2 + (it.cgst_amount || 0) + (it.sgst_amount || 0) + (it.igst_amount || 0), 0), 0
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

  // Email helpers
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
    if (invoices.length === 0) {
      alert("No invoices found for the selected period.");
      return;
    }
    try {
      const adminEmails = await getAdminEmails();
      if (!adminEmails.length) {
        alert("No admin emails found.");
        return;
      }

      const orgName = org?.company_name || "Academy";
      const gstin = org?.gstin || "Not Registered";

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

      const htmlBody = `
        <div style="font-family:Arial,sans-serif;max-width:800px;margin:0 auto;">
          <h2 style="color:${theme.primary_color};">GSTR-1 Report</h2>
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
              <div style="font-size:18px;font-weight:700;color:${theme.primary_color};">₹ ${summaries.totalGst.toLocaleString('en-IN')}</div>
            </div>
            <div style="border:1px solid #ddd;padding:8px 16px;border-radius:6px;background:#f9f9f9;">
              <div style="font-size:10px;color:#888;">Avg Tax Rate</div>
              <div style="font-size:18px;font-weight:700;color:${theme.primary_color};">
                ${summaries.totalTaxable > 0 ? ((summaries.totalGst / summaries.totalTaxable) * 100).toFixed(1) : 0}%
              </div>
            </div>
          </div>

          <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:15px;">
            <div style="border:1px solid #ddd;padding:8px 16px;border-radius:6px;background:#f9f9f9;">
              <div style="font-weight:600;color:${theme.primary_color};">B2B Supplies (${summaries.totalB2B} invoices)</div>
              <div>Taxable Value: ₹ ${summaries.b2bTaxable.toLocaleString('en-IN')}</div>
              <div>GST: ₹ ${summaries.b2bGst.toLocaleString('en-IN')}</div>
            </div>
            <div style="border:1px solid #ddd;padding:8px 16px;border-radius:6px;background:#f9f9f9;">
              <div style="font-weight:600;color:${theme.primary_color};">B2C Supplies (${summaries.totalB2C} invoices)</div>
              <div>Taxable Value: ₹ ${summaries.b2cTaxable.toLocaleString('en-IN')}</div>
              <div>GST: ₹ ${summaries.b2cGst.toLocaleString('en-IN')}</div>
            </div>
          </div>

          <h3 style="color:${theme.primary_color};">HSN Summary</h3>
          <table style="width:100%;border-collapse:collapse;font-size:11px;border:1px solid #ddd;">
            <thead style="background:#f5f5f5;">
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
      });
      toast.success("Report sent to admins.");
    } catch (err) {
      console.error("Failed to send report:", err);
      toast.error("Failed to send report.");
    }
  };

  // JSON download
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

  // PDF export (professional, black & white)
  const handlePrintPDF = async () => {
    if (!org || invoices.length === 0) return;

    const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
    const pageWidth = doc.internal.pageSize.getWidth();
    const pageHeight = doc.internal.pageSize.getHeight();
    const margin = 14;
    let y = margin;

    // Logo
    let logoBase64 = null;
    if (org?.logo_dark_url) {
      logoBase64 = await loadImageAsBase64(org.logo_dark_url);
    }

    // Header
    const logoWidth = 30, logoHeight = 12;
    if (logoBase64) {
      doc.addImage(logoBase64, "PNG", margin, y, logoWidth, logoHeight);
    }
    const textX = margin + (logoBase64 ? logoWidth + 4 : 0);
    const textY = y + 1;

    doc.setFont("helvetica", "bold");
    doc.setFontSize(14);
    doc.setTextColor("#000000");
    doc.text(org.company_name || "Academy", textX, textY);

    doc.setFont("helvetica", "normal");
    doc.setFontSize(7);
    doc.setTextColor("#000000");
    let detailY = textY + 4.5;
    if (org.address) {
      const addrLines = doc.splitTextToSize(org.address, pageWidth - textX - margin - 10);
      doc.text(addrLines, textX, detailY);
      detailY += addrLines.length * 3.5 + 1;
    }
    if (org.gstin) { doc.text(`GSTIN: ${org.gstin}`, textX, detailY); detailY += 4; }
    if (org.phone) { doc.text(`Phone: ${org.phone}`, textX, detailY); detailY += 4; }
    if (org.email) { doc.text(`Email: ${org.email}`, textX, detailY); detailY += 4; }

    const headerHeight = Math.max(logoHeight + 4, detailY - textY + 4);
    y += headerHeight + 2;
    doc.setDrawColor("#000000");
    doc.line(margin, y, pageWidth - margin, y);
    y += 6;

    // Title
    doc.setFontSize(16);
    doc.setFont("helvetica", "bold");
    doc.setTextColor("#000000");
    doc.text("GSTR-1 Report", pageWidth / 2, y, { align: "center" });
    y += 8;
    doc.setFontSize(10);
    doc.setFont("helvetica", "normal");
    doc.text(`Period: ${startDate} – ${endDate}`, pageWidth / 2, y, { align: "center" });
    y += 10;

    // Summary boxes
    const boxWidth = (pageWidth - 2 * margin - 30) / 4;
    const boxHeight = 16;
    const boxY = y;
    const summaryItems = [
      { label: "Total Invoices", value: summaries.totalInvoices },
      { label: "Taxable Value", value: summaries.totalTaxable },
      { label: "Total GST", value: summaries.totalGst },
      {
        label: "Avg Tax Rate",
        value: summaries.totalTaxable > 0
          ? ((summaries.totalGst / summaries.totalTaxable) * 100).toFixed(1)
          : 0,
      },
    ];

    summaryItems.forEach((item, i) => {
      const x = margin + i * (boxWidth + 10);
      doc.setDrawColor("#000000");
      doc.setFillColor(255, 255, 255);
      doc.rect(x, boxY, boxWidth, boxHeight, "FD");
      doc.setFontSize(8);
      doc.setFont("helvetica", "normal");
      doc.text(item.label, x + 2, boxY + 5);
      if (typeof item.value === "number") {
        drawCurrency(doc, item.value, x + 2, boxY + 13, 8, "left", "#000");
      } else {
        doc.setFontSize(8);
        doc.text(item.value.toString(), x + 2, boxY + 13);
      }
    });
    y += boxHeight + 10;

    // B2B / B2C summaries
    doc.setFontSize(11);
    doc.setFont("helvetica", "bold");
    doc.text(`B2B Supplies (${summaries.totalB2B} invoices)`, margin, y);
    y += 7;
    doc.setFontSize(9);
    doc.setFont("helvetica", "normal");
    doc.text(`Taxable Value: ₹ ${summaries.b2bTaxable.toLocaleString("en-IN")}`, margin + 5, y);
    y += 5;
    doc.text(`GST: ₹ ${summaries.b2bGst.toLocaleString("en-IN")}`, margin + 5, y);
    y += 8;

    doc.setFontSize(11);
    doc.setFont("helvetica", "bold");
    doc.text(`B2C Supplies (${summaries.totalB2C} invoices)`, margin, y);
    y += 7;
    doc.setFontSize(9);
    doc.text(`Taxable Value: ₹ ${summaries.b2cTaxable.toLocaleString("en-IN")}`, margin + 5, y);
    y += 5;
    doc.text(`GST: ₹ ${summaries.b2cGst.toLocaleString("en-IN")}`, margin + 5, y);
    y += 10;

    // HSN table
    doc.setFontSize(12);
    doc.setFont("helvetica", "bold");
    doc.text("HSN Summary", margin, y);
    y += 8;

    const hsnRows = summaries.hsnSummary.map((h) => [
      h.hsn_code,
      h.description || "—",
      h.quantity,
      h.unit,
      h.taxable_value,
      h.tax_amount,
    ]);
    const totalHsnTaxable = summaries.hsnSummary.reduce((s, h) => s + h.taxable_value, 0);
    const totalHsnTax = summaries.hsnSummary.reduce((s, h) => s + h.tax_amount, 0);
    hsnRows.push(["", "", "", "Total", totalHsnTaxable, totalHsnTax]);

    autoTable(doc, {
      startY: y,
      head: [["HSN/SAC", "Description", "Qty", "Unit", "Taxable Value", "Tax"]],
      body: hsnRows,
      theme: "plain",
      styles: { fontSize: 8, textColor: [0,0,0], fillColor: [255,255,255], lineColor: [0,0,0], lineWidth: 0.2 },
      headStyles: { fillColor: [255,255,255], textColor: [0,0,0], fontStyle: "bold", lineWidth: 0.2, lineColor: [0,0,0] },
      columnStyles: {
        0: { cellWidth: 25 },
        1: { cellWidth: 40, halign: "left" },
        2: { cellWidth: 20, halign: "right" },
        3: { cellWidth: 15 },
        4: { cellWidth: 35, halign: "right" },
        5: { cellWidth: 35, halign: "right" },
      },
      margin: { left: margin, right: margin },
      willDrawCell: (data) => {
        if ([4,5].includes(data.column.index) && typeof data.cell.raw === "number") {
          data.cell.text = [];
        }
      },
      didDrawCell: (data) => {
        if ([4,5].includes(data.column.index) && typeof data.cell.raw === "number") {
          drawCurrency(doc, data.cell.raw, data.cell.x + data.cell.width - 2, data.cell.y + data.cell.height / 2 + 1.5, 8, "right", "#000");
        }
        if (data.row.index === hsnRows.length - 1) {
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
    doc.text(`© ${org.company_name || "Academy"}`, pageWidth / 2, footerY, { align: "center" });

    doc.save(`GSTR1_Report_${startDate}_${endDate}.pdf`);
  };

  return (
    <div className="space-y-6 px-4 sm:px-6 lg:px-0">
      {/* Header & Buttons */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold text-primary">
            GST Report (GSTR‑1)
          </h1>
          <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
            Generate GST return JSON and summaries
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            onClick={sendReportEmail}
            className="inline-flex items-center gap-2 px-4 py-2.5 bg-primary hover:bg-primary-dark text-white rounded-lg transition-colors text-sm font-medium"
          >
            <Mail size={16} /> Send Report
          </button>
          <button
            onClick={handlePrintPDF}
            className="inline-flex items-center gap-2 px-4 py-2.5 bg-primary hover:bg-primary-light text-white rounded-lg transition-colors text-sm font-medium"
          >
            <Printer size={16} /> Print PDF
          </button>
          <button
            onClick={handleDownloadJSON}
            className="inline-flex items-center gap-2 px-4 py-2.5 border border-gray-300 dark:border-gray-600 bg-white dark:bg-accent text-gray-700 dark:text-gray-200 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors text-sm"
          >
            <Download size={16} /> Download JSON
          </button>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-4 bg-white dark:bg-accent p-4 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700">
        <div className="flex items-center">
          <label className="text-sm font-medium text-gray-700 dark:text-gray-300 mr-2">From:</label>
          <input
            type="date"
            value={startDate}
            onChange={(e) => setStartDate(e.target.value)}
            className="border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 rounded-lg p-2 text-sm"
          />
        </div>
        <div className="flex items-center">
          <label className="text-sm font-medium text-gray-700 dark:text-gray-300 mr-2">To:</label>
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
        >
          Refresh
        </button>
        {isLoading && <span className="text-sm text-gray-500 dark:text-gray-400 flex items-center">Loading...</span>}
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-6">
        <div className="bg-white dark:bg-accent rounded-xl shadow-sm p-4 border border-gray-200 dark:border-gray-700">
          <p className="text-xs text-gray-500 dark:text-gray-400">Total Invoices</p>
          <p className="text-2xl font-bold text-primary">{summaries.totalInvoices}</p>
          <div className="flex gap-2 mt-1 text-xs text-gray-600 dark:text-gray-300">
            <span>B2B: {summaries.totalB2B}</span>
            <span>B2C: {summaries.totalB2C}</span>
          </div>
        </div>
        <div className="bg-white dark:bg-accent rounded-xl shadow-sm p-4 border border-gray-200 dark:border-gray-700">
          <p className="text-xs text-gray-500 dark:text-gray-400">Taxable Value</p>
          <p className="text-2xl font-bold text-primary">₹ {summaries.totalTaxable.toLocaleString("en-IN")}</p>
        </div>
        <div className="bg-white dark:bg-accent rounded-xl shadow-sm p-4 border border-gray-200 dark:border-gray-700">
          <p className="text-xs text-gray-500 dark:text-gray-400">Total GST</p>
          <p className="text-2xl font-bold text-primary">₹ {summaries.totalGst.toLocaleString("en-IN")}</p>
        </div>
        <div className="bg-white dark:bg-accent rounded-xl shadow-sm p-4 border border-gray-200 dark:border-gray-700">
          <p className="text-xs text-gray-500 dark:text-gray-400">Avg Tax Rate</p>
          <p className="text-2xl font-bold text-primary">
            {summaries.totalTaxable > 0 ? ((summaries.totalGst / summaries.totalTaxable) * 100).toFixed(1) : 0}%
          </p>
        </div>
      </div>

      {/* B2B & B2C Summary */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-6">
        <div className="bg-white dark:bg-accent rounded-xl shadow-sm p-4 border border-gray-200 dark:border-gray-700">
          <h3 className="font-semibold flex items-center gap-2">
            <span className="px-2 py-0.5 rounded-full text-xs bg-primary-bg text-primary">B2B</span>
            <span className="text-primary">Supplies ({summaries.totalB2B} invoices)</span>
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
        <div className="bg-white dark:bg-accent rounded-xl shadow-sm p-4 border border-gray-200 dark:border-gray-700">
          <h3 className="font-semibold flex items-center gap-2">
            <span className="px-2 py-0.5 rounded-full text-xs bg-primary-bg text-primary">B2C</span>
            <span className="text-primary">Supplies ({summaries.totalB2C} invoices)</span>
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
      <div className="bg-white dark:bg-accent rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 overflow-hidden mb-6">
        <h2 className="text-lg font-semibold p-4 border-b border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-700 flex items-center gap-2 text-primary">
          <FileText size={18} /> HSN Summary
        </h2>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[600px]">
            <thead className="bg-gray-50 dark:bg-gray-700">
              <tr>
                <th className="p-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">HSN/SAC</th>
                <th className="p-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Description</th>
                <th className="p-3 text-right text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Qty</th>
                <th className="p-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Unit</th>
                <th className="p-3 text-right text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Taxable Value</th>
                <th className="p-3 text-right text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Tax</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
              {summaries.hsnSummary.length === 0 ? (
                <tr><td colSpan={6} className="p-4 text-center text-gray-500 dark:text-gray-400">No HSN data available</td></tr>
              ) : (
                summaries.hsnSummary.map((h, idx) => (
                  <tr key={idx} className="hover:bg-gray-50 dark:hover:bg-gray-700">
                    <td className="p-3 text-sm text-gray-700 dark:text-gray-200 font-mono">{h.hsn_code}</td>
                    <td className="p-3 text-sm text-gray-700 dark:text-gray-200">{h.description || "—"}</td>
                    <td className="p-3 text-sm text-right text-gray-700 dark:text-gray-200">{h.quantity}</td>
                    <td className="p-3 text-sm text-gray-700 dark:text-gray-200">{h.unit}</td>
                    <td className="p-3 text-sm text-right text-gray-700 dark:text-gray-200">₹ {h.taxable_value.toLocaleString("en-IN")}</td>
                    <td className="p-3 text-sm text-right text-gray-700 dark:text-gray-200">₹ {h.tax_amount.toLocaleString("en-IN")}</td>
                  </tr>
                ))
              )}
            </tbody>
            <tfoot className="bg-gray-50 dark:bg-gray-700 border-t border-gray-200 dark:border-gray-600 font-medium">
              <tr>
                <td colSpan={4} className="p-3 text-right text-primary">Total</td>
                <td className="p-3 text-right text-primary">₹ {summaries.hsnSummary.reduce((s, h) => s + h.taxable_value, 0).toLocaleString("en-IN")}</td>
                <td className="p-3 text-right text-primary">₹ {summaries.hsnSummary.reduce((s, h) => s + h.tax_amount, 0).toLocaleString("en-IN")}</td>
              </tr>
            </tfoot>
          </table>
        </div>
      </div>

      {/* JSON Preview */}
      <div className="bg-gray-50 dark:bg-gray-800 rounded-xl p-4 border border-gray-200 dark:border-gray-700">
        <h2 className="text-lg font-semibold mb-3 flex items-center gap-2 text-primary">
          <IndianRupee size={18} /> GSTR‑1 JSON Preview
        </h2>
        <pre className="text-xs bg-white dark:bg-gray-700 p-3 rounded border border-gray-200 dark:border-gray-600 max-h-80 overflow-auto text-gray-900 dark:text-gray-100">
          {isLoading
            ? "Loading invoice data..."
            : invoices.length === 0
            ? "No finalized invoices found for the selected period."
            : org
            ? JSON.stringify(buildGSTR1JSON(invoices, org, startDate, endDate), null, 2)
            : "Organization details not loaded. Please refresh."}
        </pre>
        <p className="text-xs text-gray-500 dark:text-gray-400 mt-2">
          JSON follows the GST portal offline utility schema (v1.0.0). Contains B2B, B2C, and HSN summary.
        </p>
      </div>
    </div>
  );
}