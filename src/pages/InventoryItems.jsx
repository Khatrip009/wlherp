// src/pages/InventoryItems.jsx
import React, { useState, useRef } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import toast from "react-hot-toast";
import {
  Search, Plus, Edit3, Trash2, Download, Upload, Box, Filter, X,
} from "lucide-react";
import Papa from "papaparse";
import AdminLayout from "../layouts/AdminLayout";
import BackButton from "../components/BackButton";

import { supabase } from "../api/supabase";
import { useOrg } from "../context/OrganizationContext";   // NEW

export default function InventoryItems() {
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState({
    item_name: "", description: "", unit: "pcs", unit_price: 0, reorder_level: 5, category_id: "",
  });
  const [showCatForm, setShowCatForm] = useState(false);
  const [catForm, setCatForm] = useState({ name: "" });
  const fileInputRef = useRef(null);

  // ── Branch & Financial Year context ──
  const { branch, selectedFinancialYear } = useOrg();   // NEW
  const branchId = branch?.id;
  const financialYearId = selectedFinancialYear?.id;
  const context = { branchId, financialYearId };

  // Fetch categories (organization-wide – no branch/FY)
  const { data: categories = [] } = useQuery({
    queryKey: ["inventory-categories"],
    queryFn: async () => {
      const { data } = await supabase.from("inventory_categories").select("*").order("name");
      return data || [];
    },
    staleTime: 10 * 60 * 1000,
  });

  // Fetch items – now scoped to branch & FY
  const { data: items = [], isLoading } = useQuery({
    queryKey: ["inventory-items", search, categoryFilter, branchId, financialYearId],
    queryFn: async () => {
      let query = supabase
        .from("inventory_items")
        .select("*, inventory_categories(name)")
        .order("item_name");

      if (branchId) query = query.eq("branch_id", branchId);
      if (financialYearId) query = query.eq("financial_year_id", financialYearId);

      if (search) query = query.ilike("item_name", `%${search}%`);
      if (categoryFilter) query = query.eq("category_id", categoryFilter);

      const { data } = await query;
      return data || [];
    },
    enabled: !!branchId && !!financialYearId,
    staleTime: 2 * 60 * 1000,
  });

  // Create item – scoped
  const createItemMut = useMutation({
    mutationFn: async (payload) => {
      const { data, error } = await supabase
        .from("inventory_items")
        .insert({ ...payload, branch_id: branchId, financial_year_id: financialYearId })
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      toast.success("Item added");
      queryClient.invalidateQueries(["inventory-items"]);
      setShowForm(false);
    },
    onError: () => toast.error("Failed to add"),
  });

  // Update item – scoped
  const updateItemMut = useMutation({
    mutationFn: async ({ id, payload }) => {
      const { error } = await supabase
        .from("inventory_items")
        .update({ ...payload, branch_id: branchId, financial_year_id: financialYearId })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Item updated");
      queryClient.invalidateQueries(["inventory-items"]);
      setEditing(null);
      setShowForm(false);
    },
    onError: () => toast.error("Failed to update"),
  });

  // Delete item – scoped
  const deleteItemMut = useMutation({
    mutationFn: async (id) => {
      let query = supabase
        .from("inventory_items")
        .delete()
        .eq("id", id);
      if (branchId) query = query.eq("branch_id", branchId);
      if (financialYearId) query = query.eq("financial_year_id", financialYearId);
      const { error } = await query;
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Item deleted");
      queryClient.invalidateQueries(["inventory-items"]);
    },
    onError: () => toast.error("Delete failed"),
  });

  // Category mutations (unchanged, categories are org-wide)
  const createCatMut = useMutation({
    mutationFn: async (payload) => {
      await supabase.from("inventory_categories").insert(payload);
    },
    onSuccess: () => {
      toast.success("Category created");
      queryClient.invalidateQueries(["inventory-categories"]);
      setShowCatForm(false);
      setCatForm({ name: "" });
    },
    onError: () => toast.error("Failed"),
  });

  const deleteCatMut = useMutation({
    mutationFn: async (id) => {
      await supabase.from("inventory_categories").delete().eq("id", id);
    },
    onSuccess: () => {
      toast.success("Category deleted");
      queryClient.invalidateQueries(["inventory-categories"]);
    },
    onError: () => toast.error("Delete failed"),
  });

  const openCreate = () => {
    setForm({ item_name: "", description: "", unit: "pcs", unit_price: 0, reorder_level: 5, category_id: "" });
    setEditing(null);
    setShowForm(true);
  };
  const openEdit = (item) => {
    setForm({
      item_name: item.item_name,
      description: item.description || "",
      unit: item.unit,
      unit_price: item.unit_price,
      reorder_level: item.reorder_level,
      category_id: item.category_id || "",
    });
    setEditing(item);
    setShowForm(true);
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    const payload = {
      ...form,
      unit_price: parseFloat(form.unit_price),
      category_id: form.category_id ? parseInt(form.category_id) : null,
    };
    if (editing) updateItemMut.mutate({ id: editing.id, payload });
    else createItemMut.mutate(payload);
  };

  return (
    <AdminLayout>
      <BackButton to="/accounting" label="Finance & Accounting" />
      <div className="flex justify-between items-center mb-6">
        <div>
          <h1 className="text-3xl font-righteous text-primary-dark">Inventory Items</h1>
          <p className="text-sm text-secondary-dark">Manage stock items</p>
        </div>
        <div className="flex gap-2">
          <button onClick={() => { setShowCatForm(true); setCatForm({ name: "" }); }} className="border px-4 py-2 rounded-lg text-sm flex items-center gap-2">
            <Box size={16} /> Manage Categories
          </button>
          <button onClick={openCreate} className="bg-primary text-white px-4 py-2 rounded-lg text-sm flex items-center gap-2">
            <Plus size={16} /> Add Item
          </button>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-4 mb-4">
        <div className="relative max-w-xs flex-1">
          <Search size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-secondary" />
          <input type="text" placeholder="Search items..." value={search} onChange={(e) => setSearch(e.target.value)} className="w-full pl-10 pr-4 py-2.5 border rounded-lg text-sm" />
        </div>
        <select value={categoryFilter} onChange={(e) => setCategoryFilter(e.target.value)} className="border rounded p-2 text-sm">
          <option value="">All Categories</option>
          {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
      </div>

      {/* Items Table */}
      <div className="bg-white rounded-xl shadow-sm overflow-hidden">
        <table className="w-full">
          <thead className="bg-slate-100"><tr>
            <th className="p-3 text-left text-sm">Item Name</th>
            <th className="p-3 text-left text-sm">Category</th>
            <th className="p-3 text-left text-sm">Unit</th>
            <th className="p-3 text-left text-sm">Price</th>
            <th className="p-3 text-left text-sm">Stock</th>
            <th className="p-3 text-left text-sm">Reorder Lvl</th>
            <th className="p-3 text-left text-sm">Actions</th>
          </tr></thead>
          <tbody>
            {isLoading ? <tr><td colSpan={7} className="p-6 text-center">Loading…</td></tr> :
            items.length === 0 ? <tr><td colSpan={7} className="p-6 text-center">No items found.</td></tr> :
            items.map(item => (
              <tr key={item.id} className="border-t hover:bg-gray-50">
                <td className="p-3 text-sm font-medium">{item.item_name}</td>
                <td className="text-sm">{item.inventory_categories?.name || "—"}</td>
                <td className="text-sm">{item.unit}</td>
                <td className="text-sm">₹{Number(item.unit_price).toLocaleString()}</td>
                <td className="text-sm">{item.current_stock}</td>
                <td className="text-sm">{item.reorder_level}</td>
                <td className="text-sm">
                  <button onClick={() => openEdit(item)} className="text-blue-600 mr-2"><Edit3 size={15} /></button>
                  <button onClick={() => { if (window.confirm("Delete?")) deleteItemMut.mutate(item.id); }} className="text-red-600"><Trash2 size={15} /></button>
                </td>
              </tr>
            ))
            }
          </tbody>
        </table>
      </div>

      {/* Item Add/Edit Modal */}
      {showForm && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl max-w-md w-full p-6 shadow-xl">
            <h2 className="text-xl font-righteous text-primary-dark mb-4">{editing ? "Edit Item" : "Add Item"}</h2>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div><label className="block text-sm mb-1">Item Name *</label><input type="text" value={form.item_name} onChange={(e) => setForm({...form, item_name: e.target.value})} className="w-full border rounded p-2.5 text-sm" required /></div>
              <div><label className="block text-sm mb-1">Category</label><select value={form.category_id} onChange={(e) => setForm({...form, category_id: e.target.value})} className="w-full border rounded p-2.5 text-sm"><option value="">None</option>{categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}</select></div>
              <div className="grid grid-cols-2 gap-4">
                <div><label className="block text-sm mb-1">Unit</label><input type="text" value={form.unit} onChange={(e) => setForm({...form, unit: e.target.value})} className="w-full border rounded p-2.5 text-sm" /></div>
                <div><label className="block text-sm mb-1">Unit Price</label><input type="number" value={form.unit_price} onChange={(e) => setForm({...form, unit_price: e.target.value})} className="w-full border rounded p-2.5 text-sm" /></div>
              </div>
              <div><label className="block text-sm mb-1">Reorder Level</label><input type="number" value={form.reorder_level} onChange={(e) => setForm({...form, reorder_level: e.target.value})} className="w-full border rounded p-2.5 text-sm" /></div>
              <div className="flex justify-end gap-3">
                <button type="button" onClick={() => setShowForm(false)} className="border px-4 py-2 rounded-lg text-sm">Cancel</button>
                <button type="submit" className="bg-primary text-white px-4 py-2 rounded-lg text-sm">{editing ? "Update" : "Create"}</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Category Management Modal */}
      {showCatForm && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl max-w-md w-full p-6 shadow-xl">
            <h2 className="text-xl font-righteous text-primary-dark mb-4">Manage Categories</h2>
            <div className="space-y-3 mb-4 max-h-40 overflow-y-auto">
              {categories.map((cat) => (
                <div key={cat.id} className="flex justify-between items-center border-b pb-2">
                  <span className="text-sm">{cat.name}</span>
                  <button onClick={() => { if (window.confirm("Delete category?")) deleteCatMut.mutate(cat.id); }} className="text-red-500 text-xs"><Trash2 size={14} /></button>
                </div>
              ))}
            </div>
            <form onSubmit={(e) => { e.preventDefault(); if (catForm.name.trim()) createCatMut.mutate({ name: catForm.name }); }} className="flex gap-2">
              <input type="text" value={catForm.name} onChange={(e) => setCatForm({ name: e.target.value })} placeholder="New category name" className="flex-1 border rounded p-2 text-sm" required />
              <button type="submit" className="bg-primary text-white px-3 py-2 rounded text-sm">Add</button>
            </form>
            <button onClick={() => setShowCatForm(false)} className="mt-4 border px-4 py-2 rounded text-sm w-full">Close</button>
          </div>
        </div>
      )}
    </AdminLayout>
  );
}