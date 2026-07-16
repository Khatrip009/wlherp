// src/pages/Budgets.jsx
import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import toast from "react-hot-toast";
import { Plus, Edit3, Trash2, BarChart3 } from "lucide-react";
import { Link } from "react-router-dom";
import {
  getBudgets,
  createBudget,
  updateBudget,
  deleteBudget,
} from "../services/budgetService";
import { getChartOfAccounts } from "../services/accountingService";
import { useOrg } from "../context/OrganizationContext";

export default function Budgets() {
  const queryClient = useQueryClient();
  const { branch, selectedFinancialYear } = useOrg();
  const branchId = branch?.id;
  const financialYearId = selectedFinancialYear?.id;

  const context = { branchId, financialYearId };

  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState({
    account_id: "",
    period_start: "",
    period_end: "",
    amount: "",
  });

  // Budgets – scoped
  const { data: budgets = [], isLoading } = useQuery({
    queryKey: ["budgets", branchId, financialYearId],
    queryFn: () => getBudgets(branchId, financialYearId),
    enabled: !!branchId && !!financialYearId,
    staleTime: 5 * 60 * 1000,
  });

  // Chart of Accounts – scoped
  const { data: accounts = [] } = useQuery({
    queryKey: ["chart-of-accounts", branchId, financialYearId],
    queryFn: () => getChartOfAccounts(branchId, financialYearId),
    enabled: !!branchId && !!financialYearId,
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
    mutationFn: (id) => deleteBudget(id, branchId, financialYearId),
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
    <div className="space-y-6 px-4 sm:px-6 lg:px-0">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1
            className="text-2xl sm:text-3xl font-bold"
            style={{ fontFamily: "var(--font-heading)", color: "var(--color-primary)" }}
          >
            Budgets
          </h1>
          <p
            className="text-sm text-gray-600 dark:text-gray-400 mt-1"
            style={{ fontFamily: "var(--font-body)" }}
          >
            Set and manage expense budgets
          </p>
        </div>
        <div className="flex gap-2">
          <Link
            to="/budget-vs-actual"
            className="inline-flex items-center gap-2 px-4 py-2.5 border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-200 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors text-sm"
            style={{ fontFamily: "var(--font-body)" }}
          >
            <BarChart3 size={16} /> Budget vs Actual
          </Link>
          <button
            onClick={openCreate}
            className="inline-flex items-center gap-2 px-4 py-2.5 bg-primary hover:bg-primary-light text-white rounded-lg transition-colors text-sm font-medium"
            style={{ fontFamily: "var(--font-body)" }}
          >
            <Plus size={16} /> Add Budget
          </button>
        </div>
      </div>

      {/* Budgets Table */}
      <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[600px]">
            <thead className="bg-gray-50 dark:bg-gray-700">
              <tr>
                <th className="p-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                  Account
                </th>
                <th className="p-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                  Period Start
                </th>
                <th className="p-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                  Period End
                </th>
                <th className="p-3 text-right text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                  Budget Amount
                </th>
                <th className="p-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
              {isLoading ? (
                <tr>
                  <td colSpan={5} className="p-6 text-center text-gray-500 dark:text-gray-400">
                    Loading…
                  </td>
                </tr>
              ) : budgets.length === 0 ? (
                <tr>
                  <td colSpan={5} className="p-6 text-center text-gray-500 dark:text-gray-400">
                    No budgets set. Create one to start.
                  </td>
                </tr>
              ) : (
                budgets.map((b) => (
                  <tr
                    key={b.id}
                    className="hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
                  >
                    <td className="p-3 text-sm text-gray-700 dark:text-gray-200">
                      {b.chart_of_accounts?.account_code} - {b.chart_of_accounts?.account_name}
                    </td>
                    <td className="text-sm text-gray-700 dark:text-gray-200">{b.period_start}</td>
                    <td className="text-sm text-gray-700 dark:text-gray-200">{b.period_end}</td>
                    <td className="text-sm text-right font-medium text-gray-800 dark:text-gray-100">
                      ₹ {Number(b.amount).toLocaleString("en-IN")}
                    </td>
                    <td className="text-sm">
                      <div className="flex gap-2">
                        <button
                          onClick={() => openEdit(b)}
                          className="text-blue-600 dark:text-blue-400 hover:underline"
                        >
                          <Edit3 size={15} />
                        </button>
                        <button
                          onClick={() => {
                            if (window.confirm("Delete?")) deleteMut.mutate(b.id);
                          }}
                          className="text-red-600 dark:text-red-400 hover:underline"
                        >
                          <Trash2 size={15} />
                        </button>
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
            <h2
              className="text-xl font-bold mb-4"
              style={{ fontFamily: "var(--font-heading)", color: "var(--color-primary)" }}
            >
              {editing ? "Edit Budget" : "Add Budget"}
            </h2>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label
                  className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1"
                  style={{ fontFamily: "var(--font-body)" }}
                >
                  Account *
                </label>
                <select
                  value={form.account_id}
                  onChange={(e) => setForm({ ...form, account_id: e.target.value })}
                  className="w-full border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 rounded-lg p-2.5 text-sm"
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
                  <label
                    className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1"
                    style={{ fontFamily: "var(--font-body)" }}
                  >
                    Period Start *
                  </label>
                  <input
                    type="date"
                    value={form.period_start}
                    onChange={(e) => setForm({ ...form, period_start: e.target.value })}
                    className="w-full border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 rounded-lg p-2.5 text-sm"
                    required
                  />
                </div>
                <div>
                  <label
                    className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1"
                    style={{ fontFamily: "var(--font-body)" }}
                  >
                    Period End *
                  </label>
                  <input
                    type="date"
                    value={form.period_end}
                    onChange={(e) => setForm({ ...form, period_end: e.target.value })}
                    className="w-full border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 rounded-lg p-2.5 text-sm"
                    required
                  />
                </div>
              </div>
              <div>
                <label
                  className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1"
                  style={{ fontFamily: "var(--font-body)" }}
                >
                  Budget Amount *
                </label>
                <input
                  type="number"
                  value={form.amount}
                  onChange={(e) => setForm({ ...form, amount: e.target.value })}
                  className="w-full border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 rounded-lg p-2.5 text-sm"
                  required
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
    </div>
  );
}