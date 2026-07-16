import { useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  getInvoice,
  finalizeInvoice,
  deleteInvoice,
} from "../services/invoiceService";
import { generateInvoicePDF, numberToWords } from "../utils/invoicePdf";
import toast from "react-hot-toast";
import {
  ArrowLeft,
  Printer,
  Edit3,
  CheckCircle,
  Trash2,
  Loader,
  FileText,
} from "lucide-react";
import { useOrg } from "../context/OrganizationContext";
import { useTheme } from "../context/ThemeContext";

export default function InvoiceView() {
  const { id } = useParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [printing, setPrinting] = useState(false);
  const [generatingPDF, setGeneratingPDF] = useState(false);

  const { branch, selectedFinancialYear, org } = useOrg();
  const branchId = branch?.id;
  const financialYearId = selectedFinancialYear?.id;
  const ctx = { branchId, financialYearId };

  // ── Get theme from context (exactly as stored, with underscores) ──
  const theme = useTheme();

  const { data: invoice, isLoading } = useQuery({
    queryKey: ["invoice", id, branchId, financialYearId],
    queryFn: () => getInvoice(id, branchId, financialYearId),
    enabled: !!id && !!branchId && !!financialYearId,
  });

  const finalizeMutation = useMutation({
    mutationFn: () => finalizeInvoice(id, ctx),
    onSuccess: () => {
      toast.success("Invoice finalized");
      queryClient.invalidateQueries({ queryKey: ["invoice", id] });
      queryClient.invalidateQueries({ queryKey: ["invoices"] });
    },
    onError: (err) => toast.error(err.message),
  });

  const deleteMutation = useMutation({
    mutationFn: () => deleteInvoice(id, branchId, financialYearId),
    onSuccess: () => {
      toast.success("Invoice deleted");
      navigate("/invoices");
    },
    onError: (err) => toast.error(err.message),
  });

  // ── Print using PDF with auto‑print ──
  const handlePrint = async () => {
    if (!invoice || !org) return;
    setPrinting(true);
    try {
      const doc = await generateInvoicePDF(invoice, org, "sales", {
        autoPrint: true,
        theme, // pass the full theme object
      });
      doc.output("dataurlnewwindow");
    } catch (err) {
      toast.error("Failed to prepare PDF for printing");
      console.error(err);
    } finally {
      setPrinting(false);
    }
  };

  // ── Download PDF (no auto‑print) ──
  const handleDownloadPDF = async () => {
    if (!invoice || !org) return;
    setGeneratingPDF(true);
    try {
      const doc = await generateInvoicePDF(invoice, org, "sales", {
        theme, // pass the full theme object
      });
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
    return <div className="p-8 text-center">Loading invoice…</div>;
  }

  if (!invoice) {
    return <div className="p-8 text-center text-red-600">Invoice not found</div>;
  }

  const orgName = org?.company_name || "Academy";
  const student = invoice.students || {};
  const studentName = `${student.first_name || ""} ${student.last_name || ""}`.trim() || "N/A";

  const formatCurrency = (amount) =>
    `₹ ${Number(amount).toLocaleString("en-IN", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    })}`;

  const items = invoice.invoice_items || [];
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

  const primaryColor = theme?.primary_color || "#0D47A1";

  return (
    <>
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

      {/* ─── Invoice Preview (visible only on screen) ─── */}
      <div
        className="invoice-preview"
        style={{
          maxWidth: "210mm",
          margin: "0 auto",
          padding: "20mm",
          background: "#fff",
          border: "1px solid #ddd",
          borderRadius: "4px",
          boxShadow: "0 2px 8px rgba(0,0,0,0.1)",
        }}
      >
        <div style={{ textAlign: "center", marginBottom: "20px" }}>
          <h2 style={{ color: primaryColor, margin: 0 }}>TAX INVOICE</h2>
        </div>
        <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "16px" }}>
          <div>
            <strong>Billed To:</strong> {studentName}
            {student.admission_no && <div>Admission: {student.admission_no}</div>}
            {student.gstin && <div>GSTIN: {student.gstin}</div>}
            {student.billing_address && <div>Address: {student.billing_address}</div>}
          </div>
          <div style={{ textAlign: "right" }}>
            <strong>Invoice Details</strong>
            <div>No: {invoice.invoice_number}</div>
            <div>Date: {invoice.invoice_date}</div>
            <div>Status: {invoice.status}</div>
          </div>
        </div>
        <table style={{ width: "100%", borderCollapse: "collapse", marginBottom: "16px" }}>
          <thead>
            <tr style={{ background: primaryColor, color: "#fff" }}>
              <th style={{ padding: "6px", border: "1px solid #ccc", textAlign: "left" }}>#</th>
              <th style={{ padding: "6px", border: "1px solid #ccc", textAlign: "left" }}>Description</th>
              <th style={{ padding: "6px", border: "1px solid #ccc", textAlign: "right" }}>Qty</th>
              <th style={{ padding: "6px", border: "1px solid #ccc", textAlign: "right" }}>Unit Price</th>
              <th style={{ padding: "6px", border: "1px solid #ccc", textAlign: "right" }}>Total</th>
            </tr>
          </thead>
          <tbody>
            {items.map((item, idx) => (
              <tr key={idx}>
                <td style={{ padding: "6px", border: "1px solid #ccc" }}>{idx + 1}</td>
                <td style={{ padding: "6px", border: "1px solid #ccc" }}>{item.description}</td>
                <td style={{ padding: "6px", border: "1px solid #ccc", textAlign: "right" }}>{item.quantity}</td>
                <td style={{ padding: "6px", border: "1px solid #ccc", textAlign: "right" }}>{formatCurrency(item.unit_price)}</td>
                <td style={{ padding: "6px", border: "1px solid #ccc", textAlign: "right" }}>{formatCurrency(item.total_amount)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: "8px" }}>
          <div style={{ width: "250px" }}>
            <div style={{ display: "flex", justifyContent: "space-between" }}>
              <span>Taxable:</span>
              <span>{formatCurrency(totals.taxable)}</span>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between" }}>
              <span>CGST:</span>
              <span>{formatCurrency(totals.cgst)}</span>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between" }}>
              <span>SGST:</span>
              <span>{formatCurrency(totals.sgst)}</span>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between" }}>
              <span>IGST:</span>
              <span>{formatCurrency(totals.igst)}</span>
            </div>
            {roundOff !== 0 && (
              <div style={{ display: "flex", justifyContent: "space-between" }}>
                <span>Round Off:</span>
                <span>{formatCurrency(roundOff)}</span>
              </div>
            )}
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                fontWeight: "bold",
                fontSize: "1.2em",
                borderTop: `2px solid ${primaryColor}`,
                marginTop: "4px",
                paddingTop: "4px",
              }}
            >
              <span>Grand Total:</span>
              <span style={{ color: primaryColor }}>{formatCurrency(grandTotal)}</span>
            </div>
          </div>
        </div>
        <div>
          <strong>Amount in words:</strong> {words}
        </div>
      </div>

      <style>{`
        @media print {
          .no-print { display: none !important; }
          .invoice-preview { border: none !important; box-shadow: none !important; padding: 0 !important; max-width: 100% !important; }
        }
      `}</style>
    </>
  );
}