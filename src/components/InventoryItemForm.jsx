import { useState, useEffect } from "react";
import toast from "react-hot-toast";
import { supabase } from "../api/supabase";
import { useOrg } from "../context/OrganizationContext";
import { useTheme } from "../context/ThemeContext"; // ✅ dynamic theme

export default function InventoryItemForm({ initialData = {}, onSubmit, onClose, loading = false }) {
  const { branch, selectedFinancialYear } = useOrg();
  const theme = useTheme();
  const branchId = branch?.id;
  const financialYearId = selectedFinancialYear?.id;

  const headingFont = theme?.font_heading || "Righteous";
  const bodyFont = theme?.font_body || "Montserrat";

  const [form, setForm] = useState({
    item_name: initialData.item_name || "",
    description: initialData.description || "",
    category_id: initialData.category_id || "",
    unit: initialData.unit || "pcs",
    unit_price: initialData.unit_price ?? 0,
    current_stock: initialData.current_stock ?? 0,
    reorder_level: initialData.reorder_level ?? 5,
  });

  const [categories, setCategories] = useState([]);

  // Fetch categories
  useEffect(() => {
    const fetchCategories = async () => {
      let query = supabase
        .from("inventory_categories")
        .select("id, name")
        .order("name");

      if (branchId) query = query.eq("branch_id", branchId);
      if (financialYearId) query = query.eq("financial_year_id", financialYearId);

      const { data } = await query;
      setCategories(data || []);
    };
    fetchCategories();
  }, [branchId, financialYearId]);

  // Reset form when initialData changes (e.g., editing)
  useEffect(() => {
    setForm({
      item_name: initialData.item_name || "",
      description: initialData.description || "",
      category_id: initialData.category_id || "",
      unit: initialData.unit || "pcs",
      unit_price: initialData.unit_price ?? 0,
      current_stock: initialData.current_stock ?? 0,
      reorder_level: initialData.reorder_level ?? 5,
    });
  }, [initialData]);

  const handleChange = (field, value) => {
    setForm((prev) => ({ ...prev, [field]: value }));
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!form.item_name.trim()) {
      toast.error("Item name is required");
      return;
    }
    onSubmit(form);
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div>
        <label className="block text-sm font-medium text-primary-dark mb-1" style={{ fontFamily: bodyFont }}>
          Item Name *
        </label>
        <input
          type="text"
          placeholder="e.g., Notebook"
          value={form.item_name}
          onChange={(e) => handleChange("item_name", e.target.value)}
          className="w-full border border-primary-bg rounded-lg p-2.5 text-sm focus:ring-1 focus:ring-primary bg-white text-primary-dark placeholder-primary-dark/40"
          required
        />
      </div>

      <div>
        <label className="block text-sm font-medium text-primary-dark mb-1" style={{ fontFamily: bodyFont }}>
          Description
        </label>
        <textarea
          rows={2}
          placeholder="Optional description"
          value={form.description}
          onChange={(e) => handleChange("description", e.target.value)}
          className="w-full border border-primary-bg rounded-lg p-2.5 text-sm focus:ring-1 focus:ring-primary bg-white text-primary-dark placeholder-primary-dark/40 resize-none"
        />
      </div>

      <div>
        <label className="block text-sm font-medium text-primary-dark mb-1" style={{ fontFamily: bodyFont }}>
          Category
        </label>
        <select
          value={form.category_id}
          onChange={(e) => handleChange("category_id", e.target.value)}
          className="w-full border border-primary-bg rounded-lg p-2.5 text-sm focus:ring-1 focus:ring-primary bg-white text-primary-dark"
        >
          <option value="">Select category</option>
          {categories.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
      </div>

      <div>
        <label className="block text-sm font-medium text-primary-dark mb-1" style={{ fontFamily: bodyFont }}>
          Unit
        </label>
        <input
          type="text"
          placeholder="e.g., pcs, kg, box"
          value={form.unit}
          onChange={(e) => handleChange("unit", e.target.value)}
          className="w-full border border-primary-bg rounded-lg p-2.5 text-sm focus:ring-1 focus:ring-primary bg-white text-primary-dark placeholder-primary-dark/40"
        />
      </div>

      <div>
        <label className="block text-sm font-medium text-primary-dark mb-1" style={{ fontFamily: bodyFont }}>
          Unit Price
        </label>
        <input
          type="number"
          min="0"
          step="0.01"
          placeholder="0.00"
          value={form.unit_price}
          onChange={(e) => handleChange("unit_price", e.target.value)}
          className="w-full border border-primary-bg rounded-lg p-2.5 text-sm focus:ring-1 focus:ring-primary bg-white text-primary-dark placeholder-primary-dark/40"
        />
      </div>

      <div>
        <label className="block text-sm font-medium text-primary-dark mb-1" style={{ fontFamily: bodyFont }}>
          Current Stock
        </label>
        <input
          type="number"
          min="0"
          placeholder="0"
          value={form.current_stock}
          onChange={(e) => handleChange("current_stock", e.target.value)}
          className="w-full border border-primary-bg rounded-lg p-2.5 text-sm focus:ring-1 focus:ring-primary bg-white text-primary-dark placeholder-primary-dark/40"
        />
      </div>

      <div>
        <label className="block text-sm font-medium text-primary-dark mb-1" style={{ fontFamily: bodyFont }}>
          Reorder Level
        </label>
        <input
          type="number"
          min="0"
          placeholder="5"
          value={form.reorder_level}
          onChange={(e) => handleChange("reorder_level", e.target.value)}
          className="w-full border border-primary-bg rounded-lg p-2.5 text-sm focus:ring-1 focus:ring-primary bg-white text-primary-dark placeholder-primary-dark/40"
        />
      </div>

      <div className="flex justify-end gap-3 pt-2">
        <button
          type="button"
          onClick={onClose}
          className="border border-primary-bg px-4 py-2 rounded-lg text-sm text-primary-dark hover:bg-primary-bg transition-colors"
          style={{ fontFamily: bodyFont }}
        >
          Cancel
        </button>
        <button
          type="submit"
          disabled={loading}
          className="bg-primary hover:bg-primary-light text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors disabled:opacity-50"
          style={{ fontFamily: bodyFont }}
        >
          {loading ? "Saving..." : initialData.id ? "Update" : "Create"}
        </button>
      </div>
    </form>
  );
}