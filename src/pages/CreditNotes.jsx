// src/pages/CreditNotes.jsx
import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  getCreditNotes,
  createCreditNote,
  finalizeCreditNote,
  deleteCreditNote,
} from "../services/creditNoteService";
import { supabase } from "../api/supabase";
import { useOrg } from "../context/OrganizationContext";
import { useTheme } from "../context/ThemeContext"; // ✅ dynamic theme
import toast from "react-hot-toast";
import AdminLayout from "../layouts/AdminLayout";
import {
  Plus,
  CheckCircle,
  Loader,
  Search,
  X,
  Trash2,
} from "lucide-react";

export default function CreditNotes() {
  const queryClient = useQueryClient();

  // ── Organisation / Branch / Financial Year context ──
  const { branch, selectedFinancialYear } = useOrg();
  const theme = useTheme();
  const branchId = branch?.id;
  const financialYearId = selectedFinancialYear?.id;
  const ctx = { branchId, financialYearId };

  const headingFont = theme?.font_heading || "Righteous";
  const bodyFont = theme?.font_body || "Montserrat";

  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [showModal, setShowModal] = useState(false);
  const [selectedInvoice, setSelectedInvoice] = useState(null);
  const [studentSearch, setStudentSearch] = useState("");
  const [selectedStudent, setSelectedStudent] = useState(null);
  const [form, setForm] = useState({
    invoice_id: "",
    reason: "",
    total_amount: "",
    date: new Date().toISOString().split("T")[0],
  });
  const [calculatedTax, setCalculatedTax] = useState({
    taxable_amount: 0,
    cgst: 0,
    sgst: 0,
    igst: 0,
    total_tax_amount: 0,
  });
  const [submitting, setSubmitting] = useState(false);

  // Fetch credit notes – scoped to branch & FY
  const { data: notes = [], isLoading } = useQuery({
    queryKey: ["credit-notes", statusFilter, branchId, financialYearId],
    queryFn: () =>
      getCreditNotes({ status: statusFilter }, branchId, financialYearId),
    enabled: !!branchId && !!financialYearId,
    staleTime: 2 * 60 * 1000,
  });

  // Fetch students with search – scoped to branch & FY
  const { data: students = [] } = useQuery({
    queryKey: ["students-credit", studentSearch, branchId, financialYearId],
    queryFn: async () => {
      let query = supabase
        .from("students")
        .select("id, first_name, last_name, admission_no, gstin")
        .eq("branch_id", branchId)
        .eq("financial_year_id", financialYearId)
        .order("first_name");
      if (studentSearch) {
        query = query.or(
          `first_name.ilike.%${studentSearch}%,last_name.ilike.%${studentSearch}%,admission_no.ilike.%${studentSearch}%`
        );
      }
      const { data } = await query;
      return data || [];
    },
    enabled: !!branchId && !!financialYearId,
    staleTime: 5 * 60 * 1000,
  });

  // Fetch invoices for the selected student – scoped to branch & FY
  const { data: studentInvoices = [], refetch: refetchInvoices } = useQuery({
    queryKey: ["student-invoices", selectedStudent?.id, branchId, financialYearId],
    queryFn: async () => {
      if (!selectedStudent?.id) return [];
      const { data } = await supabase
        .from("invoices")
        .select(
          "id, invoice_number, invoice_date, grand_total, total_taxable_amount, total_cgst, total_sgst, total_igst, status"
        )
        .eq("student_id", selectedStudent.id)
        .eq("status", "Final")
        .eq("branch_id", branchId)
        .eq("financial_year_id", financialYearId)
        .order("invoice_date", { ascending: false });
      return data || [];
    },
    enabled: !!selectedStudent?.id && !!branchId && !!financialYearId,
    staleTime: 5 * 60 * 1000,
  });

  const handleStudentSelect = (studentId) => {
    const student = students.find((s) => s.id === Number(studentId));
    setSelectedStudent(student || null);
    setForm((prev) => ({ ...prev, invoice_id: "" }));
    setSelectedInvoice(null);
  };

  const handleInvoiceSelect = (invoiceId) => {
    const invoice = studentInvoices.find((inv) => inv.id === Number(invoiceId));
    setSelectedInvoice(invoice || null);
    setForm((prev) => ({ ...prev, invoice_id: invoiceId }));
    setCalculatedTax({
      taxable_amount: 0,
      cgst: 0,
      sgst: 0,
      igst: 0,
      total_tax_amount: 0,
    });
  };

  const handleAmountChange = (value) => {
    const total = parseFloat(value) || 0;
    if (!selectedInvoice || selectedInvoice.grand_total === 0) {
      setCalculatedTax({
        taxable_amount: 0,
        cgst: 0,
        sgst: 0,
        igst: 0,
        total_tax_amount: 0,
      });
      return;
    }

    const ratio = total / selectedInvoice.grand_total;
    setCalculatedTax({
      taxable_amount: selectedInvoice.total_taxable_amount * ratio,
      cgst: selectedInvoice.total_cgst * ratio,
      sgst: selectedInvoice.total_sgst * ratio,
      igst: selectedInvoice.total_igst * ratio,
      total_tax_amount:
        (selectedInvoice.total_cgst +
          selectedInvoice.total_sgst +
          selectedInvoice.total_igst) *
        ratio,
    });
  };

  // Mutations – pass context/branch/FY as needed
  const createMutation = useMutation({
    mutationFn: (payload) => createCreditNote(payload, ctx),
    onSuccess: () => {
      toast.success("Credit note created");
      queryClient.invalidateQueries(["credit-notes"]);
      setShowModal(false);
      resetForm();
    },
    onError: (err) => toast.error(err.message),
  });

  const finalizeMutation = useMutation({
    mutationFn: (id) => finalizeCreditNote(id, ctx),
    onSuccess: () => {
      toast.success("Credit note finalized");
      queryClient.invalidateQueries(["credit-notes"]);
    },
    onError: (err) => toast.error(err.message),
  });

  const deleteMutation = useMutation({
    mutationFn: (id) => deleteCreditNote(id, branchId, financialYearId),
    onSuccess: () => {
      toast.success("Credit note deleted");
      queryClient.invalidateQueries(["credit-notes"]);
    },
    onError: (err) => toast.error(err.message),
  });

  const resetForm = () => {
    setForm({
      invoice_id: "",
      reason: "",
      total_amount: "",
      date: new Date().toISOString().split("T")[0],
    });
    setSelectedInvoice(null);
    setSelectedStudent(null);
    setCalculatedTax({
      taxable_amount: 0,
      cgst: 0,
      sgst: 0,
      igst: 0,
      total_tax_amount: 0,
    });
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!form.invoice_id) {
      toast.error("Please select an invoice");
      return;
    }
    if (!form.total_amount || parseFloat(form.total_amount) <= 0) {
      toast.error("Please enter a valid amount");
      return;
    }
    if (
      selectedInvoice &&
      parseFloat(form.total_amount) > selectedInvoice.grand_total
    ) {
      toast.error("Credit note amount cannot exceed invoice total");
      return;
    }

    setSubmitting(true);
    const payload = {
      invoice_id: form.invoice_id,
      date: form.date,
      reason: form.reason,
      taxable_amount: calculatedTax.taxable_amount,
      cgst: calculatedTax.cgst,
      sgst: calculatedTax.sgst,
      igst: calculatedTax.igst,
      total_tax_amount: calculatedTax.total_tax_amount,
      total_amount: parseFloat(form.total_amount),
      gst_breakdown: {
        cgst: calculatedTax.cgst,
        sgst: calculatedTax.sgst,
        igst: calculatedTax.igst,
      },
    };
    createMutation.mutate(payload);
    setSubmitting(false);
  };

  const handleFinalize = (id) => {
    if (
      window.confirm(
        "Finalize this credit note? This action cannot be undone."
      )
    ) {
      finalizeMutation.mutate(id);
    }
  };

  const handleDelete = (id) => {
    if (window.confirm("Delete this credit note?")) {
      deleteMutation.mutate(id);
    }
  };

  const filteredNotes = notes.filter((note) => {
    const searchTerm = search.toLowerCase();
    const studentName =
      `${note.invoices?.students?.first_name} ${note.invoices?.students?.last_name}`.toLowerCase();
    return (
      note.credit_note_number.toLowerCase().includes(searchTerm) ||
      studentName.includes(searchTerm) ||
      note.reason?.toLowerCase().includes(searchTerm)
    );
  });

  return (
    <AdminLayout>
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-6 gap-4">
        <h1
          className="text-3xl font-bold text-primary"
          style={{ fontFamily: headingFont }}
        >
          Credit Notes
        </h1>
        <button
          onClick={() => setShowModal(true)}
          className="bg-primary hover:bg-primary-light text-white px-4 py-2 rounded-lg text-sm flex items-center gap-2 transition-colors"
          style={{ fontFamily: bodyFont }}
        >
          <Plus size={16} /> New Credit Note
        </button>
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
            placeholder="Search by note number, student..."
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
          <option value="Draft">Draft</option>
          <option value="Final">Final</option>
          <option value="Cancelled">Cancelled</option>
        </select>
      </div>

      {/* Table */}
      <div className="bg-white rounded-xl shadow-sm border border-primary-bg overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[700px]">
            <thead className="bg-primary-bg">
              <tr>
                <th
                  className="p-3 text-left text-sm font-medium text-primary-dark"
                  style={{ fontFamily: bodyFont }}
                >
                  Note No
                </th>
                <th
                  className="p-3 text-left text-sm font-medium text-primary-dark"
                  style={{ fontFamily: bodyFont }}
                >
                  Against Invoice
                </th>
                <th
                  className="p-3 text-left text-sm font-medium text-primary-dark"
                  style={{ fontFamily: bodyFont }}
                >
                  Student
                </th>
                <th
                  className="p-3 text-right text-sm font-medium text-primary-dark"
                  style={{ fontFamily: bodyFont }}
                >
                  Amount
                </th>
                <th
                  className="p-3 text-left text-sm font-medium text-primary-dark"
                  style={{ fontFamily: bodyFont }}
                >
                  Reason
                </th>
                <th
                  className="p-3 text-left text-sm font-medium text-primary-dark"
                  style={{ fontFamily: bodyFont }}
                >
                  Status
                </th>
                <th
                  className="p-3 text-left text-sm font-medium text-primary-dark"
                  style={{ fontFamily: bodyFont }}
                >
                  Actions
                </th>
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                <tr>
                  <td colSpan={7} className="p-6 text-center text-primary-dark/60" style={{ fontFamily: bodyFont }}>
                    Loading…
                  </td>
                </tr>
              ) : filteredNotes.length === 0 ? (
                <tr>
                  <td colSpan={7} className="p-6 text-center text-primary-dark/60" style={{ fontFamily: bodyFont }}>
                    No credit notes found.
                  </td>
                </tr>
              ) : (
                filteredNotes.map((note) => (
                  <tr
                    key={note.id}
                    className="border-t border-primary-bg hover:bg-primary-bg transition"
                  >
                    <td className="p-3 text-sm font-medium text-primary" style={{ fontFamily: bodyFont }}>
                      {note.credit_note_number}
                    </td>
                    <td className="p-3 text-sm text-primary-dark" style={{ fontFamily: bodyFont }}>
                      {note.invoices?.invoice_number || "—"}
                    </td>
                    <td className="p-3 text-sm text-primary-dark" style={{ fontFamily: bodyFont }}>
                      {note.invoices?.students?.first_name}{" "}
                      {note.invoices?.students?.last_name}
                    </td>
                    <td className="p-3 text-right text-sm font-medium text-primary" style={{ fontFamily: bodyFont }}>
                      ₹ {Number(note.total_amount).toLocaleString("en-IN")}
                    </td>
                    <td className="p-3 text-sm text-primary-dark" style={{ fontFamily: bodyFont }}>
                      {note.reason || "—"}
                    </td>
                    <td className="p-3 text-sm">
                      <span
                        className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                          note.status === "Final"
                            ? "bg-primary-bg text-primary-dark"
                            : note.status === "Draft"
                            ? "bg-accent-bg text-accent-dark"
                            : "bg-accent text-white"
                        }`}
                      >
                        {note.status}
                      </span>
                    </td>
                    <td className="p-3 text-sm">
                      <div className="flex gap-2">
                        {note.status === "Draft" && (
                          <>
                            <button
                              onClick={() => handleFinalize(note.id)}
                              className="text-primary hover:underline"
                              title="Finalize"
                            >
                              <CheckCircle size={15} />
                            </button>
                            <button
                              onClick={() => handleDelete(note.id)}
                              className="text-accent hover:underline"
                              title="Delete"
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

      {/* Create Modal */}
      {showModal && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto shadow-xl border border-primary-bg">
            <div className="sticky top-0 bg-white px-6 py-4 border-b border-primary-bg flex items-center justify-between rounded-t-xl">
              <h2
                className="text-xl font-bold text-primary"
                style={{ fontFamily: headingFont }}
              >
                New Credit Note
              </h2>
              <button
                onClick={() => {
                  setShowModal(false);
                  resetForm();
                }}
                className="p-2 hover:bg-primary-bg rounded-lg transition-colors"
              >
                <X size={20} className="text-primary-dark" />
              </button>
            </div>

            <form onSubmit={handleSubmit} className="p-6 space-y-4">
              {/* Student Selection */}
              <div>
                <label
                  className="block text-sm text-primary-dark mb-1"
                  style={{ fontFamily: bodyFont }}
                >
                  Student *
                </label>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <select
                    value={selectedStudent?.id || ""}
                    onChange={(e) => handleStudentSelect(e.target.value)}
                    className="w-full border border-primary-bg bg-white text-primary-dark rounded p-2.5 focus:ring-1 focus:ring-primary"
                    required
                  >
                    <option value="">Select Student</option>
                    {students.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.first_name} {s.last_name} ({s.admission_no})
                      </option>
                    ))}
                  </select>
                  <div className="relative">
                    <Search
                      size={16}
                      className="absolute left-3 top-1/2 -translate-y-1/2 text-primary-dark/60"
                    />
                    <input
                      type="text"
                      placeholder="Search student..."
                      value={studentSearch}
                      onChange={(e) => setStudentSearch(e.target.value)}
                      className="w-full pl-9 pr-4 py-2.5 border border-primary-bg bg-white text-primary-dark rounded-lg text-sm"
                      style={{ fontFamily: bodyFont }}
                    />
                  </div>
                </div>
              </div>

              {/* Invoice Selection (only if student selected) */}
              {selectedStudent && (
                <div>
                  <label
                    className="block text-sm text-primary-dark mb-1"
                    style={{ fontFamily: bodyFont }}
                  >
                    Invoice *
                  </label>
                  <select
                    value={form.invoice_id}
                    onChange={(e) => handleInvoiceSelect(e.target.value)}
                    className="w-full border border-primary-bg bg-white text-primary-dark rounded p-2.5 focus:ring-1 focus:ring-primary"
                    required
                  >
                    <option value="">Select Invoice</option>
                    {studentInvoices.map((inv) => (
                      <option key={inv.id} value={inv.id}>
                        {inv.invoice_number} (₹ {inv.grand_total.toLocaleString("en-IN")} - {inv.invoice_date})
                      </option>
                    ))}
                  </select>
                  {studentInvoices.length === 0 && (
                    <p className="text-xs text-accent-dark mt-1">
                      No finalized invoices found for this student.
                    </p>
                  )}
                </div>
              )}

              {/* Selected Invoice Details */}
              {selectedInvoice && (
                <div className="bg-primary-bg p-4 rounded-lg border border-primary-bg">
                  <p className="text-sm font-medium text-primary" style={{ fontFamily: headingFont }}>
                    Invoice: {selectedInvoice.invoice_number}
                  </p>
                  <div className="grid grid-cols-3 gap-2 text-sm mt-1">
                    <span className="text-primary-dark">
                      Taxable: ₹ {selectedInvoice.total_taxable_amount?.toLocaleString("en-IN")}
                    </span>
                    <span className="text-primary-dark">
                      CGST: ₹ {selectedInvoice.total_cgst?.toLocaleString("en-IN")}
                    </span>
                    <span className="text-primary-dark">
                      SGST: ₹ {selectedInvoice.total_sgst?.toLocaleString("en-IN")}
                    </span>
                    <span className="text-primary-dark">
                      IGST: ₹ {selectedInvoice.total_igst?.toLocaleString("en-IN")}
                    </span>
                    <span className="col-span-2 font-medium text-primary">
                      Total: ₹ {selectedInvoice.grand_total?.toLocaleString("en-IN")}
                    </span>
                  </div>
                </div>
              )}

              {/* Amount to Credit */}
              <div>
                <label
                  className="block text-sm text-primary-dark mb-1"
                  style={{ fontFamily: bodyFont }}
                >
                  Credit Amount (₹) *
                </label>
                <input
                  type="number"
                  value={form.total_amount}
                  onChange={(e) => {
                    setForm((prev) => ({ ...prev, total_amount: e.target.value }));
                    handleAmountChange(e.target.value);
                  }}
                  className="w-full border border-primary-bg bg-white text-primary rounded p-2.5 focus:ring-1 focus:ring-primary"
                  placeholder="Enter amount to credit"
                  min="0"
                  step="0.01"
                  required
                />
                <p className="text-xs text-primary-dark/60 mt-1">
                  Max allowed: ₹ {selectedInvoice?.grand_total?.toLocaleString("en-IN") || "0"}
                </p>
              </div>

              {/* Calculated Tax Breakdown */}
              {parseFloat(form.total_amount) > 0 && (
                <div className="bg-primary-bg rounded-lg p-3 space-y-1 text-sm">
                  <p className="font-medium text-primary-dark" style={{ fontFamily: bodyFont }}>
                    Tax Breakdown
                  </p>
                  <div className="grid grid-cols-2 gap-2">
                    <span className="text-primary-dark">Taxable Amount:</span>
                    <span className="font-medium text-right text-primary">
                      ₹ {calculatedTax.taxable_amount.toFixed(2)}
                    </span>
                    {calculatedTax.cgst > 0 && (
                      <>
                        <span className="text-primary-dark">CGST:</span>
                        <span className="font-medium text-right text-primary">
                          ₹ {calculatedTax.cgst.toFixed(2)}
                        </span>
                      </>
                    )}
                    {calculatedTax.sgst > 0 && (
                      <>
                        <span className="text-primary-dark">SGST:</span>
                        <span className="font-medium text-right text-primary">
                          ₹ {calculatedTax.sgst.toFixed(2)}
                        </span>
                      </>
                    )}
                    {calculatedTax.igst > 0 && (
                      <>
                        <span className="text-primary-dark">IGST:</span>
                        <span className="font-medium text-right text-primary">
                          ₹ {calculatedTax.igst.toFixed(2)}
                        </span>
                      </>
                    )}
                    <span className="text-primary-dark font-medium border-t border-primary-bg pt-1">
                      Total Tax:
                    </span>
                    <span className="font-medium text-right border-t border-primary-bg pt-1 text-primary">
                      ₹ {calculatedTax.total_tax_amount.toFixed(2)}
                    </span>
                    <span className="text-primary-dark font-bold border-t border-primary-bg pt-1">
                      Total Amount:
                    </span>
                    <span className="font-bold text-right border-t border-primary-bg pt-1 text-primary">
                      ₹ {Number(form.total_amount || 0).toFixed(2)}
                    </span>
                  </div>
                </div>
              )}

              {/* Reason */}
              <div>
                <label
                  className="block text-sm text-primary-dark mb-1"
                  style={{ fontFamily: bodyFont }}
                >
                  Reason
                </label>
                <textarea
                  value={form.reason}
                  onChange={(e) =>
                    setForm((prev) => ({ ...prev, reason: e.target.value }))
                  }
                  rows={2}
                  className="w-full border border-primary-bg bg-white text-primary-dark rounded p-2.5 focus:ring-1 focus:ring-primary"
                  placeholder="e.g., Student cancelled admission, Scholarship granted after billing, etc."
                  style={{ fontFamily: bodyFont }}
                />
              </div>

              <div>
                <label
                  className="block text-sm text-primary-dark mb-1"
                  style={{ fontFamily: bodyFont }}
                >
                  Date
                </label>
                <input
                  type="date"
                  value={form.date}
                  onChange={(e) =>
                    setForm((prev) => ({ ...prev, date: e.target.value }))
                  }
                  className="w-full border border-primary-bg bg-white text-primary rounded p-2.5 focus:ring-1 focus:ring-primary"
                />
              </div>

              <div className="flex justify-end gap-3 pt-2 border-t border-primary-bg">
                <button
                  type="button"
                  onClick={() => {
                    setShowModal(false);
                    resetForm();
                  }}
                  className="border border-primary-bg px-4 py-2 rounded-lg text-sm text-primary-dark hover:bg-primary-bg transition-colors"
                  style={{ fontFamily: bodyFont }}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitting || createMutation.isPending}
                  className="bg-primary hover:bg-primary-light text-white px-6 py-2 rounded-lg text-sm flex items-center gap-2 transition disabled:opacity-50"
                  style={{ fontFamily: bodyFont }}
                >
                  {submitting || createMutation.isPending ? (
                    <Loader className="w-4 h-4 animate-spin" />
                  ) : (
                    <CheckCircle size={16} />
                  )}
                  {submitting || createMutation.isPending ? "Creating..." : "Create Draft"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </AdminLayout>
  );
}