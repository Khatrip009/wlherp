import React, { useState, useRef } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import toast from "react-hot-toast";
import { Search, Plus, Edit3, Trash2, Download, Upload, Box, Filter, X } from "lucide-react";
import Papa from "papaparse";
import BackButton from "../components/BackButton";
import InventoryItemForm from "../components/InventoryItemForm";
import { supabase } from "../api/supabase";
import { useOrg } from "../context/OrganizationContext";
import { useTheme } from "../context/ThemeContext"; // ✅ dynamic theme

export default function InventoryItems() {
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState(null);
  const [showCatForm, setShowCatForm] = useState(false);
  const [catForm, setCatForm] = useState({ name: "" });
  const [loading, setLoading] = useState(false);
  const fileInputRef = useRef(null);

  const { branch, selectedFinancialYear } = useOrg();
  const theme = useTheme();
  const branchId = branch?.id;
  const financialYearId = selectedFinancialYear?.id;
  const context = { branchId, financialYearId };

  const headingFont = theme?.font_heading || "Righteous";
  const bodyFont = theme?.font_body || "Montserrat";

  // ── Fetch categories ──
  const { data: categories = [] } = useQuery({
    queryKey: ["inventory-categories"],
    queryFn: async () => {
      const { data } = await supabase.from("inventory_categories").select("*").order("name");
      return data || [];
    },
    staleTime: 10 * 60 * 1000,
  });

  // ── Fetch items ──
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

  // ── Mutations ──
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
      setLoading(false);
    },
    onError: () => {
      toast.error("Failed to add");
      setLoading(false);
    },
  });

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
      setLoading(false);
    },
    onError: () => {
      toast.error("Failed to update");
      setLoading(false);
    },
  });

  const deleteItemMut = useMutation({
    mutationFn: async (id) => {
      let query = supabase.from("inventory_items").delete().eq("id", id);
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

  // ── Category mutations ──
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

  // ── Handlers ──
  const openCreate = () => {
    setEditing(null);
    setShowForm(true);
  };

  const openEdit = (item) => {
    setEditing(item);
    setShowForm(true);
  };

  const handleSubmit = async (values) => {
    setLoading(true);
    const payload = {
      ...values,
      unit_price: parseFloat(values.unit_price) || 0,
      current_stock: parseInt(values.current_stock) || 0,
      reorder_level: parseInt(values.reorder_level) || 5,
      category_id: values.category_id || null,
    };
    if (editing) {
      await updateItemMut.mutateAsync({ id: editing.id, payload });
    } else {
      await createItemMut.mutateAsync(payload);
    }
  };

  return (
    <>
      <BackButton to="/accounting" label="Finance & Accounting" />
      <div className="flex justify-between items-center mb-6">
        <div>
          <h1 className="text-3xl font-bold text-primary" style={{ fontFamily: headingFont }}>
            Inventory Items
          </h1>
          <p className="text-sm text-primary-dark mt-1" style={{ fontFamily: bodyFont }}>
            Manage stock items
          </p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => {
              setShowCatForm(true);
              setCatForm({ name: "" });
            }}
            className="border border-primary-bg text-primary-dark px-4 py-2 rounded-lg text-sm flex items-center gap-2 hover:bg-primary-bg transition-colors"
            style={{ fontFamily: bodyFont }}
          >
            <Box size={16} /> Manage Categories
          </button>
          <button
            onClick={openCreate}
            className="bg-primary hover:bg-primary-light text-white px-4 py-2 rounded-lg text-sm flex items-center gap-2 transition-colors"
            style={{ fontFamily: bodyFont }}
          >
            <Plus size={16} /> Add Item
          </button>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-4 mb-4">
        <div className="relative max-w-xs flex-1">
          <Search size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-primary-dark/60" />
          <input
            type="text"
            placeholder="Search items..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-10 pr-4 py-2.5 border border-primary-bg bg-white text-primary-dark rounded-lg text-sm placeholder-primary-dark/40"
            style={{ fontFamily: bodyFont }}
          />
        </div>
        <select
          value={categoryFilter}
          onChange={(e) => setCategoryFilter(e.target.value)}
          className="border border-primary-bg bg-white text-primary-dark rounded p-2 text-sm"
          style={{ fontFamily: bodyFont }}
        >
          <option value="">All Categories</option>
          {categories.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
      </div>

      {/* Items Table */}
      <div className="bg-white rounded-xl shadow-sm overflow-hidden border border-primary-bg">
        <table className="w-full">
          <thead className="bg-primary-bg">
            <tr>
              <th className="p-3 text-left text-sm font-medium text-primary-dark uppercase" style={{ fontFamily: bodyFont }}>
                Item Name
              </th>
              <th className="p-3 text-left text-sm font-medium text-primary-dark uppercase" style={{ fontFamily: bodyFont }}>
                Category
              </th>
              <th className="p-3 text-left text-sm font-medium text-primary-dark uppercase" style={{ fontFamily: bodyFont }}>
                Unit
              </th>
              <th className="p-3 text-left text-sm font-medium text-primary-dark uppercase" style={{ fontFamily: bodyFont }}>
                Price
              </th>
              <th className="p-3 text-left text-sm font-medium text-primary-dark uppercase" style={{ fontFamily: bodyFont }}>
                Stock
              </th>
              <th className="p-3 text-left text-sm font-medium text-primary-dark uppercase" style={{ fontFamily: bodyFont }}>
                Reorder Lvl
              </th>
              <th className="p-3 text-left text-sm font-medium text-primary-dark uppercase" style={{ fontFamily: bodyFont }}>
                Actions
              </th>
            </tr>
          </thead>
          <tbody>
            {isLoading ? (
              <tr>
                <td colSpan={7} className="p-6 text-center text-primary-dark/60" style={{ fontFamily: bodyFont }}>
                  Loading…
                </td>
              </tr>
            ) : items.length === 0 ? (
              <tr>
                <td colSpan={7} className="p-6 text-center text-primary-dark/60" style={{ fontFamily: bodyFont }}>
                  No items found.
                </td>
              </tr>
            ) : (
              items.map((item) => (
                <tr key={item.id} className="border-t border-primary-bg hover:bg-primary-bg transition-colors">
                  <td className="p-3 text-sm font-medium text-primary" style={{ fontFamily: bodyFont }}>
                    {item.item_name}
                  </td>
                  <td className="text-sm text-primary-dark" style={{ fontFamily: bodyFont }}>
                    {item.inventory_categories?.name || "—"}
                  </td>
                  <td className="text-sm text-primary-dark" style={{ fontFamily: bodyFont }}>
                    {item.unit}
                  </td>
                  <td className="text-sm text-primary-dark" style={{ fontFamily: bodyFont }}>
                    ₹{Number(item.unit_price).toLocaleString()}
                  </td>
                  <td className="text-sm text-primary-dark" style={{ fontFamily: bodyFont }}>
                    {item.current_stock}
                  </td>
                  <td className="text-sm text-primary-dark" style={{ fontFamily: bodyFont }}>
                    {item.reorder_level}
                  </td>
                  <td className="text-sm">
                    <button onClick={() => openEdit(item)} className="text-primary hover:underline mr-2">
                      <Edit3 size={15} />
                    </button>
                    <button
                      onClick={() => {
                        if (window.confirm("Delete?")) deleteItemMut.mutate(item.id);
                      }}
                      className="text-accent hover:underline"
                    >
                      <Trash2 size={15} />
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* ─── Add/Edit Modal using InventoryItemForm ─── */}
      {showForm && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl max-w-md w-full p-6 shadow-xl max-h-[90vh] overflow-y-auto border border-primary-bg">
            <h2
              className="text-xl font-bold text-primary mb-4"
              style={{ fontFamily: headingFont }}
            >
              {editing ? "Edit Item" : "Add Item"}
            </h2>
            <InventoryItemForm
              initialData={editing || {}}
              onSubmit={handleSubmit}
              onClose={() => {
                setShowForm(false);
                setEditing(null);
                setLoading(false);
              }}
              loading={loading}
            />
          </div>
        </div>
      )}

      {/* Category Management Modal */}
      {showCatForm && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl max-w-md w-full p-6 shadow-xl border border-primary-bg">
            <h2
              className="text-xl font-bold text-primary mb-4"
              style={{ fontFamily: headingFont }}
            >
              Manage Categories
            </h2>
            <div className="space-y-3 mb-4 max-h-40 overflow-y-auto">
              {categories.map((cat) => (
                <div key={cat.id} className="flex justify-between items-center border-b border-primary-bg pb-2">
                  <span className="text-sm text-primary-dark" style={{ fontFamily: bodyFont }}>
                    {cat.name}
                  </span>
                  <button
                    onClick={() => {
                      if (window.confirm("Delete category?")) deleteCatMut.mutate(cat.id);
                    }}
                    className="text-accent hover:underline text-xs"
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              ))}
            </div>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                if (catForm.name.trim()) createCatMut.mutate({ name: catForm.name });
              }}
              className="flex gap-2"
            >
              <input
                type="text"
                value={catForm.name}
                onChange={(e) => setCatForm({ name: e.target.value })}
                placeholder="New category name"
                className="flex-1 border border-primary-bg bg-white text-primary-dark rounded p-2 text-sm placeholder-primary-dark/40"
                style={{ fontFamily: bodyFont }}
                required
              />
              <button
                type="submit"
                className="bg-primary hover:bg-primary-light text-white px-3 py-2 rounded text-sm transition-colors"
                style={{ fontFamily: bodyFont }}
              >
                Add
              </button>
            </form>
            <button
              onClick={() => setShowCatForm(false)}
              className="mt-4 border border-primary-bg text-primary-dark px-4 py-2 rounded text-sm w-full hover:bg-primary-bg transition-colors"
              style={{ fontFamily: bodyFont }}
            >
              Close
            </button>
          </div>
        </div>
      )}
    </>
  );
}