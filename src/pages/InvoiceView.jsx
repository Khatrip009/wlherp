// src/pages/InvoiceView.jsx
import { useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "../api/supabase";
import {
  getInvoice,
  finalizeInvoice,
  deleteInvoice,
} from "../services/invoiceService";
import { generateInvoicePDF, numberToWords } from "../utils/invoicePdf";
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
  DollarSign,
  Mail,
} from "lucide-react";
import { useOrg } from "../context/OrganizationContext";
import { useTheme } from "../context/ThemeContext";
import CollectPaymentModal from "../components/CollectPaymentModal";

export default function InvoiceView() {
  const { id } = useParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [printing, setPrinting] = useState(false);
  const [generatingPDF, setGeneratingPDF] = useState(false);
  const [paymentModalOpen, setPaymentModalOpen] = useState(false);
  const [selectedFee, setSelectedFee] = useState(null);
  const [sendingEmail, setSendingEmail] = useState(false);

  const { branch, selectedFinancialYear, org } = useOrg();
  const branchId = branch?.id;
  const financialYearId = selectedFinancialYear?.id;
  const ctx = { branchId, financialYearId };

  // ── Get theme ──
  const theme = useTheme();

  // ── Fetch invoice ──
  const { data: invoice, isLoading } = useQuery({
    queryKey: ["invoice", id, branchId, financialYearId],
    queryFn: () => getInvoice(id, branchId, financialYearId),
    enabled: !!id && !!branchId && !!financialYearId,
  });

  // ── Fetch payments for this invoice ──
  const { data: payments = [], refetch: refetchPayments } = useQuery({
    queryKey: ["invoice-payments", id, branchId, financialYearId],
    queryFn: async () => {
      let query = supabase
        .from("fee_payments")
        .select(`
          *,
          receipts (*)
        `)
        .eq("invoice_id", id);
      if (branchId) query = query.eq("branch_id", branchId);
      if (financialYearId) query = query.eq("financial_year_id", financialYearId);
      const { data } = await query;
      return data || [];
    },
    enabled: !!id && !!branchId && !!financialYearId,
  });

  // ── Mutations ──
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

  // ─── Send Invoice Email ────────────────────────────────────────────
  const sendInvoiceEmail = async () => {
    if (!invoice || !org) return;
    setSendingEmail(true);
    try {
      // 1. Find recipient email (parent or student)
      const student = invoice.students || {};
      let recipientEmail = student.email;

      // Try to find parent email
      if (invoice.student_id) {
        const { data: parent, error: parentError } = await supabase
          .from("student_parents")
          .select("parents!inner(email)")
          .eq("student_id", invoice.student_id)
          .maybeSingle();
        if (!parentError && parent && parent.parents?.email) {
          recipientEmail = parent.parents.email;
        }
      }

      if (!recipientEmail) {
        toast.error("No email found for the student or parent.");
        setSendingEmail(false);
        return;
      }

      // 2. Build HTML invoice content
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
      const studentName = `${student.first_name || ""} ${student.last_name || ""}`.trim() || "N/A";

      // Build items table rows
      let itemsRows = items.map((item, idx) => `
        <tr>
          <td style="padding:4px 8px;border:1px solid #ddd;">${idx+1}</td>
          <td style="padding:4px 8px;border:1px solid #ddd;">${item.description}</td>
          <td style="padding:4px 8px;border:1px solid #ddd;text-align:right;">${item.quantity}</td>
          <td style="padding:4px 8px;border:1px solid #ddd;text-align:right;">${formatCurrency(item.unit_price)}</td>
          <td style="padding:4px 8px;border:1px solid #ddd;text-align:right;">${formatCurrency(item.taxable_amount)}</td>
          <td style="padding:4px 8px;border:1px solid #ddd;text-align:right;">${formatCurrency(item.cgst_amount)}</td>
          <td style="padding:4px 8px;border:1px solid #ddd;text-align:right;">${formatCurrency(item.sgst_amount)}</td>
          <td style="padding:4px 8px;border:1px solid #ddd;text-align:right;">${formatCurrency(item.igst_amount)}</td>
          <td style="padding:4px 8px;border:1px solid #ddd;text-align:right;">${formatCurrency(item.total_amount)}</td>
        </tr>
      `).join('');

      // Build payment history rows
      const totalPaid = payments.reduce((sum, p) => sum + Number(p.amount), 0);
      const balance = grandTotal - totalPaid;
      let paymentRows = payments.map(p => `
        <tr>
          <td style="padding:4px 8px;border:1px solid #ddd;">${p.payment_date}</td>
          <td style="padding:4px 8px;border:1px solid #ddd;text-align:right;">${formatCurrency(p.amount)}</td>
          <td style="padding:4px 8px;border:1px solid #ddd;">${p.payment_mode || "—"}</td>
          <td style="padding:4px 8px;border:1px solid #ddd;">${p.receipts?.[0]?.receipt_no || "—"}</td>
        </tr>
      `).join('');

      const htmlBody = `
        <div style="font-family:Arial,sans-serif;max-width:800px;margin:0 auto;padding:20px;border:1px solid #ddd;">
          <h2 style="text-align:center;color:${primaryColor};">TAX INVOICE</h2>
          <div style="display:flex;justify-content:space-between;margin-bottom:16px;">
            <div>
              <strong>Billed To:</strong> ${studentName}
              ${student.admission_no ? `<div>Admission: ${student.admission_no}</div>` : ''}
              ${student.gstin ? `<div>GSTIN: ${student.gstin}</div>` : ''}
              ${student.billing_address ? `<div>Address: ${student.billing_address}</div>` : ''}
            </div>
            <div style="text-align:right;">
              <strong>Invoice Details</strong>
              <div>No: ${invoice.invoice_number}</div>
              <div>Date: ${invoice.invoice_date}</div>
              <div>Status: ${invoice.status}</div>
              ${invoice.due_date ? `<div>Due Date: ${invoice.due_date}</div>` : ''}
            </div>
          </div>

          <table style="width:100%;border-collapse:collapse;margin-bottom:16px;">
            <thead>
              <tr style="background:${primaryColor};color:#fff;">
                <th style="padding:6px;border:1px solid #ccc;text-align:left;">#</th>
                <th style="padding:6px;border:1px solid #ccc;text-align:left;">Description</th>
                <th style="padding:6px;border:1px solid #ccc;text-align:right;">Qty</th>
                <th style="padding:6px;border:1px solid #ccc;text-align:right;">Unit Price</th>
                <th style="padding:6px;border:1px solid #ccc;text-align:right;">Taxable</th>
                <th style="padding:6px;border:1px solid #ccc;text-align:right;">CGST</th>
                <th style="padding:6px;border:1px solid #ccc;text-align:right;">SGST</th>
                <th style="padding:6px;border:1px solid #ccc;text-align:right;">IGST</th>
                <th style="padding:6px;border:1px solid #ccc;text-align:right;">Total</th>
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
              <div style="display:flex;justify-content:space-between;font-weight:bold;font-size:1.2em;border-top:2px solid ${primaryColor};margin-top:4px;padding-top:4px;">
                <span>Grand Total:</span>
                <span style="color:${primaryColor};">${formatCurrency(grandTotal)}</span>
              </div>
            </div>
          </div>

          <div style="margin-bottom:8px;"><strong>Amount in words:</strong> ${words}</div>

          ${reverseCharge ? `<div style="color:#CC0000;font-weight:bold;margin-bottom:8px;">** Reverse Charge Applicable – Tax payable by recipient **</div>` : ''}

          <div style="margin-top:20px;border-top:1px solid #ddd;padding-top:16px;">
            <h3 style="margin:0 0 8px 0;">Payment History</h3>
            ${payments.length === 0 ? '<p style="color:#888;">No payments recorded.</p>' : `
              <table style="width:100%;border-collapse:collapse;font-size:9pt;">
                <thead>
                  <tr style="background:#f0f0f0;">
                    <th style="padding:4px;border:1px solid #ddd;text-align:left;">Date</th>
                    <th style="padding:4px;border:1px solid #ddd;text-align:right;">Amount</th>
                    <th style="padding:4px;border:1px solid #ddd;text-align:left;">Mode</th>
                    <th style="padding:4px;border:1px solid #ddd;text-align:left;">Receipt No</th>
                  </tr>
                </thead>
                <tbody>
                  ${paymentRows}
                </tbody>
                <tfoot>
                  <tr style="font-weight:bold;">
                    <td style="padding:4px;border:1px solid #ddd;">Total Paid</td>
                    <td style="padding:4px;border:1px solid #ddd;text-align:right;">${formatCurrency(totalPaid)}</td>
                    <td colspan="2" style="padding:4px;border:1px solid #ddd;"></td>
                  </tr>
                  <tr style="font-weight:bold;">
                    <td style="padding:4px;border:1px solid #ddd;">Balance Due</td>
                    <td style="padding:4px;border:1px solid #ddd;text-align:right;color:${balance > 0 ? '#cc0000' : '#008000'};">${formatCurrency(balance)}</td>
                    <td colspan="2" style="padding:4px;border:1px solid #ddd;"></td>
                  </tr>
                </tfoot>
              </table>
            `}
          </div>

          <p style="color:#888;font-size:10px;margin-top:20px;">This is a computer‑generated invoice from ${org.company_name || 'Academy'}.</p>
        </div>
      `;

      // 3. Send email
      await sendEmail({
        to: recipientEmail,
        subject: `Invoice ${invoice.invoice_number} from ${org.company_name || 'Academy'}`,
        html: htmlBody,
       // from: org?.email || undefined,
      });

      toast.success(`Invoice sent to ${recipientEmail}`);
    } catch (err) {
      console.error("Email error:", err);
      toast.error("Failed to send invoice email.");
    } finally {
      setSendingEmail(false);
    }
  };

  // ── Print using PDF with auto‑print ──
  const handlePrint = async () => {
    if (!invoice || !org) return;
    setPrinting(true);
    try {
      const doc = await generateInvoicePDF(invoice, org, "sales", {
        autoPrint: true,
        theme,
      });
      doc.output("dataurlnewwindow");
    } catch (err) {
      toast.error("Failed to prepare PDF for printing");
      console.error(err);
    } finally {
      setPrinting(false);
    }
  };

  // ── Download PDF ──
  const handleDownloadPDF = async () => {
    if (!invoice || !org) return;
    setGeneratingPDF(true);
    try {
      const doc = await generateInvoicePDF(invoice, org, "sales", {
        theme,
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

  // ── Handle successful payment ──
  const handlePaymentSuccess = () => {
    setPaymentModalOpen(false);
    queryClient.invalidateQueries({ queryKey: ["invoice", id] });
    queryClient.invalidateQueries({ queryKey: ["invoices"] });
    queryClient.invalidateQueries({ queryKey: ["invoice-payments", id] });
    refetchPayments();
    toast.success("Payment recorded successfully");
  };

  if (isLoading) {
    return <div className="p-8 text-center">Loading invoice…</div>;
  }

  if (!invoice) {
    return <div className="p-8 text-center text-red-600">Invoice not found</div>;
  }

  // ── Compute totals ──
  const totalPaid = payments.reduce((sum, p) => sum + Number(p.amount), 0);
  const balance = invoice.grand_total - totalPaid;
  const isFullyPaid = balance <= 0;

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
      {/* Action buttons */}
      <div className="no-print flex justify-between items-center mb-6 flex-wrap gap-2">
        <button
          onClick={() => navigate("/invoices")}
          className="inline-flex items-center gap-2 text-secondary hover:text-primary-dark text-sm"
        >
          <ArrowLeft size={18} /> Back to Invoices
        </button>
        <div className="flex flex-wrap gap-2">
          {/* 👇 NEW Email Invoice button */}
          <button
            onClick={sendInvoiceEmail}
            disabled={sendingEmail}
            className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg text-sm flex items-center gap-2 transition disabled:opacity-50"
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
          {!isFullyPaid && (
            <button
              onClick={() => {
                setSelectedFee({
                  id: invoice.student_fee_id || null,
                  student_id: invoice.student_id,
                  students: invoice.students || {},
                  final_fee: invoice.grand_total,
                  pending: balance,
                  total_paid: totalPaid,
                  fee_structures: {
                    courses: { course_name: "Invoice Payment" },
                    tax_rate_id: null,
                    tax_inclusive: false,
                    tax_rates: null,
                  },
                });
                setPaymentModalOpen(true);
              }}
              className="bg-blue-600 text-white px-4 py-2 rounded-lg text-sm flex items-center gap-2"
            >
              <DollarSign size={16} /> Record Payment
            </button>
          )}
        </div>
      </div>

      {/* ─── Invoice Preview ─── */}
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
            {invoice.due_date && <div>Due Date: {invoice.due_date}</div>}
          </div>
        </div>

        {/* Items table */}
        <table style={{ width: "100%", borderCollapse: "collapse", marginBottom: "16px" }}>
          <thead>
            <tr style={{ background: primaryColor, color: "#fff" }}>
              <th style={{ padding: "6px", border: "1px solid #ccc", textAlign: "left" }}>#</th>
              <th style={{ padding: "6px", border: "1px solid #ccc", textAlign: "left" }}>Description</th>
              <th style={{ padding: "6px", border: "1px solid #ccc", textAlign: "right" }}>Qty</th>
              <th style={{ padding: "6px", border: "1px solid #ccc", textAlign: "right" }}>Unit Price</th>
              <th style={{ padding: "6px", border: "1px solid #ccc", textAlign: "right" }}>Taxable</th>
              <th style={{ padding: "6px", border: "1px solid #ccc", textAlign: "right" }}>CGST</th>
              <th style={{ padding: "6px", border: "1px solid #ccc", textAlign: "right" }}>SGST</th>
              <th style={{ padding: "6px", border: "1px solid #ccc", textAlign: "right" }}>IGST</th>
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
                <td style={{ padding: "6px", border: "1px solid #ccc", textAlign: "right" }}>{formatCurrency(item.taxable_amount)}</td>
                <td style={{ padding: "6px", border: "1px solid #ccc", textAlign: "right" }}>{formatCurrency(item.cgst_amount)}</td>
                <td style={{ padding: "6px", border: "1px solid #ccc", textAlign: "right" }}>{formatCurrency(item.sgst_amount)}</td>
                <td style={{ padding: "6px", border: "1px solid #ccc", textAlign: "right" }}>{formatCurrency(item.igst_amount)}</td>
                <td style={{ padding: "6px", border: "1px solid #ccc", textAlign: "right" }}>{formatCurrency(item.total_amount)}</td>
              </tr>
            ))}
          </tbody>
        </table>

        {/* Totals */}
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

        {/* Amount in words */}
        <div style={{ marginBottom: "8px" }}>
          <strong>Amount in words:</strong> {words}
        </div>

        {/* Reverse Charge Note */}
        {reverseCharge && (
          <div style={{ color: "#CC0000", fontWeight: "bold", marginBottom: "8px" }}>
            ** Reverse Charge Applicable – Tax payable by recipient **
          </div>
        )}

        {/* ─── Payment History ─── */}
        <div style={{ marginTop: "20px", borderTop: `1px solid #ddd`, paddingTop: "16px" }}>
          <h3 style={{ margin: "0 0 8px 0" }}>Payment History</h3>
          {payments.length === 0 ? (
            <p style={{ color: "#888" }}>No payments recorded.</p>
          ) : (
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "9pt" }}>
              <thead>
                <tr style={{ background: "#f0f0f0" }}>
                  <th style={{ padding: "4px", border: "1px solid #ddd", textAlign: "left" }}>Date</th>
                  <th style={{ padding: "4px", border: "1px solid #ddd", textAlign: "right" }}>Amount</th>
                  <th style={{ padding: "4px", border: "1px solid #ddd", textAlign: "left" }}>Mode</th>
                  <th style={{ padding: "4px", border: "1px solid #ddd", textAlign: "left" }}>Receipt No</th>
                </tr>
              </thead>
              <tbody>
                {payments.map((p) => (
                  <tr key={p.id}>
                    <td style={{ padding: "4px", border: "1px solid #ddd" }}>{p.payment_date}</td>
                    <td style={{ padding: "4px", border: "1px solid #ddd", textAlign: "right" }}>
                      {formatCurrency(p.amount)}
                    </td>
                    <td style={{ padding: "4px", border: "1px solid #ddd" }}>{p.payment_mode || "—"}</td>
                    <td style={{ padding: "4px", border: "1px solid #ddd" }}>
                      {p.receipts?.[0]?.receipt_no || "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr style={{ fontWeight: "bold" }}>
                  <td style={{ padding: "4px", border: "1px solid #ddd" }}>Total Paid</td>
                  <td style={{ padding: "4px", border: "1px solid #ddd", textAlign: "right" }}>
                    {formatCurrency(totalPaid)}
                  </td>
                  <td colSpan="2" style={{ padding: "4px", border: "1px solid #ddd" }}></td>
                </tr>
                <tr style={{ fontWeight: "bold" }}>
                  <td style={{ padding: "4px", border: "1px solid #ddd" }}>Balance Due</td>
                  <td style={{ padding: "4px", border: "1px solid #ddd", textAlign: "right", color: balance > 0 ? "#cc0000" : "#008000" }}>
                    {formatCurrency(balance)}
                  </td>
                  <td colSpan="2" style={{ padding: "4px", border: "1px solid #ddd" }}></td>
                </tr>
              </tfoot>
            </table>
          )}
        </div>
      </div>

      {/* ─── Collect Payment Modal ─── */}
      {selectedFee && (
        <CollectPaymentModal
          fee={selectedFee}
          onClose={() => {
            setPaymentModalOpen(false);
            setSelectedFee(null);
          }}
          onSuccess={handlePaymentSuccess}
        />
      )}

      <style>{`
        @media print {
          .no-print { display: none !important; }
          .invoice-preview { border: none !important; box-shadow: none !important; padding: 0 !important; max-width: 100% !important; }
        }
      `}</style>
    </>
  );
}