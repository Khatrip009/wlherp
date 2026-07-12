// src/pages/DebitNotes.jsx
import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  getDebitNotes,
  createDebitNote,
  finalizeDebitNote,
  deleteDebitNote,
} from "../services/debitNoteService";
import { supabase } from "../api/supabase";
import { useOrg } from "../context/OrganizationContext";
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

export default function DebitNotes() {
  const queryClient = useQueryClient();

  // ── Organisation / Branch / Financial Year context ──
  const { branch, selectedFinancialYear } = useOrg();
  const branchId = branch?.id;
  const financialYearId = selectedFinancialYear?.id;
  const ctx = { branchId, financialYearId };

  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [showModal, setShowModal] = useState(false);
  const [selectedInvoice, setSelectedInvoice] = useState(null);
  const [studentSearch, setStudentSearch] = useState("");
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

  // Fetch debit notes – now scoped
  const { data: notes = [], isLoading } = useQuery({
    queryKey: ["debit-notes", statusFilter, branchId, financialYearId],
    queryFn: () =>
      getDebitNotes({ status: statusFilter }, branchId, financialYearId),
    enabled: !!branchId && !!financialYearId,
    staleTime: 2 * 60 * 1000,
  });

  // Fetch students – now scoped
  const { data: students = [] } = useQuery({
    queryKey: ["students-debit", studentSearch, branchId, financialYearId],
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

  const handleInvoiceSelect = async (invoiceId) => {
    // Fetch invoice scoped by branch & FY
    const { data: invoice } = await supabase
      .from("invoices")
      .select("*")
      .eq("id", invoiceId)
      .eq("branch_id", branchId)
      .eq("financial_year_id", financialYearId)
      .single();

    setSelectedInvoice(invoice);
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

  // Mutations – now all pass the required scope
  const createMutation = useMutation({
    mutationFn: (payload) => createDebitNote(payload, ctx),
    onSuccess: () => {
      toast.success("Debit note created");
      queryClient.invalidateQueries(["debit-notes"]);
      setShowModal(false);
      resetForm();
    },
    onError: (err) => toast.error(err.message),
  });

  const finalizeMutation = useMutation({
    mutationFn: (id) => finalizeDebitNote(id, ctx),
    onSuccess: () => {
      toast.success("Debit note finalized");
      queryClient.invalidateQueries(["debit-notes"]);
    },
    onError: (err) => toast.error(err.message),
  });

  const deleteMutation = useMutation({
    mutationFn: (id) => deleteDebitNote(id, branchId, financialYearId),
    onSuccess: () => {
      toast.success("Debit note deleted");
      queryClient.invalidateQueries(["debit-notes"]);
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
        "Finalize this debit note? This action cannot be undone."
      )
    ) {
      finalizeMutation.mutate(id);
    }
  };

  const handleDelete = (id) => {
    if (window.confirm("Delete this debit note?")) {
      deleteMutation.mutate(id);
    }
  };

  const filteredNotes = notes.filter((note) => {
    const searchTerm = search.toLowerCase();
    const studentName =
      `${note.invoices?.students?.first_name} ${note.invoices?.students?.last_name}`.toLowerCase();
    return (
      note.debit_note_number.toLowerCase().includes(searchTerm) ||
      studentName.includes(searchTerm) ||
      note.reason?.toLowerCase().includes(searchTerm)
    );
  });

  return (
    <AdminLayout>
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-6 gap-4">
        <h1 className="text-3xl font-righteous text-primary-dark">
          Debit Notes
        </h1>
        <button
          onClick={() => setShowModal(true)}
          className="bg-primary text-white px-4 py-2 rounded-lg text-sm flex items-center gap-2"
        >
          <Plus size={16} /> New Debit Note
        </button>
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-3 mb-4">
        <div className="relative flex-1">
          <Search
            size={18}
            className="absolute left-3 top-1/2 -translate-y-1/2 text-secondary"
          />
          <input
            type="text"
            placeholder="Search by note number, student..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-10 pr-4 py-2.5 border rounded-lg text-sm"
          />
        </div>
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="border rounded-lg px-4 py-2.5 text-sm"
        >
          <option value="">All Statuses</option>
          <option value="Draft">Draft</option>
          <option value="Final">Final</option>
          <option value="Cancelled">Cancelled</option>
        </select>
      </div>

      {/* Table */}
      <div className="bg-white rounded-xl shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[700px]">
            <thead className="bg-slate-100">
              <tr>
                <th className="p-3 text-left text-sm">Note No</th>
                <th className="p-3 text-left text-sm">Against Invoice</th>
                <th className="p-3 text-left text-sm">Student</th>
                <th className="p-3 text-right text-sm">Amount</th>
                <th className="p-3 text-left text-sm">Reason</th>
                <th className="p-3 text-left text-sm">Status</th>
                <th className="p-3 text-left text-sm">Actions</th>
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                <tr>
                  <td
                    colSpan={7}
                    className="p-6 text-center text-secondary"
                  >
                    Loading…
                  </td>
                </tr>
              ) : filteredNotes.length === 0 ? (
                <tr>
                  <td
                    colSpan={7}
                    className="p-6 text-center text-secondary"
                  >
                    No debit notes found.
                  </td>
                </tr>
              ) : (
                filteredNotes.map((note) => (
                  <tr
                    key={note.id}
                    className="border-t hover:bg-gray-50 transition"
                  >
                    <td className="p-3 text-sm font-medium">
                      {note.debit_note_number}
                    </td>
                    <td className="p-3 text-sm">
                      {note.invoices?.invoice_number || "—"}
                    </td>
                    <td className="p-3 text-sm">
                      {note.invoices?.students?.first_name}{" "}
                      {note.invoices?.students?.last_name}
                    </td>
                    <td className="p-3 text-right text-sm font-medium">
                      ₹{" "}
                      {Number(note.total_amount).toLocaleString(
                        "en-IN"
                      )}
                    </td>
                    <td className="p-3 text-sm">
                      {note.reason || "—"}
                    </td>
                    <td className="p-3 text-sm">
                      <span
                        className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                          note.status === "Final"
                            ? "bg-green-100 text-green-700"
                            : note.status === "Draft"
                            ? "bg-yellow-100 text-yellow-700"
                            : "bg-red-100 text-red-700"
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
                              onClick={() =>
                                handleFinalize(note.id)
                              }
                              className="text-green-600 hover:underline"
                              title="Finalize"
                            >
                              <CheckCircle size={15} />
                            </button>
                            <button
                              onClick={() =>
                                handleDelete(note.id)
                              }
                              className="text-red-600 hover:underline"
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

      {/* Create Modal – unchanged except createMutation already passes ctx */}
      {showModal && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto shadow-xl">
            <div className="sticky top-0 bg-white px-6 py-4 border-b flex items-center justify-between rounded-t-xl">
              <h2 className="text-xl font-righteous text-primary-dark">
                New Debit Note
              </h2>
              <button
                onClick={() => {
                  setShowModal(false);
                  resetForm();
                }}
                className="p-2 hover:bg-secondary-bg rounded-lg"
              >
                <X size={20} className="text-secondary-dark" />
              </button>
            </div>

            <form onSubmit={handleSubmit} className="p-6 space-y-4">
              {/* Student & Invoice Selection */}
              <div>
                <label className="block text-sm font-montserrat text-secondary-dark mb-1">
                  Student / Invoice *
                </label>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <select
                    value={form.invoice_id}
                    onChange={(e) =>
                      handleInvoiceSelect(e.target.value)
                    }
                    className="w-full border border-secondary-light rounded p-2.5 focus:ring-1 focus:ring-primary"
                    required
                  >
                    <option value="">Select Invoice</option>
                    {students.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.first_name} {s.last_name} (
                        {s.admission_no})
                      </option>
                    ))}
                  </select>
                  <div className="relative">
                    <Search
                      size={16}
                      className="absolute left-3 top-1/2 -translate-y-1/2 text-secondary"
                    />
                    <input
                      type="text"
                      placeholder="Search student..."
                      value={studentSearch}
                      onChange={(e) =>
                        setStudentSearch(e.target.value)
                      }
                      className="w-full pl-9 pr-4 py-2.5 border rounded-lg text-sm"
                    />
                  </div>
                </div>
              </div>

              {/* Selected Invoice Details */}
              {selectedInvoice && (
                <div className="bg-blue-50 p-4 rounded-lg border border-blue-200">
                  <p className="text-sm font-medium text-blue-800">
                    Invoice: {selectedInvoice.invoice_number}
                  </p>
                  <div className="grid grid-cols-3 gap-2 text-sm mt-1">
                    <span>
                      Taxable: ₹{" "}
                      {selectedInvoice.total_taxable_amount?.toLocaleString(
                        "en-IN"
                      )}
                    </span>
                    <span>
                      CGST: ₹{" "}
                      {selectedInvoice.total_cgst?.toLocaleString(
                        "en-IN"
                      )}
                    </span>
                    <span>
                      SGST: ₹{" "}
                      {selectedInvoice.total_sgst?.toLocaleString(
                        "en-IN"
                      )}
                    </span>
                    <span>
                      IGST: ₹{" "}
                      {selectedInvoice.total_igst?.toLocaleString(
                        "en-IN"
                      )}
                    </span>
                    <span className="col-span-2 font-medium">
                      Total: ₹{" "}
                      {selectedInvoice.grand_total?.toLocaleString(
                        "en-IN"
                      )}
                    </span>
                  </div>
                </div>
              )}

              {/* Amount to Debit */}
              <div>
                <label className="block text-sm font-montserrat text-secondary-dark mb-1">
                  Debit Amount (₹) *
                </label>
                <input
                  type="number"
                  value={form.total_amount}
                  onChange={(e) => {
                    setForm((prev) => ({
                      ...prev,
                      total_amount: e.target.value,
                    }));
                    handleAmountChange(e.target.value);
                  }}
                  className="w-full border border-secondary-light rounded p-2.5 focus:ring-1 focus:ring-primary"
                  placeholder="Enter amount to debit"
                  min="0"
                  step="0.01"
                  required
                />
              </div>

              {/* Calculated Tax Breakdown */}
              {parseFloat(form.total_amount) > 0 && (
                <div className="bg-gray-50 rounded-lg p-3 space-y-1 text-sm">
                  <p className="font-medium text-secondary-dark">
                    Tax Breakdown
                  </p>
                  <div className="grid grid-cols-2 gap-2">
                    <span className="text-gray-600">
                      Taxable Amount:
                    </span>
                    <span className="font-medium text-right">
                      ₹ {calculatedTax.taxable_amount.toFixed(2)}
                    </span>
                    {calculatedTax.cgst > 0 && (
                      <>
                        <span className="text-gray-600">
                          CGST:
                        </span>
                        <span className="font-medium text-right">
                          ₹ {calculatedTax.cgst.toFixed(2)}
                        </span>
                      </>
                    )}
                    {calculatedTax.sgst > 0 && (
                      <>
                        <span className="text-gray-600">
                          SGST:
                        </span>
                        <span className="font-medium text-right">
                          ₹ {calculatedTax.sgst.toFixed(2)}
                        </span>
                      </>
                    )}
                    {calculatedTax.igst > 0 && (
                      <>
                        <span className="text-gray-600">
                          IGST:
                        </span>
                        <span className="font-medium text-right">
                          ₹ {calculatedTax.igst.toFixed(2)}
                        </span>
                      </>
                    )}
                    <span className="text-gray-600 font-medium border-t pt-1">
                      Total Tax:
                    </span>
                    <span className="font-medium text-right border-t pt-1">
                      ₹{" "}
                      {calculatedTax.total_tax_amount.toFixed(
                        2
                      )}
                    </span>
                    <span className="text-gray-600 font-bold border-t pt-1">
                      Total Amount:
                    </span>
                    <span className="font-bold text-right border-t pt-1">
                      ₹{" "}
                      {Number(
                        form.total_amount || 0
                      ).toFixed(2)}
                    </span>
                  </div>
                </div>
              )}

              {/* Reason */}
              <div>
                <label className="block text-sm font-montserrat text-secondary-dark mb-1">
                  Reason
                </label>
                <textarea
                  value={form.reason}
                  onChange={(e) =>
                    setForm((prev) => ({
                      ...prev,
                      reason: e.target.value,
                    }))
                  }
                  rows={2}
                  className="w-full border border-secondary-light rounded p-2.5 focus:ring-1 focus:ring-primary"
                  placeholder="e.g., Additional charges, Course upgrade, etc."
                />
              </div>

              <div>
                <label className="block text-sm font-montserrat text-secondary-dark mb-1">
                  Date
                </label>
                <input
                  type="date"
                  value={form.date}
                  onChange={(e) =>
                    setForm((prev) => ({
                      ...prev,
                      date: e.target.value,
                    }))
                  }
                  className="w-full border border-secondary-light rounded p-2.5 focus:ring-1 focus:ring-primary"
                />
              </div>

              <div className="flex justify-end gap-3 pt-2 border-t">
                <button
                  type="button"
                  onClick={() => {
                    setShowModal(false);
                    resetForm();
                  }}
                  className="border border-secondary-light px-4 py-2 rounded-lg text-sm hover:bg-secondary-bg transition"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={
                    submitting || createMutation.isPending
                  }
                  className="bg-primary hover:bg-primary-light text-white px-6 py-2 rounded-lg text-sm flex items-center gap-2 transition disabled:opacity-50"
                >
                  {submitting ||
                  createMutation.isPending ? (
                    <Loader className="w-4 h-4 animate-spin" />
                  ) : (
                    <CheckCircle size={16} />
                  )}
                  {submitting ||
                  createMutation.isPending
                    ? "Creating..."
                    : "Create Draft"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </AdminLayout>
  );
}