// src/pages/PurchaseRegister.jsx
import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "../api/supabase";
import { getOrganization } from "../services/organizationService";
import { useOrg } from "../context/OrganizationContext";
import { sendEmail } from "../services/emailService";
import toast from "react-hot-toast";

import {
  Search,
  Calendar,
  Download,
  Printer,
  Loader,
  TrendingUp,
  IndianRupee,
  FileText,
  Building,
  Mail,
} from "lucide-react";
import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";
import Papa from "papaparse";

export default function PurchaseRegister() {
  const today = new Date();
  const firstDay = new Date(today.getFullYear(), today.getMonth(), 1);
  const [startDate, setStartDate] = useState(firstDay.toISOString().split("T")[0]);
  const [endDate, setEndDate] = useState(today.toISOString().split("T")[0]);
  const [vendorFilter, setVendorFilter] = useState("");
  const [taxRateFilter, setTaxRateFilter] = useState("");
  const [search, setSearch] = useState("");

  const { org: currentOrg, branch, selectedFinancialYear } = useOrg();
  const branchId = branch?.id;
  const financialYearId = selectedFinancialYear?.id;

  const { data: org } = useQuery({
    queryKey: ["organization", currentOrg?.id],
    queryFn: () => getOrganization(currentOrg?.id),
    enabled: !!currentOrg?.id,
  });

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

      // Build summary cards HTML
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

      // Tax Rate table
      let taxRows = summaries.byRate.map(rate => `
        <tr>
          <td style="padding:4px 8px;border:1px solid #ddd;">${rate.rateName} (${rate.ratePercent}%)</td>
          <td style="padding:4px 8px;border:1px solid #ddd;text-align:right;">${rate.count}</td>
          <td style="padding:4px 8px;border:1px solid #ddd;text-align:right;">₹ ${rate.taxable.toLocaleString('en-IN')}</td>
          <td style="padding:4px 8px;border:1px solid #ddd;text-align:right;">₹ ${rate.gst.toLocaleString('en-IN')}</td>
          <td style="padding:4px 8px;border:1px solid #ddd;text-align:right;">₹ ${rate.itc.toLocaleString('en-IN')}</td>
        </tr>
      `).join('');

      // Vendor table
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

      // Detailed entries (first 20 rows to keep email size manageable)
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
          <h2 style="color:#0D47A1;">Purchase Register</h2>
          <p><strong>Organization:</strong> ${orgName}</p>
          <p>${orgAddr}</p>
          <p>Phone: ${orgPhone} | Email: ${orgEmail}</p>
          <p><strong>Branch:</strong> ${branch?.branch_name || 'N/A'}</p>
          <p><strong>Period:</strong> ${startDate} – ${endDate}</p>
          <hr />
          ${summaryCards}
          <h3 style="color:#0D47A1;margin-top:15px;">Tax Rate Breakdown</h3>
          <table style="width:100%;border-collapse:collapse;font-size:11px;">
            <thead style="background:#e3f2fd;">
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

          <h3 style="color:#0D47A1;margin-top:15px;">Vendor Summary</h3>
          <table style="width:100%;border-collapse:collapse;font-size:11px;">
            <thead style="background:#e3f2fd;">
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

          <h3 style="color:#0D47A1;margin-top:15px;">Detailed Entries (first ${Math.min(expenses.length, 20)} of ${expenses.length})</h3>
          <table style="width:100%;border-collapse:collapse;font-size:10px;">
            <thead style="background:#e3f2fd;">
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
       // from: org?.email || undefined,
      });

      toast.success("Report sent to admins.");
    } catch (err) {
      console.error("Failed to send report:", err);
      toast.error("Failed to send report.");
    }
  };

  // ─── Vendors dropdown ──────────────────────────────────────────────
  const { data: vendors = [] } = useQuery({
    queryKey: ["vendors-dropdown", branchId, financialYearId],
    queryFn: async () => {
      let query = supabase
        .from("vendors")
        .select("id, vendor_name")
        .order("vendor_name");
      if (branchId) query = query.eq("branch_id", branchId);
      if (financialYearId) query = query.eq("financial_year_id", financialYearId);
      const { data } = await query;
      return data || [];
    },
    enabled: !!branchId && !!financialYearId,
    staleTime: 10 * 60 * 1000,
  });

  // ─── Tax rates dropdown ────────────────────────────────────────────
  const { data: taxRates = [] } = useQuery({
    queryKey: ["tax-rates-dropdown", branchId, financialYearId],
    queryFn: async () => {
      let query = supabase
        .from("tax_rates")
        .select("id, name, rate")
        .eq("is_active", true);
      if (branchId) query = query.eq("branch_id", branchId);
      if (financialYearId) query = query.eq("financial_year_id", financialYearId);
      const { data } = await query;
      return data || [];
    },
    enabled: !!branchId && !!financialYearId,
    staleTime: 10 * 60 * 1000,
  });

  // ─── Main query ─────────────────────────────────────────────────────
  const {
    data: expenses = [],
    isLoading,
    refetch,
  } = useQuery({
    queryKey: ["purchase-register", startDate, endDate, vendorFilter, taxRateFilter, search, branchId, financialYearId],
    queryFn: async () => {
      let query = supabase
        .from("expenses")
        .select(`
          *,
          vendors(id, vendor_name, gstin),
          tax_rates(id, name, rate)
        `)
        .gte("expense_date", startDate)
        .lte("expense_date", endDate)
        .order("expense_date", { ascending: false });

      if (branchId) query = query.eq("branch_id", branchId);
      if (financialYearId) query = query.eq("financial_year_id", financialYearId);

      if (vendorFilter) query = query.eq("vendor_id", vendorFilter);
      if (taxRateFilter) query = query.eq("tax_rate_id", taxRateFilter);
      if (search) {
        query = query.or(
          `description.ilike.%${search}%,bill_number.ilike.%${search}%,vendors.vendor_name.ilike.%${search}%`
        );
      }

      const { data, error } = await query;
      if (error) throw error;
      return data || [];
    },
    enabled: !!branchId && !!financialYearId,
    staleTime: 2 * 60 * 1000,
  });

  // ─── Summaries ─────────────────────────────────────────────────────
  const summaries = useMemo(() => {
    const totalTaxable = expenses.reduce((s, e) => s + Number(e.amount || 0), 0);
    const totalGST = expenses.reduce((s, e) => s + Number(e.gst_amount || 0), 0);
    const totalITC = expenses
      .filter((e) => e.itc_claimed)
      .reduce((s, e) => s + Number(e.gst_amount || 0), 0);
    const totalAmount = totalTaxable + totalGST;
    const invoiceCount = expenses.filter((e) => e.invoice_number).length;
    const vendorCount = new Set(expenses.map((e) => e.vendor_id).filter(Boolean)).size;

    const rateMap = {};
    expenses.forEach((e) => {
      const rateId = e.tax_rate_id || "0";
      const rateName = e.tax_rates?.name || "No Tax";
      const ratePercent = e.tax_rates?.rate || 0;
      if (!rateMap[rateId]) {
        rateMap[rateId] = {
          rateName,
          ratePercent,
          taxable: 0,
          gst: 0,
          itc: 0,
          count: 0,
        };
      }
      rateMap[rateId].taxable += Number(e.amount || 0);
      rateMap[rateId].gst += Number(e.gst_amount || 0);
      if (e.itc_claimed) rateMap[rateId].itc += Number(e.gst_amount || 0);
      rateMap[rateId].count += 1;
    });
    const byRate = Object.values(rateMap).sort((a, b) => b.ratePercent - a.ratePercent);

    const vendorMap = {};
    expenses.forEach((e) => {
      const vid = e.vendor_id || "0";
      const name = e.vendors?.vendor_name || "Unknown Vendor";
      if (!vendorMap[vid]) {
        vendorMap[vid] = {
          vendor_name: name,
          gstin: e.vendors?.gstin || "",
          count: 0,
          taxable: 0,
          gst: 0,
          itc: 0,
        };
      }
      vendorMap[vid].count += 1;
      vendorMap[vid].taxable += Number(e.amount || 0);
      vendorMap[vid].gst += Number(e.gst_amount || 0);
      if (e.itc_claimed) vendorMap[vid].itc += Number(e.gst_amount || 0);
    });
    const byVendor = Object.values(vendorMap).sort((a, b) => b.taxable - a.taxable);

    return {
      totalTaxable,
      totalGST,
      totalITC,
      totalAmount,
      invoiceCount,
      vendorCount,
      byRate,
      byVendor,
    };
  }, [expenses]);

  // ─── Export handlers (unchanged) ──────────────────────────────────
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

  const handleExportPDF = () => {
    if (expenses.length === 0) {
      toast.error("No data to export");
      return;
    }

    const doc = new jsPDF({ unit: "mm", format: "a4", orientation: "landscape" });
    const pageWidth = doc.internal.pageSize.getWidth();
    const margin = 14;
    let y = 16;

    const orgName = org?.company_name || "ShreeVidhya Academy";
    const address = org?.address || "";
    const phone = org?.phone || "";
    const email = org?.email || "";

    doc.setFontSize(16);
    doc.setFont("helvetica", "bold");
    doc.setTextColor("#0D47A1");
    doc.text(orgName, margin, y);
    y += 7;
    doc.setFontSize(9);
    doc.setFont("helvetica", "normal");
    doc.setTextColor("#555");
    doc.text(address, margin, y);
    y += 5;
    doc.text(`Phone: ${phone} | Email: ${email}`, margin, y);
    y += 10;

    doc.setFontSize(14);
    doc.setFont("helvetica", "bold");
    doc.setTextColor("#0D47A1");
    const title = `Purchase Register – ${startDate} to ${endDate}`;
    doc.text(title, pageWidth / 2, y, { align: "center" });
    y += 10;

    const summaryData = [
      ["Total Taxable", `₹ ${summaries.totalTaxable.toLocaleString("en-IN")}`],
      ["Total GST", `₹ ${summaries.totalGST.toLocaleString("en-IN")}`],
      ["Total ITC Claimed", `₹ ${summaries.totalITC.toLocaleString("en-IN")}`],
      ["Total Amount", `₹ ${summaries.totalAmount.toLocaleString("en-IN")}`],
      ["Invoices", summaries.invoiceCount],
      ["Vendors", summaries.vendorCount],
    ];
    autoTable(doc, {
      startY: y,
      body: summaryData,
      theme: "plain",
      styles: { fontSize: 8, cellPadding: 2 },
      columnStyles: {
        0: { fontStyle: "bold", cellWidth: 40 },
        1: { cellWidth: 40, halign: "right" },
      },
      margin: { left: margin, right: margin },
    });
    y = doc.lastAutoTable.finalY + 8;

    const tableRows = expenses.map((e) => [
      e.expense_date,
      e.vendors?.vendor_name || "—",
      e.invoice_number || "—",
      e.category || "—",
      `₹ ${Number(e.amount || 0).toLocaleString("en-IN")}`,
      `₹ ${Number(e.gst_amount || 0).toLocaleString("en-IN")}`,
      `₹ ${(Number(e.amount || 0) + Number(e.gst_amount || 0)).toLocaleString("en-IN")}`,
      e.itc_claimed ? "✓" : "✗",
      e.tax_rates?.name || "—",
    ]);

    autoTable(doc, {
      startY: y,
      head: [["Date", "Vendor", "Invoice No", "Category", "Taxable", "GST", "Total", "ITC", "Tax Rate"]],
      body: tableRows,
      theme: "grid",
      styles: { fontSize: 7, cellPadding: 2 },
      headStyles: { fillColor: "#0D47A1", textColor: "#FFFFFF", fontSize: 7 },
      columnStyles: {
        0: { cellWidth: 22 },
        1: { cellWidth: 35 },
        2: { cellWidth: 25 },
        3: { cellWidth: 25 },
        4: { cellWidth: 22, halign: "right" },
        5: { cellWidth: 22, halign: "right" },
        6: { cellWidth: 22, halign: "right" },
        7: { cellWidth: 12, halign: "center" },
        8: { cellWidth: 20 },
      },
      margin: { left: margin, right: margin },
    });

    const footerY = doc.internal.pageSize.getHeight() - 10;
    doc.setFontSize(7);
    doc.setTextColor("#999");
    doc.setFont("helvetica", "italic");
    doc.text(`Generated on ${new Date().toLocaleString()}`, margin, footerY);
    doc.text(`© ${orgName}`, pageWidth / 2, footerY, { align: "center" });

    doc.save(`Purchase_Register_${startDate}_${endDate}.pdf`);
    toast.success("PDF exported");
  };

  // ─── Print handler ─────────────────────────────────────────────────
  const handlePrint = () => {
    const content = document.getElementById("purchase-register-content")?.innerHTML;
    if (!content) return;
    const win = window.open("", "_blank", "width=1100,height=750");
    win.document.write(`
      <html><head><title>Purchase Register</title>
      <style>
        body { font-family: Arial, sans-serif; margin: 30px; color: #222; }
        .header { display: flex; align-items: center; border-bottom: 2px solid #0D47A1; padding-bottom: 8px; margin-bottom: 15px; }
        .header .org-name { font-size: 18px; font-weight: 700; color: #0D47A1; }
        .header .org-details { font-size: 10px; color: #555; }
        h1 { text-align: center; color: #0D47A1; font-size: 16px; margin: 10px 0; }
        table { width: 100%; border-collapse: collapse; font-size: 9px; }
        th, td { padding: 4px 6px; border: 1px solid #bbb; text-align: right; }
        th { background-color: #E3F2FD; text-align: left; }
        .summary-card { border: 1px solid #ddd; padding: 10px; margin: 5px 0; border-radius: 6px; display: inline-block; min-width: 120px; }
        .summary-card .label { font-size: 8px; color: #888; }
        .summary-card .value { font-size: 14px; font-weight: 700; }
        .footer { margin-top: 20px; font-size: 8px; color: #888; text-align: center; border-top: 1px solid #ddd; padding-top: 8px; }
      </style></head>
      <body>
        <div class="header"><div><div class="org-name">${org?.company_name || "ShreeVidhya Academy"}</div><div class="org-details">${org?.address || ""}</div><div class="org-details">Ph: ${org?.phone || ""} | Email: ${org?.email || ""}</div></div></div>
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
        <h1 className="text-3xl font-righteous text-primary-dark">Purchase Register</h1>
        <div className="flex flex-wrap gap-2">
          {/* 👇 Send Report button */}
          <button
            onClick={sendReportEmail}
            className="bg-green-600 hover:bg-green-700 text-white px-4 py-2 rounded-lg text-sm flex items-center gap-2"
          >
            <Mail size={16} /> Send Report
          </button>
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
            <Download size={16} /> CSV
          </button>
          <button
            onClick={handleExportPDF}
            className="border border-primary text-primary px-4 py-2 rounded-lg text-sm flex items-center gap-2 hover:bg-primary/10 transition"
          >
            <FileText size={16} /> PDF
          </button>
          <button
            onClick={() => refetch()}
            disabled={isLoading}
            className="border px-4 py-2 rounded-lg text-sm flex items-center gap-2 hover:bg-gray-50 transition disabled:opacity-50"
          >
            <Loader size={16} className={isLoading ? "animate-spin" : ""} />
            Refresh
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
        <div>
          <label className="text-sm font-medium text-secondary-dark">Vendor:</label>
          <select
            value={vendorFilter}
            onChange={(e) => setVendorFilter(e.target.value)}
            className="ml-2 border rounded-lg p-2 text-sm focus:ring-1 focus:ring-primary"
          >
            <option value="">All Vendors</option>
            {vendors.map((v) => (
              <option key={v.id} value={v.id}>{v.vendor_name}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="text-sm font-medium text-secondary-dark">Tax Rate:</label>
          <select
            value={taxRateFilter}
            onChange={(e) => setTaxRateFilter(e.target.value)}
            className="ml-2 border rounded-lg p-2 text-sm focus:ring-1 focus:ring-primary"
          >
            <option value="">All Rates</option>
            {taxRates.map((t) => (
              <option key={t.id} value={t.id}>{t.name} ({t.rate}%)</option>
            ))}
          </select>
        </div>
        <div className="relative flex-1 min-w-[200px]">
          <Search size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-secondary" />
          <input
            type="text"
            placeholder="Search by description, bill no, vendor..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-10 pr-4 py-2 border rounded-lg text-sm focus:ring-1 focus:ring-primary"
          />
        </div>
      </div>

      {/* Content for print */}
      <div id="purchase-register-content">
        {/* Summary Cards */}
        {!isLoading && expenses.length > 0 && (
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-4 mb-6">
            <div className="bg-white rounded-xl shadow-sm p-4 border">
              <p className="text-xs text-secondary-light">Total Taxable</p>
              <p className="text-xl font-bold text-primary-dark">
                ₹ {summaries.totalTaxable.toLocaleString("en-IN")}
              </p>
            </div>
            <div className="bg-white rounded-xl shadow-sm p-4 border">
              <p className="text-xs text-secondary-light">Total GST</p>
              <p className="text-xl font-bold text-blue-700">
                ₹ {summaries.totalGST.toLocaleString("en-IN")}
              </p>
            </div>
            <div className="bg-white rounded-xl shadow-sm p-4 border border-green-200">
              <p className="text-xs text-secondary-light">ITC Claimed</p>
              <p className="text-xl font-bold text-green-700">
                ₹ {summaries.totalITC.toLocaleString("en-IN")}
              </p>
            </div>
            <div className="bg-white rounded-xl shadow-sm p-4 border">
              <p className="text-xs text-secondary-light">Total Amount</p>
              <p className="text-xl font-bold text-indigo-700">
                ₹ {summaries.totalAmount.toLocaleString("en-IN")}
              </p>
            </div>
            <div className="bg-white rounded-xl shadow-sm p-4 border">
              <p className="text-xs text-secondary-light">Invoices</p>
              <p className="text-xl font-bold text-secondary-dark">{summaries.invoiceCount}</p>
            </div>
            <div className="bg-white rounded-xl shadow-sm p-4 border">
              <p className="text-xs text-secondary-light">Vendors</p>
              <p className="text-xl font-bold text-secondary-dark">{summaries.vendorCount}</p>
            </div>
          </div>
        )}

        {/* Tax Rate Breakdown */}
        {summaries.byRate.length > 0 && (
          <div className="bg-white rounded-xl shadow-sm overflow-hidden mb-6">
            <h2 className="text-lg font-semibold p-4 border-b bg-slate-50 flex items-center gap-2">
              <IndianRupee size={18} /> Tax Rate Breakdown
            </h2>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-slate-100">
                  <tr>
                    <th className="p-3 text-left text-sm">Tax Rate</th>
                    <th className="p-3 text-right text-sm">Count</th>
                    <th className="p-3 text-right text-sm">Taxable</th>
                    <th className="p-3 text-right text-sm">GST</th>
                    <th className="p-3 text-right text-sm">ITC</th>
                  </tr>
                </thead>
                <tbody>
                  {summaries.byRate.map((rate, idx) => (
                    <tr key={idx} className="border-t hover:bg-gray-50">
                      <td className="p-3 text-sm">{rate.rateName} ({rate.ratePercent}%)</td>
                      <td className="p-3 text-sm text-right">{rate.count}</td>
                      <td className="p-3 text-sm text-right">₹ {rate.taxable.toLocaleString("en-IN")}</td>
                      <td className="p-3 text-sm text-right">₹ {rate.gst.toLocaleString("en-IN")}</td>
                      <td className="p-3 text-sm text-right">₹ {rate.itc.toLocaleString("en-IN")}</td>
                    </tr>
                  ))}
                  <tfoot className="bg-slate-50 border-t font-medium">
                    <tr>
                      <td className="p-3">Total</td>
                      <td className="p-3 text-right">{expenses.length}</td>
                      <td className="p-3 text-right">₹ {summaries.totalTaxable.toLocaleString("en-IN")}</td>
                      <td className="p-3 text-right">₹ {summaries.totalGST.toLocaleString("en-IN")}</td>
                      <td className="p-3 text-right">₹ {summaries.totalITC.toLocaleString("en-IN")}</td>
                    </tr>
                  </tfoot>
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Vendor Breakdown */}
        {summaries.byVendor.length > 0 && (
          <div className="bg-white rounded-xl shadow-sm overflow-hidden mb-6">
            <h2 className="text-lg font-semibold p-4 border-b bg-slate-50 flex items-center gap-2">
              <Building size={18} /> Vendor Summary
            </h2>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-slate-100">
                  <tr>
                    <th className="p-3 text-left text-sm">Vendor</th>
                    <th className="p-3 text-left text-sm">GSTIN</th>
                    <th className="p-3 text-right text-sm">Count</th>
                    <th className="p-3 text-right text-sm">Taxable</th>
                    <th className="p-3 text-right text-sm">GST</th>
                    <th className="p-3 text-right text-sm">ITC</th>
                  </tr>
                </thead>
                <tbody>
                  {summaries.byVendor.map((vendor, idx) => (
                    <tr key={idx} className="border-t hover:bg-gray-50">
                      <td className="p-3 text-sm">{vendor.vendor_name}</td>
                      <td className="p-3 text-sm">{vendor.gstin || "—"}</td>
                      <td className="p-3 text-sm text-right">{vendor.count}</td>
                      <td className="p-3 text-sm text-right">₹ {vendor.taxable.toLocaleString("en-IN")}</td>
                      <td className="p-3 text-sm text-right">₹ {vendor.gst.toLocaleString("en-IN")}</td>
                      <td className="p-3 text-sm text-right">₹ {vendor.itc.toLocaleString("en-IN")}</td>
                    </tr>
                  ))}
                  <tfoot className="bg-slate-50 border-t font-medium">
                    <tr>
                      <td className="p-3">Total</td>
                      <td className="p-3"></td>
                      <td className="p-3 text-right">{expenses.length}</td>
                      <td className="p-3 text-right">₹ {summaries.totalTaxable.toLocaleString("en-IN")}</td>
                      <td className="p-3 text-right">₹ {summaries.totalGST.toLocaleString("en-IN")}</td>
                      <td className="p-3 text-right">₹ {summaries.totalITC.toLocaleString("en-IN")}</td>
                    </tr>
                  </tfoot>
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Detailed Table */}
        <div className="bg-white rounded-xl shadow-sm overflow-hidden">
          <h2 className="text-lg font-semibold p-4 border-b bg-slate-50 flex items-center gap-2">
            <FileText size={18} /> Detailed Entries
          </h2>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[900px]">
              <thead className="bg-slate-100">
                <tr>
                  <th className="p-3 text-left text-sm">Date</th>
                  <th className="p-3 text-left text-sm">Vendor</th>
                  <th className="p-3 text-left text-sm">Invoice No</th>
                  <th className="p-3 text-left text-sm">Category</th>
                  <th className="p-3 text-left text-sm">Description</th>
                  <th className="p-3 text-right text-sm">Taxable</th>
                  <th className="p-3 text-right text-sm">GST</th>
                  <th className="p-3 text-right text-sm">Total</th>
                  <th className="p-3 text-center text-sm">ITC</th>
                  <th className="p-3 text-left text-sm">Tax Rate</th>
                </tr>
              </thead>
              <tbody>
                {isLoading ? (
                  <tr><td colSpan={10} className="p-6 text-center text-secondary">Loading…</td></tr>
                ) : expenses.length === 0 ? (
                  <tr><td colSpan={10} className="p-6 text-center text-secondary">No expenses found</td></tr>
                ) : (
                  expenses.map((e) => (
                    <tr key={e.id} className="border-t hover:bg-gray-50">
                      <td className="p-3 text-sm">{e.expense_date}</td>
                      <td className="p-3 text-sm">{e.vendors?.vendor_name || "—"}</td>
                      <td className="p-3 text-sm">{e.invoice_number || "—"}</td>
                      <td className="p-3 text-sm">{e.category || "—"}</td>
                      <td className="p-3 text-sm">{e.description || "—"}</td>
                      <td className="p-3 text-sm text-right">₹ {Number(e.amount || 0).toLocaleString("en-IN")}</td>
                      <td className="p-3 text-sm text-right">₹ {Number(e.gst_amount || 0).toLocaleString("en-IN")}</td>
                      <td className="p-3 text-sm text-right font-medium">
                        ₹ {(Number(e.amount || 0) + Number(e.gst_amount || 0)).toLocaleString("en-IN")}
                      </td>
                      <td className="p-3 text-sm text-center">
                        {e.itc_claimed ? (
                          <span className="text-green-600 font-medium">✓</span>
                        ) : (
                          <span className="text-gray-400">—</span>
                        )}
                      </td>
                      <td className="p-3 text-sm">{e.tax_rates?.name || "—"}</td>
                    </tr>
                  ))
                )}
              </tbody>
              {expenses.length > 0 && (
                <tfoot className="bg-slate-50 border-t font-medium">
                  <tr>
                    <td colSpan={5} className="p-3 text-right">Total</td>
                    <td className="p-3 text-right">₹ {summaries.totalTaxable.toLocaleString("en-IN")}</td>
                    <td className="p-3 text-right">₹ {summaries.totalGST.toLocaleString("en-IN")}</td>
                    <td className="p-3 text-right">₹ {summaries.totalAmount.toLocaleString("en-IN")}</td>
                    <td className="p-3 text-center">₹ {summaries.totalITC.toLocaleString("en-IN")}</td>
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
        <div className="fixed bottom-4 right-4 bg-white shadow-lg rounded-lg p-4 flex items-center gap-3 border">
          <Loader className="w-5 h-5 animate-spin text-primary" />
          <span className="text-sm text-secondary-dark">Loading purchase data...</span>
        </div>
      )}
    </>
  );
}