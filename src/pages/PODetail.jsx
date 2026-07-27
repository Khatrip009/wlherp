// src/pages/PODetail.jsx
import { useState } from "react";
import { useParams, Link } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import toast from "react-hot-toast";
import { ArrowLeft, Printer, Truck, Mail } from "lucide-react";
import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";
import { supabase } from "../api/supabase";
import { receivePO } from "../services/poService";
import { useOrg } from "../context/OrganizationContext";
import { sendTemplateEmail } from "../services/emailService";

/* ─── PDF helpers ─────────────────────────────────────── */
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

function numberToWords(num) {
  const a = [
    "", "One", "Two", "Three", "Four", "Five", "Six", "Seven", "Eight", "Nine", "Ten",
    "Eleven", "Twelve", "Thirteen", "Fourteen", "Fifteen", "Sixteen", "Seventeen", "Eighteen", "Nineteen"
  ];
  const b = ["", "", "Twenty", "Thirty", "Forty", "Fifty", "Sixty", "Seventy", "Eighty", "Ninety"];
  function convert(n) {
    if (n < 20) return a[n];
    if (n < 100) return b[Math.floor(n / 10)] + (n % 10 ? " " + a[n % 10] : "");
    if (n < 1000) return a[Math.floor(n / 100)] + " Hundred" + (n % 100 ? " and " + convert(n % 100) : "");
    if (n < 100000) return convert(Math.floor(n / 1000)) + " Thousand" + (n % 1000 ? " " + convert(n % 1000) : "");
    if (n < 10000000) return convert(Math.floor(n / 100000)) + " Lakh" + (n % 100000 ? " " + convert(n % 100000) : "");
    return convert(Math.floor(n / 10000000)) + " Crore" + (n % 10000000 ? " " + convert(n % 10000000) : "");
  }
  return num === 0 ? "Zero" : convert(num);
}

