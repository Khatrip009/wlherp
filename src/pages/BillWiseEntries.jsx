// src/pages/BillWiseEntries.jsx
import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import toast from "react-hot-toast";
import { Plus, Edit3, Trash2, Search, Filter, DollarSign, Printer } from "lucide-react";
import {
  getBillWiseEntries,
  createBillWiseEntry,
  updateBillWiseEntry,
  deleteBillWiseEntry,
  recordBillPayment,
} from "../services/billWiseService";
import { getOrganization } from "../services/organizationService";
import { useOrg } from "../context/OrganizationContext";

export default function BillWiseEntries() {
  const queryClient = useQueryClient();
  const { org: currentOrg, branch, selectedFinancialYear } = useOrg();
  const branchId = branch?.id;
  const financialYearId = selectedFinancialYear?.id;

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

  // Fetch organization details
  const { data: org } = useQuery({
    queryKey: ["organization", currentOrg?.id],
    queryFn: () => getOrganization(currentOrg?.id),
    enabled: !!currentOrg?.id,
  });

  // Bills query – scoped
  const { data: bills = [], isLoading } = useQuery({
    queryKey: ["bill-wise-entries", search, statusFilter, startDate, endDate, branchId, financialYearId],
    queryFn: () =>
      getBillWiseEntries(
        { search, status: statusFilter, start_date: startDate, end_date: endDate },
        branchId,
        financialYearId
      ),
    enabled: !!branchId && !!financialYearId,
    staleTime: 2 * 60 * 1000,
  });

  // Mutations
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

  const openCreate = () => {
    resetForm();
    setEditing(null);
    setShowForm(true);
  };
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

  return (
    <div className="space-y-6 px-4 sm:px-6 lg:px-0">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold" style={{ fontFamily: "var(--font-heading)", color: "var(--color-primary)" }}>
            Bill‑wise Payables / Receivables
          </h1>
          <p className="text-sm text-gray-600 dark:text-gray-400 mt-1" style={{ fontFamily: "var(--font-body)" }}>
            Track outstanding bills and payments
          </p>
        </div>
        <button
          onClick={openCreate}
          className="inline-flex items-center gap-2 px-4 py-2.5 bg-primary hover:bg-primary-light text-white rounded-lg transition-colors text-sm font-medium"
          style={{ fontFamily: "var(--font-body)" }}
        >
          <Plus size={16} /> Add Bill
        </button>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-4">
        <div className="relative flex-1 min-w-[200px] max-w-xs">
          <Search size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 dark:text-gray-500" />
          <input
            type="text"
            placeholder="Search reference or name..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-10 pr-4 py-2.5 border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 rounded-lg text-sm"
            style={{ fontFamily: "var(--font-body)" }}
          />
        </div>
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 rounded-lg px-4 py-2.5 text-sm"
          style={{ fontFamily: "var(--font-body)" }}
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
          className="border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 rounded-lg p-2.5 text-sm"
          style={{ fontFamily: "var(--font-body)" }}
        />
        <input
          type="date"
          value={endDate}
          onChange={(e) => setEndDate(e.target.value)}
          className="border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 rounded-lg p-2.5 text-sm"
          style={{ fontFamily: "var(--font-body)" }}
        />
      </div>

      {/* Table */}
      <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[800px]">
            <thead className="bg-gray-50 dark:bg-gray-700">
              <tr>
                <th className="p-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Reference</th>
                <th className="p-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Name</th>
                <th className="p-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Bill Date</th>
                <th className="p-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Due Date</th>
                <th className="p-3 text-right text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Original</th>
                <th className="p-3 text-right text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Outstanding</th>
                <th className="p-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Status</th>
                <th className="p-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
              {isLoading ? (
                <tr>
                  <td colSpan={8} className="p-6 text-center text-gray-500 dark:text-gray-400">Loading…</td>
                </tr>
              ) : bills.length === 0 ? (
                <tr>
                  <td colSpan={8} className="p-6 text-center text-gray-500 dark:text-gray-400">No bills found.</td>
                </tr>
              ) : (
                bills.map((bill) => (
                  <tr key={bill.id} className="hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors">
                    <td className="p-3 text-sm font-medium text-gray-800 dark:text-gray-100">{bill.reference}</td>
                    <td className="text-sm text-gray-700 dark:text-gray-300">{bill.vendor_customer_name || "—"}</td>
                    <td className="text-sm text-gray-700 dark:text-gray-300">{bill.bill_date}</td>
                    <td className="text-sm text-gray-700 dark:text-gray-300">{bill.due_date || "—"}</td>
                    <td className="text-sm text-right text-gray-700 dark:text-gray-300">₹ {Number(bill.original_amount).toLocaleString("en-IN")}</td>
                    <td className="text-sm text-right font-medium text-gray-800 dark:text-gray-100">₹ {Number(bill.outstanding_amount).toLocaleString("en-IN")}</td>
                    <td className="text-sm">
                      <span
                        className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                          bill.status === "Paid"
                            ? "bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-200"
                            : bill.status === "Partially Paid"
                            ? "bg-yellow-100 text-yellow-700 dark:bg-yellow-900 dark:text-yellow-200"
                            : bill.status === "Overdue"
                            ? "bg-red-100 text-red-700 dark:bg-red-900 dark:text-red-200"
                            : "bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-200"
                        }`}
                      >
                        {bill.status}
                      </span>
                    </td>
                    <td className="text-sm">
                      <div className="flex gap-2">
                        <button onClick={() => openEdit(bill)} className="text-blue-600 dark:text-blue-400 hover:underline">
                          <Edit3 size={15} />
                        </button>
                        <button
                          onClick={() => { if (window.confirm("Delete?")) deleteMut.mutate(bill.id); }}
                          className="text-red-600 dark:text-red-400 hover:underline"
                        >
                          <Trash2 size={15} />
                        </button>
                        {bill.status !== "Paid" && (
                          <button
                            onClick={() => { setPaymentModal(bill); setPaymentAmount(""); }}
                            className="text-green-600 dark:text-green-400 hover:underline"
                          >
                            <DollarSign size={15} />
                          </button>
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
          <div className="bg-white dark:bg-gray-800 rounded-xl max-w-md w-full p-6 shadow-xl border border-gray-200 dark:border-gray-700">
            <h2 className="text-xl font-bold mb-4" style={{ fontFamily: "var(--font-heading)", color: "var(--color-primary)" }}>
              {editing ? "Edit Bill" : "Add Bill"}
            </h2>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-sm mb-1 text-gray-700 dark:text-gray-300" style={{ fontFamily: "var(--font-body)" }}>
                  Reference *
                </label>
                <input
                  type="text"
                  value={form.reference}
                  onChange={(e) => setForm({ ...form, reference: e.target.value })}
                  className="w-full border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 rounded-lg p-2.5 text-sm"
                  required
                />
              </div>
              <div>
                <label className="block text-sm mb-1 text-gray-700 dark:text-gray-300" style={{ fontFamily: "var(--font-body)" }}>
                  Description
                </label>
                <input
                  type="text"
                  value={form.description}
                  onChange={(e) => setForm({ ...form, description: e.target.value })}
                  className="w-full border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 rounded-lg p-2.5 text-sm"
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm mb-1 text-gray-700 dark:text-gray-300" style={{ fontFamily: "var(--font-body)" }}>
                    Bill Date *
                  </label>
                  <input
                    type="date"
                    value={form.bill_date}
                    onChange={(e) => setForm({ ...form, bill_date: e.target.value })}
                    className="w-full border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 rounded-lg p-2.5 text-sm"
                    required
                  />
                </div>
                <div>
                  <label className="block text-sm mb-1 text-gray-700 dark:text-gray-300" style={{ fontFamily: "var(--font-body)" }}>
                    Due Date
                  </label>
                  <input
                    type="date"
                    value={form.due_date}
                    onChange={(e) => setForm({ ...form, due_date: e.target.value })}
                    className="w-full border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 rounded-lg p-2.5 text-sm"
                  />
                </div>
              </div>
              <div>
                <label className="block text-sm mb-1 text-gray-700 dark:text-gray-300" style={{ fontFamily: "var(--font-body)" }}>
                  Amount *
                </label>
                <input
                  type="number"
                  value={form.original_amount}
                  onChange={(e) => setForm({ ...form, original_amount: e.target.value })}
                  className="w-full border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 rounded-lg p-2.5 text-sm"
                  required
                />
              </div>
              <div>
                <label className="block text-sm mb-1 text-gray-700 dark:text-gray-300" style={{ fontFamily: "var(--font-body)" }}>
                  Vendor / Student Name
                </label>
                <input
                  type="text"
                  value={form.vendor_customer_name}
                  onChange={(e) => setForm({ ...form, vendor_customer_name: e.target.value })}
                  className="w-full border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 rounded-lg p-2.5 text-sm"
                />
              </div>
              <div>
                <label className="block text-sm mb-1 text-gray-700 dark:text-gray-300" style={{ fontFamily: "var(--font-body)" }}>
                  Contact
                </label>
                <input
                  type="text"
                  value={form.contact}
                  onChange={(e) => setForm({ ...form, contact: e.target.value })}
                  className="w-full border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 rounded-lg p-2.5 text-sm"
                />
              </div>
              <div className="flex justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setShowForm(false)}
                  className="border border-gray-300 dark:border-gray-600 px-4 py-2 rounded-lg text-sm text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
                  style={{ fontFamily: "var(--font-body)" }}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="bg-primary hover:bg-primary-light text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors"
                  style={{ fontFamily: "var(--font-body)" }}
                >
                  {editing ? "Update" : "Create"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Payment Modal */}
      {paymentModal && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white dark:bg-gray-800 rounded-xl max-w-sm w-full p-6 shadow-xl border border-gray-200 dark:border-gray-700">
            <h2 className="text-xl font-bold mb-4" style={{ fontFamily: "var(--font-heading)", color: "var(--color-primary)" }}>
              Record Payment
            </h2>
            <p className="text-sm text-gray-700 dark:text-gray-300 mb-2">Bill: {paymentModal.reference}</p>
            <p className="text-sm text-gray-700 dark:text-gray-300 mb-4">
              Outstanding: ₹ {Number(paymentModal.outstanding_amount).toLocaleString("en-IN")}
            </p>
            <input
              type="number"
              value={paymentAmount}
              onChange={(e) => setPaymentAmount(e.target.value)}
              placeholder="Payment amount"
              className="w-full border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 rounded-lg p-2.5 text-sm mb-4"
              style={{ fontFamily: "var(--font-body)" }}
            />
            <div className="flex justify-end gap-3">
              <button
                onClick={() => setPaymentModal(null)}
                className="border border-gray-300 dark:border-gray-600 px-4 py-2 rounded-lg text-sm text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
                style={{ fontFamily: "var(--font-body)" }}
              >
                Cancel
              </button>
              <button
                onClick={handlePayment}
                className="bg-primary hover:bg-primary-light text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors"
                style={{ fontFamily: "var(--font-body)" }}
              >
                Record Payment
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}