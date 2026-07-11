// src/pages/InvoiceView.jsx
import { useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { getInvoice, finalizeInvoice, deleteInvoice } from "../services/invoiceService";
import { getOrganization } from "../services/organizationService";
import { generateInvoicePDF, numberToWords } from "../utils/invoicePdf";
import toast from "react-hot-toast";
import AdminLayout from "../layouts/AdminLayout";
import { ArrowLeft, Printer, Edit3, CheckCircle, Trash2, Loader, FileText } from "lucide-react";

export default function InvoiceView() {
  const { id } = useParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [printing, setPrinting] = useState(false);
  const [generatingPDF, setGeneratingPDF] = useState(false);

  const { data: org } = useQuery({
    queryKey: ["organization"],
    queryFn: getOrganization,
  });

  const { data: invoice, isLoading } = useQuery({
    queryKey: ["invoice", id],
    queryFn: () => getInvoice(id),
    enabled: !!id,
  });

  const finalizeMutation = useMutation({
    mutationFn: () => finalizeInvoice(id),
    onSuccess: () => {
      toast.success("Invoice finalized");
      queryClient.invalidateQueries(["invoice", id]);
      queryClient.invalidateQueries(["invoices"]);
    },
    onError: (err) => toast.error(err.message),
  });

  const deleteMutation = useMutation({
    mutationFn: () => deleteInvoice(id),
    onSuccess: () => {
      toast.success("Invoice deleted");
      navigate("/invoices");
    },
    onError: (err) => toast.error(err.message),
  });

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
          <title>Invoice ${invoice.invoice_number}</title>
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
      const doc = await generateInvoicePDF(invoice, org, "sales");
      doc.save(`Invoice_${invoice.invoice_number}.pdf`);
      toast.success("PDF downloaded");
    } catch (err) {
      toast.error("Failed to generate PDF");
      console.error(err);
    } finally {
      setGeneratingPDF(false);
    }
  };

  if (isLoading) {
    return (
      <AdminLayout>
        <div className="p-8 text-center">Loading invoice…</div>
      </AdminLayout>
    );
  }

  if (!invoice) {
    return (
      <AdminLayout>
        <div className="p-8 text-center text-red-600">Invoice not found</div>
      </AdminLayout>
    );
  }

  const orgName = org?.company_name || "ShreeVidhya Academy";
  const orgAddress = org?.address || "";
  const orgPhone = org?.phone || "";
  const orgEmail = org?.email || "";
  const orgGSTIN = org?.gstin || "";
  const orgLogo = org?.logo_dark_url || null;

  const student = invoice.students || {};
  const studentName = `${student.first_name || ""} ${student.last_name || ""}`.trim() || "N/A";

  const formatCurrency = (amount) =>
    `₹ ${Number(amount).toLocaleString("en-IN", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    })}`;

  const items = invoice.invoice_items || [];

  // Compute tax breakup from items (as PDF does)
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
    <AdminLayout>
      {/* Action buttons – hidden during print */}
      <div className="no-print flex justify-between items-center mb-6">
        <button
          onClick={() => navigate("/invoices")}
          className="inline-flex items-center gap-2 text-secondary hover:text-primary-dark text-sm"
        >
          <ArrowLeft size={18} /> Back to Invoices
        </button>
        <div className="flex gap-2">
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
                onClick={() => navigate(`/invoices/${id}/edit`)}
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
        <div className="invoice-header" style={{ display: "flex", alignItems: "flex-start", gap: "10px", marginBottom: "16px" }}>
          {orgLogo && (
            <img
              src={orgLogo}
              alt="Logo"
              className="invoice-logo"
              style={{ width: "30mm", height: "auto", objectFit: "contain" }}
            />
          )}
          <div>
            <div className="org-name" style={{ fontSize: "18pt", fontWeight: "bold", color: "#0D47A1" }}>
              {orgName}
            </div>
            <div className="org-details" style={{ fontSize: "9pt", color: "#555" }}>
              {orgAddress && <div>{orgAddress}</div>}
              <div>Phone: {orgPhone} | Email: {orgEmail}</div>
              {orgGSTIN && <div>GSTIN: {orgGSTIN}</div>}
            </div>
          </div>
        </div>

        {/* Title */}
        <div className="title" style={{ textAlign: "center", fontSize: "16pt", fontWeight: "bold", color: "#0D47A1", marginBottom: "12px" }}>
          TAX INVOICE
        </div>

        {/* Two-column details (right-aligned Invoice Details) */}
        <table className="details-table" style={{ width: "100%", borderCollapse: "collapse", marginBottom: "12px", fontSize: "9pt" }}>
          <tbody>
            <tr>
              <td style={{ verticalAlign: "top", padding: "2px 0", width: "50%" }}>
                <div className="label" style={{ fontWeight: "bold", color: "#0D47A1", marginBottom: "2px" }}>Billed To:</div>
                <div>{studentName}</div>
                {student.admission_no && <div>Admission: {student.admission_no}</div>}
                {student.gstin && <div>GSTIN: {student.gstin}</div>}
                {student.billing_address && <div>Address: {student.billing_address}</div>}
                <div>Payment Terms: {invoice.payment_terms || "Standard"}</div>
              </td>
              <td style={{ verticalAlign: "top", padding: "2px 0", width: "50%", textAlign: "right" }}>
                <div className="label" style={{ fontWeight: "bold", color: "#0D47A1", marginBottom: "2px" }}>Invoice Details</div>
                <div>No: {invoice.invoice_number}</div>
                <div>Date: {invoice.invoice_date}</div>
                <div>Status: {invoice.status}</div>
                {invoice.due_date && <div>Due Date: {invoice.due_date}</div>}
              </td>
            </tr>
          </tbody>
        </table>

        {/* Items table with CGST, SGST, IGST */}
        <table className="items-table" style={{ width: "100%", borderCollapse: "collapse", fontSize: "7pt", marginBottom: "12px" }}>
          <thead>
            <tr>
              <th style={{ backgroundColor: "#0D47A1", color: "#fff", fontWeight: "bold", fontSize: "7.5pt", padding: "4px 4px", border: "1px solid #0D47A1", width: "4%" }}>#</th>
              <th style={{ backgroundColor: "#0D47A1", color: "#fff", fontWeight: "bold", fontSize: "7.5pt", padding: "4px 4px", border: "1px solid #0D47A1", width: "25%" }}>Description</th>
              <th style={{ backgroundColor: "#0D47A1", color: "#fff", fontWeight: "bold", fontSize: "7.5pt", padding: "4px 4px", border: "1px solid #0D47A1", width: "13%" }}>HSN/SAC</th>
              <th style={{ backgroundColor: "#0D47A1", color: "#fff", fontWeight: "bold", fontSize: "7.5pt", padding: "4px 4px", border: "1px solid #0D47A1", width: "6%", textAlign: "center" }}>Qty</th>
              <th style={{ backgroundColor: "#0D47A1", color: "#fff", fontWeight: "bold", fontSize: "7.5pt", padding: "4px 4px", border: "1px solid #0D47A1", width: "10%", textAlign: "right" }}>Unit Price</th>
              <th style={{ backgroundColor: "#0D47A1", color: "#fff", fontWeight: "bold", fontSize: "7.5pt", padding: "4px 4px", border: "1px solid #0D47A1", width: "10%", textAlign: "right" }}>Taxable</th>
              <th style={{ backgroundColor: "#0D47A1", color: "#fff", fontWeight: "bold", fontSize: "7.5pt", padding: "4px 4px", border: "1px solid #0D47A1", width: "9%", textAlign: "right" }}>CGST</th>
              <th style={{ backgroundColor: "#0D47A1", color: "#fff", fontWeight: "bold", fontSize: "7.5pt", padding: "4px 4px", border: "1px solid #0D47A1", width: "9%", textAlign: "right" }}>SGST</th>
              <th style={{ backgroundColor: "#0D47A1", color: "#fff", fontWeight: "bold", fontSize: "7.5pt", padding: "4px 4px", border: "1px solid #0D47A1", width: "9%", textAlign: "right" }}>IGST</th>
              <th style={{ backgroundColor: "#0D47A1", color: "#fff", fontWeight: "bold", fontSize: "7.5pt", padding: "4px 4px", border: "1px solid #0D47A1", width: "10%", textAlign: "right" }}>Total</th>
            </tr>
          </thead>
          <tbody>
            {items.map((item, idx) => (
              <tr key={item.id || idx}>
                <td style={{ padding: "4px 4px", border: "1px solid #d1d5db" }}>{idx + 1}</td>
                <td style={{ padding: "4px 4px", border: "1px solid #d1d5db" }}>{item.description}</td>
                <td style={{ padding: "4px 4px", border: "1px solid #d1d5db" }}>{item.hsn_sac_code || "—"}</td>
                <td style={{ padding: "4px 4px", border: "1px solid #d1d5db", textAlign: "center" }}>{item.quantity}</td>
                <td style={{ padding: "4px 4px", border: "1px solid #d1d5db", textAlign: "right" }}>{formatCurrency(item.unit_price)}</td>
                <td style={{ padding: "4px 4px", border: "1px solid #d1d5db", textAlign: "right" }}>{formatCurrency(item.taxable_amount)}</td>
                <td style={{ padding: "4px 4px", border: "1px solid #d1d5db", textAlign: "right" }}>{formatCurrency(item.cgst_amount)}</td>
                <td style={{ padding: "4px 4px", border: "1px solid #d1d5db", textAlign: "right" }}>{formatCurrency(item.sgst_amount)}</td>
                <td style={{ padding: "4px 4px", border: "1px solid #d1d5db", textAlign: "right" }}>{formatCurrency(item.igst_amount)}</td>
                <td style={{ padding: "4px 4px", border: "1px solid #d1d5db", textAlign: "right", fontWeight: "500" }}>{formatCurrency(item.total_amount)}</td>
              </tr>
            ))}
          </tbody>
        </table>

        {/* Totals (with tax breakup) */}
        <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: "8px" }}>
          <table className="totals" style={{ width: "250px", fontSize: "9pt", borderCollapse: "collapse" }}>
            <tbody>
              <tr>
                <td className="total-label" style={{ textAlign: "right", paddingRight: "8px" }}>Taxable Amount:</td>
                <td className="total-value" style={{ textAlign: "right" }}>{formatCurrency(totals.taxable)}</td>
              </tr>
              <tr>
                <td className="total-label" style={{ textAlign: "right", paddingRight: "8px" }}>CGST:</td>
                <td className="total-value" style={{ textAlign: "right" }}>{formatCurrency(totals.cgst)}</td>
              </tr>
              <tr>
                <td className="total-label" style={{ textAlign: "right", paddingRight: "8px" }}>SGST:</td>
                <td className="total-value" style={{ textAlign: "right" }}>{formatCurrency(totals.sgst)}</td>
              </tr>
              <tr>
                <td className="total-label" style={{ textAlign: "right", paddingRight: "8px" }}>IGST:</td>
                <td className="total-value" style={{ textAlign: "right" }}>{formatCurrency(totals.igst)}</td>
              </tr>
              {roundOff !== 0 && (
                <tr>
                  <td className="total-label" style={{ textAlign: "right", paddingRight: "8px" }}>Round Off:</td>
                  <td className="total-value" style={{ textAlign: "right" }}>{formatCurrency(roundOff)}</td>
                </tr>
              )}
              <tr>
                <td className="total-label grand-total" style={{ fontWeight: "bold", color: "#0D47A1", fontSize: "12pt", textAlign: "right", paddingRight: "8px" }}>Grand Total:</td>
                <td className="total-value grand-total" style={{ fontWeight: "bold", color: "#0D47A1", fontSize: "12pt", textAlign: "right" }}>{formatCurrency(grandTotal)}</td>
              </tr>
            </tbody>
          </table>
        </div>

        {/* Reverse Charge Note */}
        {reverseCharge && (
          <div className="reverse-charge" style={{ fontSize: "8pt", color: "#CC0000", fontWeight: "bold", marginBottom: "6px" }}>
            ** Reverse Charge Applicable – Tax payable by recipient **
          </div>
        )}

        {/* Amount in words */}
        <div className="amount-words" style={{ fontSize: "9pt", marginBottom: "10px" }}>
          <span style={{ fontWeight: "bold" }}>Amount in words:</span> {words}
        </div>

        {/* Divider */}
        <hr className="divider" style={{ borderTop: "1px solid #cccccc", margin: "10px 0" }} />

        {/* Terms */}
        <div className="terms" style={{ fontSize: "7pt", color: "#555", marginBottom: "10px" }}>
          <p>1. Payment is due within 15 days from invoice date.</p>
          <p>2. Late payment will attract interest @18% p.a.</p>
          <p>3. Goods once sold will not be taken back.</p>
          <p>4. This is a system‑generated invoice, no signature required.</p>
          <p>5. Any dispute shall be subject to local jurisdiction.</p>
        </div>

        {/* Footer */}
        <div className="footer" style={{ fontSize: "6pt", color: "#999", fontStyle: "italic", display: "flex", justifyContent: "space-between" }}>
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
    </AdminLayout>
  );
}