export default function PODetail() {
  const { id } = useParams();
  const queryClient = useQueryClient();

  const { org, branch, selectedFinancialYear } = useOrg();
  const branchId = branch?.id;
  const financialYearId = selectedFinancialYear?.id;
  const context = { branchId, financialYearId };

  // ─── Fetch PO ────────────────────────────────────────────
  const { data: po, isLoading } = useQuery({
    queryKey: ["purchase-order", id, branchId, financialYearId],
    queryFn: async () => {
      const { data } = await supabase
        .from("purchase_orders")
        .select(
          `*,
          purchase_order_items(
            *,
            inventory_items(item_name, unit),
            tax_rates(name, rate)
          )`
        )
        .eq("id", id)
        .eq("branch_id", branchId)
        .eq("financial_year_id", financialYearId)
        .single();
      return data;
    },
    enabled: !!id && !!branchId && !!financialYearId,
  });

  // ─── Receive PO mutation ─────────────────────────────────
  const receiveMut = useMutation({
    mutationFn: () => receivePO(id, context),
    onSuccess: () => {
      toast.success("PO received – stock updated");
      queryClient.invalidateQueries(["purchase-orders"]);
      queryClient.invalidateQueries(["purchase-order", id]);
    },
    onError: () => toast.error("Receive failed"),
  });

  // ─── Email PO to vendor ──────────────────────────────────
  const sendPOEmail = async () => {
    if (!po) return;
    if (!po.vendor_email) {
      toast.error("No vendor email address found.");
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
      const totalTax = (po.total_amount || 0) - subtotal;
      const grandTotal = po.total_amount || subtotal + totalTax;

      const contextEmail = {
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
        context: contextEmail,
        branchId,
      });

      toast.success(`PO sent to ${po.vendor_email}`);
    } catch (err) {
      console.error("Email error:", err);
      toast.error("Failed to send PO email.");
    }
  };

  // ─── PDF Export (A5 landscape, full-width table, no footer overlap) ──
  const handlePrintPDF = async () => {
    if (!po) return;

    const items = po.purchase_order_items || [];
    const subtotal = items.reduce((s, i) => s + i.quantity_ordered * i.unit_price, 0);
    let totalTax = 0;
    const taxSummary = {};
    items.forEach((item) => {
      const rate = item.tax_rates;
      const ratePercent = rate ? parseFloat(rate.rate) : 0;
      const itemTotal = item.quantity_ordered * item.unit_price;
      const taxAmount = itemTotal * (ratePercent / 100);
      if (!taxSummary[rate?.name || "No Tax"]) {
        taxSummary[rate?.name || "No Tax"] = { ratePercent, taxAmount: 0, taxableValue: 0 };
      }
      taxSummary[rate?.name || "No Tax"].taxAmount += taxAmount;
      taxSummary[rate?.name || "No Tax"].taxableValue += itemTotal;
      totalTax += taxAmount;
    });
    const grandTotal = subtotal + totalTax;

    const doc = new jsPDF({ orientation: "landscape", unit: "mm", format: "a5" });
    const pageWidth = doc.internal.pageSize.getWidth();   // 210
    const pageHeight = doc.internal.pageSize.getHeight(); // 148
    const margin = 10;
    const bottomMargin = 8;   // space reserved for footer
    let y = margin;

    // Logo
    let logoBase64 = null;
    if (org?.logo_dark_url) {
      logoBase64 = await loadImageAsBase64(org.logo_dark_url);
    }

    // Header
    const logoWidth = 25, logoHeight = 10;
    if (logoBase64) {
      doc.addImage(logoBase64, "PNG", margin, y, logoWidth, logoHeight);
    }
    const textX = margin + (logoBase64 ? logoWidth + 3 : 0);
    const textY = y + 1;

    doc.setFont("helvetica", "bold");
    doc.setFontSize(12);
    doc.setTextColor("#000000");
    doc.text(org?.company_name || "Academy", textX, textY);

    doc.setFont("helvetica", "normal");
    doc.setFontSize(6);
    doc.setTextColor("#000000");
    let detailY = textY + 3.5;
    if (org?.address) {
      const addrLines = doc.splitTextToSize(org.address, pageWidth - textX - margin - 10);
      doc.text(addrLines, textX, detailY);
      detailY += addrLines.length * 3 + 1;
    }
    if (org?.gstin) { doc.text(`GSTIN: ${org.gstin}`, textX, detailY); detailY += 3.5; }
    if (org?.phone) { doc.text(`Phone: ${org.phone}`, textX, detailY); detailY += 3.5; }
    if (org?.email) { doc.text(`Email: ${org.email}`, textX, detailY); detailY += 3.5; }

    const headerHeight = Math.max(logoHeight + 3, detailY - textY + 3);
    y += headerHeight + 2;
    doc.setDrawColor("#000000");
    doc.line(margin, y, pageWidth - margin, y);
    y += 4;

    // Title & PO Number
    doc.setFontSize(14);
    doc.setFont("helvetica", "bold");
    doc.text("Purchase Order", pageWidth / 2, y, { align: "center" });
    y += 6;
    doc.setFontSize(9);
    doc.setFont("helvetica", "normal");
    doc.text(po.po_number, pageWidth / 2, y, { align: "center" });
    y += 8;

    // Two‑column details
    const leftX = margin;
    const rightX = pageWidth / 2;

    doc.setFontSize(8);
    doc.setFont("helvetica", "bold");
    doc.text("Vendor Details", leftX, y);
    doc.text("Order Info", rightX, y);
    y += 5;

    doc.setFont("helvetica", "normal");
    doc.setFontSize(7);
    doc.text(po.vendor || "N/A", leftX, y);
    doc.text(`Order Date: ${po.order_date}`, rightX, y);
    y += 4;
    if (po.vendor_address) {
      doc.text(po.vendor_address, leftX, y);
      y += 4;
    }
    if (po.vendor_gstin) {
      doc.text(`GSTIN: ${po.vendor_gstin}`, leftX, y);
      y += 4;
    }
    doc.text(`Expected: ${po.expected_date || "—"}`, rightX, y);
    y += 4;
    doc.text(`Status: ${po.status}`, rightX, y);
    y += 4;

    if (po.notes) {
      doc.text(`Notes: ${po.notes}`, margin, y);
      y += 5;
    }

    // Items table (full-width, column widths sum to available width)
    const availableWidth = pageWidth - 2 * margin; // 190 mm
    const tableRows = items.map((item, idx) => {
      const rate = item.tax_rates;
      const ratePercent = rate ? parseFloat(rate.rate) : 0;
      const itemTotal = item.quantity_ordered * item.unit_price;
      const taxAmount = itemTotal * (ratePercent / 100);
      const cgst = taxAmount / 2;
      const sgst = taxAmount / 2;
      return [
        idx + 1,
        item.inventory_items?.item_name || `Item #${item.item_id}`,
        item.quantity_ordered,
        item.unit_price,
        ratePercent > 0 ? `${ratePercent}%` : "—",
        cgst,
        sgst,
        itemTotal + taxAmount,
      ];
    });

    autoTable(doc, {
      startY: y,
      head: [["#", "Item", "Qty", "Unit Price", "Tax Rate", "CGST", "SGST", "Total"]],
      body: tableRows,
      theme: "plain",
      styles: { fontSize: 7, textColor: [0,0,0], fillColor: [255,255,255], lineColor: [0,0,0], lineWidth: 0.2 },
      headStyles: { fillColor: [255,255,255], textColor: [0,0,0], fontStyle: "bold", lineWidth: 0.2, lineColor: [0,0,0] },
      columnStyles: {
        0: { cellWidth: 8, halign: "center" },          // #
        1: { cellWidth: 60, halign: "left" },           // Item (was 45)
        2: { cellWidth: 12, halign: "center" },         // Qty
        3: { cellWidth: 22, halign: "right" },          // Unit Price
        4: { cellWidth: 18, halign: "center" },         // Tax Rate
        5: { cellWidth: 22, halign: "right" },          // CGST
        6: { cellWidth: 22, halign: "right" },          // SGST
        7: { cellWidth: 26, halign: "right" },          // Total
      },
      // total = 8+60+12+22+18+22+22+26 = 190 mm ✅ full available width
      margin: { left: margin, right: margin },
      willDrawCell: (data) => {
        if ([3,5,6,7].includes(data.column.index) && typeof data.cell.raw === "number") {
          data.cell.text = [];
        }
      },
      didDrawCell: (data) => {
        if ([3,5,6,7].includes(data.column.index) && typeof data.cell.raw === "number") {
          drawCurrency(doc, data.cell.raw, data.cell.x + data.cell.width - 2, data.cell.y + data.cell.height / 2 + 1.2, 7, "right", "#000");
        }
      },
    });

    y = doc.lastAutoTable.finalY + 8;

    // Totals
    doc.setFontSize(8);
    doc.setFont("helvetica", "bold");
    doc.text("Subtotal:", pageWidth - margin - 60, y);
    drawCurrency(doc, subtotal, pageWidth - margin, y, 8, "right", "#000");
    y += 6;

    Object.entries(taxSummary).forEach(([name, data]) => {
      doc.setFont("helvetica", "normal");
      doc.text(`${name}:`, pageWidth - margin - 60, y);
      drawCurrency(doc, data.taxAmount, pageWidth - margin, y, 8, "right", "#000");
      y += 6;
    });

    doc.setFont("helvetica", "bold");
    doc.setFontSize(10);
    doc.text("Grand Total:", pageWidth - margin - 60, y);
    drawCurrency(doc, grandTotal, pageWidth - margin, y, 10, "right", "#000");
    y += 6;

    // Amount in words
    doc.setFontSize(7);
    doc.setFont("helvetica", "italic");
    doc.text(`Amount in Words: ${numberToWords(Math.round(grandTotal))} Only`, margin, y);
    y += 10;

    // Terms
    doc.setFontSize(6.5);
    doc.setFont("helvetica", "normal");
    doc.text("Terms & Conditions:", margin, y);
    y += 4;
    const terms = [
      "1. All prices are inclusive of taxes unless specified otherwise.",
      "2. Delivery must be made within the expected date.",
      "3. Goods once received will not be returned unless defective.",
      "4. Payment is due within 15 days of invoice receipt.",
      "5. Any discrepancies must be reported within 48 hours of delivery.",
    ];
    terms.forEach(line => {
      doc.text(line, margin, y);
      y += 3.5;
    });

    // Signatures
    y += 8;
    // Ensure there is enough space for signatures + footer. If not, add a new page.
    if (y + 20 > pageHeight - bottomMargin) {
      doc.addPage();
      y = margin;
    }
    doc.setDrawColor("#000000");
    doc.line(margin, y, margin + 50, y);
    doc.line(pageWidth - margin - 50, y, pageWidth - margin, y);
    y += 3;
    doc.setFontSize(7);
    doc.text("Authorized Signatory", margin, y, { align: "center" });
    doc.text("Vendor / Supplier", pageWidth - margin - 50, y, { align: "center" });

    // Footer (always at the bottom of the current page)
    const footerY = pageHeight - bottomMargin;
    // If the signatures pushed us too close, we already moved to a new page.
    // Just draw the footer at the correct position.
    doc.setFontSize(6);
    doc.setTextColor("#000000");
    doc.setFont("helvetica", "italic");
    doc.text(`Generated on ${new Date().toLocaleString()}`, margin, footerY);
    doc.text(`© ${org?.company_name || "Academy"}`, pageWidth / 2, footerY, { align: "center" });

    doc.save(`PO_${po.po_number}.pdf`);
  };

  if (isLoading) return <div className="p-8 text-center text-gray-500">Loading PO…</div>;
  if (!po) return <div className="p-8 text-center text-red-600">PO not found</div>;

  const items = po.purchase_order_items || [];
  const subtotal = items.reduce((s, i) => s + i.quantity_ordered * i.unit_price, 0);
  let totalTax = 0;
  const taxSummary = {};
  items.forEach((item) => {
    const rate = item.tax_rates;
    const ratePercent = rate ? parseFloat(rate.rate) : 0;
    const itemTotal = item.quantity_ordered * item.unit_price;
    const taxAmount = itemTotal * (ratePercent / 100);
    if (!taxSummary[rate?.name || "No Tax"]) {
      taxSummary[rate?.name || "No Tax"] = { ratePercent, taxAmount: 0, taxableValue: 0 };
    }
    taxSummary[rate?.name || "No Tax"].taxAmount += taxAmount;
    taxSummary[rate?.name || "No Tax"].taxableValue += itemTotal;
    totalTax += taxAmount;
  });
  const grandTotal = subtotal + totalTax;
  const amountWords = numberToWords(Math.round(grandTotal)) + " Only";

  return (
    <>
      <div className="flex justify-between items-center mb-6 no-print">
        <Link to="/purchase-orders" className="inline-flex items-center gap-2 text-gray-600 hover:text-gray-900 text-sm">
          <ArrowLeft size={18} /> Back to POs
        </Link>
        <div className="flex gap-2">
          <button
            onClick={sendPOEmail}
            disabled={!po.vendor_email}
            className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg text-sm flex items-center gap-2 disabled:opacity-50"
          >
            <Mail size={16} /> Email PO
          </button>
          {po.status !== "Received" && po.status !== "Cancelled" && (
            <button
              onClick={() => receiveMut.mutate()}
              className="bg-green-600 text-white px-4 py-2 rounded-lg text-sm flex items-center gap-2"
            >
              <Truck size={16} /> Receive
            </button>
          )}
          <button
            onClick={handlePrintPDF}
            className="bg-primary text-white px-4 py-2 rounded-lg text-sm flex items-center gap-2"
          >
            <Printer size={16} /> Print PDF
          </button>
        </div>
      </div>

      <div id="po-print-area" className="bg-white rounded-xl p-6 shadow-sm border border-gray-200">
        <h1 className="text-2xl font-bold text-gray-900 text-center mb-2">Purchase Order</h1>
        <p className="text-center text-sm font-medium text-gray-700 mb-6">{po.po_number}</p>

        <div className="two-col" style={{ display: "flex", justifyContent: "space-between", marginBottom: "20px" }}>
          <div style={{ width: "48%" }}>
            <h2 className="font-bold text-sm text-gray-900 mb-1">Vendor Details</h2>
            <p className="text-xs text-gray-700"><strong>{po.vendor}</strong></p>
            {po.vendor_address && <p className="text-xs text-gray-700">{po.vendor_address}</p>}
            {po.vendor_gstin && <p className="text-xs text-gray-700"><strong>GSTIN:</strong> {po.vendor_gstin}</p>}
          </div>
          <div style={{ width: "48%", textAlign: "right" }}>
            <p className="text-xs text-gray-700"><strong>Order Date:</strong> {po.order_date}</p>
            <p className="text-xs text-gray-700"><strong>Expected Date:</strong> {po.expected_date || "—"}</p>
            <p className="text-xs text-gray-700">
              <strong>Status:</strong>{" "}
              <span className={`px-2 py-0.5 rounded-full text-xs ${
                po.status === "Received" ? "bg-green-100 text-green-700" :
                po.status === "Partially Received" ? "bg-yellow-100 text-yellow-700" :
                po.status === "Cancelled" ? "bg-red-100 text-red-700" :
                "bg-blue-100 text-blue-700"
              }`}>{po.status}</span>
            </p>
          </div>
        </div>

        {po.notes && <p className="text-xs text-gray-700 mb-4"><strong>Notes:</strong> {po.notes}</p>}

        <table className="w-full text-sm border border-gray-200">
          <thead className="bg-gray-50">
            <tr>
              <th className="p-2 text-left border border-gray-200 text-gray-700">#</th>
              <th className="p-2 text-left border border-gray-200 text-gray-700">Item</th>
              <th className="p-2 text-center border border-gray-200 text-gray-700">Qty</th>
              <th className="p-2 text-right border border-gray-200 text-gray-700">Unit Price</th>
              <th className="p-2 text-right border border-gray-200 text-gray-700">Tax Rate</th>
              <th className="p-2 text-right border border-gray-200 text-gray-700">CGST</th>
              <th className="p-2 text-right border border-gray-200 text-gray-700">SGST</th>
              <th className="p-2 text-right border border-gray-200 text-gray-700">Total</th>
            </tr>
          </thead>
          <tbody>
            {items.map((item, idx) => {
              const rate = item.tax_rates;
              const ratePercent = rate ? parseFloat(rate.rate) : 0;
              const itemTotal = item.quantity_ordered * item.unit_price;
              const taxAmount = itemTotal * (ratePercent / 100);
              const cgst = taxAmount / 2;
              const sgst = taxAmount / 2;
              return (
                <tr key={idx} className="border-t border-gray-200">
                  <td className="p-2 border border-gray-200 text-gray-900">{idx + 1}</td>
                  <td className="p-2 border border-gray-200 text-gray-900">{item.inventory_items?.item_name || `Item #${item.item_id}`}</td>
                  <td className="p-2 border border-gray-200 text-center text-gray-900">{item.quantity_ordered}</td>
                  <td className="p-2 border border-gray-200 text-right text-gray-900">₹ {Number(item.unit_price).toLocaleString("en-IN")}</td>
                  <td className="p-2 border border-gray-200 text-right text-gray-900">{rate ? `${rate.rate}%` : "—"}</td>
                  <td className="p-2 border border-gray-200 text-right text-gray-900">₹ {cgst.toLocaleString("en-IN", { minimumFractionDigits: 2 })}</td>
                  <td className="p-2 border border-gray-200 text-right text-gray-900">₹ {sgst.toLocaleString("en-IN", { minimumFractionDigits: 2 })}</td>
                  <td className="p-2 border border-gray-200 text-right font-medium text-gray-900">₹ {(itemTotal + taxAmount).toLocaleString("en-IN", { minimumFractionDigits: 2 })}</td>
                </tr>
              );
            })}
          </tbody>
        </table>

        <div style={{ display: "flex", justifyContent: "flex-end", marginTop: "10px" }}>
          <div style={{ width: "300px" }}>
            <table className="w-full text-sm">
              <tbody>
                <tr>
                  <td className="p-1 text-right text-gray-700">Subtotal:</td>
                  <td className="p-1 text-right font-medium text-gray-900">₹ {subtotal.toLocaleString("en-IN", { minimumFractionDigits: 2 })}</td>
                </tr>
                {Object.entries(taxSummary).map(([name, data]) => (
                  <tr key={name}>
                    <td className="p-1 text-right text-gray-700">{name}:</td>
                    <td className="p-1 text-right text-gray-900">₹ {data.taxAmount.toLocaleString("en-IN", { minimumFractionDigits: 2 })}</td>
                  </tr>
                ))}
                <tr className="font-bold border-t border-gray-300">
                  <td className="p-1 text-right text-gray-900">Grand Total:</td>
                  <td className="p-1 text-right text-gray-900">₹ {grandTotal.toLocaleString("en-IN", { minimumFractionDigits: 2 })}</td>
                </tr>
              </tbody>
            </table>
            <p className="text-xs text-right mt-2 text-gray-700"><strong>Amount in Words:</strong> {amountWords}</p>
          </div>
        </div>

        <div className="terms mt-6 text-xs text-gray-600 border-t border-gray-200 pt-4">
          <h3 className="font-bold text-gray-900 mb-1">Terms & Conditions</h3>
          <ol className="list-decimal list-inside space-y-1">
            <li>All prices are inclusive of taxes unless specified otherwise.</li>
            <li>Delivery must be made within the expected date.</li>
            <li>Goods once received will not be returned unless defective.</li>
            <li>Payment is due within 15 days of invoice receipt.</li>
            <li>Any discrepancies must be reported within 48 hours of delivery.</li>
          </ol>
        </div>

        <div className="signature" style={{ display: "flex", justifyContent: "space-between", marginTop: "40px" }}>
          <div style={{ width: "40%" }}>
            <div style={{ borderBottom: "1px solid #000", marginBottom: "4px" }}></div>
            <p className="text-xs text-center text-gray-700">Authorized Signatory</p>
          </div>
          <div style={{ width: "40%" }}>
            <div style={{ borderBottom: "1px solid #000", marginBottom: "4px" }}></div>
            <p className="text-xs text-center text-gray-700">Vendor / Supplier</p>
          </div>
        </div>
      </div>
    </>
  );
}