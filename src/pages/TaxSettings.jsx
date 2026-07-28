// src/pages/TaxSettings.jsx
import React, { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "../api/supabase";
import { useAuth } from "../context/AuthContext";
import { useOrg } from "../context/OrganizationContext";
import { useTheme } from "../context/ThemeContext"; // 👈 import theme
import toast from "react-hot-toast";
import {
  Plus,
  Edit3,
  Trash2,
  Check,
  X,
  Percent,
  Globe,
  Star,
} from "lucide-react";

export default function TaxSettings() {
  const { profile } = useAuth();
  const queryClient = useQueryClient();
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState({
    name: "",
    rate: "",
    country: "India",
    is_default: false,
    is_active: true,
  });

  // ── Check if user is branch admin ──
  const isBranchAdmin = profile?.role?.toLowerCase() === "branch_admin";

  // ── Branch & Financial Year context ──
  const { branch, selectedFinancialYear } = useOrg();
  const theme = useTheme(); // 👈 get theme colours (optional)
  const branchId = branch?.id;
  const financialYearId = selectedFinancialYear?.id;

  // Fetch tax rates – scoped to branch & FY
  const { data: taxRates = [], isLoading } = useQuery({
    queryKey: ["tax-rates", branchId, financialYearId],
    queryFn: async () => {
      let query = supabase
        .from("tax_rates")
        .select("*")
        .order("created_at", { ascending: false });

      if (branchId) query = query.eq("branch_id", branchId);
      if (financialYearId) query = query.eq("financial_year_id", financialYearId);

      const { data, error } = await query;
      if (error) throw error;
      return data;
    },
    enabled: !!branchId && !!financialYearId,
    staleTime: 10 * 60 * 1000,
  });

  // Create mutation – scoped
  const createMutation = useMutation({
    mutationFn: async (payload) => {
      if (payload.is_default) {
        let unsetQuery = supabase
          .from("tax_rates")
          .update({ is_default: false })
          .eq("is_default", true);
        if (branchId) unsetQuery = unsetQuery.eq("branch_id", branchId);
        if (financialYearId) unsetQuery = unsetQuery.eq("financial_year_id", financialYearId);
        await unsetQuery;
      }
      const { data, error } = await supabase
        .from("tax_rates")
        .insert([
          {
            ...payload,
            branch_id: branchId,
            financial_year_id: financialYearId,
          },
        ])
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      toast.success("Tax rate created");
      queryClient.invalidateQueries(["tax-rates"]);
      setShowForm(false);
      resetForm();
    },
    onError: (err) => toast.error(err.message),
  });

  // Update mutation – scoped
  const updateMutation = useMutation({
    mutationFn: async ({ id, payload }) => {
      if (payload.is_default) {
        let unsetQuery = supabase
          .from("tax_rates")
          .update({ is_default: false })
          .eq("is_default", true)
          .neq("id", id);
        if (branchId) unsetQuery = unsetQuery.eq("branch_id", branchId);
        if (financialYearId) unsetQuery = unsetQuery.eq("financial_year_id", financialYearId);
        await unsetQuery;
      }
      const { data, error } = await supabase
        .from("tax_rates")
        .update({
          ...payload,
          branch_id: branchId,
          financial_year_id: financialYearId,
        })
        .eq("id", id)
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      toast.success("Tax rate updated");
      queryClient.invalidateQueries(["tax-rates"]);
      setEditing(null);
      setShowForm(false);
      resetForm();
    },
    onError: (err) => toast.error(err.message),
  });

  // Delete mutation – scoped
  const deleteMutation = useMutation({
    mutationFn: async (id) => {
      let query = supabase
        .from("tax_rates")
        .delete()
        .eq("id", id);
      if (branchId) query = query.eq("branch_id", branchId);
      if (financialYearId) query = query.eq("financial_year_id", financialYearId);
      const { error } = await query;
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Tax rate deleted");
      queryClient.invalidateQueries(["tax-rates"]);
    },
    onError: (err) => toast.error(err.message),
  });

  const resetForm = () => {
    setForm({
      name: "",
      rate: "",
      country: "India",
      is_default: false,
      is_active: true,
    });
  };

  const openCreate = () => {
    if (isBranchAdmin) return;
    resetForm();
    setEditing(null);
    setShowForm(true);
  };

  const openEdit = (item) => {
    if (isBranchAdmin) return;
    setForm({
      name: item.name,
      rate: item.rate,
      country: item.country || "India",
      is_default: item.is_default || false,
      is_active: item.is_active !== undefined ? item.is_active : true,
    });
    setEditing(item);
    setShowForm(true);
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    if (isBranchAdmin) return;
    if (!form.name || !form.rate) {
      toast.error("Name and rate are required");
      return;
    }
    const payload = {
      ...form,
      rate: parseFloat(form.rate),
      is_active: form.is_active,
    };
    if (editing) {
      updateMutation.mutate({ id: editing.id, payload });
    } else {
      createMutation.mutate(payload);
    }
  };

  return (
    <div className="space-y-6 px-4 sm:px-6 lg:px-0">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-6 gap-4">
        <div>
          <h1 className="text-3xl font-heading text-primary">
            Tax Settings
          </h1>
          <p className="text-sm text-gray-600 dark:text-gray-400 font-body mt-1">
            Manage tax rates applicable to fees and income
          </p>
        </div>
        {!isBranchAdmin && (
          <button
            onClick={openCreate}
            className="bg-primary hover:bg-primary-light text-white px-5 py-2.5 rounded-lg transition font-body text-sm flex items-center gap-2"
          >
            <Plus size={18} /> Add Tax Rate
          </button>
        )}
      </div>

      {isBranchAdmin && (
        <div className="bg-yellow-50 dark:bg-yellow-900/20 border-l-4 border-yellow-400 dark:border-yellow-600 p-4 mb-6 rounded">
          <p className="text-yellow-700 dark:text-yellow-300 text-sm font-medium">
            Read‑only mode
          </p>
          <p className="text-yellow-600 dark:text-yellow-400 text-sm">
            As a branch admin, you can view but cannot edit tax settings.
          </p>
        </div>
      )}

      {/* Tax Rates Table */}
      <div className="bg-white dark:bg-accent rounded-xl shadow-sm overflow-hidden border border-gray-200 dark:border-gray-700">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[600px]">
            <thead className="bg-gray-50 dark:bg-gray-700 border-b border-gray-200 dark:border-gray-600">
              <tr>
                <th className="p-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                  Name
                </th>
                <th className="p-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                  Rate
                </th>
                <th className="p-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                  Country
                </th>
                <th className="p-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                  Default
                </th>
                <th className="p-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                  Status
                </th>
                <th className="p-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
              {isLoading ? (
                <tr>
                  <td colSpan={6} className="p-6 text-center text-gray-500 dark:text-gray-400">
                    Loading...
                  </td>
                </tr>
              ) : taxRates.length === 0 ? (
                <tr>
                  <td colSpan={6} className="p-6 text-center text-gray-500 dark:text-gray-400">
                    <div className="flex flex-col items-center gap-2">
                      <Percent size={32} className="text-gray-400 dark:text-gray-500" />
                      <span>No tax rates defined</span>
                      <span className="text-xs text-gray-400 dark:text-gray-500">
                        Add a tax rate to apply taxes to fees
                      </span>
                    </div>
                  </td>
                </tr>
              ) : (
                taxRates.map((rate) => (
                  <tr
                    key={rate.id}
                    className="hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
                  >
                    <td className="p-3 text-sm font-medium text-gray-800 dark:text-gray-100">
                      {rate.name}
                    </td>
                    <td className="p-3 text-sm text-gray-700 dark:text-gray-200">{rate.rate}%</td>
                    <td className="p-3 text-sm text-gray-700 dark:text-gray-200">
                      {rate.country || "India"}
                    </td>
                    <td className="p-3 text-sm">
                      {rate.is_default ? (
                        <Star size={16} className="text-yellow-500" />
                      ) : (
                        <span className="text-gray-400 dark:text-gray-500">-</span>
                      )}
                    </td>
                    <td className="p-3 text-sm">
                      <span
                        className={`px-2 py-1 rounded-full text-xs font-medium ${
                          rate.is_active
                            ? "bg-primary-bg text-primary dark:bg-primary-dark dark:text-primary-light"
                            : "bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-400"
                        }`}
                      >
                        {rate.is_active ? "Active" : "Inactive"}
                      </span>
                    </td>
                    <td className="p-3 text-sm">
                      {!isBranchAdmin ? (
                        <div className="flex gap-2">
                          <button
                            onClick={() => openEdit(rate)}
                            className="text-primary dark:text-primary-light hover:underline"
                            title="Edit"
                          >
                            <Edit3 size={15} />
                          </button>
                          <button
                            onClick={() => {
                              if (!window.confirm("Delete this tax rate?")) return;
                              deleteMutation.mutate(rate.id);
                            }}
                            className="text-accent-dark dark:text-accent-light hover:underline"
                            title="Delete"
                          >
                            <Trash2 size={15} />
                          </button>
                        </div>
                      ) : (
                        <span className="text-xs text-gray-400 dark:text-gray-500">
                          Read‑only
                        </span>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Modal – hidden for branch admin */}
      {!isBranchAdmin && showForm && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white dark:bg-accent rounded-xl w-full max-w-md shadow-xl border border-gray-200 dark:border-gray-700">
            <div className="sticky top-0 bg-white dark:bg-accent border-b border-gray-200 dark:border-gray-700 px-6 py-4 flex items-center justify-between rounded-t-xl">
              <h2 className="text-xl font-heading text-primary">
                {editing ? "Edit Tax Rate" : "Add Tax Rate"}
              </h2>
              <button
                onClick={() => setShowForm(false)}
                className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg"
              >
                <X size={20} className="text-gray-600 dark:text-gray-400" />
              </button>
            </div>
            <form onSubmit={handleSubmit} className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-body text-gray-700 dark:text-gray-300 mb-1">
                  Name *
                </label>
                <input
                  type="text"
                  placeholder="e.g., GST 18%"
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  className="w-full border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 rounded-lg p-2.5 text-sm focus:ring-2 focus:ring-primary outline-none"
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-body text-gray-700 dark:text-gray-300 mb-1">
                  Rate (%) *
                </label>
                <input
                  type="number"
                  placeholder="e.g., 18"
                  value={form.rate}
                  onChange={(e) => setForm({ ...form, rate: e.target.value })}
                  className="w-full border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 rounded-lg p-2.5 text-sm focus:ring-2 focus:ring-primary outline-none"
                  required
                  step="0.01"
                  min="0"
                />
              </div>
              <div>
                <label className="block text-sm font-body text-gray-700 dark:text-gray-300 mb-1">
                  Country
                </label>
                <input
                  type="text"
                  placeholder="Country"
                  value={form.country}
                  onChange={(e) => setForm({ ...form, country: e.target.value })}
                  className="w-full border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 rounded-lg p-2.5 text-sm focus:ring-2 focus:ring-primary outline-none"
                />
              </div>
              <div className="flex items-center gap-3">
                <input
                  type="checkbox"
                  id="is_default"
                  checked={form.is_default}
                  onChange={(e) => setForm({ ...form, is_default: e.target.checked })}
                  className="w-4 h-4 text-primary border-gray-300 dark:border-gray-600 rounded focus:ring-primary dark:focus:ring-offset-gray-800"
                />
                <label htmlFor="is_default" className="text-sm text-gray-700 dark:text-gray-300">
                  Set as default tax rate
                </label>
              </div>
              <div className="flex items-center gap-3">
                <input
                  type="checkbox"
                  id="is_active"
                  checked={form.is_active}
                  onChange={(e) => setForm({ ...form, is_active: e.target.checked })}
                  className="w-4 h-4 text-primary border-gray-300 dark:border-gray-600 rounded focus:ring-primary dark:focus:ring-offset-gray-800"
                />
                <label htmlFor="is_active" className="text-sm text-gray-700 dark:text-gray-300">
                  Active
                </label>
              </div>
              <div className="flex flex-col sm:flex-row-reverse gap-3 pt-2">
                <button
                  type="submit"
                  disabled={createMutation.isPending || updateMutation.isPending}
                  className="w-full sm:w-auto bg-primary hover:bg-primary-light text-white px-6 py-2.5 rounded-lg font-body transition disabled:opacity-60"
                >
                  {editing ? "Update" : "Create"}
                </button>
                <button
                  type="button"
                  onClick={() => setShowForm(false)}
                  className="w-full sm:w-auto border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-700 px-6 py-2.5 rounded-lg font-body transition"
                >
                  Cancel
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}