// src/pages/PurchaseRegister.jsx
import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "../api/supabase";
import { useOrg } from "../context/OrganizationContext";
import { useTheme } from "../context/ThemeContext";               // ✅ dynamic theme
import { sendEmail } from "../services/emailService";
import toast from "react-hot-toast";

import {
  Search,
  Download,
  Printer,
  Loader,
  IndianRupee,
  FileText,
  Building,
  Mail,
} from "lucide-react";
import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";
import Papa from "papaparse";

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

export default function PurchaseRegister() {
  const today = new Date();
  const firstDay = new Date(today.getFullYear(), today.getMonth(), 1);
  const [startDate, setStartDate] = useState(firstDay.toISOString().split("T")[0]);
  const [endDate, setEndDate] = useState(today.toISOString().split("T")[0]);
  const [vendorFilter, setVendorFilter] = useState("");
  const [taxRateFilter, setTaxRateFilter] = useState("");
  const [search, setSearch] = useState("");

  const { org, branch, selectedFinancialYear } = useOrg();
  const theme = useTheme();                                     // ✅ theme hook
  const branchId = branch?.id;
  const financialYearId = selectedFinancialYear?.id;

  const headingFont = theme?.font_heading || "Righteous";
  const bodyFont = theme?.font_body || "Montserrat";

  /* ─── Vendors dropdown ────────────────────────────────── */
  const { data: vendors = [] } = useQuery({
    queryKey: ["vendors-dropdown", branchId, financialYearId],
    queryFn: async () => {
      let query = supabase.from("vendors").select("id, vendor_name").order("vendor_name");
      if (branchId) query = query.eq("branch_id", branchId);
      if (financialYearId) query = query.eq("financial_year_id", financialYearId);
      const { data } = await query;
      return data || [];
    },
    enabled: !!branchId && !!financialYearId,
    staleTime: 10 * 60 * 1000,
  });

  /* ─── Tax rates dropdown ──────────────────────────────── */
  const { data: taxRates = [] } = useQuery({
    queryKey: ["tax-rates-dropdown", branchId, financialYearId],
    queryFn: async () => {
      let query = supabase.from("tax_rates").select("id, name, rate").eq("is_active", true);
      if (branchId) query = query.eq("branch_id", branchId);
      if (financialYearId) query = query.eq("financial_year_id", financialYearId);
      const { data } = await query;
      return data || [];
    },
    enabled: !!branchId && !!financialYearId,
    staleTime: 10 * 60 * 1000,
  });

  /* ─── Main expenses query ──────────────────────────────── */
  const {
    data: expenses = [],
    isLoading,
    refetch,
  } = useQuery({
    queryKey: ["purchase-register", startDate, endDate, vendorFilter, taxRateFilter, search, branchId, financialYearId],
    queryFn: async () => {
      let query = supabase
        .from("expenses")
        .select(`*, vendors(id, vendor_name, gstin), tax_rates(id, name, rate)`)
        .gte("expense_date", startDate)
        .lte("expense_date", endDate)
        .order("expense_date", { ascending: false });

      if (branchId) query = query.eq("branch_id", branchId);
      if (financialYearId) query = query.eq("financial_year_id", financialYearId);
      if (vendorFilter) query = query.eq("vendor_id", vendorFilter);
      if (taxRateFilter) query = query.eq("tax_rate_id", taxRateFilter);
      if (search) {
        query = query.or(`description.ilike.%${search}%,bill_number.ilike.%${search}%,vendors.vendor_name.ilike.%${search}%`);
      }
      const { data, error } = await query;
      if (error) throw error;
      return data || [];
    },
    enabled: !!branchId && !!financialYearId,
    staleTime: 2 * 60 * 1000,
  });

  /* ─── Summaries ────────────────────────────────────────── */
  const summaries = useMemo(() => {
    const totalTaxable = expenses.reduce((s, e) => s + Number(e.amount || 0), 0);
    const totalGST = expenses.reduce((s, e) => s + Number(e.gst_amount || 0), 0);
    const totalITC = expenses.filter(e => e.itc_claimed).reduce((s, e) => s + Number(e.gst_amount || 0), 0);
    const totalAmount = totalTaxable + totalGST;
    const invoiceCount = expenses.filter(e => e.invoice_number).length;
    const vendorCount = new Set(expenses.map(e => e.vendor_id).filter(Boolean)).size;

    const rateMap = {};
    expenses.forEach(e => {
      const rateId = e.tax_rate_id || "0";
      const rateName = e.tax_rates?.name || "No Tax";
      const ratePercent = e.tax_rates?.rate || 0;
      if (!rateMap[rateId]) {
        rateMap[rateId] = { rateName, ratePercent, taxable: 0, gst: 0, itc: 0, count: 0 };
      }
      rateMap[rateId].taxable += Number(e.amount || 0);
      rateMap[rateId].gst += Number(e.gst_amount || 0);
      if (e.itc_claimed) rateMap[rateId].itc += Number(e.gst_amount || 0);
      rateMap[rateId].count += 1;
    });
    const byRate = Object.values(rateMap).sort((a, b) => b.ratePercent - a.ratePercent);

    const vendorMap = {};
    expenses.forEach(e => {
      const vid = e.vendor_id || "0";
      const name = e.vendors?.vendor_name || "Unknown Vendor";
      if (!vendorMap[vid]) {
        vendorMap[vid] = { vendor_name: name, gstin: e.vendors?.gstin || "", count: 0, taxable: 0, gst: 0, itc: 0 };
      }
      vendorMap[vid].count += 1;
      vendorMap[vid].taxable += Number(e.amount || 0);
      vendorMap[vid].gst += Number(e.gst_amount || 0);
      if (e.itc_claimed) vendorMap[vid].itc += Number(e.gst_amount || 0);
    });
    const byVendor = Object.values(vendorMap).sort((a, b) => b.taxable - a.taxable);

    return { totalTaxable, totalGST, totalITC, totalAmount, invoiceCount, vendorCount, byRate, byVendor };
  }, [expenses]);

  /* ─── Email helpers ────────────────────────────────────── */
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
    if (expenses.length === 0) {
      alert("No data to send.");
      return;
    }
    try {
      const adminEmails = await getAdminEmails();
      if (adminEmails.length === 0) {
        alert("No admin emails found.");
        return;
      }

      const orgName = org?.company_name || "Academy";
      const orgAddr = org?.address || "";
      const orgPhone = org?.phone || "";
      const orgEmail = org?.email || "";

      // Summary cards
      const summaryCards = `
        <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:10px;margin:10px 0;">
          <div style="border:1px solid #ddd;padding:8px 12px;border-radius:6px;background:#f9f9f9;text-align:center;">
            <div style="font-size:10px;color:#888;">Total Taxable</div>
            <div style="font-size:16px;font-weight:700;">₹ ${summaries.totalTaxable.toLocaleString('en-IN')}</div>
          </div>
          <div style="border:1px solid #ddd;padding:8px 12px;border-radius:6px;background:#f9f9f9;text-align:center;">
            <div style="font-size:10px;color:#888;">Total GST</div>
            <div style="font-size:16px;font-weight:700;color:#1565C0;">₹ ${summaries.totalGST.toLocaleString('en-IN')}</div>
          </div>
          <div style="border:1px solid #ddd;padding:8px 12px;border-radius:6px;background:#f9f9f9;text-align:center;">
            <div style="font-size:10px;color:#888;">ITC Claimed</div>
            <div style="font-size:16px;font-weight:700;color:#2e7d32;">₹ ${summaries.totalITC.toLocaleString('en-IN')}</div>
          </div>
          <div style="border:1px solid #ddd;padding:8px 12px;border-radius:6px;background:#f9f9f9;text-align:center;">
            <div style="font-size:10px;color:#888;">Total Amount</div>
            <div style="font-size:16px;font-weight:700;color:#0D47A1;">₹ ${summaries.totalAmount.toLocaleString('en-IN')}</div>
          </div>
          <div style="border:1px solid #ddd;padding:8px 12px;border-radius:6px;background:#f9f9f9;text-align:center;">
            <div style="font-size:10px;color:#888;">Invoices</div>
            <div style="font-size:16px;font-weight:700;">${summaries.invoiceCount}</div>
          </div>
          <div style="border:1px solid #ddd;padding:8px 12px;border-radius:6px;background:#f9f9f9;text-align:center;">
            <div style="font-size:10px;color:#888;">Vendors</div>
            <div style="font-size:16px;font-weight:700;">${summaries.vendorCount}</div>
          </div>
        </div>
      `;

      // Tax rate breakdown rows
      let taxRows = summaries.byRate.map(rate => `
        <tr>
          <td style="padding:4px 8px;border:1px solid #ddd;">${rate.rateName} (${rate.ratePercent}%)</td>
          <td style="padding:4px 8px;border:1px solid #ddd;text-align:right;">${rate.count}</td>
          <td style="padding:4px 8px;border:1px solid #ddd;text-align:right;">₹ ${rate.taxable.toLocaleString('en-IN')}</td>
          <td style="padding:4px 8px;border:1px solid #ddd;text-align:right;">₹ ${rate.gst.toLocaleString('en-IN')}</td>
          <td style="padding:4px 8px;border:1px solid #ddd;text-align:right;">₹ ${rate.itc.toLocaleString('en-IN')}</td>
        </tr>
      `).join('');

      // Vendor rows
      let vendorRows = summaries.byVendor.map(v => `
        <tr>
          <td style="padding:4px 8px;border:1px solid #ddd;">${v.vendor_name}</td>
          <td style="padding:4px 8px;border:1px solid #ddd;">${v.gstin || '—'}</td>
          <td style="padding:4px 8px;border:1px solid #ddd;text-align:right;">${v.count}</td>
          <td style="padding:4px 8px;border:1px solid #ddd;text-align:right;">₹ ${v.taxable.toLocaleString('en-IN')}</td>
          <td style="padding:4px 8px;border:1px solid #ddd;text-align:right;">₹ ${v.gst.toLocaleString('en-IN')}</td>
          <td style="padding:4px 8px;border:1px solid #ddd;text-align:right;">₹ ${v.itc.toLocaleString('en-IN')}</td>
        </tr>
      `).join('');

      // Detailed rows (first 20)
      const detailRows = expenses.slice(0, 20).map(e => `
        <tr>
          <td style="padding:4px 8px;border:1px solid #ddd;">${e.expense_date}</td>
          <td style="padding:4px 8px;border:1px solid #ddd;">${e.vendors?.vendor_name || '—'}</td>
          <td style="padding:4px 8px;border:1px solid #ddd;">${e.invoice_number || '—'}</td>
          <td style="padding:4px 8px;border:1px solid #ddd;text-align:right;">₹ ${Number(e.amount || 0).toLocaleString('en-IN')}</td>
          <td style="padding:4px 8px;border:1px solid #ddd;text-align:right;">₹ ${Number(e.gst_amount || 0).toLocaleString('en-IN')}</td>
          <td style="padding:4px 8px;border:1px solid #ddd;text-align:right;">₹ ${(Number(e.amount || 0) + Number(e.gst_amount || 0)).toLocaleString('en-IN')}</td>
          <td style="padding:4px 8px;border:1px solid #ddd;text-align:center;">${e.itc_claimed ? '✓' : '—'}</td>
          <td style="padding:4px 8px;border:1px solid #ddd;">${e.tax_rates?.name || '—'}</td>
        </tr>
      `).join('');

      const totalDetail = expenses.length > 20 ? `<p style="font-size:10px;color:#888;">... and ${expenses.length - 20} more entries</p>` : '';

      const htmlBody = `
        <div style="font-family:Arial,sans-serif;max-width:800px;margin:0 auto;">
          <h2 style="color:#000;">Purchase Register</h2>
          <p><strong>Organization:</strong> ${orgName}</p>
          <p>${orgAddr}</p>
          <p>Phone: ${orgPhone} | Email: ${orgEmail}</p>
          <p><strong>Branch:</strong> ${branch?.branch_name || 'N/A'}</p>
          <p><strong>Period:</strong> ${startDate} – ${endDate}</p>
          <hr />
          ${summaryCards}
          <h3 style="color:#000;margin-top:15px;">Tax Rate Breakdown</h3>
          <table style="width:100%;border-collapse:collapse;font-size:11px;">
            <thead style="background:#f5f5f5;">
              <tr>
                <th style="padding:4px 8px;border:1px solid #ddd;text-align:left;">Tax Rate</th>
                <th style="padding:4px 8px;border:1px solid #ddd;text-align:right;">Count</th>
                <th style="padding:4px 8px;border:1px solid #ddd;text-align:right;">Taxable</th>
                <th style="padding:4px 8px;border:1px solid #ddd;text-align:right;">GST</th>
                <th style="padding:4px 8px;border:1px solid #ddd;text-align:right;">ITC</th>
              </tr>
            </thead>
            <tbody>
              ${taxRows}
              <tr style="font-weight:bold;background:#f5f5f5;">
                <td style="padding:4px 8px;border:1px solid #ddd;">Total</td>
                <td style="padding:4px 8px;border:1px solid #ddd;text-align:right;">${expenses.length}</td>
                <td style="padding:4px 8px;border:1px solid #ddd;text-align:right;">₹ ${summaries.totalTaxable.toLocaleString('en-IN')}</td>
                <td style="padding:4px 8px;border:1px solid #ddd;text-align:right;">₹ ${summaries.totalGST.toLocaleString('en-IN')}</td>
                <td style="padding:4px 8px;border:1px solid #ddd;text-align:right;">₹ ${summaries.totalITC.toLocaleString('en-IN')}</td>
              </tr>
            </tbody>
          </table>
          <h3 style="color:#000;margin-top:15px;">Vendor Summary</h3>
          <table style="width:100%;border-collapse:collapse;font-size:11px;">
            <thead style="background:#f5f5f5;">
              <tr>
                <th style="padding:4px 8px;border:1px solid #ddd;text-align:left;">Vendor</th>
                <th style="padding:4px 8px;border:1px solid #ddd;text-align:left;">GSTIN</th>
                <th style="padding:4px 8px;border:1px solid #ddd;text-align:right;">Count</th>
                <th style="padding:4px 8px;border:1px solid #ddd;text-align:right;">Taxable</th>
                <th style="padding:4px 8px;border:1px solid #ddd;text-align:right;">GST</th>
                <th style="padding:4px 8px;border:1px solid #ddd;text-align:right;">ITC</th>
              </tr>
            </thead>
            <tbody>
              ${vendorRows}
              <tr style="font-weight:bold;background:#f5f5f5;">
                <td style="padding:4px 8px;border:1px solid #ddd;">Total</td>
                <td></td>
                <td style="padding:4px 8px;border:1px solid #ddd;text-align:right;">${expenses.length}</td>
                <td style="padding:4px 8px;border:1px solid #ddd;text-align:right;">₹ ${summaries.totalTaxable.toLocaleString('en-IN')}</td>
                <td style="padding:4px 8px;border:1px solid #ddd;text-align:right;">₹ ${summaries.totalGST.toLocaleString('en-IN')}</td>
                <td style="padding:4px 8px;border:1px solid #ddd;text-align:right;">₹ ${summaries.totalITC.toLocaleString('en-IN')}</td>
              </tr>
            </tbody>
          </table>
          <h3 style="color:#000;margin-top:15px;">Detailed Entries (first ${Math.min(expenses.length, 20)} of ${expenses.length})</h3>
          <table style="width:100%;border-collapse:collapse;font-size:10px;">
            <thead style="background:#f5f5f5;">
              <tr>
                <th style="padding:4px 8px;border:1px solid #ddd;text-align:left;">Date</th>
                <th style="padding:4px 8px;border:1px solid #ddd;text-align:left;">Vendor</th>
                <th style="padding:4px 8px;border:1px solid #ddd;text-align:left;">Invoice</th>
                <th style="padding:4px 8px;border:1px solid #ddd;text-align:right;">Taxable</th>
                <th style="padding:4px 8px;border:1px solid #ddd;text-align:right;">GST</th>
                <th style="padding:4px 8px;border:1px solid #ddd;text-align:right;">Total</th>
                <th style="padding:4px 8px;border:1px solid #ddd;text-align:center;">ITC</th>
                <th style="padding:4px 8px;border:1px solid #ddd;text-align:left;">Tax Rate</th>
              </tr>
            </thead>
            <tbody>
              ${detailRows}
            </tbody>
          </table>
          ${totalDetail}
          <p style="color:#888;font-size:10px;margin-top:20px;">Computer‑generated report from ${orgName}</p>
        </div>
      `;

      await sendEmail({
        to: adminEmails,
        subject: `Purchase Register - ${startDate} to ${endDate}`,
        html: htmlBody,
      });
      toast.success("Report sent to admins.");
    } catch (err) {
      console.error("Failed to send report:", err);
      toast.error("Failed to send report.");
    }
  };

  /* ─── CSV Export ────────────────────────────────────────── */
  const handleExportCSV = () => {
    if (expenses.length === 0) {
      toast.error("No data to export");
      return;
    }
    const csvData = expenses.map((e) => ({
      "Date": e.expense_date,
      "Vendor": e.vendors?.vendor_name || "",
      "Vendor GSTIN": e.vendors?.gstin || "",
      "Invoice No": e.invoice_number || "",
      "Category": e.category || "",
      "Description": e.description || "",
      "Taxable Amount": e.amount || 0,
      "GST Amount": e.gst_amount || 0,
      "Total": (Number(e.amount || 0) + Number(e.gst_amount || 0)),
      "ITC Eligible": e.itc_eligible ? "Yes" : "No",
      "ITC Claimed": e.itc_claimed ? "Yes" : "No",
      "Tax Rate": e.tax_rates?.name || "None",
    }));
    const csv = Papa.unparse(csvData);
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `Purchase_Register_${startDate}_${endDate}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success("CSV exported");
  };

  /* ─── PDF Export (all black, transparent table) ──────────── */
  const handleExportPDF = async () => {
    if (expenses.length === 0) {
      toast.error("No data to export");
      return;
    }

    const doc = new jsPDF({ unit: "mm", format: "a4", orientation: "landscape" });
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

    // Title
    doc.setFontSize(14);
    doc.setFont("helvetica", "bold");
    doc.setTextColor("#000000");
    doc.text(`Purchase Register – ${startDate} to ${endDate}`, pageWidth / 2, y, { align: "center" });
    y += 10;

    // Summary boxes
    const boxWidth = (pageWidth - 2 * margin - 30) / 6;
    const boxHeight = 16;
    const boxY = y;
    const summaryItems = [
      { label: "Total Taxable", value: summaries.totalTaxable },
      { label: "Total GST", value: summaries.totalGST },
      { label: "ITC Claimed", value: summaries.totalITC },
      { label: "Total Amount", value: summaries.totalAmount },
      { label: "Invoices", value: summaries.invoiceCount },
      { label: "Vendors", value: summaries.vendorCount },
    ];

    summaryItems.forEach((item, i) => {
      const x = margin + i * (boxWidth + 5);
      doc.setDrawColor("#000000");
      doc.setFillColor(255, 255, 255);
      doc.rect(x, boxY, boxWidth, boxHeight, "FD");
      doc.setFontSize(8);
      doc.setFont("helvetica", "normal");
      doc.text(item.label, x + 2, boxY + 5);
      if (typeof item.value === "number") {
        drawCurrency(doc, item.value, x + 2, boxY + 13, 8, "left", "#000");
      } else {
        doc.text(item.value.toString(), x + 2, boxY + 13);
      }
    });
    y += boxHeight + 12;

    // Table
    const tableRows = expenses.map((e) => [
      e.expense_date,
      e.vendors?.vendor_name || "—",
      e.invoice_number || "—",
      e.category || "—",
      e.amount || 0,
      e.gst_amount || 0,
      (Number(e.amount || 0) + Number(e.gst_amount || 0)),
      e.itc_claimed ? "Yes" : "No",
      e.tax_rates?.name || "—",
    ]);

    autoTable(doc, {
      startY: y,
      head: [["Date", "Vendor", "Invoice No", "Category", "Taxable", "GST", "Total", "ITC", "Tax Rate"]],
      body: tableRows,
      theme: "plain",
      styles: { fontSize: 7, textColor: [0,0,0], fillColor: [255,255,255], lineColor: [0,0,0], lineWidth: 0.2 },
      headStyles: { fillColor: [255,255,255], textColor: [0,0,0], fontStyle: "bold", lineWidth: 0.2, lineColor: [0,0,0] },
      columnStyles: {
        0: { cellWidth: 22 },
        1: { cellWidth: 35 },
        2: { cellWidth: 25 },
        3: { cellWidth: 25 },
        4: { cellWidth: 22, halign: "right" },
        5: { cellWidth: 22, halign: "right" },
        6: { cellWidth: 22, halign: "right" },
        7: { cellWidth: 15, halign: "center" },
        8: { cellWidth: 25 },
      },
      margin: { left: margin, right: margin },
      willDrawCell: (data) => {
        if ([4,5,6].includes(data.column.index) && typeof data.cell.raw === "number") {
          data.cell.text = [];
        }
      },
      didDrawCell: (data) => {
        if ([4,5,6].includes(data.column.index) && typeof data.cell.raw === "number") {
          drawCurrency(doc, data.cell.raw, data.cell.x + data.cell.width - 2, data.cell.y + data.cell.height / 2 + 1.5, 7, "right", "#000");
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

    doc.save(`Purchase_Register_${startDate}_${endDate}.pdf`);
    toast.success("PDF exported");
  };

  /* ─── Print (window.print) kept as fallback ──────────────── */
  const handlePrint = () => {
    const content = document.getElementById("purchase-register-content")?.innerHTML;
    if (!content) return;
    const win = window.open("", "_blank", "width=1100,height=750");
    win.document.write(`
      <html><head><title>Purchase Register</title>
      <style>
        body { font-family: Arial, sans-serif; margin: 30px; color: #222; }
        .header { display: flex; align-items: center; border-bottom: 2px solid #000; padding-bottom: 8px; margin-bottom: 15px; }
        .header .org-name { font-size: 18px; font-weight: 700; color: #000; }
        .header .org-details { font-size: 10px; color: #555; }
        h1 { text-align: center; color: #000; font-size: 16px; margin: 10px 0; }
        table { width: 100%; border-collapse: collapse; font-size: 9px; }
        th, td { padding: 4px 6px; border: 1px solid #bbb; text-align: right; }
        th { background-color: #f0f0f0; text-align: left; }
        .summary-card { border: 1px solid #ddd; padding: 10px; margin: 5px 0; border-radius: 6px; display: inline-block; min-width: 120px; }
        .summary-card .label { font-size: 8px; color: #888; }
        .summary-card .value { font-size: 14px; font-weight: 700; }
        .footer { margin-top: 20px; font-size: 8px; color: #888; text-align: center; border-top: 1px solid #ddd; padding-top: 8px; }
      </style></head>
      <body>
        <div class="header"><div><div class="org-name">${org?.company_name || "Academy"}</div><div class="org-details">${org?.address || ""}</div><div class="org-details">Ph: ${org?.phone || ""} | Email: ${org?.email || ""}</div></div></div>
        <h1>Purchase Register – ${startDate} to ${endDate}</h1>
        <div id="purchase-register-content">${content}</div>
        <div class="footer">Generated on ${new Date().toLocaleString()} – ${org?.company_name || ""}</div>
        <script>window.print();</script>
      </body></html>
    `);
    win.document.close();
  };

  return (
    <>
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-6 gap-4">
        <h1 className="text-3xl font-bold text-primary" style={{ fontFamily: headingFont }}>
          Purchase Register
        </h1>
        <div className="flex flex-wrap gap-2">
          <button
            onClick={sendReportEmail}
            className="inline-flex items-center gap-2 px-4 py-2.5 bg-accent hover:bg-accent-dark text-white rounded-lg text-sm font-medium transition-colors"
            style={{ fontFamily: bodyFont }}
          >
            <Mail size={16} /> Send Report
          </button>
          <button
            onClick={handlePrint}
            className="inline-flex items-center gap-2 px-4 py-2.5 bg-primary hover:bg-accent text-white rounded-lg text-sm font-medium transition-colors"
            style={{ fontFamily: bodyFont }}
          >
            <Printer size={16} /> Print
          </button>
          <button
            onClick={handleExportCSV}
            className="inline-flex items-center gap-2 px-4 py-2.5 border border-primary-bg bg-white text-primary-dark rounded-lg hover:bg-primary-bg transition-colors text-sm"
            style={{ fontFamily: bodyFont }}
          >
            <Download size={16} /> CSV
          </button>
          <button
            onClick={handleExportPDF}
            className="inline-flex items-center gap-2 px-4 py-2.5 border border-primary-bg bg-white text-primary-dark rounded-lg hover:bg-primary-bg transition-colors text-sm"
            style={{ fontFamily: bodyFont }}
          >
            <FileText size={16} /> PDF
          </button>
          <button
            onClick={() => refetch()}
            disabled={isLoading}
            className="inline-flex items-center gap-2 px-4 py-2.5 border border-primary-bg bg-white text-primary-dark rounded-lg hover:bg-primary-bg transition-colors text-sm disabled:opacity-50"
            style={{ fontFamily: bodyFont }}
          >
            <Loader size={16} className={isLoading ? "animate-spin" : ""} />
            Refresh
          </button>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-4 mb-6 bg-white p-4 rounded-xl shadow-sm border border-primary-bg">
        <div>
          <label className="text-sm font-medium text-primary-dark mr-2" style={{ fontFamily: bodyFont }}>From:</label>
          <input
            type="date"
            value={startDate}
            onChange={(e) => setStartDate(e.target.value)}
            className="border border-primary-bg bg-white text-primary-dark rounded-lg p-2 text-sm"
          />
        </div>
        <div>
          <label className="text-sm font-medium text-primary-dark mr-2" style={{ fontFamily: bodyFont }}>To:</label>
          <input
            type="date"
            value={endDate}
            onChange={(e) => setEndDate(e.target.value)}
            className="border border-primary-bg bg-white text-primary-dark rounded-lg p-2 text-sm"
          />
        </div>
        <div>
          <label className="text-sm font-medium text-primary-dark mr-2" style={{ fontFamily: bodyFont }}>Vendor:</label>
          <select
            value={vendorFilter}
            onChange={(e) => setVendorFilter(e.target.value)}
            className="border border-primary-bg bg-white text-primary-dark rounded-lg p-2 text-sm"
          >
            <option value="">All Vendors</option>
            {vendors.map(v => (
              <option key={v.id} value={v.id}>{v.vendor_name}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="text-sm font-medium text-primary-dark mr-2" style={{ fontFamily: bodyFont }}>Tax Rate:</label>
          <select
            value={taxRateFilter}
            onChange={(e) => setTaxRateFilter(e.target.value)}
            className="border border-primary-bg bg-white text-primary-dark rounded-lg p-2 text-sm"
          >
            <option value="">All Rates</option>
            {taxRates.map(t => (
              <option key={t.id} value={t.id}>{t.name} ({t.rate}%)</option>
            ))}
          </select>
        </div>
        <div className="relative flex-1 min-w-[200px]">
          <Search size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-primary-dark/60" />
          <input
            type="text"
            placeholder="Search by description, bill no, vendor..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-10 pr-4 py-2 border border-primary-bg bg-white text-primary-dark rounded-lg text-sm placeholder-primary-dark/40"
            style={{ fontFamily: bodyFont }}
          />
        </div>
      </div>

      {/* Content for print */}
      <div id="purchase-register-content">
        {/* Summary Cards */}
        {!isLoading && expenses.length > 0 && (
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-4 mb-6">
            <div className="bg-white rounded-xl shadow-sm p-4 border border-primary-bg text-center">
              <p className="text-xs text-primary-dark" style={{ fontFamily: bodyFont }}>Total Taxable</p>
              <p className="text-xl font-bold text-primary" style={{ fontFamily: headingFont }}>
                ₹ {summaries.totalTaxable.toLocaleString("en-IN")}
              </p>
            </div>
            <div className="bg-white rounded-xl shadow-sm p-4 border border-primary-bg text-center">
              <p className="text-xs text-primary-dark" style={{ fontFamily: bodyFont }}>Total GST</p>
              <p className="text-xl font-bold text-primary" style={{ fontFamily: headingFont }}>
                ₹ {summaries.totalGST.toLocaleString("en-IN")}
              </p>
            </div>
            <div className="bg-white rounded-xl shadow-sm p-4 border border-primary-bg text-center">
              <p className="text-xs text-primary-dark" style={{ fontFamily: bodyFont }}>ITC Claimed</p>
              <p className="text-xl font-bold text-primary" style={{ fontFamily: headingFont }}>
                ₹ {summaries.totalITC.toLocaleString("en-IN")}
              </p>
            </div>
            <div className="bg-white rounded-xl shadow-sm p-4 border border-primary-bg text-center">
              <p className="text-xs text-primary-dark" style={{ fontFamily: bodyFont }}>Total Amount</p>
              <p className="text-xl font-bold text-primary" style={{ fontFamily: headingFont }}>
                ₹ {summaries.totalAmount.toLocaleString("en-IN")}
              </p>
            </div>
            <div className="bg-white rounded-xl shadow-sm p-4 border border-primary-bg text-center">
              <p className="text-xs text-primary-dark" style={{ fontFamily: bodyFont }}>Invoices</p>
              <p className="text-xl font-bold text-primary" style={{ fontFamily: headingFont }}>
                {summaries.invoiceCount}
              </p>
            </div>
            <div className="bg-white rounded-xl shadow-sm p-4 border border-primary-bg text-center">
              <p className="text-xs text-primary-dark" style={{ fontFamily: bodyFont }}>Vendors</p>
              <p className="text-xl font-bold text-primary" style={{ fontFamily: headingFont }}>
                {summaries.vendorCount}
              </p>
            </div>
          </div>
        )}

        {/* Tax Rate Breakdown */}
        {summaries.byRate.length > 0 && (
          <div className="bg-white rounded-xl shadow-sm overflow-hidden mb-6 border border-primary-bg">
            <h2 className="text-lg font-semibold p-4 border-b bg-primary-bg text-primary" style={{ fontFamily: headingFont }}>
              <IndianRupee size={18} className="inline mr-2" /> Tax Rate Breakdown
            </h2>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-primary-bg">
                  <tr>
                    <th className="p-3 text-left text-sm font-medium text-primary-dark uppercase" style={{ fontFamily: bodyFont }}>Tax Rate</th>
                    <th className="p-3 text-right text-sm font-medium text-primary-dark uppercase" style={{ fontFamily: bodyFont }}>Count</th>
                    <th className="p-3 text-right text-sm font-medium text-primary-dark uppercase" style={{ fontFamily: bodyFont }}>Taxable</th>
                    <th className="p-3 text-right text-sm font-medium text-primary-dark uppercase" style={{ fontFamily: bodyFont }}>GST</th>
                    <th className="p-3 text-right text-sm font-medium text-primary-dark uppercase" style={{ fontFamily: bodyFont }}>ITC</th>
                  </tr>
                </thead>
                <tbody>
                  {summaries.byRate.map((rate, idx) => (
                    <tr key={idx} className="border-t border-primary-bg hover:bg-primary-bg">
                      <td className="p-3 text-sm text-primary-dark" style={{ fontFamily: bodyFont }}>{rate.rateName} ({rate.ratePercent}%)</td>
                      <td className="p-3 text-sm text-right text-primary-dark" style={{ fontFamily: bodyFont }}>{rate.count}</td>
                      <td className="p-3 text-sm text-right text-primary-dark" style={{ fontFamily: bodyFont }}>₹ {rate.taxable.toLocaleString("en-IN")}</td>
                      <td className="p-3 text-sm text-right text-primary-dark" style={{ fontFamily: bodyFont }}>₹ {rate.gst.toLocaleString("en-IN")}</td>
                      <td className="p-3 text-sm text-right text-primary-dark" style={{ fontFamily: bodyFont }}>₹ {rate.itc.toLocaleString("en-IN")}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot className="bg-primary-bg border-t font-medium">
                  <tr>
                    <td className="p-3 text-primary-dark" style={{ fontFamily: bodyFont }}>Total</td>
                    <td className="p-3 text-right text-primary-dark" style={{ fontFamily: bodyFont }}>{expenses.length}</td>
                    <td className="p-3 text-right text-primary-dark" style={{ fontFamily: bodyFont }}>₹ {summaries.totalTaxable.toLocaleString("en-IN")}</td>
                    <td className="p-3 text-right text-primary-dark" style={{ fontFamily: bodyFont }}>₹ {summaries.totalGST.toLocaleString("en-IN")}</td>
                    <td className="p-3 text-right text-primary-dark" style={{ fontFamily: bodyFont }}>₹ {summaries.totalITC.toLocaleString("en-IN")}</td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </div>
        )}

        {/* Vendor Breakdown */}
        {summaries.byVendor.length > 0 && (
          <div className="bg-white rounded-xl shadow-sm overflow-hidden mb-6 border border-primary-bg">
            <h2 className="text-lg font-semibold p-4 border-b bg-primary-bg text-primary" style={{ fontFamily: headingFont }}>
              <Building size={18} className="inline mr-2" /> Vendor Summary
            </h2>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-primary-bg">
                  <tr>
                    <th className="p-3 text-left text-sm font-medium text-primary-dark uppercase" style={{ fontFamily: bodyFont }}>Vendor</th>
                    <th className="p-3 text-left text-sm font-medium text-primary-dark uppercase" style={{ fontFamily: bodyFont }}>GSTIN</th>
                    <th className="p-3 text-right text-sm font-medium text-primary-dark uppercase" style={{ fontFamily: bodyFont }}>Count</th>
                    <th className="p-3 text-right text-sm font-medium text-primary-dark uppercase" style={{ fontFamily: bodyFont }}>Taxable</th>
                    <th className="p-3 text-right text-sm font-medium text-primary-dark uppercase" style={{ fontFamily: bodyFont }}>GST</th>
                    <th className="p-3 text-right text-sm font-medium text-primary-dark uppercase" style={{ fontFamily: bodyFont }}>ITC</th>
                  </tr>
                </thead>
                <tbody>
                  {summaries.byVendor.map((vendor, idx) => (
                    <tr key={idx} className="border-t border-primary-bg hover:bg-primary-bg">
                      <td className="p-3 text-sm text-primary-dark" style={{ fontFamily: bodyFont }}>{vendor.vendor_name}</td>
                      <td className="p-3 text-sm text-primary-dark" style={{ fontFamily: bodyFont }}>{vendor.gstin || "—"}</td>
                      <td className="p-3 text-sm text-right text-primary-dark" style={{ fontFamily: bodyFont }}>{vendor.count}</td>
                      <td className="p-3 text-sm text-right text-primary-dark" style={{ fontFamily: bodyFont }}>₹ {vendor.taxable.toLocaleString("en-IN")}</td>
                      <td className="p-3 text-sm text-right text-primary-dark" style={{ fontFamily: bodyFont }}>₹ {vendor.gst.toLocaleString("en-IN")}</td>
                      <td className="p-3 text-sm text-right text-primary-dark" style={{ fontFamily: bodyFont }}>₹ {vendor.itc.toLocaleString("en-IN")}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot className="bg-primary-bg border-t font-medium">
                  <tr>
                    <td className="p-3 text-primary-dark" style={{ fontFamily: bodyFont }}>Total</td>
                    <td className="p-3"></td>
                    <td className="p-3 text-right text-primary-dark" style={{ fontFamily: bodyFont }}>{expenses.length}</td>
                    <td className="p-3 text-right text-primary-dark" style={{ fontFamily: bodyFont }}>₹ {summaries.totalTaxable.toLocaleString("en-IN")}</td>
                    <td className="p-3 text-right text-primary-dark" style={{ fontFamily: bodyFont }}>₹ {summaries.totalGST.toLocaleString("en-IN")}</td>
                    <td className="p-3 text-right text-primary-dark" style={{ fontFamily: bodyFont }}>₹ {summaries.totalITC.toLocaleString("en-IN")}</td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </div>
        )}

        {/* Detailed Table */}
        <div className="bg-white rounded-xl shadow-sm overflow-hidden border border-primary-bg">
          <h2 className="text-lg font-semibold p-4 border-b bg-primary-bg text-primary" style={{ fontFamily: headingFont }}>
            <FileText size={18} className="inline mr-2" /> Detailed Entries
          </h2>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[900px]">
              <thead className="bg-primary-bg">
                <tr>
                  <th className="p-3 text-left text-sm font-medium text-primary-dark uppercase" style={{ fontFamily: bodyFont }}>Date</th>
                  <th className="p-3 text-left text-sm font-medium text-primary-dark uppercase" style={{ fontFamily: bodyFont }}>Vendor</th>
                  <th className="p-3 text-left text-sm font-medium text-primary-dark uppercase" style={{ fontFamily: bodyFont }}>Invoice No</th>
                  <th className="p-3 text-left text-sm font-medium text-primary-dark uppercase" style={{ fontFamily: bodyFont }}>Category</th>
                  <th className="p-3 text-left text-sm font-medium text-primary-dark uppercase" style={{ fontFamily: bodyFont }}>Description</th>
                  <th className="p-3 text-right text-sm font-medium text-primary-dark uppercase" style={{ fontFamily: bodyFont }}>Taxable</th>
                  <th className="p-3 text-right text-sm font-medium text-primary-dark uppercase" style={{ fontFamily: bodyFont }}>GST</th>
                  <th className="p-3 text-right text-sm font-medium text-primary-dark uppercase" style={{ fontFamily: bodyFont }}>Total</th>
                  <th className="p-3 text-center text-sm font-medium text-primary-dark uppercase" style={{ fontFamily: bodyFont }}>ITC</th>
                  <th className="p-3 text-left text-sm font-medium text-primary-dark uppercase" style={{ fontFamily: bodyFont }}>Tax Rate</th>
                </tr>
              </thead>
              <tbody>
                {isLoading ? (
                  <tr>
                    <td colSpan={10} className="p-6 text-center text-primary-dark/60" style={{ fontFamily: bodyFont }}>
                      Loading…
                    </td>
                  </tr>
                ) : expenses.length === 0 ? (
                  <tr>
                    <td colSpan={10} className="p-6 text-center text-primary-dark/60" style={{ fontFamily: bodyFont }}>
                      No expenses found
                    </td>
                  </tr>
                ) : (
                  expenses.map((e) => (
                    <tr key={e.id} className="border-t border-primary-bg hover:bg-primary-bg">
                      <td className="p-3 text-sm text-primary-dark" style={{ fontFamily: bodyFont }}>{e.expense_date}</td>
                      <td className="p-3 text-sm text-primary-dark" style={{ fontFamily: bodyFont }}>{e.vendors?.vendor_name || "—"}</td>
                      <td className="p-3 text-sm text-primary-dark" style={{ fontFamily: bodyFont }}>{e.invoice_number || "—"}</td>
                      <td className="p-3 text-sm text-primary-dark" style={{ fontFamily: bodyFont }}>{e.category || "—"}</td>
                      <td className="p-3 text-sm text-primary-dark" style={{ fontFamily: bodyFont }}>{e.description || "—"}</td>
                      <td className="p-3 text-sm text-right text-primary-dark" style={{ fontFamily: bodyFont }}>₹ {Number(e.amount || 0).toLocaleString("en-IN")}</td>
                      <td className="p-3 text-sm text-right text-primary-dark" style={{ fontFamily: bodyFont }}>₹ {Number(e.gst_amount || 0).toLocaleString("en-IN")}</td>
                      <td className="p-3 text-sm text-right font-medium text-primary" style={{ fontFamily: bodyFont }}>
                        ₹ {(Number(e.amount || 0) + Number(e.gst_amount || 0)).toLocaleString("en-IN")}
                      </td>
                      <td className="p-3 text-sm text-center">
                        {e.itc_claimed ? (
                          <span className="text-primary font-medium">✓</span>
                        ) : (
                          <span className="text-primary-dark/40">—</span>
                        )}
                      </td>
                      <td className="p-3 text-sm text-primary-dark" style={{ fontFamily: bodyFont }}>{e.tax_rates?.name || "—"}</td>
                    </tr>
                  ))
                )}
              </tbody>
              {expenses.length > 0 && (
                <tfoot className="bg-primary-bg border-t font-medium">
                  <tr>
                    <td colSpan={5} className="p-3 text-right text-primary-dark" style={{ fontFamily: bodyFont }}>Total</td>
                    <td className="p-3 text-right text-primary-dark" style={{ fontFamily: bodyFont }}>₹ {summaries.totalTaxable.toLocaleString("en-IN")}</td>
                    <td className="p-3 text-right text-primary-dark" style={{ fontFamily: bodyFont }}>₹ {summaries.totalGST.toLocaleString("en-IN")}</td>
                    <td className="p-3 text-right text-primary-dark" style={{ fontFamily: bodyFont }}>₹ {summaries.totalAmount.toLocaleString("en-IN")}</td>
                    <td className="p-3 text-center text-primary-dark" style={{ fontFamily: bodyFont }}>₹ {summaries.totalITC.toLocaleString("en-IN")}</td>
                    <td className="p-3"></td>
                  </tr>
                </tfoot>
              )}
            </table>
          </div>
        </div>
      </div>

      {/* Loading overlay */}
      {isLoading && (
        <div className="fixed bottom-4 right-4 bg-white shadow-lg rounded-lg p-4 flex items-center gap-3 border border-primary-bg">
          <Loader className="w-5 h-5 animate-spin text-primary-dark" />
          <span className="text-sm text-primary-dark" style={{ fontFamily: bodyFont }}>
            Loading purchase data...
          </span>
        </div>
      )}
    </>
  );
}