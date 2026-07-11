// src/pages/Budgets.jsx
import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import toast from "react-hot-toast";
import { Plus, Edit3, Trash2, BarChart3 } from "lucide-react";
import { Link } from "react-router-dom";
import AdminLayout from "../layouts/AdminLayout";
import { getBudgets, createBudget, updateBudget, deleteBudget } from "../services/budgetService";
import { getChartOfAccounts } from "../services/accountingService";
import { useOrg } from "../context/OrganizationContext";   // NEW

export default function Budgets() {
  const queryClient = useQueryClient();
  const { branch, selectedFinancialYear } = useOrg();   // NEW
  const context = { branchId: branch?.id, financialYearId: selectedFinancialYear?.id };

  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState({ account_id: "", period_start: "", period_end: "", amount: "" });

  const { data: budgets = [], isLoading } = useQuery({
    queryKey: ["budgets"],
    queryFn: getBudgets,
    staleTime: 5 * 60 * 1000,
  });

  const { data: accounts = [] } = useQuery({
    queryKey: ["chart-of-accounts"],
    queryFn: getChartOfAccounts,
    staleTime: 10 * 60 * 1000,
  });

  const expenseAccounts = accounts.filter((a) => a.account_type === "expense");

  // Mutations with context
  const createMut = useMutation({
    mutationFn: (payload) => createBudget(payload, context),
    onSuccess: () => {
      toast.success("Budget created");
      queryClient.invalidateQueries(["budgets"]);
      setShowForm(false);
    },
    onError: () => toast.error("Failed to create budget"),
  });

  const updateMut = useMutation({
    mutationFn: ({ id, payload }) => updateBudget(id, payload, context),
    onSuccess: () => {
      toast.success("Budget updated");
      queryClient.invalidateQueries(["budgets"]);
      setEditing(null);
      setShowForm(false);
    },
    onError: () => toast.error("Failed to update budget"),
  });

  const deleteMut = useMutation({
    mutationFn: deleteBudget,   // hard delete, RLS protects
    onSuccess: () => {
      toast.success("Budget deleted");
      queryClient.invalidateQueries(["budgets"]);
    },
    onError: () => toast.error("Delete failed"),
  });

  const openCreate = () => {
    setForm({ account_id: "", period_start: "", period_end: "", amount: "" });
    setEditing(null);
    setShowForm(true);
  };

  const openEdit = (budget) => {
    setForm({
      account_id: budget.account_id,
      period_start: budget.period_start,
      period_end: budget.period_end,
      amount: budget.amount,
    });
    setEditing(budget);
    setShowForm(true);
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    const payload = {
      ...form,
      amount: parseFloat(form.amount),
    };
    if (editing) updateMut.mutate({ id: editing.id, payload });
    else createMut.mutate(payload);
  };

  return (
    <AdminLayout>
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-3xl font-righteous text-primary-dark">Budgets</h1>
        <div className="flex gap-2">
          <Link
            to="/budget-vs-actual"
            className="border px-4 py-2 rounded-lg text-sm flex items-center gap-2"
          >
            <BarChart3 size={16} /> Budget vs Actual
          </Link>
          <button
            onClick={openCreate}
            className="bg-primary text-white px-4 py-2 rounded-lg text-sm flex items-center gap-2"
          >
            <Plus size={16} /> Add Budget
          </button>
        </div>
      </div>

      <div className="bg-white rounded-xl shadow-sm overflow-hidden">
        <table className="w-full">
          <thead className="bg-slate-100">
            <tr>
              <th className="p-3 text-left text-sm">Account</th>
              <th className="p-3 text-left text-sm">Period Start</th>
              <th className="p-3 text-left text-sm">Period End</th>
              <th className="p-3 text-right text-sm">Budget Amount</th>
              <th className="p-3 text-left text-sm">Actions</th>
            </tr>
          </thead>
          <tbody>
            {isLoading ? (
              <tr><td colSpan={5} className="p-6 text-center">Loading…</td></tr>
            ) : budgets.length === 0 ? (
              <tr><td colSpan={5} className="p-6 text-center text-secondary">No budgets set. Create one to start.</td></tr>
            ) : (
              budgets.map((b) => (
                <tr key={b.id} className="border-t hover:bg-gray-50">
                  <td className="p-3 text-sm">
                    {b.chart_of_accounts?.account_code} - {b.chart_of_accounts?.account_name}
                  </td>
                  <td className="text-sm">{b.period_start}</td>
                  <td className="text-sm">{b.period_end}</td>
                  <td className="text-sm text-right font-medium">₹ {Number(b.amount).toLocaleString("en-IN")}</td>
                  <td className="text-sm">
                    <button onClick={() => openEdit(b)} className="text-blue-600 mr-2">
                      <Edit3 size={15} />
                    </button>
                    <button onClick={() => { if (window.confirm("Delete?")) deleteMut.mutate(b.id); }} className="text-red-600">
                      <Trash2 size={15} />
                    </button>
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
            <h2 className="text-xl font-righteous text-primary-dark mb-4">{editing ? "Edit Budget" : "Add Budget"}</h2>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-sm mb-1">Account *</label>
                <select
                  value={form.account_id}
                  onChange={(e) => setForm({ ...form, account_id: e.target.value })}
                  className="w-full border rounded p-2.5 text-sm"
                  required
                >
                  <option value="">Select account</option>
                  {expenseAccounts.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.account_code} - {a.account_name}
                    </option>
                  ))}
                </select>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm mb-1">Period Start</label>
                  <input type="date" value={form.period_start} onChange={(e) => setForm({ ...form, period_start: e.target.value })} className="w-full border rounded p-2.5 text-sm" required />
                </div>
                <div>
                  <label className="block text-sm mb-1">Period End</label>
                  <input type="date" value={form.period_end} onChange={(e) => setForm({ ...form, period_end: e.target.value })} className="w-full border rounded p-2.5 text-sm" required />
                </div>
              </div>
              <div>
                <label className="block text-sm mb-1">Budget Amount *</label>
                <input type="number" value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} className="w-full border rounded p-2.5 text-sm" required />
              </div>
              <div className="flex justify-end gap-3">
                <button type="button" onClick={() => setShowForm(false)} className="border px-4 py-2 rounded-lg text-sm">Cancel</button>
                <button type="submit" className="bg-primary text-white px-4 py-2 rounded-lg text-sm">{editing ? "Update" : "Create"}</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </AdminLayout>
  );
}