// src/pages/PurchaseOrders.jsx
import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { Plus, Eye, Trash2, Truck, Edit3, Mail, Printer } from "lucide-react";
import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";
import toast from "react-hot-toast";

import BackButton from "../components/BackButton";
import {
  getPurchaseOrders,
  receivePO,
  deletePO,
} from "../services/poService";
import { useOrg } from "../context/OrganizationContext";
import { useTheme } from "../context/ThemeContext";               // ✅ dynamic theme
import { supabase } from "../api/supabase";
import { sendEmail, sendTemplateEmail } from "../services/emailService";

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

export default function PurchaseOrders() {
  const queryClient = useQueryClient();
  const [statusFilter, setStatusFilter] = useState("");

  const { org, branch, selectedFinancialYear } = useOrg();
  const theme = useTheme();                                     // ✅ theme hook
  const branchId = branch?.id;
  const financialYearId = selectedFinancialYear?.id;
  const ctx = { branchId, financialYearId };

  const headingFont = theme?.font_heading || "Righteous";
  const bodyFont = theme?.font_body || "Montserrat";

  // ─── Helper: get admin emails ────────────────────────────────
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

  // ─── Send Report Email (black & white) ──────────────────────────
  const sendReportEmail = async () => {
    if (pos.length === 0) {
      alert("No purchase orders to send.");
      return;
    }
    try {
      const adminEmails = await getAdminEmails();
      if (adminEmails.length === 0) {
        alert("No admin emails found.");
        return;
      }

      let tableRows = pos.map((po) => {
        const itemCount = po.purchase_order_items?.length || 0;
        return `
          <tr>
            <td style="padding:4px 8px;border:1px solid #ddd;">${po.po_number}</td>
            <td style="padding:4px 8px;border:1px solid #ddd;">${po.vendor}</td>
            <td style="padding:4px 8px;border:1px solid #ddd;">${po.order_date}</td>
            <td style="padding:4px 8px;border:1px solid #ddd;">${po.expected_date || '—'}</td>
            <td style="padding:4px 8px;border:1px solid #ddd;text-align:center;">${itemCount}</td>
            <td style="padding:4px 8px;border:1px solid #ddd;">
              <span style="background:#f0f0f0;color:#000;padding:2px 8px;border-radius:12px;font-size:10px;font-weight:600;">${po.status}</span>
            </td>
          </tr>`;
      }).join('');

      const totalPOs = pos.length;
      const totalItems = pos.reduce((sum, po) => sum + (po.purchase_order_items?.length || 0), 0);

      const htmlBody = `
        <div style="font-family:Arial,sans-serif;max-width:800px;margin:0 auto;">
          <h2 style="color:#000;">Purchase Order Report</h2>
          <p><strong>Branch:</strong> ${branch?.branch_name || 'N/A'}</p>
          <p><strong>Status Filter:</strong> ${statusFilter || 'All'}</p>
          <p><strong>Total POs:</strong> ${totalPOs}</p>
          <p><strong>Total Items:</strong> ${totalItems}</p>
          <hr />
          <table style="width:100%;border-collapse:collapse;font-size:11px;border:1px solid #ddd;">
            <thead style="background:#f5f5f5;">
              <tr>
                <th style="padding:4px 8px;border:1px solid #ddd;text-align:left;">PO Number</th>
                <th style="padding:4px 8px;border:1px solid #ddd;text-align:left;">Vendor</th>
                <th style="padding:4px 8px;border:1px solid #ddd;text-align:left;">Order Date</th>
                <th style="padding:4px 8px;border:1px solid #ddd;text-align:left;">Expected</th>
                <th style="padding:4px 8px;border:1px solid #ddd;text-align:center;">Items</th>
                <th style="padding:4px 8px;border:1px solid #ddd;text-align:left;">Status</th>
              </tr>
            </thead>
            <tbody>
              ${tableRows}
            </tbody>
          </table>
          <p style="color:#888;font-size:10px;margin-top:20px;">Computer‑generated report from ${org?.company_name || 'Academy'}</p>
        </div>`;

      await sendEmail({
        to: adminEmails,
        subject: `Purchase Order Report - ${new Date().toLocaleDateString()}`,
        html: htmlBody,
      });
      alert("Report sent to admins.");
    } catch (err) {
      console.error("Failed to send report:", err);
      toast.error("Failed to send report.");
    }
  };

  // ─── Send PO email to vendor (unchanged) ────────────────────────
  const sendPOEmail = async (po) => {
    if (!po.vendor_email) {
      toast.error("No vendor email address.");
      return;
    }
    try {
      const items = po.purchase_order_items || [];
      const itemsList = items
        .map(item => {
          const name = item.inventory_items?.item_name || 'Unknown Item';
          return `${name} x ${item.quantity_ordered} @ ₹${item.unit_price}`;
        })
        .join('; ');
      const subtotal = items.reduce((s, i) => s + i.quantity_ordered * i.unit_price, 0);
      const grandTotal = po.total_amount || subtotal;

      const context = {
        academyName: org?.company_name || "Academy",
        vendor_name: po.vendor || 'Vendor',
        po_number: po.po_number,
        order_date: po.order_date,
        expected_date: po.expected_date || 'Not specified',
        total_amount: grandTotal,
        items_list: itemsList || 'No items',
      };

      await sendTemplateEmail({
        to: po.vendor_email,
        organizationId: org?.id,
        slug: "po_sent",
        context,
        branchId,
      });

      toast.success(`PO sent to ${po.vendor_email}`);
    } catch (err) {
      console.error("Email error:", err);
      toast.error("Failed to send PO email.");
    }
  };

  // ─── Data fetching (unchanged) ──────────────────────────────────
  const { data: pos = [], isLoading } = useQuery({
    queryKey: ["purchase-orders", statusFilter, branchId, financialYearId],
    queryFn: () => getPurchaseOrders({ status: statusFilter }, branchId, financialYearId),
    enabled: !!branchId && !!financialYearId,
    staleTime: 2 * 60 * 1000,
  });

  // ─── Mutations (unchanged) ──────────────────────────────────────
  const receiveMut = useMutation({
    mutationFn: (poId) => receivePO(poId, ctx),
    onSuccess: () => {
      toast.success("PO received – stock updated");
      queryClient.invalidateQueries(["purchase-orders"]);
    },
    onError: () => toast.error("Failed to receive PO"),
  });

  const deleteMut = useMutation({
    mutationFn: (poId) => deletePO(poId, branchId, financialYearId),
    onSuccess: () => {
      toast.success("PO deleted");
      queryClient.invalidateQueries(["purchase-orders"]);
    },
    onError: () => toast.error("Delete failed"),
  });

  // ─── PDF Export (landscape, black & white) ────────────────────────
  const handlePrintPDF = async () => {
    if (pos.length === 0) return;

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
    doc.text("Purchase Orders", pageWidth / 2, y, { align: "center" });
    y += 10;

    // Table
    const tableRows = pos.map((po) => [
      po.po_number,
      po.vendor,
      po.order_date,
      po.expected_date || "—",
      po.purchase_order_items?.length || 0,
      po.status,
    ]);

    autoTable(doc, {
      startY: y,
      head: [["PO Number", "Vendor", "Date", "Expected", "Items", "Status"]],
      body: tableRows,
      theme: "plain",
      styles: { fontSize: 9, textColor: [0,0,0], fillColor: [255,255,255], lineColor: [0,0,0], lineWidth: 0.2 },
      headStyles: { fillColor: [255,255,255], textColor: [0,0,0], fontStyle: "bold", lineWidth: 0.2, lineColor: [0,0,0] },
      columnStyles: {
        0: { cellWidth: 35 },
        1: { cellWidth: 55, halign: "left" },
        2: { cellWidth: 30 },
        3: { cellWidth: 30 },
        4: { cellWidth: 20, halign: "center" },
        5: { cellWidth: 30 },
      },
      margin: { left: margin, right: margin },
    });

    y = doc.lastAutoTable.finalY + 10;

    // Footer
    const footerY = pageHeight - margin - 5;
    doc.setFontSize(7);
    doc.setTextColor("#000000");
    doc.setFont("helvetica", "italic");
    doc.text(`Generated on ${new Date().toLocaleString()}`, margin, footerY);
    doc.text(`© ${org?.company_name || "Academy"}`, pageWidth / 2, footerY, { align: "center" });

    doc.save(`Purchase_Orders_${new Date().toISOString().slice(0, 10)}.pdf`);
  };

  return (
    <>
      <BackButton to="/accounting" label="Finance & Accounting" />
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-6 gap-3">
        <h1
          className="text-3xl font-bold text-primary"
          style={{ fontFamily: headingFont }}
        >
          Purchase Orders
        </h1>
        <div className="flex gap-2">
          <button
            onClick={sendReportEmail}
            className="inline-flex items-center gap-2 px-4 py-2.5 bg-accent hover:bg-accent-dark text-white rounded-lg text-sm font-medium transition-colors"
            style={{ fontFamily: bodyFont }}
          >
            <Mail size={16} /> Send Report
          </button>
          <button
            onClick={handlePrintPDF}
            className="inline-flex items-center gap-2 px-4 py-2.5 bg-primary hover:bg-accent text-white rounded-lg text-sm font-medium transition-colors"
            style={{ fontFamily: bodyFont }}
          >
            <Printer size={16} /> Print PDF
          </button>
          <Link
            to="/purchase-orders/new"
            className="inline-flex items-center gap-2 px-4 py-2.5 bg-primary hover:bg-accent text-white rounded-lg text-sm font-medium transition-colors"
            style={{ fontFamily: bodyFont }}
          >
            <Plus size={16} /> New PO
          </Link>
        </div>
      </div>

      <div className="mb-4">
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="border border-primary-bg bg-white text-primary-dark rounded-lg p-2.5 text-sm"
          style={{ fontFamily: bodyFont }}
        >
          <option value="">All Statuses</option>
          <option value="Draft">Draft</option>
          <option value="Sent">Sent</option>
          <option value="Received">Received</option>
          <option value="Partially Received">Partially Received</option>
          <option value="Cancelled">Cancelled</option>
        </select>
      </div>

      <div className="bg-white rounded-xl shadow-sm overflow-hidden border border-primary-bg">
        <table className="w-full">
          <thead className="bg-primary-bg">
            <tr>
              <th
                className="p-3 text-left text-sm font-medium text-primary-dark uppercase"
                style={{ fontFamily: bodyFont }}
              >
                PO Number
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
                className="p-3 text-left text-sm font-medium text-primary-dark uppercase"
                style={{ fontFamily: bodyFont }}
              >
                Expected
              </th>
              <th
                className="p-3 text-right text-sm font-medium text-primary-dark uppercase"
                style={{ fontFamily: bodyFont }}
              >
                Items
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
                  colSpan={7}
                  className="p-6 text-center text-primary-dark/60"
                  style={{ fontFamily: bodyFont }}
                >
                  Loading…
                </td>
              </tr>
            ) : pos.length === 0 ? (
              <tr>
                <td
                  colSpan={7}
                  className="p-6 text-center text-primary-dark/60"
                  style={{ fontFamily: bodyFont }}
                >
                  No purchase orders.
                </td>
              </tr>
            ) : (
              pos.map((po) => (
                <tr
                  key={po.id}
                  className="border-t border-primary-bg hover:bg-primary-bg transition-colors"
                >
                  <td className="p-3 text-sm font-medium text-primary" style={{ fontFamily: bodyFont }}>
                    {po.po_number}
                  </td>
                  <td className="text-sm text-primary-dark" style={{ fontFamily: bodyFont }}>
                    {po.vendor}
                  </td>
                  <td className="text-sm text-primary-dark" style={{ fontFamily: bodyFont }}>
                    {po.order_date}
                  </td>
                  <td className="text-sm text-primary-dark" style={{ fontFamily: bodyFont }}>
                    {po.expected_date || "—"}
                  </td>
                  <td className="text-sm text-right text-primary-dark" style={{ fontFamily: bodyFont }}>
                    {po.purchase_order_items?.length || 0}
                  </td>
                  <td className="text-sm">
                    <span
                      className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                        po.status === "Received"
                          ? "bg-primary-bg text-primary-dark"
                          : po.status === "Partially Received"
                          ? "bg-accent-bg text-accent-dark"
                          : po.status === "Sent"
                          ? "bg-primary-bg/50 text-primary-dark"
                          : po.status === "Cancelled"
                          ? "bg-accent text-white"
                          : "bg-primary-bg/50 text-primary-dark"
                      }`}
                    >
                      {po.status}
                    </span>
                  </td>
                  <td className="text-sm">
                    <div className="flex gap-2">
                      <button
                        onClick={() => sendPOEmail(po)}
                        className="text-primary hover:underline"
                        title="Send PO to vendor"
                        disabled={!po.vendor_email}
                      >
                        <Mail size={15} />
                      </button>
                      <Link
                        to={`/purchase-orders/${po.id}/edit`}
                        className="text-primary hover:underline"
                      >
                        <Edit3 size={15} />
                      </Link>
                      <Link
                        to={`/purchase-orders/${po.id}`}
                        className="text-primary hover:underline"
                      >
                        <Eye size={15} />
                      </Link>
                      {po.status !== "Received" && po.status !== "Cancelled" && (
                        <button
                          onClick={() => receiveMut.mutate(po.id)}
                          className="text-accent hover:underline"
                          title="Receive"
                        >
                          <Truck size={15} />
                        </button>
                      )}
                      <button
                        onClick={() => {
                          if (window.confirm("Delete?")) deleteMut.mutate(po.id);
                        }}
                        className="text-accent-dark hover:underline"
                      >
                        <Trash2 size={15} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </>
  );
}