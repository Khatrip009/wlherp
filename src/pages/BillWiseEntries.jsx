// src/pages/BillWiseEntries.jsx
import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import toast from "react-hot-toast";
import { Plus, Edit3, Trash2, Search, DollarSign, Printer } from "lucide-react";
import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";
import { supabase } from "../api/supabase";
import {
  createBillWiseEntry,
  updateBillWiseEntry,
  deleteBillWiseEntry,
  recordBillPayment,
} from "../services/billWiseService";
import { useOrg } from "../context/OrganizationContext";
import { useTheme } from "../context/ThemeContext";

/* ─── PDF helpers ──────────────────────────────────────────── */
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

export default function BillWiseEntries() {
  const queryClient = useQueryClient();
  const { org, branch, selectedFinancialYear } = useOrg();
  const theme = useTheme();
  const branchId = branch?.id;
  const financialYearId = selectedFinancialYear?.id;

  const headingFont = theme?.font_heading || "Righteous";
  const bodyFont = theme?.font_body || "Montserrat";

  const context = { branchId, financialYearId };

  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState({
    reference: "",
    description: "",
    bill_date: new Date().toISOString().split("T")[0],
    due_date: "",
    original_amount: "",
    vendor_customer_name: "",
    contact: "",
  });
  const [paymentModal, setPaymentModal] = useState(null);
  const [paymentAmount, setPaymentAmount] = useState("");
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");

  // ── DIRECT SUPABASE QUERY – always scoped ──────────────────
  const { data: bills = [], isLoading } = useQuery({
    queryKey: ["bill-wise-entries", search, statusFilter, startDate, endDate, branchId, financialYearId],
    queryFn: async () => {
      let query = supabase
        .from("bill_wise_entries")
        .select("*")
        .order("bill_date", { ascending: false });

      if (branchId) query = query.eq("branch_id", branchId);
      if (financialYearId) query = query.eq("financial_year_id", financialYearId);

      if (search) {
        query = query.or(`reference.ilike.%${search}%,vendor_customer_name.ilike.%${search}%`);
      }
      if (statusFilter) query = query.eq("status", statusFilter);
      if (startDate) query = query.gte("bill_date", startDate);
      if (endDate) query = query.lte("bill_date", endDate);

      const { data, error } = await query;
      if (error) throw error;
      return data || [];
    },
    enabled: !!branchId && !!financialYearId,
    staleTime: 2 * 60 * 1000,
  });

  // ── Mutations (using existing services) ────────────────────
  const createMut = useMutation({
    mutationFn: (payload) => createBillWiseEntry(payload, context),
    onSuccess: () => {
      toast.success("Bill created");
      queryClient.invalidateQueries(["bill-wise-entries"]);
      setShowForm(false);
      resetForm();
    },
    onError: () => toast.error("Failed to create"),
  });

  const updateMut = useMutation({
    mutationFn: ({ id, payload }) => updateBillWiseEntry(id, payload, context),
    onSuccess: () => {
      toast.success("Bill updated");
      queryClient.invalidateQueries(["bill-wise-entries"]);
      setEditing(null);
      setShowForm(false);
    },
    onError: () => toast.error("Failed to update"),
  });

  const deleteMut = useMutation({
    mutationFn: (id) => deleteBillWiseEntry(id, branchId, financialYearId),
    onSuccess: () => {
      toast.success("Bill deleted");
      queryClient.invalidateQueries(["bill-wise-entries"]);
    },
    onError: () => toast.error("Delete failed"),
  });

  const paymentMut = useMutation({
    mutationFn: ({ entryId, amount }) => recordBillPayment(entryId, amount, context),
    onSuccess: () => {
      toast.success("Payment recorded");
      queryClient.invalidateQueries(["bill-wise-entries"]);
      setPaymentModal(null);
      setPaymentAmount("");
    },
    onError: () => toast.error("Payment failed"),
  });

  const resetForm = () =>
    setForm({
      reference: "",
      description: "",
      bill_date: new Date().toISOString().split("T")[0],
      due_date: "",
      original_amount: "",
      vendor_customer_name: "",
      contact: "",
    });

  const openCreate = () => { resetForm(); setEditing(null); setShowForm(true); };
  const openEdit = (bill) => {
    setForm({
      reference: bill.reference,
      description: bill.description || "",
      bill_date: bill.bill_date,
      due_date: bill.due_date || "",
      original_amount: bill.original_amount,
      vendor_customer_name: bill.vendor_customer_name || "",
      contact: bill.contact || "",
    });
    setEditing(bill);
    setShowForm(true);
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    const payload = { ...form, original_amount: parseFloat(form.original_amount) };
    if (editing) updateMut.mutate({ id: editing.id, payload });
    else createMut.mutate(payload);
  };

  const handlePayment = () => {
    if (!paymentModal || !paymentAmount) return;
    paymentMut.mutate({ entryId: paymentModal.id, amount: parseFloat(paymentAmount) });
  };

  // ─── PDF Export (all black, landscape) ────────────────────
  const handlePrintPDF = async () => {
    if (bills.length === 0) return;

    const doc = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4" });
    const pageWidth = doc.internal.pageSize.getWidth();
    const pageHeight = doc.internal.pageSize.getHeight();
    const margin = 10;
    let y = margin;

    let logoBase64 = null;
    if (org?.logo_dark_url) {
      logoBase64 = await loadImageAsBase64(org.logo_dark_url);
    }

    const logoWidth = 35, logoHeight = 14;
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

    doc.setFontSize(16);
    doc.setFont("helvetica", "bold");
    doc.setTextColor("#000000");
    doc.text("Bill‑wise Payables / Receivables", pageWidth / 2, y, { align: "center" });
    y += 10;

    const rows = bills.map((b) => [
      b.reference,
      b.vendor_customer_name || "—",
      b.bill_date,
      b.due_date || "—",
      b.original_amount,
      b.outstanding_amount,
      b.status,
    ]);

    autoTable(doc, {
      startY: y,
      head: [["Reference", "Name", "Bill Date", "Due Date", "Original", "Outstanding", "Status"]],
      body: rows,
      theme: "plain",
      styles: { fontSize: 8, textColor: [0,0,0], fillColor: [255,255,255], lineColor: [0,0,0], lineWidth: 0.2 },
      headStyles: { fillColor: [255,255,255], textColor: [0,0,0], fontStyle: "bold", lineWidth: 0.2, lineColor: [0,0,0] },
      columnStyles: {
        0: { cellWidth: 35 },
        1: { cellWidth: 40, halign: "left" },
        2: { cellWidth: 25 },
        3: { cellWidth: 25 },
        4: { cellWidth: 30, halign: "right" },
        5: { cellWidth: 30, halign: "right" },
        6: { cellWidth: 25 },
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
      },
    });

    y = doc.lastAutoTable.finalY + 10;

    const footerY = pageHeight - margin - 5;
    doc.setFontSize(7);
    doc.setTextColor("#000000");
    doc.setFont("helvetica", "italic");
    doc.text(`Generated on ${new Date().toLocaleString()}`, margin, footerY);
    doc.text(`© ${org?.company_name || "Academy"}`, pageWidth / 2, footerY, { align: "center" });

    doc.save(`BillWise_Entries_${new Date().toISOString().slice(0, 10)}.pdf`);
  };

  return (
    <div className="space-y-6 px-4 sm:px-6 lg:px-0">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold text-primary" style={{ fontFamily: headingFont }}>
            Bill‑wise Payables / Receivables
          </h1>
          <p className="text-sm text-primary-dark mt-1" style={{ fontFamily: bodyFont }}>
            Track outstanding bills and payments
          </p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={handlePrintPDF}
            className="inline-flex items-center gap-2 px-4 py-2.5 bg-primary hover:bg-accent text-white rounded-lg transition-colors text-sm font-medium"
            style={{ fontFamily: bodyFont }}
          >
            <Printer size={16} /> Print PDF
          </button>
          <button
            onClick={openCreate}
            className="inline-flex items-center gap-2 px-4 py-2.5 bg-primary hover:bg-accent text-white rounded-lg transition-colors text-sm font-medium"
            style={{ fontFamily: bodyFont }}
          >
            <Plus size={16} /> Add Bill
          </button>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-4">
        <div className="relative flex-1 min-w-[200px] max-w-xs">
          <Search size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-primary-dark/60" />
          <input
            type="text"
            placeholder="Search reference or name..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-10 pr-4 py-2.5 border border-primary-bg bg-white text-primary-dark rounded-lg text-sm"
            style={{ fontFamily: bodyFont }}
          />
        </div>
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="border border-primary-bg bg-white text-primary-dark rounded-lg px-4 py-2.5 text-sm"
          style={{ fontFamily: bodyFont }}
        >
          <option value="">All Statuses</option>
          <option value="Pending">Pending</option>
          <option value="Partially Paid">Partially Paid</option>
          <option value="Paid">Paid</option>
          <option value="Overdue">Overdue</option>
        </select>
        <input
          type="date"
          value={startDate}
          onChange={(e) => setStartDate(e.target.value)}
          className="border border-primary-bg bg-white text-primary-dark rounded-lg p-2.5 text-sm"
        />
        <input
          type="date"
          value={endDate}
          onChange={(e) => setEndDate(e.target.value)}
          className="border border-primary-bg bg-white text-primary-dark rounded-lg p-2.5 text-sm"
        />
      </div>

      {/* Table */}
      <div className="bg-white rounded-xl shadow-sm border border-primary-bg overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[800px]">
            <thead className="bg-primary-bg">
              <tr>
                <th className="p-3 text-left text-xs font-medium text-primary-dark uppercase" style={{ fontFamily: bodyFont }}>Reference</th>
                <th className="p-3 text-left text-xs font-medium text-primary-dark uppercase" style={{ fontFamily: bodyFont }}>Name</th>
                <th className="p-3 text-left text-xs font-medium text-primary-dark uppercase" style={{ fontFamily: bodyFont }}>Bill Date</th>
                <th className="p-3 text-left text-xs font-medium text-primary-dark uppercase" style={{ fontFamily: bodyFont }}>Due Date</th>
                <th className="p-3 text-right text-xs font-medium text-primary-dark uppercase" style={{ fontFamily: bodyFont }}>Original</th>
                <th className="p-3 text-right text-xs font-medium text-primary-dark uppercase" style={{ fontFamily: bodyFont }}>Outstanding</th>
                <th className="p-3 text-left text-xs font-medium text-primary-dark uppercase" style={{ fontFamily: bodyFont }}>Status</th>
                <th className="p-3 text-left text-xs font-medium text-primary-dark uppercase" style={{ fontFamily: bodyFont }}>Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-primary-bg">
              {isLoading ? (
                <tr><td colSpan={8} className="p-6 text-center text-primary-dark/60" style={{ fontFamily: bodyFont }}>Loading…</td></tr>
              ) : bills.length === 0 ? (
                <tr><td colSpan={8} className="p-6 text-center text-primary-dark/60" style={{ fontFamily: bodyFont }}>No bills found.</td></tr>
              ) : (
                bills.map((bill) => (
                  <tr key={bill.id} className="hover:bg-primary-bg transition-colors">
                    <td className="p-3 text-sm font-medium text-primary" style={{ fontFamily: headingFont }}>{bill.reference}</td>
                    <td className="text-sm text-primary-dark" style={{ fontFamily: bodyFont }}>{bill.vendor_customer_name || "—"}</td>
                    <td className="text-sm text-primary-dark" style={{ fontFamily: bodyFont }}>{bill.bill_date}</td>
                    <td className="text-sm text-primary-dark" style={{ fontFamily: bodyFont }}>{bill.due_date || "—"}</td>
                    <td className="text-sm text-right text-primary-dark" style={{ fontFamily: bodyFont }}>₹ {Number(bill.original_amount).toLocaleString("en-IN")}</td>
                    <td className="text-sm text-right font-medium text-primary" style={{ fontFamily: bodyFont }}>₹ {Number(bill.outstanding_amount).toLocaleString("en-IN")}</td>
                    <td className="text-sm">
                      <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                        bill.status === "Paid" ? "bg-primary-bg text-primary-dark" :
                        bill.status === "Partially Paid" ? "bg-accent-bg text-accent-dark" :
                        bill.status === "Overdue" ? "bg-accent text-white" :
                        "bg-primary-bg/50 text-primary-dark"
                      }`}>{bill.status}</span>
                    </td>
                    <td className="text-sm">
                      <div className="flex gap-2">
                        <button onClick={() => openEdit(bill)} className="text-primary hover:underline"><Edit3 size={15} /></button>
                        <button onClick={() => { if (window.confirm("Delete?")) deleteMut.mutate(bill.id); }} className="text-accent-dark hover:underline"><Trash2 size={15} /></button>
                        {bill.status !== "Paid" && (
                          <button onClick={() => { setPaymentModal(bill); setPaymentAmount(""); }} className="text-accent hover:underline"><DollarSign size={15} /></button>
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

      {/* Add / Edit Modal */}
      {showForm && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl max-w-md w-full p-6 shadow-xl border border-primary-bg">
            <h2 className="text-xl font-bold mb-4 text-primary" style={{ fontFamily: headingFont }}>
              {editing ? "Edit Bill" : "Add Bill"}
            </h2>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-sm mb-1 text-primary-dark" style={{ fontFamily: bodyFont }}>Reference *</label>
                <input type="text" value={form.reference} onChange={(e) => setForm({ ...form, reference: e.target.value })} className="w-full border border-primary-bg bg-white text-primary-dark rounded-lg p-2.5 text-sm" required />
              </div>
              <div>
                <label className="block text-sm mb-1 text-primary-dark" style={{ fontFamily: bodyFont }}>Description</label>
                <input type="text" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} className="w-full border border-primary-bg bg-white text-primary-dark rounded-lg p-2.5 text-sm" />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm mb-1 text-primary-dark" style={{ fontFamily: bodyFont }}>Bill Date *</label>
                  <input type="date" value={form.bill_date} onChange={(e) => setForm({ ...form, bill_date: e.target.value })} className="w-full border border-primary-bg bg-white text-primary-dark rounded-lg p-2.5 text-sm" required />
                </div>
                <div>
                  <label className="block text-sm mb-1 text-primary-dark" style={{ fontFamily: bodyFont }}>Due Date</label>
                  <input type="date" value={form.due_date} onChange={(e) => setForm({ ...form, due_date: e.target.value })} className="w-full border border-primary-bg bg-white text-primary-dark rounded-lg p-2.5 text-sm" />
                </div>
              </div>
              <div>
                <label className="block text-sm mb-1 text-primary-dark" style={{ fontFamily: bodyFont }}>Amount *</label>
                <input type="number" value={form.original_amount} onChange={(e) => setForm({ ...form, original_amount: e.target.value })} className="w-full border border-primary-bg bg-white text-primary-dark rounded-lg p-2.5 text-sm" required />
              </div>
              <div>
                <label className="block text-sm mb-1 text-primary-dark" style={{ fontFamily: bodyFont }}>Vendor / Student Name</label>
                <input type="text" value={form.vendor_customer_name} onChange={(e) => setForm({ ...form, vendor_customer_name: e.target.value })} className="w-full border border-primary-bg bg-white text-primary-dark rounded-lg p-2.5 text-sm" />
              </div>
              <div>
                <label className="block text-sm mb-1 text-primary-dark" style={{ fontFamily: bodyFont }}>Contact</label>
                <input type="text" value={form.contact} onChange={(e) => setForm({ ...form, contact: e.target.value })} className="w-full border border-primary-bg bg-white text-primary-dark rounded-lg p-2.5 text-sm" />
              </div>
              <div className="flex justify-end gap-3 pt-2">
                <button type="button" onClick={() => setShowForm(false)} className="border border-primary-bg px-4 py-2 rounded-lg text-sm text-primary-dark hover:bg-primary-bg transition-colors" style={{ fontFamily: bodyFont }}>Cancel</button>
                <button type="submit" className="bg-primary hover:bg-accent text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors" style={{ fontFamily: bodyFont }}>{editing ? "Update" : "Create"}</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Payment Modal */}
      {paymentModal && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl max-w-sm w-full p-6 shadow-xl border border-primary-bg">
            <h2 className="text-xl font-bold mb-4 text-primary" style={{ fontFamily: headingFont }}>Record Payment</h2>
            <p className="text-sm text-primary-dark mb-2" style={{ fontFamily: bodyFont }}>Bill: {paymentModal.reference}</p>
            <p className="text-sm text-primary-dark mb-4" style={{ fontFamily: bodyFont }}>Outstanding: ₹ {Number(paymentModal.outstanding_amount).toLocaleString("en-IN")}</p>
            <input
              type="number"
              value={paymentAmount}
              onChange={(e) => setPaymentAmount(e.target.value)}
              placeholder="Payment amount"
              className="w-full border border-primary-bg bg-white text-primary-dark rounded-lg p-2.5 text-sm mb-4"
            />
            <div className="flex justify-end gap-3">
              <button onClick={() => setPaymentModal(null)} className="border border-primary-bg px-4 py-2 rounded-lg text-sm text-primary-dark hover:bg-primary-bg transition-colors" style={{ fontFamily: bodyFont }}>Cancel</button>
              <button onClick={handlePayment} className="bg-primary hover:bg-accent text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors" style={{ fontFamily: bodyFont }}>Record Payment</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}