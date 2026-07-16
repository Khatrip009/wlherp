// src/pages/FixedAssets.jsx
import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import toast from "react-hot-toast";
import { Plus, Edit3, Trash2, Calculator } from "lucide-react";
import {
  getFixedAssets,
  createFixedAsset,
  updateFixedAsset,
  deleteFixedAsset,
  calculateMonthlyDepreciation,
  postDepreciation,
} from "../services/fixedAssetService";
import { useOrg } from "../context/OrganizationContext";

export default function FixedAssets() {
  const queryClient = useQueryClient();

  const { branch, selectedFinancialYear } = useOrg();
  const branchId = branch?.id;
  const financialYearId = selectedFinancialYear?.id;
  const ctx = { branchId, financialYearId };

  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState({
    asset_name: "",
    category: "",
    purchase_date: "",
    purchase_cost: "",
    salvage_value: "0",
    useful_life_months: "",
    depreciation_method: "straight_line",
    status: "Active",
  });

  // Scoped query with branchId and financialYearId
  const { data: assets = [], isLoading } = useQuery({
    queryKey: ["fixed-assets", branchId, financialYearId],
    queryFn: () => getFixedAssets(branchId, financialYearId),
    enabled: !!branchId && !!financialYearId,
    staleTime: 2 * 60 * 1000,
  });

  const [depPreview, setDepPreview] = useState(null);
  const [posting, setPosting] = useState(false);

  // Mutations – now pass context where needed
  const createMut = useMutation({
    mutationFn: (payload) => createFixedAsset(payload, ctx),
    onSuccess: () => {
      toast.success("Asset added");
      queryClient.invalidateQueries({ queryKey: ["fixed-assets"] });
      setShowForm(false);
      resetForm();
    },
    onError: () => toast.error("Failed to add asset"),
  });

  const updateMut = useMutation({
    mutationFn: ({ id, payload }) => updateFixedAsset(id, payload, ctx),
    onSuccess: () => {
      toast.success("Asset updated");
      queryClient.invalidateQueries({ queryKey: ["fixed-assets"] });
      setEditing(null);
      setShowForm(false);
    },
    onError: () => toast.error("Failed to update asset"),
  });

  const deleteMut = useMutation({
    mutationFn: (id) => deleteFixedAsset(id, branchId, financialYearId),
    onSuccess: () => {
      toast.success("Asset deleted");
      queryClient.invalidateQueries({ queryKey: ["fixed-assets"] });
    },
    onError: () => toast.error("Delete failed"),
  });

  const resetForm = () =>
    setForm({
      asset_name: "",
      category: "",
      purchase_date: "",
      purchase_cost: "",
      salvage_value: "0",
      useful_life_months: "",
      depreciation_method: "straight_line",
      status: "Active",
    });

  const openCreate = () => { resetForm(); setEditing(null); setShowForm(true); };
  const openEdit = (asset) => {
    setForm({
      asset_name: asset.asset_name,
      category: asset.category || "",
      purchase_date: asset.purchase_date,
      purchase_cost: asset.purchase_cost,
      salvage_value: asset.salvage_value,
      useful_life_months: asset.useful_life_months,
      depreciation_method: asset.depreciation_method,
      status: asset.status,
    });
    setEditing(asset);
    setShowForm(true);
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    const payload = {
      ...form,
      purchase_cost: parseFloat(form.purchase_cost),
      salvage_value: parseFloat(form.salvage_value),
      useful_life_months: parseInt(form.useful_life_months),
    };
    if (editing) updateMut.mutate({ id: editing.id, payload });
    else createMut.mutate(payload);
  };

  const handleCalculateDep = async () => {
    if (!branchId || !financialYearId) {
      toast.error("Branch and financial year required");
      return;
    }
    const result = await calculateMonthlyDepreciation(branchId, financialYearId);
    setDepPreview(result);
    if (result.length === 0) toast("No depreciation to calculate");
  };

  const handlePostDep = async () => {
    if (!depPreview || depPreview.length === 0) return;
    setPosting(true);
    try {
      await postDepreciation(depPreview, ctx);
      toast.success("Depreciation posted");
      setDepPreview(null);
      queryClient.invalidateQueries({ queryKey: ["fixed-assets"] });
    } catch {
      toast.error("Posting failed");
    } finally {
      setPosting(false);
    }
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
            Fixed Assets Register
          </h1>
          <p
            className="text-sm text-gray-600 dark:text-gray-400 mt-1"
            style={{ fontFamily: "var(--font-body)" }}
          >
            Track company assets and depreciation
          </p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={handleCalculateDep}
            className="inline-flex items-center gap-2 px-4 py-2.5 border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-200 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors text-sm"
            style={{ fontFamily: "var(--font-body)" }}
          >
            <Calculator size={16} /> Calculate Depreciation
          </button>
          <button
            onClick={openCreate}
            className="inline-flex items-center gap-2 px-4 py-2.5 bg-primary hover:bg-primary-light text-white rounded-lg transition-colors text-sm font-medium"
            style={{ fontFamily: "var(--font-body)" }}
          >
            <Plus size={16} /> Add Asset
          </button>
        </div>
      </div>

      {/* Depreciation preview */}
      {depPreview && (
        <div className="bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-300 dark:border-yellow-700 rounded-xl p-4">
          <h3 className="font-semibold mb-2" style={{ fontFamily: "var(--font-heading)", color: "var(--color-primary)" }}>
            Monthly Depreciation Preview
          </h3>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-yellow-100 dark:bg-yellow-900/40">
                <tr>
                  <th className="text-left p-2 text-gray-700 dark:text-gray-200">Asset</th>
                  <th className="text-right p-2 text-gray-700 dark:text-gray-200">Depreciation</th>
                  <th className="text-right p-2 text-gray-700 dark:text-gray-200">New Book Value</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-yellow-200 dark:divide-yellow-800">
                {depPreview.map((d) => (
                  <tr key={d.id}>
                    <td className="p-2 text-gray-700 dark:text-gray-200">{d.asset_name}</td>
                    <td className="p-2 text-right text-gray-700 dark:text-gray-200">₹ {d.monthly_depreciation.toLocaleString("en-IN")}</td>
                    <td className="p-2 text-right text-gray-700 dark:text-gray-200">₹ {d.new_book_value.toLocaleString("en-IN")}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <button
            onClick={handlePostDep}
            disabled={posting}
            className="mt-3 bg-primary hover:bg-primary-light text-white px-4 py-2 rounded-lg text-sm font-medium transition disabled:opacity-50"
            style={{ fontFamily: "var(--font-body)" }}
          >
            {posting ? "Posting…" : "Post Depreciation Journal"}
          </button>
        </div>
      )}

      {/* Asset List */}
      <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[800px]">
            <thead className="bg-gray-50 dark:bg-gray-700">
              <tr>
                <th className="p-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Asset Name</th>
                <th className="p-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Category</th>
                <th className="p-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Purchase Date</th>
                <th className="p-3 text-right text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Cost</th>
                <th className="p-3 text-right text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Book Value</th>
                <th className="p-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Method</th>
                <th className="p-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Status</th>
                <th className="p-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
              {isLoading ? (
                <tr>
                  <td colSpan={8} className="p-6 text-center text-gray-500 dark:text-gray-400">Loading…</td>
                </tr>
              ) : assets.length === 0 ? (
                <tr>
                  <td colSpan={8} className="p-6 text-center text-gray-500 dark:text-gray-400">No assets recorded. Add your first asset.</td>
                </tr>
              ) : (
                assets.map((a) => (
                  <tr key={a.id} className="hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors">
                    <td className="p-3 text-sm font-medium text-gray-800 dark:text-gray-100">{a.asset_name}</td>
                    <td className="p-3 text-sm text-gray-700 dark:text-gray-200">{a.category}</td>
                    <td className="p-3 text-sm text-gray-700 dark:text-gray-200">{a.purchase_date}</td>
                    <td className="p-3 text-sm text-right text-gray-700 dark:text-gray-200">₹ {Number(a.purchase_cost).toLocaleString("en-IN")}</td>
                    <td className="p-3 text-sm text-right text-gray-700 dark:text-gray-200">₹ {Number(a.current_book_value).toLocaleString("en-IN")}</td>
                    <td className="p-3 text-sm capitalize text-gray-700 dark:text-gray-200">{a.depreciation_method.replace("_", " ")}</td>
                    <td className="p-3 text-sm text-gray-700 dark:text-gray-200">{a.status}</td>
                    <td className="text-sm">
                      <div className="flex gap-2">
                        <button onClick={() => openEdit(a)} className="text-blue-600 dark:text-blue-400 hover:underline"><Edit3 size={15} /></button>
                        <button onClick={() => { if (window.confirm("Delete?")) deleteMut.mutate(a.id); }} className="text-red-600 dark:text-red-400 hover:underline"><Trash2 size={15} /></button>
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
          <div className="bg-white dark:bg-gray-800 rounded-xl max-w-md w-full p-6 shadow-xl max-h-[90vh] overflow-y-auto border border-gray-200 dark:border-gray-700">
            <h2
              className="text-xl font-bold mb-4"
              style={{ fontFamily: "var(--font-heading)", color: "var(--color-primary)" }}
            >
              {editing ? "Edit Asset" : "Add Asset"}
            </h2>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1" style={{ fontFamily: "var(--font-body)" }}>
                  Asset Name *
                </label>
                <input
                  type="text"
                  value={form.asset_name}
                  onChange={(e) => setForm({ ...form, asset_name: e.target.value })}
                  className="w-full border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 rounded-lg p-2.5 text-sm"
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1" style={{ fontFamily: "var(--font-body)" }}>
                  Category
                </label>
                <input
                  type="text"
                  value={form.category}
                  onChange={(e) => setForm({ ...form, category: e.target.value })}
                  className="w-full border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 rounded-lg p-2.5 text-sm"
                  placeholder="Furniture, Computer, etc."
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1" style={{ fontFamily: "var(--font-body)" }}>
                  Purchase Date *
                </label>
                <input
                  type="date"
                  value={form.purchase_date}
                  onChange={(e) => setForm({ ...form, purchase_date: e.target.value })}
                  className="w-full border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 rounded-lg p-2.5 text-sm"
                  required
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1" style={{ fontFamily: "var(--font-body)" }}>
                    Purchase Cost *
                  </label>
                  <input
                    type="number"
                    value={form.purchase_cost}
                    onChange={(e) => setForm({ ...form, purchase_cost: e.target.value })}
                    className="w-full border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 rounded-lg p-2.5 text-sm"
                    required
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1" style={{ fontFamily: "var(--font-body)" }}>
                    Salvage Value
                  </label>
                  <input
                    type="number"
                    value={form.salvage_value}
                    onChange={(e) => setForm({ ...form, salvage_value: e.target.value })}
                    className="w-full border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 rounded-lg p-2.5 text-sm"
                  />
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1" style={{ fontFamily: "var(--font-body)" }}>
                  Useful Life (months) *
                </label>
                <input
                  type="number"
                  value={form.useful_life_months}
                  onChange={(e) => setForm({ ...form, useful_life_months: e.target.value })}
                  className="w-full border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 rounded-lg p-2.5 text-sm"
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1" style={{ fontFamily: "var(--font-body)" }}>
                  Depreciation Method
                </label>
                <select
                  value={form.depreciation_method}
                  onChange={(e) => setForm({ ...form, depreciation_method: e.target.value })}
                  className="w-full border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 rounded-lg p-2.5 text-sm"
                >
                  <option value="straight_line">Straight Line</option>
                  <option value="declining_balance">Declining Balance (10%)</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1" style={{ fontFamily: "var(--font-body)" }}>
                  Status
                </label>
                <select
                  value={form.status}
                  onChange={(e) => setForm({ ...form, status: e.target.value })}
                  className="w-full border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 rounded-lg p-2.5 text-sm"
                >
                  <option value="Active">Active</option>
                  <option value="Sold">Sold</option>
                  <option value="Disposed">Disposed</option>
                </select>
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