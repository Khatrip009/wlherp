// src/pages/ChartOfAccounts.jsx
import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import toast from "react-hot-toast";
import { Plus, Edit3, Trash2, X } from "lucide-react";
import AdminLayout from "../layouts/AdminLayout";
import {
  getChartOfAccounts,
  createAccount,
  updateAccount,
  deleteAccount,
} from "../services/accountingService";
import { useOrg } from "../context/OrganizationContext";

export default function ChartOfAccounts() {
  const queryClient = useQueryClient();
  const { branch, selectedFinancialYear } = useOrg();
  const branchId = branch?.id;
  const financialYearId = selectedFinancialYear?.id;

  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState({
    account_code: "",
    account_name: "",
    account_type: "asset",
    parent_id: "",
  });

  // Fetch accounts – now scoped
  const { data: accounts = [], isLoading } = useQuery({
    queryKey: ["chart-of-accounts", branchId, financialYearId],
    queryFn: () => getChartOfAccounts(branchId, financialYearId),
    enabled: !!branchId && !!financialYearId,
    staleTime: 10 * 60 * 1000,
  });

  // Context for mutations
  const context = { branchId, financialYearId };

  const createMutation = useMutation({
    mutationFn: (payload) => createAccount(payload, context),
    onSuccess: () => {
      toast.success("Account created");
      queryClient.invalidateQueries(["chart-of-accounts"]);
      setShowForm(false);
      resetForm();
    },
    onError: (err) => toast.error(err.message || "Failed to create"),
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, payload }) => updateAccount(id, payload, context),
    onSuccess: () => {
      toast.success("Account updated");
      queryClient.invalidateQueries(["chart-of-accounts"]);
      setEditing(null);
      setShowForm(false);
      resetForm();
    },
    onError: (err) => toast.error(err.message || "Failed to update"),
  });

  const deleteMutation = useMutation({
    mutationFn: (id) => deleteAccount(id, branchId, financialYearId),
    onSuccess: () => {
      toast.success("Account deleted");
      queryClient.invalidateQueries(["chart-of-accounts"]);
    },
    onError: (err) => toast.error(err.message || "Delete failed"),
  });

  const resetForm = () =>
    setForm({ account_code: "", account_name: "", account_type: "asset", parent_id: "" });

  const openCreate = () => {
    resetForm();
    setEditing(null);
    setShowForm(true);
  };

  const openEdit = (account) => {
    setForm({
      account_code: account.account_code,
      account_name: account.account_name,
      account_type: account.account_type,
      parent_id: account.parent_id || "",
    });
    setEditing(account);
    setShowForm(true);
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!form.account_code.trim() || !form.account_name.trim()) {
      toast.error("Code and name are required");
      return;
    }
    const payload = { ...form, parent_id: form.parent_id ? Number(form.parent_id) : null };
    if (editing) {
      updateMutation.mutate({ id: editing.id, payload });
    } else {
      createMutation.mutate(payload);
    }
  };

  // Group accounts by type
  const grouped = accounts.reduce((acc, a) => {
    const type = a.account_type;
    if (!acc[type]) acc[type] = [];
    acc[type].push(a);
    return acc;
  }, {});

  return (
    <AdminLayout>
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-3xl font-righteous text-primary-dark">Chart of Accounts</h1>
        <button
          onClick={openCreate}
          className="bg-primary text-white px-4 py-2 rounded-lg flex items-center gap-2 text-sm"
        >
          <Plus size={18} /> Add Account
        </button>
      </div>

      {isLoading ? (
        <p className="text-center py-6">Loading…</p>
      ) : (
        Object.entries(grouped).map(([type, accts]) => (
          <div key={type} className="mb-6">
            <h2 className="text-xl font-semibold text-primary-dark capitalize mb-3">{type}</h2>
            <div className="bg-white rounded-xl shadow-sm overflow-hidden">
              <table className="w-full">
                <thead className="bg-slate-100">
                  <tr>
                    <th className="p-3 text-left text-sm">Code</th>
                    <th className="p-3 text-left text-sm">Name</th>
                    <th className="p-3 text-left text-sm">Parent</th>
                    <th className="p-3 text-right text-sm">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {accts.map((a) => (
                    <tr key={a.id} className="border-t hover:bg-gray-50">
                      <td className="p-3 text-sm font-medium">{a.account_code}</td>
                      <td className="text-sm">{a.account_name}</td>
                      <td className="text-sm">
                        {accounts.find((p) => p.id === a.parent_id)?.account_name || "-"}
                      </td>
                      <td className="text-sm text-right">
                        <button onClick={() => openEdit(a)} className="text-blue-600 mr-2">
                          <Edit3 size={15} />
                        </button>
                        <button
                          onClick={() => {
                            if (window.confirm("Delete this account?"))
                              deleteMutation.mutate(a.id);
                          }}
                          className="text-red-600"
                        >
                          <Trash2 size={15} />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        ))
      )}

      {/* Add / Edit Modal */}
      {showForm && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl w-full max-w-md shadow-xl">
            <div className="flex items-center justify-between px-6 py-4 border-b">
              <h2 className="text-xl font-righteous text-primary-dark">
                {editing ? "Edit Account" : "Add Account"}
              </h2>
              <button onClick={() => setShowForm(false)} className="p-2 hover:bg-gray-100 rounded">
                <X size={20} />
              </button>
            </div>
            <form onSubmit={handleSubmit} className="p-6 space-y-4">
              <div>
                <label className="block text-sm mb-1">Account Code *</label>
                <input
                  type="text"
                  value={form.account_code}
                  onChange={(e) => setForm({ ...form, account_code: e.target.value })}
                  className="w-full border rounded p-2.5 text-sm"
                  required
                />
              </div>
              <div>
                <label className="block text-sm mb-1">Account Name *</label>
                <input
                  type="text"
                  value={form.account_name}
                  onChange={(e) => setForm({ ...form, account_name: e.target.value })}
                  className="w-full border rounded p-2.5 text-sm"
                  required
                />
              </div>
              <div>
                <label className="block text-sm mb-1">Type</label>
                <select
                  value={form.account_type}
                  onChange={(e) => setForm({ ...form, account_type: e.target.value })}
                  className="w-full border rounded p-2.5 text-sm"
                >
                  <option value="asset">Asset</option>
                  <option value="liability">Liability</option>
                  <option value="equity">Equity</option>
                  <option value="income">Income</option>
                  <option value="expense">Expense</option>
                </select>
              </div>
              <div>
                <label className="block text-sm mb-1">Parent Account</label>
                <select
                  value={form.parent_id}
                  onChange={(e) => setForm({ ...form, parent_id: e.target.value })}
                  className="w-full border rounded p-2.5 text-sm"
                >
                  <option value="">None</option>
                  {accounts.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.account_code} - {a.account_name}
                    </option>
                  ))}
                </select>
              </div>
              <div className="flex justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setShowForm(false)}
                  className="border px-4 py-2 rounded-lg text-sm"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="bg-primary text-white px-4 py-2 rounded-lg text-sm"
                >
                  {editing ? "Update" : "Create"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </AdminLayout>
  );
}