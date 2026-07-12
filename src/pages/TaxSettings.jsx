// src/pages/TaxSettings.jsx
import React, { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "../api/supabase";
import AdminLayout from "../layouts/AdminLayout";
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
import { useOrg } from "../context/OrganizationContext";   // NEW

export default function TaxSettings() {
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

  // ── Branch & Financial Year context ──
  const { branch, selectedFinancialYear } = useOrg();
  const branchId = branch?.id;
  const financialYearId = selectedFinancialYear?.id;

  // Fetch tax rates – scoped to branch & FY (include inactive as well)
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

  // Create mutation – adds branch & FY to payload
  const createMutation = useMutation({
    mutationFn: async (payload) => {
      if (payload.is_default) {
        // Unset other defaults (scoped)
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

  // Delete mutation – scoped to prevent cross‑branch deletion
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
    resetForm();
    setEditing(null);
    setShowForm(true);
  };

  const openEdit = (item) => {
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
    <AdminLayout>
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-6 gap-4">
        <div>
          <h1 className="text-3xl font-righteous text-primary-dark">Tax Settings</h1>
          <p className="text-sm text-secondary-dark font-montserrat mt-1">
            Manage tax rates applicable to fees and income
          </p>
        </div>
        <button
          onClick={openCreate}
          className="bg-primary hover:bg-primary-light text-white px-5 py-2.5 rounded-lg transition font-montserrat text-sm flex items-center gap-2"
        >
          <Plus size={18} /> Add Tax Rate
        </button>
      </div>

      {/* Tax Rates Table */}
      <div className="bg-white rounded-xl shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[600px]">
            <thead className="bg-slate-100 border-b border-secondary-light">
              <tr>
                <th className="p-3 text-left text-sm font-montserrat text-secondary-dark">Name</th>
                <th className="p-3 text-left text-sm font-montserrat text-secondary-dark">Rate</th>
                <th className="p-3 text-left text-sm font-montserrat text-secondary-dark">Country</th>
                <th className="p-3 text-left text-sm font-montserrat text-secondary-dark">Default</th>
                <th className="p-3 text-left text-sm font-montserrat text-secondary-dark">Status</th>
                <th className="p-3 text-left text-sm font-montserrat text-secondary-dark">Actions</th>
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                <tr>
                  <td colSpan={6} className="p-6 text-center text-secondary">Loading...</td>
                </tr>
              ) : taxRates.length === 0 ? (
                <tr>
                  <td colSpan={6} className="p-6 text-center text-secondary">
                    <div className="flex flex-col items-center gap-2">
                      <Percent size={32} className="text-secondary-light" />
                      <span>No tax rates defined</span>
                      <span className="text-xs text-secondary-light">
                        Add a tax rate to apply taxes to fees
                      </span>
                    </div>
                  </td>
                </tr>
              ) : (
                taxRates.map((rate) => (
                  <tr
                    key={rate.id}
                    className="border-b border-secondary-light hover:bg-primary-bg transition"
                  >
                    <td className="p-3 text-sm font-medium">{rate.name}</td>
                    <td className="p-3 text-sm">{rate.rate}%</td>
                    <td className="p-3 text-sm">{rate.country || "India"}</td>
                    <td className="p-3 text-sm">
                      {rate.is_default ? (
                        <Star size={16} className="text-yellow-500" />
                      ) : (
                        <span className="text-gray-400">-</span>
                      )}
                    </td>
                    <td className="p-3 text-sm">
                      <span
                        className={`px-2 py-1 rounded-full text-xs font-medium ${
                          rate.is_active
                            ? "bg-green-100 text-green-800"
                            : "bg-gray-100 text-gray-600"
                        }`}
                      >
                        {rate.is_active ? "Active" : "Inactive"}
                      </span>
                    </td>
                    <td className="p-3 text-sm">
                      <div className="flex gap-2">
                        <button
                          onClick={() => openEdit(rate)}
                          className="text-blue-600 hover:underline"
                          title="Edit"
                        >
                          <Edit3 size={15} />
                        </button>
                        <button
                          onClick={() => {
                            if (!window.confirm("Delete this tax rate?")) return;
                            deleteMutation.mutate(rate.id);
                          }}
                          className="text-red-600 hover:underline"
                          title="Delete"
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

      {/* Modal */}
      {showForm && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl w-full max-w-md shadow-xl">
            <div className="sticky top-0 bg-white border-b border-secondary-light px-6 py-4 flex items-center justify-between rounded-t-xl">
              <h2 className="text-xl font-righteous text-primary-dark">
                {editing ? "Edit Tax Rate" : "Add Tax Rate"}
              </h2>
              <button
                onClick={() => setShowForm(false)}
                className="p-2 hover:bg-secondary-bg rounded-lg"
              >
                <X size={20} className="text-secondary-dark" />
              </button>
            </div>
            <form onSubmit={handleSubmit} className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-montserrat text-secondary-dark mb-1">
                  Name *
                </label>
                <input
                  type="text"
                  placeholder="e.g., GST 18%"
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  className="w-full border border-secondary-light rounded p-2.5 focus:ring-1 focus:ring-primary focus:border-primary outline-none"
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-montserrat text-secondary-dark mb-1">
                  Rate (%) *
                </label>
                <input
                  type="number"
                  placeholder="e.g., 18"
                  value={form.rate}
                  onChange={(e) => setForm({ ...form, rate: e.target.value })}
                  className="w-full border border-secondary-light rounded p-2.5 focus:ring-1 focus:ring-primary focus:border-primary outline-none"
                  required
                  step="0.01"
                  min="0"
                />
              </div>
              <div>
                <label className="block text-sm font-montserrat text-secondary-dark mb-1">
                  Country
                </label>
                <input
                  type="text"
                  placeholder="Country"
                  value={form.country}
                  onChange={(e) => setForm({ ...form, country: e.target.value })}
                  className="w-full border border-secondary-light rounded p-2.5 focus:ring-1 focus:ring-primary focus:border-primary outline-none"
                />
              </div>
              <div className="flex items-center gap-3">
                <input
                  type="checkbox"
                  id="is_default"
                  checked={form.is_default}
                  onChange={(e) => setForm({ ...form, is_default: e.target.checked })}
                  className="w-4 h-4 text-primary border-gray-300 rounded focus:ring-primary"
                />
                <label htmlFor="is_default" className="text-sm text-gray-700">
                  Set as default tax rate
                </label>
              </div>
              <div className="flex items-center gap-3">
                <input
                  type="checkbox"
                  id="is_active"
                  checked={form.is_active}
                  onChange={(e) => setForm({ ...form, is_active: e.target.checked })}
                  className="w-4 h-4 text-primary border-gray-300 rounded focus:ring-primary"
                />
                <label htmlFor="is_active" className="text-sm text-gray-700">
                  Active
                </label>
              </div>
              <div className="flex flex-col sm:flex-row-reverse gap-3 pt-2">
                <button
                  type="submit"
                  disabled={createMutation.isPending || updateMutation.isPending}
                  className="w-full sm:w-auto bg-primary hover:bg-primary-light text-white px-6 py-2.5 rounded-lg font-montserrat transition disabled:opacity-60"
                >
                  {editing ? "Update" : "Create"}
                </button>
                <button
                  type="button"
                  onClick={() => setShowForm(false)}
                  className="w-full sm:w-auto border border-secondary-light text-secondary-dark hover:bg-secondary-bg px-6 py-2.5 rounded-lg font-montserrat transition"
                >
                  Cancel
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </AdminLayout>
  );
}