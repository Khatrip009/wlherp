// src/pages/PurchaseInvoices.jsx
import { useState } from "react";
import { Link } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  getPurchaseInvoices,
  deletePurchaseInvoice,
  finalizePurchaseInvoice,
} from "../services/purchaseInvoiceService";
import { supabase } from "../api/supabase";
import { useOrg } from "../context/OrganizationContext";
import { useTheme } from "../context/ThemeContext";               // ✅ dynamic theme
import toast from "react-hot-toast";
import { sendEmail } from "../services/emailService";
import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";

import {
  Search,
  Plus,
  Eye,
  Edit3,
  Trash2,
  CheckCircle,
  Mail,
  Printer,
} from "lucide-react";

/* ─── PDF helpers (unchanged) ──────────────────────────────── */
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

export default function PurchaseInvoices() {
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [vendorFilter, setVendorFilter] = useState("");

  const { org, branch, selectedFinancialYear } = useOrg();
  const theme = useTheme();                                     // ✅ theme hook
  const branchId = branch?.id;
  const financialYearId = selectedFinancialYear?.id;
  const ctx = { branchId, financialYearId };

  const headingFont = theme?.font_heading || "Righteous";
  const bodyFont = theme?.font_body || "Montserrat";

  // ─── Helper: get admin emails ──────────────────────────────
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

  // ─── Send report email ─────────────────────────────────────
  const sendReportEmail = async () => {
    if (invoices.length === 0) {
      alert("No invoices to send.");
      return;
    }
    try {
      const adminEmails = await getAdminEmails();
      if (adminEmails.length === 0) {
        alert("No admin emails found.");
        return;
      }

      let tableRows = invoices.map((inv) => {
        const vendorName = inv.vendors?.vendor_name || "—";
        const statusColor = inv.status === "Final" ? "#2e7d32" : inv.status === "Draft" ? "#e65100" : "#c62828";
        const statusBg = inv.status === "Final" ? "#e8f5e9" : inv.status === "Draft" ? "#fff3e0" : "#ffebee";
        return `
          <tr>
            <td style="padding:4px 8px;border:1px solid #ddd;">${inv.invoice_number}</td>
            <td style="padding:4px 8px;border:1px solid #ddd;">${vendorName}</td>
            <td style="padding:4px 8px;border:1px solid #ddd;">${inv.invoice_date}</td>
            <td style="padding:4px 8px;border:1px solid #ddd;text-align:right;">₹ ${Number(inv.grand_total).toLocaleString('en-IN')}</td>
            <td style="padding:4px 8px;border:1px solid #ddd;">
              <span style="background:${statusBg};color:${statusColor};padding:2px 8px;border-radius:12px;font-size:10px;font-weight:600;">${inv.status}</span>
            </td>
          </tr>`;
      }).join('');

      const totalAmount = invoices.reduce((sum, inv) => sum + Number(inv.grand_total), 0);
      const draftCount = invoices.filter(inv => inv.status === "Draft").length;
      const finalCount = invoices.filter(inv => inv.status === "Final").length;

      const htmlBody = `
        <div style="font-family:Arial,sans-serif;max-width:800px;margin:0 auto;">
          <h2 style="color:#000;">Purchase Invoice Report</h2>
          <p><strong>Branch:</strong> ${branch?.branch_name || 'N/A'}</p>
          <p><strong>Filters:</strong> Status: ${statusFilter || 'All'} | Vendor: ${vendorFilter || 'All'} | Search: ${search || 'None'}</p>
          <p><strong>Total Invoices:</strong> ${invoices.length}</p>
          <p><strong>Total Amount:</strong> ₹ ${totalAmount.toLocaleString('en-IN')}</p>
          <p><strong>Draft:</strong> ${draftCount} | <strong>Final:</strong> ${finalCount}</p>
          <hr />
          <table style="width:100%;border-collapse:collapse;font-size:11px;border:1px solid #ddd;">
            <thead style="background:#f5f5f5;">
              <tr>
                <th style="padding:4px 8px;border:1px solid #ddd;text-align:left;">Invoice No</th>
                <th style="padding:4px 8px;border:1px solid #ddd;text-align:left;">Vendor</th>
                <th style="padding:4px 8px;border:1px solid #ddd;text-align:left;">Date</th>
                <th style="padding:4px 8px;border:1px solid #ddd;text-align:right;">Grand Total</th>
                <th style="padding:4px 8px;border:1px solid #ddd;text-align:left;">Status</th>
              </tr>
            </thead>
            <tbody>
              ${tableRows}
            </tbody>
            <tfoot style="font-weight:bold;background:#f5f5f5;">
              <tr>
                <td colspan="3" style="padding:4px 8px;border:1px solid #ddd;text-align:right;">Grand Total</td>
                <td style="padding:4px 8px;border:1px solid #ddd;text-align:right;">₹ ${totalAmount.toLocaleString('en-IN')}</td>
                <td></td>
              </tr>
            </tfoot>
          </table>
          <p style="color:#888;font-size:10px;margin-top:20px;">Computer‑generated report from ${org?.company_name || 'Academy'}</p>
        </div>`;

      await sendEmail({
        to: adminEmails,
        subject: `Purchase Invoice Report - ${new Date().toLocaleDateString()}`,
        html: htmlBody,
      });
      alert("Report sent to admins.");
    } catch (err) {
      console.error("Failed to send report:", err);
      toast.error("Failed to send report.");
    }
  };

  // ─── Vendors dropdown ──────────────────────────────────────
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

  // ─── Purchase invoices ──────────────────────────────────────
  const { data: invoices = [], isLoading } = useQuery({
    queryKey: ["purchase-invoices", search, statusFilter, vendorFilter, branchId, financialYearId],
    queryFn: () => getPurchaseInvoices({ search, status: statusFilter, vendor_id: vendorFilter }, branchId, financialYearId),
    enabled: !!branchId && !!financialYearId,
    staleTime: 2 * 60 * 1000,
  });

  // ─── Mutations ──────────────────────────────────────────────
  const deleteMutation = useMutation({
    mutationFn: (id) => deletePurchaseInvoice(id, branchId, financialYearId),
    onSuccess: () => {
      toast.success("Invoice deleted");
      queryClient.invalidateQueries({ queryKey: ["purchase-invoices"] });
    },
    onError: (err) => toast.error(err.message),
  });

  const finalizeMutation = useMutation({
    mutationFn: (id) => finalizePurchaseInvoice(id, ctx),
    onSuccess: () => {
      toast.success("Invoice finalized");
      queryClient.invalidateQueries({ queryKey: ["purchase-invoices"] });
    },
    onError: (err) => toast.error(err.message),
  });

  const handleDelete = (id) => {
    if (window.confirm("Delete this invoice?")) deleteMutation.mutate(id);
  };

  const handleFinalize = (id) => {
    if (window.confirm("Finalize this invoice? This will update stock and create journal entry.")) {
      finalizeMutation.mutate(id);
    }
  };

  // ─── PDF Export (all black, landscape) ─────────────────────
  const handlePrintPDF = async () => {
    if (invoices.length === 0) return;

    const doc = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4" });
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
    doc.text("Purchase Invoices", pageWidth / 2, y, { align: "center" });
    y += 8;

    // Table
    const tableRows = invoices.map((inv) => [
      inv.invoice_number,
      inv.vendors?.vendor_name || "—",
      inv.invoice_date,
      inv.grand_total,
      inv.status,
    ]);

    autoTable(doc, {
      startY: y,
      head: [["Invoice No", "Vendor", "Date", "Grand Total", "Status"]],
      body: tableRows,
      theme: "plain",
      styles: { fontSize: 9, textColor: [0,0,0], fillColor: [255,255,255], lineColor: [0,0,0], lineWidth: 0.2 },
      headStyles: { fillColor: [255,255,255], textColor: [0,0,0], fontStyle: "bold", lineWidth: 0.2, lineColor: [0,0,0] },
      columnStyles: {
        0: { cellWidth: 40 },
        1: { cellWidth: 55, halign: "left" },
        2: { cellWidth: 30 },
        3: { cellWidth: 40, halign: "right" },
        4: { cellWidth: 30 },
      },
      margin: { left: margin, right: margin },
      didDrawCell: (data) => {
        if (data.column.index === 3 && typeof data.cell.raw === "number") {
          drawCurrency(doc, data.cell.raw, data.cell.x + data.cell.width - 2, data.cell.y + data.cell.height / 2 + 1.5, 9, "right", "#000");
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

    doc.save(`Purchase_Invoices.pdf`);
  };

  return (
    <>
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-6 gap-3">
        <h1
          className="text-3xl font-bold text-primary"
          style={{ fontFamily: headingFont }}
        >
          Purchase Invoices
        </h1>
        <div className="flex gap-2">
          <button
            onClick={sendReportEmail}
            className="bg-accent hover:bg-accent-dark text-white px-4 py-2 rounded-lg text-sm flex items-center gap-2 transition-colors"
            style={{ fontFamily: bodyFont }}
          >
            <Mail size={16} /> Send Report
          </button>
          <button
            onClick={handlePrintPDF}
            className="bg-primary hover:bg-accent text-white px-4 py-2 rounded-lg text-sm flex items-center gap-2 transition-colors"
            style={{ fontFamily: bodyFont }}
          >
            <Printer size={16} /> Print PDF
          </button>
          <Link
            to="/purchase-invoices/new"
            className="bg-primary hover:bg-accent text-white px-4 py-2 rounded-lg text-sm flex items-center gap-2 transition-colors"
            style={{ fontFamily: bodyFont }}
          >
            <Plus size={16} /> New Invoice
          </Link>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-3 mb-4">
        <div className="relative flex-1">
          <Search
            size={18}
            className="absolute left-3 top-1/2 -translate-y-1/2 text-primary-dark/60"
          />
          <input
            type="text"
            placeholder="Search by invoice number, vendor..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-10 pr-4 py-2.5 border border-primary-bg bg-white text-primary-dark rounded-lg text-sm placeholder-primary-dark/40"
            style={{ fontFamily: bodyFont }}
          />
        </div>
        <select
          value={vendorFilter}
          onChange={(e) => setVendorFilter(e.target.value)}
          className="border border-primary-bg bg-white text-primary-dark rounded-lg px-4 py-2.5 text-sm"
          style={{ fontFamily: bodyFont }}
        >
          <option value="">All Vendors</option>
          {vendors.map((v) => (
            <option key={v.id} value={v.id}>
              {v.vendor_name}
            </option>
          ))}
        </select>
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="border border-primary-bg bg-white text-primary-dark rounded-lg px-4 py-2.5 text-sm"
          style={{ fontFamily: bodyFont }}
        >
          <option value="">All Statuses</option>
          <option value="Draft">Draft</option>
          <option value="Final">Final</option>
          <option value="Cancelled">Cancelled</option>
        </select>
      </div>

      {/* Table */}
      <div className="bg-white rounded-xl shadow-sm overflow-hidden border border-primary-bg">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[700px]">
            <thead className="bg-primary-bg">
              <tr>
                <th
                  className="p-3 text-left text-sm font-medium text-primary-dark uppercase"
                  style={{ fontFamily: bodyFont }}
                >
                  Invoice No
                </th>
                <th
                  className="p-3 text-left text-sm font-medium text-primary-dark uppercase"
                  style={{ fontFamily: bodyFont }}
                >
                  Vendor
                </th>
                <th
                  className="p-3 text-left text-sm font-medium text-primary-dark uppercase"
                  style={{ fontFamily: bodyFont }}
                >
                  Date
                </th>
                <th
                  className="p-3 text-right text-sm font-medium text-primary-dark uppercase"
                  style={{ fontFamily: bodyFont }}
                >
                  Grand Total
                </th>
                <th
                  className="p-3 text-left text-sm font-medium text-primary-dark uppercase"
                  style={{ fontFamily: bodyFont }}
                >
                  Status
                </th>
                <th
                  className="p-3 text-left text-sm font-medium text-primary-dark uppercase"
                  style={{ fontFamily: bodyFont }}
                >
                  Actions
                </th>
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                <tr>
                  <td
                    colSpan={6}
                    className="p-6 text-center text-primary-dark/60"
                    style={{ fontFamily: bodyFont }}
                  >
                    Loading…
                  </td>
                </tr>
              ) : invoices.length === 0 ? (
                <tr>
                  <td
                    colSpan={6}
                    className="p-6 text-center text-primary-dark/60"
                    style={{ fontFamily: bodyFont }}
                  >
                    No purchase invoices.
                  </td>
                </tr>
              ) : (
                invoices.map((inv) => (
                  <tr
                    key={inv.id}
                    className="border-t border-primary-bg hover:bg-primary-bg transition-colors"
                  >
                    <td className="p-3 text-sm font-medium text-primary" style={{ fontFamily: bodyFont }}>
                      {inv.invoice_number}
                    </td>
                    <td className="p-3 text-sm text-primary-dark" style={{ fontFamily: bodyFont }}>
                      {inv.vendors?.vendor_name}
                    </td>
                    <td className="p-3 text-sm text-primary-dark" style={{ fontFamily: bodyFont }}>
                      {inv.invoice_date}
                    </td>
                    <td className="p-3 text-right text-sm font-medium text-primary" style={{ fontFamily: bodyFont }}>
                      ₹ {Number(inv.grand_total).toLocaleString("en-IN")}
                    </td>
                    <td className="p-3 text-sm">
                      <span
                        className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                          inv.status === "Final"
                            ? "bg-primary-bg text-primary-dark"
                            : inv.status === "Draft"
                            ? "bg-accent-bg text-accent-dark"
                            : "bg-accent text-white"
                        }`}
                      >
                        {inv.status}
                      </span>
                    </td>
                    <td className="p-3 text-sm">
                      <div className="flex gap-2">
                        <Link to={`/purchase-invoices/${inv.id}`} className="text-primary hover:underline">
                          <Eye size={15} />
                        </Link>
                        {inv.status === "Draft" && (
                          <>
                            <Link to={`/purchase-invoices/${inv.id}/edit`} className="text-primary hover:underline">
                              <Edit3 size={15} />
                            </Link>
                            <button
                              onClick={() => handleFinalize(inv.id)}
                              className="text-accent hover:underline"
                              title="Finalize"
                            >
                              <CheckCircle size={15} />
                            </button>
                            <button
                              onClick={() => handleDelete(inv.id)}
                              className="text-accent-dark hover:underline"
                            >
                              <Trash2 size={15} />
                            </button>
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}