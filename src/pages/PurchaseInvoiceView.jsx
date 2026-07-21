// src/pages/PurchaseInvoiceView.jsx
import { useState } from "react";
import { useParams, useNavigate }from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  getPurchaseInvoice,
  finalizePurchaseInvoice,
  deletePurchaseInvoice,
} from "../services/purchaseInvoiceService";
import { getOrganization } from "../services/organizationService";
import { generateInvoicePDF, numberToWords } from "../utils/invoicePdf";
import { useOrg } from "../context/OrganizationContext";
import { supabase } from "../api/supabase";
import { sendEmail } from "../services/emailService";
import toast from "react-hot-toast";

import {
  ArrowLeft,
  Printer,
  Edit3,
  CheckCircle,
  Trash2,
  Loader,
  FileText,
  Mail,
} from "lucide-react";

export default function PurchaseInvoiceView() {
  const { id } = useParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [printing, setPrinting] = useState(false);
  const [generatingPDF, setGeneratingPDF] = useState(false);
  const [sendingEmail, setSendingEmail] = useState(false);

  const { org: currentOrg, branch, selectedFinancialYear } = useOrg();
  const branchId = branch?.id;
  const financialYearId = selectedFinancialYear?.id;
  const ctx = { branchId, financialYearId };

  // Organization details
  const { data: org } = useQuery({
    queryKey: ["organization", currentOrg?.id],
    queryFn: () => getOrganization(currentOrg?.id),
    enabled: !!currentOrg?.id,
  });

  // Purchase invoice
  const { data: invoice, isLoading } = useQuery({
    queryKey: ["purchase-invoice", id, branchId, financialYearId],
    queryFn: () => getPurchaseInvoice(id, branchId, financialYearId),
    enabled: !!id && !!branchId && !!financialYearId,
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

  // ─── Send invoice email ────────────────────────────────────────────
  const sendInvoiceEmail = async () => {
    if (!invoice) return;

    setSendingEmail(true);
    try {
      // Determine recipient
      const vendorEmail = invoice.vendors?.email;
      let recipients = [];
      if (vendorEmail) {
        recipients = [vendorEmail];
      } else {
        // Fallback to admins
        const admins = await getAdminEmails();
        if (admins.length === 0) {
          toast.error("No vendor email or admin emails found.");
          setSendingEmail(false);
          return;
        }
        recipients = admins;
      }

      // Build HTML email content
      const formatCurrency = (amount) =>
        `₹ ${Number(amount).toLocaleString("en-IN", {
          minimumFractionDigits: 2,
          maximumFractionDigits: 2,
        })}`;

      const items = invoice.purchase_invoice_items || [];
      const totals = {
        taxable: items.reduce((sum, item) => sum + Number(item.taxable_amount || 0), 0),
        cgst: items.reduce((sum, item) => sum + Number(item.cgst_amount || 0), 0),
        sgst: items.reduce((sum, item) => sum + Number(item.sgst_amount || 0), 0),
        igst: items.reduce((sum, item) => sum + Number(item.igst_amount || 0), 0),
        total: items.reduce((sum, item) => sum + Number(item.total_amount || 0), 0),
      };
      const roundOff = Number(invoice.round_off || 0);
      const grandTotal = totals.total + roundOff;
      const words = numberToWords(grandTotal);

      const vendor = invoice.vendors || {};
      const vendorName = vendor.vendor_name || "N/A";
      const orgName = org?.company_name || "Academy";

      // Build items table rows
      let itemsRows = items.map((item, idx) => {
        const itemName = item.inventory_items?.item_name || item.description || "—";
        return `
          <tr>
            <td style="padding:4px 8px;border:1px solid #ddd;text-align:center;">${idx + 1}</td>
            <td style="padding:4px 8px;border:1px solid #ddd;">${itemName}</td>
            <td style="padding:4px 8px;border:1px solid #ddd;text-align:center;">${item.quantity}</td>
            <td style="padding:4px 8px;border:1px solid #ddd;text-align:right;">${formatCurrency(item.unit_price)}</td>
            <td style="padding:4px 8px;border:1px solid #ddd;text-align:right;">${formatCurrency(item.taxable_amount)}</td>
            <td style="padding:4px 8px;border:1px solid #ddd;text-align:right;">${formatCurrency(item.cgst_amount)}</td>
            <td style="padding:4px 8px;border:1px solid #ddd;text-align:right;">${formatCurrency(item.sgst_amount)}</td>
            <td style="padding:4px 8px;border:1px solid #ddd;text-align:right;">${formatCurrency(item.igst_amount)}</td>
            <td style="padding:4px 8px;border:1px solid #ddd;text-align:right;font-weight:bold;">${formatCurrency(item.total_amount)}</td>
          </tr>
        `;
      }).join('');

      const htmlBody = `
        <div style="font-family:Arial,sans-serif;max-width:800px;margin:0 auto;padding:20px;border:1px solid #ddd;">
          <h2 style="text-align:center;color:#0D47A1;">PURCHASE INVOICE</h2>
          <div style="display:flex;justify-content:space-between;margin-bottom:16px;">
            <div>
              <strong>Vendor:</strong> ${vendorName}<br/>
              ${vendor.gstin ? `<strong>GSTIN:</strong> ${vendor.gstin}<br/>` : ''}
              ${vendor.address ? `<strong>Address:</strong> ${vendor.address}<br/>` : ''}
              ${vendor.state_code ? `<strong>State Code:</strong> ${vendor.state_code}` : ''}
            </div>
            <div style="text-align:right;">
              <strong>Invoice Details</strong><br/>
              No: ${invoice.invoice_number}<br/>
              Date: ${invoice.invoice_date}<br/>
              Status: ${invoice.status}
              ${invoice.due_date ? `<br/>Due Date: ${invoice.due_date}` : ''}
            </div>
          </div>
          <table style="width:100%;border-collapse:collapse;margin-bottom:16px;font-size:11px;">
            <thead>
              <tr style="background:#0D47A1;color:#fff;">
                <th style="padding:4px 8px;border:1px solid #ccc;text-align:center;">#</th>
                <th style="padding:4px 8px;border:1px solid #ccc;text-align:left;">Item</th>
                <th style="padding:4px 8px;border:1px solid #ccc;text-align:center;">Qty</th>
                <th style="padding:4px 8px;border:1px solid #ccc;text-align:right;">Unit Price</th>
                <th style="padding:4px 8px;border:1px solid #ccc;text-align:right;">Taxable</th>
                <th style="padding:4px 8px;border:1px solid #ccc;text-align:right;">CGST</th>
                <th style="padding:4px 8px;border:1px solid #ccc;text-align:right;">SGST</th>
                <th style="padding:4px 8px;border:1px solid #ccc;text-align:right;">IGST</th>
                <th style="padding:4px 8px;border:1px solid #ccc;text-align:right;">Total</th>
              </tr>
            </thead>
            <tbody>
              ${itemsRows}
            </tbody>
          </table>
          <div style="display:flex;justify-content:flex-end;margin-bottom:8px;">
            <div style="width:250px;">
              <div style="display:flex;justify-content:space-between;"><span>Taxable:</span><span>${formatCurrency(totals.taxable)}</span></div>
              <div style="display:flex;justify-content:space-between;"><span>CGST:</span><span>${formatCurrency(totals.cgst)}</span></div>
              <div style="display:flex;justify-content:space-between;"><span>SGST:</span><span>${formatCurrency(totals.sgst)}</span></div>
              <div style="display:flex;justify-content:space-between;"><span>IGST:</span><span>${formatCurrency(totals.igst)}</span></div>
              ${roundOff !== 0 ? `<div style="display:flex;justify-content:space-between;"><span>Round Off:</span><span>${formatCurrency(roundOff)}</span></div>` : ''}
              <div style="display:flex;justify-content:space-between;font-weight:bold;font-size:1.2em;border-top:2px solid #0D47A1;margin-top:4px;padding-top:4px;">
                <span>Grand Total:</span>
                <span style="color:#0D47A1;">${formatCurrency(grandTotal)}</span>
              </div>
            </div>
          </div>
          <div style="margin-bottom:8px;"><strong>Amount in words:</strong> ${words}</div>
          ${invoice.reverse_charge ? `<div style="color:#CC0000;font-weight:bold;margin-bottom:8px;">** Reverse Charge Applicable – Tax payable by recipient **</div>` : ''}
          <p style="color:#888;font-size:10px;margin-top:20px;">This is a computer‑generated purchase invoice from ${orgName}.</p>
        </div>
      `;

      await sendEmail({
        to: recipients,
        subject: `Purchase Invoice ${invoice.invoice_number} from ${orgName}`,
        html: htmlBody,
        from: org?.email || undefined,
      });

      toast.success(`Invoice sent to ${recipients.length} recipient(s).`);
    } catch (err) {
      console.error("Email error:", err);
      toast.error("Failed to send invoice email.");
    } finally {
      setSendingEmail(false);
    }
  };

  // ─── Mutations ──────────────────────────────────────────────────────
  const finalizeMutation = useMutation({
    mutationFn: () => finalizePurchaseInvoice(id, ctx),
    onSuccess: () => {
      toast.success("Invoice finalized");
      queryClient.invalidateQueries(["purchase-invoice", id]);
      queryClient.invalidateQueries(["purchase-invoices"]);
    },
    onError: (err) => toast.error(err.message),
  });

  const deleteMutation = useMutation({
    mutationFn: () => deletePurchaseInvoice(id, branchId, financialYearId),
    onSuccess: () => {
      toast.success("Invoice deleted");
      navigate("/purchase-invoices");
    },
    onError: (err) => toast.error(err.message),
  });

  // ─── Print and PDF handlers ──────────────────────────────────────
  const handlePrint = () => {
    const printContent = document.getElementById("invoice-print");
    if (!printContent) return;

    const clone = printContent.cloneNode(true);
    const logo = clone.querySelector(".invoice-logo");
    if (logo) {
      logo.style.width = "113px";
      logo.style.height = "auto";
    }

    const printWindow = window.open("", "_blank", "width=800,height=600");
    printWindow.document.write(`
      <!DOCTYPE html>
      <html>
        <head>
          <title>Purchase Invoice ${invoice.invoice_number}</title>
          <style>
            * { margin: 0; padding: 0; box-sizing: border-box; }
            body {
              font-family: Helvetica, Arial, sans-serif;
              font-size: 9pt;
              color: #333;
              padding: 14mm;
              -webkit-print-color-adjust: exact;
              print-color-adjust: exact;
            }
            @media print {
              body { padding: 0; }
            }
            .invoice-header {
              display: flex;
              align-items: flex-start;
              gap: 10px;
              margin-bottom: 16px;
            }
            .invoice-logo {
              width: 30mm;
              height: auto;
              object-fit: contain;
            }
            .org-name {
              font-size: 18pt;
              font-weight: bold;
              color: #0D47A1;
            }
            .org-details {
              font-size: 9pt;
              color: #555;
            }
            .title {
              text-align: center;
              font-size: 16pt;
              font-weight: bold;
              color: #0D47A1;
              margin-bottom: 12px;
            }
            .details-table {
              width: 100%;
              border-collapse: collapse;
              margin-bottom: 12px;
              font-size: 9pt;
            }
            .details-table td {
              vertical-align: top;
              padding: 2px 0;
            }
            .details-table .label {
              font-weight: bold;
              color: #0D47A1;
            }
            .items-table {
              width: 100%;
              border-collapse: collapse;
              font-size: 7.5pt;
              margin-bottom: 12px;
            }
            .items-table th {
              background-color: #0D47A1;
              color: #ffffff;
              font-weight: bold;
              font-size: 7.5pt;
              padding: 4px 6px;
              border: 1px solid #0D47A1;
              text-align: left;
            }
            .items-table td {
              padding: 4px 6px;
              border: 1px solid #d1d5db;
              text-align: left;
            }
            .items-table .right { text-align: right; }
            .totals {
              margin-left: auto;
              width: 250px;
              font-size: 9pt;
              margin-bottom: 8px;
            }
            .totals td { padding: 2px 0; }
            .totals .total-label { text-align: right; }
            .totals .total-value { text-align: right; }
            .grand-total {
              font-weight: bold;
              color: #0D47A1;
              font-size: 12pt;
            }
            .amount-words {
              font-size: 9pt;
              margin-bottom: 10px;
            }
            .divider {
              border-top: 1px solid #cccccc;
              margin: 10px 0;
            }
            .terms {
              font-size: 7pt;
              color: #555;
              margin-bottom: 10px;
            }
            .terms p { margin: 2px 0; }
            .footer {
              font-size: 6pt;
              color: #999;
              font-style: italic;
              display: flex;
              justify-content: space-between;
            }
            .reverse-charge {
              font-size: 8pt;
              color: #CC0000;
              font-weight: bold;
              margin-bottom: 6px;
            }
          </style>
        </head>
        <body>
          ${clone.outerHTML}
        </body>
      </html>
    `);
    printWindow.document.close();
    printWindow.focus();
    printWindow.addEventListener("afterprint", () => printWindow.close());
    printWindow.print();
  };

  const handleDownloadPDF = async () => {
    if (!invoice || !org) return;
    setGeneratingPDF(true);
    try {
      const doc = await generateInvoicePDF(invoice, org, "purchase");
      doc.save(`PurchaseInvoice_${invoice.invoice_number}.pdf`);
      toast.success("PDF downloaded");
    } catch (err) {
      toast.error("Failed to generate PDF");
      console.error(err);
    } finally {
      setGeneratingPDF(false);
    }
  };

  if (isLoading) {
    return <div className="p-8 text-center">Loading invoice…</div>;
  }

  if (!invoice) {
    return <div className="p-8 text-center text-red-600">Invoice not found</div>;
  }

  const orgName = org?.company_name || "ShreeVidhya Academy";
  const orgAddress = org?.address || "";
  const orgPhone = org?.phone || "";
  const orgEmail = org?.email || "";
  const orgGSTIN = org?.gstin || "";
  const orgLogo = org?.logo_dark_url || null;

  const vendor = invoice.vendors || {};
  const vendorName = vendor.vendor_name || "N/A";

  const formatCurrency = (amount) =>
    `₹ ${Number(amount).toLocaleString("en-IN", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    })}`;

  const items = invoice.purchase_invoice_items || [];

  const totals = {
    taxable: items.reduce((sum, item) => sum + Number(item.taxable_amount || 0), 0),
    cgst: items.reduce((sum, item) => sum + Number(item.cgst_amount || 0), 0),
    sgst: items.reduce((sum, item) => sum + Number(item.sgst_amount || 0), 0),
    igst: items.reduce((sum, item) => sum + Number(item.igst_amount || 0), 0),
    total: items.reduce((sum, item) => sum + Number(item.total_amount || 0), 0),
  };
  const roundOff = Number(invoice.round_off || 0);
  const grandTotal = totals.total + roundOff;
  const words = numberToWords(grandTotal);
  const reverseCharge = invoice.reverse_charge;

  return (
    <>
      {/* Action buttons – hidden during print */}
      <div className="no-print flex justify-between items-center mb-6">
        <button
          onClick={() => navigate("/purchase-invoices")}
          className="inline-flex items-center gap-2 text-secondary hover:text-primary-dark text-sm"
        >
          <ArrowLeft size={18} /> Back to Purchase Invoices
        </button>
        <div className="flex gap-2">
          {/* 👇 Email Invoice button */}
          <button
            onClick={sendInvoiceEmail}
            disabled={sendingEmail}
            className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg text-sm flex items-center gap-2 disabled:opacity-50"
          >
            <Mail size={16} /> {sendingEmail ? "Sending..." : "Email Invoice"}
          </button>
          <button
            onClick={handleDownloadPDF}
            disabled={generatingPDF}
            className="border px-4 py-2 rounded-lg text-sm flex items-center gap-2"
          >
            <FileText size={16} /> {generatingPDF ? "Generating..." : "Download PDF"}
          </button>
          <button
            onClick={handlePrint}
            disabled={printing}
            className="bg-primary text-white px-4 py-2 rounded-lg text-sm flex items-center gap-2"
          >
            <Printer size={16} /> {printing ? "Printing…" : "Print"}
          </button>
          {invoice.status === "Draft" && (
            <>
              <button
                onClick={() => navigate(`/purchase-invoices/${id}/edit`)}
                className="border px-4 py-2 rounded-lg text-sm flex items-center gap-2"
              >
                <Edit3 size={16} /> Edit
              </button>
              <button
                onClick={() => finalizeMutation.mutate()}
                disabled={finalizeMutation.isPending}
                className="bg-green-600 text-white px-4 py-2 rounded-lg text-sm flex items-center gap-2"
              >
                {finalizeMutation.isPending ? (
                  <Loader className="w-4 h-4 animate-spin" />
                ) : (
                  <CheckCircle size={16} />
                )}
                Finalize
              </button>
            </>
          )}
          {invoice.status === "Draft" && (
            <button
              onClick={() => {
                if (window.confirm("Delete this invoice?")) deleteMutation.mutate();
              }}
              className="bg-red-600 text-white px-4 py-2 rounded-lg text-sm flex items-center gap-2"
            >
              <Trash2 size={16} /> Delete
            </button>
          )}
        </div>
      </div>

      {/* Invoice Content – exactly matches PDF */}
      <div
        id="invoice-print"
        style={{
          fontFamily: "Helvetica, Arial, sans-serif",
          fontSize: "9pt",
          color: "#333",
          padding: "0",
        }}
      >
        {/* Header */}
        <div
          className="invoice-header"
          style={{
            display: "flex",
            alignItems: "flex-start",
            gap: "10px",
            marginBottom: "16px",
          }}
        >
          {orgLogo && (
            <img
              src={orgLogo}
              alt="Logo"
              className="invoice-logo"
              style={{ width: "30mm", height: "auto", objectFit: "contain" }}
            />
          )}
          <div>
            <div
              className="org-name"
              style={{
                fontSize: "18pt",
                fontWeight: "bold",
                color: "#0D47A1",
              }}
            >
              {orgName}
            </div>
            <div className="org-details" style={{ fontSize: "9pt", color: "#555" }}>
              {orgAddress && <div>{orgAddress}</div>}
              <div>
                Phone: {orgPhone} | Email: {orgEmail}
              </div>
              {orgGSTIN && <div>GSTIN: {orgGSTIN}</div>}
            </div>
          </div>
        </div>

        {/* Title */}
        <div
          className="title"
          style={{
            textAlign: "center",
            fontSize: "16pt",
            fontWeight: "bold",
            color: "#0D47A1",
            marginBottom: "12px",
          }}
        >
          PURCHASE INVOICE
        </div>

        {/* Two-column details */}
        <table
          className="details-table"
          style={{
            width: "100%",
            borderCollapse: "collapse",
            marginBottom: "12px",
            fontSize: "9pt",
          }}
        >
          <tbody>
            <tr>
              <td style={{ verticalAlign: "top", padding: "2px 0", width: "50%" }}>
                <div
                  className="label"
                  style={{
                    fontWeight: "bold",
                    color: "#0D47A1",
                    marginBottom: "2px",
                  }}
                >
                  Vendor:
                </div>
                <div>{vendorName}</div>
                {vendor.gstin && <div>GSTIN: {vendor.gstin}</div>}
                {vendor.address && <div>Address: {vendor.address}</div>}
                {vendor.state_code && <div>State Code: {vendor.state_code}</div>}
                <div>Payment Terms: {invoice.payment_terms || "Standard"}</div>
              </td>
              <td
                style={{
                  verticalAlign: "top",
                  padding: "2px 0",
                  width: "50%",
                  textAlign: "right",
                }}
              >
                <div
                  className="label"
                  style={{
                    fontWeight: "bold",
                    color: "#0D47A1",
                    marginBottom: "2px",
                  }}
                >
                  Invoice Details
                </div>
                <div>No: {invoice.invoice_number}</div>
                <div>Date: {invoice.invoice_date}</div>
                <div>Status: {invoice.status}</div>
                {invoice.due_date && <div>Due Date: {invoice.due_date}</div>}
              </td>
            </tr>
          </tbody>
        </table>

        {/* Items table with CGST, SGST, IGST */}
        <table
          className="items-table"
          style={{
            width: "100%",
            borderCollapse: "collapse",
            fontSize: "7pt",
            marginBottom: "12px",
          }}
        >
          <thead>
            <tr>
              <th style={{ width: "4%" }}>#</th>
              <th style={{ width: "25%" }}>Item</th>
              <th style={{ width: "13%" }}>HSN/SAC</th>
              <th style={{ width: "6%", textAlign: "center" }}>Qty</th>
              <th style={{ width: "10%", textAlign: "right" }}>Unit Price</th>
              <th style={{ width: "10%", textAlign: "right" }}>Taxable</th>
              <th style={{ width: "9%", textAlign: "right" }}>CGST</th>
              <th style={{ width: "9%", textAlign: "right" }}>SGST</th>
              <th style={{ width: "9%", textAlign: "right" }}>IGST</th>
              <th style={{ width: "10%", textAlign: "right" }}>Total</th>
            </tr>
          </thead>
          <tbody>
            {items.map((item, idx) => {
              const itemName = item.inventory_items?.item_name || item.description || "—";
              const desc =
                item.description && item.description !== itemName
                  ? ` (${item.description})`
                  : "";
              return (
                <tr key={item.id || idx}>
                  <td>{idx + 1}</td>
                  <td>
                    {itemName}
                    {desc}
                  </td>
                  <td>{item.hsn_sac_code || "—"}</td>
                  <td style={{ textAlign: "center" }}>{item.quantity}</td>
                  <td style={{ textAlign: "right" }}>{formatCurrency(item.unit_price)}</td>
                  <td style={{ textAlign: "right" }}>{formatCurrency(item.taxable_amount)}</td>
                  <td style={{ textAlign: "right" }}>{formatCurrency(item.cgst_amount)}</td>
                  <td style={{ textAlign: "right" }}>{formatCurrency(item.sgst_amount)}</td>
                  <td style={{ textAlign: "right" }}>{formatCurrency(item.igst_amount)}</td>
                  <td style={{ textAlign: "right", fontWeight: "500" }}>
                    {formatCurrency(item.total_amount)}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>

        {/* Totals with tax breakup */}
        <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: "8px" }}>
          <table
            className="totals"
            style={{ width: "250px", fontSize: "9pt", borderCollapse: "collapse" }}
          >
            <tbody>
              <tr>
                <td className="total-label" style={{ textAlign: "right", paddingRight: "8px" }}>
                  Taxable Amount:
                </td>
                <td className="total-value" style={{ textAlign: "right" }}>
                  {formatCurrency(totals.taxable)}
                </td>
              </tr>
              <tr>
                <td className="total-label" style={{ textAlign: "right", paddingRight: "8px" }}>
                  CGST:
                </td>
                <td className="total-value" style={{ textAlign: "right" }}>
                  {formatCurrency(totals.cgst)}
                </td>
              </tr>
              <tr>
                <td className="total-label" style={{ textAlign: "right", paddingRight: "8px" }}>
                  SGST:
                </td>
                <td className="total-value" style={{ textAlign: "right" }}>
                  {formatCurrency(totals.sgst)}
                </td>
              </tr>
              <tr>
                <td className="total-label" style={{ textAlign: "right", paddingRight: "8px" }}>
                  IGST:
                </td>
                <td className="total-value" style={{ textAlign: "right" }}>
                  {formatCurrency(totals.igst)}
                </td>
              </tr>
              {roundOff !== 0 && (
                <tr>
                  <td
                    className="total-label"
                    style={{ textAlign: "right", paddingRight: "8px" }}
                  >
                    Round Off:
                  </td>
                  <td className="total-value" style={{ textAlign: "right" }}>
                    {formatCurrency(roundOff)}
                  </td>
                </tr>
              )}
              <tr>
                <td
                  className="total-label grand-total"
                  style={{
                    fontWeight: "bold",
                    color: "#0D47A1",
                    fontSize: "12pt",
                    textAlign: "right",
                    paddingRight: "8px",
                  }}
                >
                  Grand Total:
                </td>
                <td
                  className="total-value grand-total"
                  style={{
                    fontWeight: "bold",
                    color: "#0D47A1",
                    fontSize: "12pt",
                    textAlign: "right",
                  }}
                >
                  {formatCurrency(grandTotal)}
                </td>
              </tr>
            </tbody>
          </table>
        </div>

        {/* Reverse Charge Note */}
        {reverseCharge && (
          <div
            className="reverse-charge"
            style={{
              fontSize: "8pt",
              color: "#CC0000",
              fontWeight: "bold",
              marginBottom: "6px",
            }}
          >
            ** Reverse Charge Applicable – Tax payable by recipient **
          </div>
        )}

        {/* Amount in words */}
        <div className="amount-words" style={{ fontSize: "9pt", marginBottom: "10px" }}>
          <span style={{ fontWeight: "bold" }}>Amount in words:</span> {words}
        </div>

        {/* Divider */}
        <hr
          className="divider"
          style={{ borderTop: "1px solid #cccccc", margin: "10px 0" }}
        />

        {/* Terms */}
        <div className="terms" style={{ fontSize: "7pt", color: "#555", marginBottom: "10px" }}>
          <p>1. Payment is due within 15 days from invoice date.</p>
          <p>2. Late payment will attract interest @18% p.a.</p>
          <p>3. Goods once sold will not be taken back.</p>
          <p>4. This is a system‑generated invoice, no signature required.</p>
          <p>5. Any dispute shall be subject to local jurisdiction.</p>
        </div>

        {/* Footer */}
        <div
          className="footer"
          style={{
            fontSize: "6pt",
            color: "#999",
            fontStyle: "italic",
            display: "flex",
            justifyContent: "space-between",
          }}
        >
          <span>Generated on {new Date().toLocaleString()}</span>
          <span>© {orgName}</span>
        </div>
      </div>

      <style>{`
        @media print {
          .no-print { display: none !important; }
          body { background: white; }
        }
      `}</style>
    </>
  );
}