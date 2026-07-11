// src/pages/BillWiseEntries.jsx
import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import toast from "react-hot-toast";
import { Plus, Edit3, Trash2, Search, Filter, DollarSign, Printer } from "lucide-react";
import AdminLayout from "../layouts/AdminLayout";
import {
  getBillWiseEntries,
  createBillWiseEntry,
  updateBillWiseEntry,
  deleteBillWiseEntry,
  recordBillPayment,
} from "../services/billWiseService";
import { getOrganization } from "../services/organizationService";
import { useOrg } from "../context/OrganizationContext";   // NEW

export default function BillWiseEntries() {
  const queryClient = useQueryClient();
  const { org: currentOrg, branch, selectedFinancialYear } = useOrg();   // NEW
  const context = { branchId: branch?.id, financialYearId: selectedFinancialYear?.id };

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

  // Fetch organization with current org id
  const { data: org } = useQuery({
    queryKey: ["organization", currentOrg?.id],
    queryFn: () => getOrganization(currentOrg?.id),
    enabled: !!currentOrg?.id,
  });

  const { data: bills = [], isLoading } = useQuery({
    queryKey: ["bill-wise-entries", search, statusFilter, startDate, endDate],
    queryFn: () =>
      getBillWiseEntries({
        search,
        status: statusFilter,
        start_date: startDate,
        end_date: endDate,
      }),
    staleTime: 2 * 60 * 1000,
  });

  // Mutations now pass context
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
    mutationFn: deleteBillWiseEntry,   // hard delete, RLS protects
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

  return (
    <AdminLayout>
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-3xl font-righteous text-primary-dark">Bill‑wise Payables / Receivables</h1>
        <button onClick={openCreate} className="bg-primary text-white px-4 py-2 rounded-lg text-sm flex items-center gap-2">
          <Plus size={16} /> Add Bill
        </button>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-4 mb-6">
        <div className="relative flex-1 max-w-xs">
          <Search size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-secondary" />
          <input type="text" placeholder="Search reference or name..." value={search} onChange={(e) => setSearch(e.target.value)} className="w-full pl-10 pr-4 py-2 border rounded text-sm" />
        </div>
        <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className="border rounded p-2 text-sm">
          <option value="">All Statuses</option>
          <option value="Pending">Pending</option>
          <option value="Partially Paid">Partially Paid</option>
          <option value="Paid">Paid</option>
          <option value="Overdue">Overdue</option>
        </select>
        <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} className="border rounded p-2 text-sm" />
        <input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} className="border rounded p-2 text-sm" />
      </div>

      {/* Bills Table */}
      <div className="bg-white rounded-xl shadow-sm overflow-hidden">
        <table className="w-full">
          <thead className="bg-slate-100">
            <tr>
              <th className="p-3 text-left text-sm">Reference</th>
              <th className="p-3 text-left text-sm">Name</th>
              <th className="p-3 text-left text-sm">Bill Date</th>
              <th className="p-3 text-left text-sm">Due Date</th>
              <th className="p-3 text-right text-sm">Original</th>
              <th className="p-3 text-right text-sm">Outstanding</th>
              <th className="p-3 text-left text-sm">Status</th>
              <th className="p-3 text-left text-sm">Actions</th>
            </tr>
          </thead>
          <tbody>
            {isLoading ? (
              <tr><td colSpan={8} className="p-6 text-center">Loading…</td></tr>
            ) : bills.length === 0 ? (
              <tr><td colSpan={8} className="p-6 text-center text-secondary">No bills found.</td></tr>
            ) : (
              bills.map((bill) => (
                <tr key={bill.id} className="border-t hover:bg-gray-50">
                  <td className="p-3 text-sm font-medium">{bill.reference}</td>
                  <td className="text-sm">{bill.vendor_customer_name || "—"}</td>
                  <td className="text-sm">{bill.bill_date}</td>
                  <td className="text-sm">{bill.due_date || "—"}</td>
                  <td className="text-sm text-right">₹ {Number(bill.original_amount).toLocaleString("en-IN")}</td>
                  <td className="text-sm text-right font-medium">₹ {Number(bill.outstanding_amount).toLocaleString("en-IN")}</td>
                  <td className="text-sm">
                    <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                      bill.status === "Paid" ? "bg-green-100 text-green-700" :
                      bill.status === "Partially Paid" ? "bg-yellow-100 text-yellow-700" :
                      bill.status === "Overdue" ? "bg-red-100 text-red-700" :
                      "bg-blue-100 text-blue-700"
                    }`}>{bill.status}</span>
                  </td>
                  <td className="text-sm">
                    <div className="flex gap-2">
                      <button onClick={() => openEdit(bill)} className="text-blue-600"><Edit3 size={15} /></button>
                      <button onClick={() => { if (window.confirm("Delete?")) deleteMut.mutate(bill.id); }} className="text-red-600"><Trash2 size={15} /></button>
                      {bill.status !== "Paid" && (
                        <button onClick={() => { setPaymentModal(bill); setPaymentAmount(""); }} className="text-green-600"><DollarSign size={15} /></button>
                      )}
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Add / Edit Modal */}
      {showForm && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl max-w-md w-full p-6 shadow-xl">
            <h2 className="text-xl font-righteous text-primary-dark mb-4">{editing ? "Edit Bill" : "Add Bill"}</h2>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-sm mb-1">Reference *</label>
                <input type="text" value={form.reference} onChange={(e) => setForm({ ...form, reference: e.target.value })} className="w-full border rounded p-2.5 text-sm" required />
              </div>
              <div>
                <label className="block text-sm mb-1">Description</label>
                <input type="text" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} className="w-full border rounded p-2.5 text-sm" />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm mb-1">Bill Date *</label>
                  <input type="date" value={form.bill_date} onChange={(e) => setForm({ ...form, bill_date: e.target.value })} className="w-full border rounded p-2.5 text-sm" required />
                </div>
                <div>
                  <label className="block text-sm mb-1">Due Date</label>
                  <input type="date" value={form.due_date} onChange={(e) => setForm({ ...form, due_date: e.target.value })} className="w-full border rounded p-2.5 text-sm" />
                </div>
              </div>
              <div>
                <label className="block text-sm mb-1">Amount *</label>
                <input type="number" value={form.original_amount} onChange={(e) => setForm({ ...form, original_amount: e.target.value })} className="w-full border rounded p-2.5 text-sm" required />
              </div>
              <div>
                <label className="block text-sm mb-1">Vendor / Student Name</label>
                <input type="text" value={form.vendor_customer_name} onChange={(e) => setForm({ ...form, vendor_customer_name: e.target.value })} className="w-full border rounded p-2.5 text-sm" />
              </div>
              <div>
                <label className="block text-sm mb-1">Contact</label>
                <input type="text" value={form.contact} onChange={(e) => setForm({ ...form, contact: e.target.value })} className="w-full border rounded p-2.5 text-sm" />
              </div>
              <div className="flex justify-end gap-3 pt-2">
                <button type="button" onClick={() => setShowForm(false)} className="border px-4 py-2 rounded-lg text-sm">Cancel</button>
                <button type="submit" className="bg-primary text-white px-4 py-2 rounded-lg text-sm">{editing ? "Update" : "Create"}</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Payment Modal */}
      {paymentModal && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl max-w-sm w-full p-6 shadow-xl">
            <h2 className="text-xl font-righteous text-primary-dark mb-4">Record Payment</h2>
            <p className="text-sm mb-2">Bill: {paymentModal.reference}</p>
            <p className="text-sm mb-4">Outstanding: ₹ {Number(paymentModal.outstanding_amount).toLocaleString("en-IN")}</p>
            <input type="number" value={paymentAmount} onChange={(e) => setPaymentAmount(e.target.value)} placeholder="Payment amount" className="w-full border rounded p-2.5 text-sm mb-4" />
            <div className="flex justify-end gap-3">
              <button onClick={() => setPaymentModal(null)} className="border px-4 py-2 rounded-lg text-sm">Cancel</button>
              <button onClick={handlePayment} className="bg-primary text-white px-4 py-2 rounded-lg text-sm">Record Payment</button>
            </div>
          </div>
        </div>
      )}
    </AdminLayout>
  );
}