// src/pages/FixedAssets.jsx
import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import toast from "react-hot-toast";
import { Plus, Edit3, Trash2, Calculator } from "lucide-react";
import AdminLayout from "../layouts/AdminLayout";
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

  // ── Organisation / Branch / Financial Year context ──
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
    <AdminLayout>
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-3xl font-righteous text-primary-dark">Fixed Assets Register</h1>
        <div className="flex gap-2">
          <button onClick={handleCalculateDep} className="border px-4 py-2 rounded-lg text-sm flex items-center gap-2">
            <Calculator size={16} /> Calculate Depreciation
          </button>
          <button onClick={openCreate} className="bg-primary text-white px-4 py-2 rounded-lg text-sm flex items-center gap-2">
            <Plus size={16} /> Add Asset
          </button>
        </div>
      </div>

      {/* Depreciation preview */}
      {depPreview && (
        <div className="bg-yellow-50 border border-yellow-300 rounded-xl p-4 mb-6">
          <h3 className="font-semibold text-primary-dark mb-2">Monthly Depreciation Preview</h3>
          <table className="w-full text-sm">
            <thead><tr><th className="text-left p-2">Asset</th><th className="text-right p-2">Depreciation</th><th className="text-right p-2">New Book Value</th></tr></thead>
            <tbody>
              {depPreview.map((d) => (
                <tr key={d.id} className="border-t">
                  <td className="p-2">{d.asset_name}</td>
                  <td className="p-2 text-right">₹ {d.monthly_depreciation.toLocaleString("en-IN")}</td>
                  <td className="p-2 text-right">₹ {d.new_book_value.toLocaleString("en-IN")}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <button
            onClick={handlePostDep}
            disabled={posting}
            className="mt-3 bg-primary text-white px-4 py-2 rounded-lg text-sm"
          >
            {posting ? "Posting…" : "Post Depreciation Journal"}
          </button>
        </div>
      )}

      {/* Asset List */}
      <div className="bg-white rounded-xl shadow-sm overflow-hidden">
        <table className="w-full">
          <thead className="bg-slate-100">
            <tr>
              <th className="p-3 text-left text-sm">Asset Name</th>
              <th className="p-3 text-left text-sm">Category</th>
              <th className="p-3 text-left text-sm">Purchase Date</th>
              <th className="p-3 text-right text-sm">Cost</th>
              <th className="p-3 text-right text-sm">Book Value</th>
              <th className="p-3 text-left text-sm">Method</th>
              <th className="p-3 text-left text-sm">Status</th>
              <th className="p-3 text-left text-sm">Actions</th>
            </tr>
          </thead>
          <tbody>
            {isLoading ? (
              <tr><td colSpan={8} className="p-6 text-center">Loading…</td></tr>
            ) : assets.length === 0 ? (
              <tr><td colSpan={8} className="p-6 text-center text-secondary">No assets recorded. Add your first asset.</td></tr>
            ) : (
              assets.map((a) => (
                <tr key={a.id} className="border-t hover:bg-gray-50">
                  <td className="p-3 text-sm font-medium">{a.asset_name}</td>
                  <td className="text-sm">{a.category}</td>
                  <td className="text-sm">{a.purchase_date}</td>
                  <td className="text-sm text-right">₹ {Number(a.purchase_cost).toLocaleString("en-IN")}</td>
                  <td className="text-sm text-right">₹ {Number(a.current_book_value).toLocaleString("en-IN")}</td>
                  <td className="text-sm capitalize">{a.depreciation_method.replace("_", " ")}</td>
                  <td className="text-sm">{a.status}</td>
                  <td className="text-sm">
                    <button onClick={() => openEdit(a)} className="text-blue-600 mr-2"><Edit3 size={15} /></button>
                    <button onClick={() => { if (window.confirm("Delete?")) deleteMut.mutate(a.id); }} className="text-red-600"><Trash2 size={15} /></button>
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
          <div className="bg-white rounded-xl max-w-md w-full p-6 shadow-xl max-h-[90vh] overflow-y-auto">
            <h2 className="text-xl font-righteous text-primary-dark mb-4">{editing ? "Edit Asset" : "Add Asset"}</h2>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-sm mb-1">Asset Name *</label>
                <input type="text" value={form.asset_name} onChange={(e) => setForm({ ...form, asset_name: e.target.value })} className="w-full border rounded p-2.5 text-sm" required />
              </div>
              <div>
                <label className="block text-sm mb-1">Category</label>
                <input type="text" value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })} className="w-full border rounded p-2.5 text-sm" placeholder="Furniture, Computer, etc." />
              </div>
              <div>
                <label className="block text-sm mb-1">Purchase Date *</label>
                <input type="date" value={form.purchase_date} onChange={(e) => setForm({ ...form, purchase_date: e.target.value })} className="w-full border rounded p-2.5 text-sm" required />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm mb-1">Purchase Cost *</label>
                  <input type="number" value={form.purchase_cost} onChange={(e) => setForm({ ...form, purchase_cost: e.target.value })} className="w-full border rounded p-2.5 text-sm" required />
                </div>
                <div>
                  <label className="block text-sm mb-1">Salvage Value</label>
                  <input type="number" value={form.salvage_value} onChange={(e) => setForm({ ...form, salvage_value: e.target.value })} className="w-full border rounded p-2.5 text-sm" />
                </div>
              </div>
              <div>
                <label className="block text-sm mb-1">Useful Life (months) *</label>
                <input type="number" value={form.useful_life_months} onChange={(e) => setForm({ ...form, useful_life_months: e.target.value })} className="w-full border rounded p-2.5 text-sm" required />
              </div>
              <div>
                <label className="block text-sm mb-1">Depreciation Method</label>
                <select value={form.depreciation_method} onChange={(e) => setForm({ ...form, depreciation_method: e.target.value })} className="w-full border rounded p-2.5 text-sm">
                  <option value="straight_line">Straight Line</option>
                  <option value="declining_balance">Declining Balance (10%)</option>
                </select>
              </div>
              <div>
                <label className="block text-sm mb-1">Status</label>
                <select value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })} className="w-full border rounded p-2.5 text-sm">
                  <option value="Active">Active</option>
                  <option value="Sold">Sold</option>
                  <option value="Disposed">Disposed</option>
                </select>
              </div>
              <div className="flex justify-end gap-3 pt-2">
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