// src/pages/PurchaseInvoiceForm.jsx
import { useState, useEffect } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "../api/supabase";
import {
  createPurchaseInvoice,
  updatePurchaseInvoice,
  getPurchaseInvoice,
} from "../services/purchaseInvoiceService";
import { useOrg } from "../context/OrganizationContext";
import { useTheme } from "../context/ThemeContext";               // ✅ dynamic theme
import toast from "react-hot-toast";

import { ArrowLeft, Save, Plus, Trash2, Loader } from "lucide-react";

export default function PurchaseInvoiceForm() {
  const { id } = useParams();
  const isEditing = !!id;
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const { branch, selectedFinancialYear } = useOrg();
  const theme = useTheme();                                     // ✅ theme hook
  const branchId = branch?.id;
  const financialYearId = selectedFinancialYear?.id;
  const ctx = { branchId, financialYearId };

  const headingFont = theme?.font_heading || "Righteous";
  const bodyFont = theme?.font_body || "Montserrat";

  const [form, setForm] = useState({
    vendor_id: "",
    invoice_date: new Date().toISOString().split("T")[0],
    purchase_order_id: "",
    reference: "",
    notes: "",
  });
  const [items, setItems] = useState([
    {
      item_id: "",
      description: "",
      hsn_sac_code: "",
      quantity: 1,
      unit_price: 0,
      tax_rate_id: "",
    },
  ]);
  const [saving, setSaving] = useState(false);

  // ── Fetch vendors – scoped ──
  const { data: vendors = [] } = useQuery({
    queryKey: ["vendors-dropdown", branchId, financialYearId],
    queryFn: async () => {
      let query = supabase.from("vendors").select("id, vendor_name").order("vendor_name");
      if (branchId) query = query.eq("branch_id", branchId);
      if (financialYearId) query = query.eq("financial_year_id", financialYearId);
      const { data } = await query;
      return data || [];
    },
    enabled: !!branchId && !!financialYearId,
    staleTime: 10 * 60 * 1000,
  });

  // ── Fetch purchase orders – scoped ──
  const { data: purchaseOrders = [] } = useQuery({
    queryKey: ["purchase-orders-dropdown", branchId, financialYearId],
    queryFn: async () => {
      let query = supabase
        .from("purchase_orders")
        .select("id, po_number")
        .eq("status", "Received")
        .order("created_at", { ascending: false });
      if (branchId) query = query.eq("branch_id", branchId);
      if (financialYearId) query = query.eq("financial_year_id", financialYearId);
      const { data } = await query;
      return data || [];
    },
    enabled: !!branchId && !!financialYearId,
    staleTime: 5 * 60 * 1000,
  });

  // ── Fetch inventory items – scoped ──
  const { data: inventoryItems = [] } = useQuery({
    queryKey: ["inventory-items-dropdown", branchId, financialYearId],
    queryFn: async () => {
      let query = supabase
        .from("inventory_items")
        .select("id, item_name, unit, unit_price")
        .order("item_name");
      if (branchId) query = query.eq("branch_id", branchId);
      if (financialYearId) query = query.eq("financial_year_id", financialYearId);
      const { data } = await query;
      return data || [];
    },
    enabled: !!branchId && !!financialYearId,
    staleTime: 5 * 60 * 1000,
  });

  // ── Fetch tax rates – scoped ──
  const { data: taxRates = [] } = useQuery({
    queryKey: ["tax-rates-dropdown", branchId, financialYearId],
    queryFn: async () => {
      let query = supabase
        .from("tax_rates")
        .select("id, name, rate")
        .eq("is_active", true);
      if (branchId) query = query.eq("branch_id", branchId);
      if (financialYearId) query = query.eq("financial_year_id", financialYearId);
      const { data } = await query;
      return data || [];
    },
    enabled: !!branchId && !!financialYearId,
    staleTime: 10 * 60 * 1000,
  });

  // ── Load existing invoice if editing – scoped ──
  const { data: invoice, isLoading: loadingInvoice } = useQuery({
    queryKey: ["purchase-invoice", id, branchId, financialYearId],
    queryFn: () => getPurchaseInvoice(id, branchId, financialYearId),
    enabled: isEditing && !!branchId && !!financialYearId,
  });

  useEffect(() => {
    if (invoice) {
      setForm({
        vendor_id: invoice.vendor_id || "",
        invoice_date: invoice.invoice_date || new Date().toISOString().split("T")[0],
        purchase_order_id: invoice.purchase_order_id || "",
        reference: invoice.reference || "",
        notes: invoice.notes || "",
      });
      if (invoice.purchase_invoice_items?.length) {
        setItems(
          invoice.purchase_invoice_items.map((item) => ({
            id: item.id,
            item_id: item.item_id || "",
            description: item.description || "",
            hsn_sac_code: item.hsn_sac_code || "",
            quantity: item.quantity || 1,
            unit_price: item.unit_price || 0,
            tax_rate_id: item.tax_rate_id || "",
          }))
        );
      }
    }
  }, [invoice]);

  // ── NEW: Fetch selected PO data (items + po_number) when a PO is chosen ──
  const { data: selectedPO } = useQuery({
    queryKey: ["selected-po", form.purchase_order_id, branchId, financialYearId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("purchase_orders")
        .select("po_number, purchase_order_items(*)")
        .eq("id", form.purchase_order_id)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
    enabled: !!form.purchase_order_id && !!branchId && !!financialYearId,
  });

  // ── Auto‑populate items from selected PO (only for new invoices) ──
  useEffect(() => {
    // Don’t override items when editing an existing invoice
    if (isEditing) return;

    if (selectedPO?.purchase_order_items?.length) {
      const poItems = selectedPO.purchase_order_items.map((poItem) => ({
        item_id: poItem.item_id ? String(poItem.item_id) : "",
        description:
          inventoryItems.find((inv) => inv.id === poItem.item_id)?.item_name || "",
        hsn_sac_code: "", // PO items don’t have HSN/SAC, leave blank
        quantity: poItem.quantity_ordered || 1,
        unit_price: poItem.unit_price || 0,
        tax_rate_id: poItem.tax_rate_id ? String(poItem.tax_rate_id) : "",
      }));
      setItems(poItems);

      // Optionally pre‑fill the reference with the PO number
      setForm((prev) => ({
        ...prev,
        reference: selectedPO.po_number || prev.reference,
      }));
    } else if (!form.purchase_order_id) {
      // Reset to one empty row when the PO is cleared
      setItems([
        {
          item_id: "",
          description: "",
          hsn_sac_code: "",
          quantity: 1,
          unit_price: 0,
          tax_rate_id: "",
        },
      ]);
      // Clear the reference if it was set by a previous PO
      setForm((prev) => ({
        ...prev,
        reference: "",
      }));
    }
    // Dependencies: re‑run when PO data, inventory list, or PO selection changes
  }, [selectedPO, inventoryItems, form.purchase_order_id, isEditing]);

  // ── Handlers ──
  const addItem = () => {
    setItems([
      ...items,
      {
        item_id: "",
        description: "",
        hsn_sac_code: "",
        quantity: 1,
        unit_price: 0,
        tax_rate_id: "",
      },
    ]);
  };

  const removeItem = (index) => {
    if (items.length === 1) {
      toast.error("At least one item is required");
      return;
    }
    setItems(items.filter((_, i) => i !== index));
  };

  const updateItem = (index, field, value) => {
    const updated = [...items];
    updated[index][field] = value;
    setItems(updated);
  };

  const handleItemSelect = (index, itemId) => {
    const item = inventoryItems.find((i) => i.id === Number(itemId));
    if (item) {
      const updated = [...items];
      updated[index].item_id = item.id;
      updated[index].description = item.item_name;
      updated[index].unit_price = item.unit_price || 0;
      setItems(updated);
    }
  };

  // ── Compute totals ──
  const computeTotals = () => {
    let taxableTotal = 0;
    let totalGST = 0;
    let grandTotal = 0;

    items.forEach((item) => {
      const qty = parseFloat(item.quantity) || 0;
      const price = parseFloat(item.unit_price) || 0;
      const taxable = qty * price;
      taxableTotal += taxable;

      const taxRate = taxRates.find((t) => t.id === Number(item.tax_rate_id));
      const rate = taxRate?.rate || 0;
      if (rate > 0) {
        totalGST += taxable * (rate / 100);
      }
      grandTotal += taxable + taxable * (rate / 100);
    });

    return { taxableTotal, totalGST, grandTotal };
  };

  const totals = computeTotals();

  // ── Mutations ──
  const createMutation = useMutation({
    mutationFn: (payload) => createPurchaseInvoice(payload, ctx),
    onSuccess: () => {
      toast.success("Invoice created");
      queryClient.invalidateQueries(["purchase-invoices"]);
      navigate("/purchase-invoices");
    },
    onError: (err) => toast.error(err.message),
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, payload }) => updatePurchaseInvoice(id, payload, ctx),
    onSuccess: () => {
      toast.success("Invoice updated");
      queryClient.invalidateQueries(["purchase-invoices"]);
      navigate("/purchase-invoices");
    },
    onError: (err) => toast.error(err.message),
  });

  const handleSubmit = (e) => {
    e.preventDefault();
    setSaving(true);

    if (!form.vendor_id) {
      toast.error("Please select a vendor");
      setSaving(false);
      return;
    }
    if (items.some((item) => !item.item_id || !item.quantity || !item.unit_price)) {
      toast.error("All items must have item, quantity, and unit price");
      setSaving(false);
      return;
    }

    const payload = {
      vendor_id: form.vendor_id,
      invoice_date: form.invoice_date,
      purchase_order_id: form.purchase_order_id || null,
      reference: form.reference || "",
      notes: form.notes || "",
      items: items.map((item) => ({
        item_id: parseInt(item.item_id),
        description: item.description || "",
        hsn_sac_code: item.hsn_sac_code || null,
        quantity: parseFloat(item.quantity) || 1,
        unit_price: parseFloat(item.unit_price) || 0,
        tax_rate_id: item.tax_rate_id || null,
      })),
    };

    if (isEditing) {
      updateMutation.mutate({ id, payload });
    } else {
      createMutation.mutate(payload);
    }
    setSaving(false);
  };

  if (loadingInvoice) {
    return (
      <div className="p-8 text-center text-primary-dark/60" style={{ fontFamily: bodyFont }}>
        Loading invoice…
      </div>
    );
  }

  return (
    <>
      <button
        onClick={() => navigate("/purchase-invoices")}
        className="inline-flex items-center gap-2 text-primary-dark hover:text-primary mb-4 text-sm"
        style={{ fontFamily: bodyFont }}
      >
        <ArrowLeft size={18} /> Back to Invoices
      </button>

      <h1
        className="text-3xl font-bold text-primary mb-6"
        style={{ fontFamily: headingFont }}
      >
        {isEditing ? "Edit Purchase Invoice" : "New Purchase Invoice"}
      </h1>

      <form
        onSubmit={handleSubmit}
        className="bg-white rounded-xl shadow-sm border border-primary-bg p-6 space-y-6"
      >
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label
              className="block text-sm font-medium text-primary-dark mb-1"
              style={{ fontFamily: bodyFont }}
            >
              Vendor *
            </label>
            <select
              value={form.vendor_id}
              onChange={(e) => setForm({ ...form, vendor_id: e.target.value })}
              className="w-full border border-primary-bg bg-white rounded-lg p-2.5 text-sm text-primary-dark focus:ring-1 focus:ring-primary"
              required
            >
              <option value="">Select Vendor</option>
              {vendors.map((v) => (
                <option key={v.id} value={v.id}>
                  {v.vendor_name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label
              className="block text-sm font-medium text-primary-dark mb-1"
              style={{ fontFamily: bodyFont }}
            >
              Invoice Date
            </label>
            <input
              type="date"
              value={form.invoice_date}
              onChange={(e) => setForm({ ...form, invoice_date: e.target.value })}
              className="w-full border border-primary-bg bg-white rounded-lg p-2.5 text-sm text-primary-dark focus:ring-1 focus:ring-primary"
            />
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label
              className="block text-sm font-medium text-primary-dark mb-1"
              style={{ fontFamily: bodyFont }}
            >
              Purchase Order (optional)
            </label>
            <select
              value={form.purchase_order_id}
              onChange={(e) => setForm({ ...form, purchase_order_id: e.target.value })}
              className="w-full border border-primary-bg bg-white rounded-lg p-2.5 text-sm text-primary-dark focus:ring-1 focus:ring-primary"
            >
              <option value="">None</option>
              {purchaseOrders.map((po) => (
                <option key={po.id} value={po.id}>
                  {po.po_number}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label
              className="block text-sm font-medium text-primary-dark mb-1"
              style={{ fontFamily: bodyFont }}
            >
              Reference
            </label>
            <input
              type="text"
              value={form.reference}
              onChange={(e) => setForm({ ...form, reference: e.target.value })}
              className="w-full border border-primary-bg bg-white rounded-lg p-2.5 text-sm text-primary-dark focus:ring-1 focus:ring-primary"
              placeholder="Vendor bill ref, etc."
            />
          </div>
        </div>

        <div>
          <label
            className="block text-sm font-medium text-primary-dark mb-1"
            style={{ fontFamily: bodyFont }}
          >
            Notes
          </label>
          <textarea
            value={form.notes}
            onChange={(e) => setForm({ ...form, notes: e.target.value })}
            rows={2}
            className="w-full border border-primary-bg bg-white rounded-lg p-2.5 text-sm text-primary-dark focus:ring-1 focus:ring-primary"
            placeholder="Any additional notes..."
          />
        </div>

        {/* Items */}
        <div>
          <h3
            className="text-lg font-semibold text-primary mb-3"
            style={{ fontFamily: headingFont }}
          >
            Items
          </h3>
          <div className="overflow-x-auto border border-primary-bg rounded-lg">
            <table className="w-full min-w-[800px]">
              <thead className="bg-primary-bg">
                <tr>
                  <th
                    className="p-2 text-left text-sm font-medium text-primary-dark uppercase"
                    style={{ fontFamily: bodyFont }}
                  >
                    Item
                  </th>
                  <th
                    className="p-2 text-left text-sm font-medium text-primary-dark uppercase"
                    style={{ fontFamily: bodyFont }}
                  >
                    Description
                  </th>
                  <th
                    className="p-2 text-left text-sm font-medium text-primary-dark uppercase"
                    style={{ fontFamily: bodyFont }}
                  >
                    HSN/SAC
                  </th>
                  <th
                    className="p-2 text-right text-sm font-medium text-primary-dark uppercase"
                    style={{ fontFamily: bodyFont }}
                  >
                    Qty
                  </th>
                  <th
                    className="p-2 text-right text-sm font-medium text-primary-dark uppercase"
                    style={{ fontFamily: bodyFont }}
                  >
                    Unit Price
                  </th>
                  <th
                    className="p-2 text-left text-sm font-medium text-primary-dark uppercase"
                    style={{ fontFamily: bodyFont }}
                  >
                    Tax Rate
                  </th>
                  <th
                    className="p-2 text-center text-sm font-medium text-primary-dark uppercase"
                    style={{ fontFamily: bodyFont }}
                  >
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody>
                {items.map((item, idx) => (
                  <tr key={idx} className="border-t border-primary-bg hover:bg-primary-bg">
                    <td className="p-2">
                      <select
                        value={item.item_id}
                        onChange={(e) => handleItemSelect(idx, e.target.value)}
                        className="w-full border border-primary-bg bg-white rounded p-1 text-sm text-primary-dark"
                      >
                        <option value="">Select</option>
                        {inventoryItems.map((inv) => (
                          <option key={inv.id} value={inv.id}>
                            {inv.item_name} ({inv.unit})
                          </option>
                        ))}
                      </select>
                    </td>
                    <td className="p-2">
                      <input
                        type="text"
                        value={item.description}
                        onChange={(e) => updateItem(idx, "description", e.target.value)}
                        className="w-full border border-primary-bg bg-white rounded p-1 text-sm text-primary-dark"
                        placeholder="Description"
                      />
                    </td>
                    <td className="p-2">
                      <input
                        type="text"
                        value={item.hsn_sac_code}
                        onChange={(e) => updateItem(idx, "hsn_sac_code", e.target.value)}
                        className="w-full border border-primary-bg bg-white rounded p-1 text-sm text-primary-dark"
                        placeholder="HSN/SAC"
                      />
                    </td>
                    <td className="p-2">
                      <input
                        type="number"
                        value={item.quantity}
                        onChange={(e) => updateItem(idx, "quantity", e.target.value)}
                        className="w-20 border border-primary-bg bg-white rounded p-1 text-sm text-right text-primary-dark"
                        min="1"
                        step="0.01"
                      />
                    </td>
                    <td className="p-2">
                      <input
                        type="number"
                        value={item.unit_price}
                        onChange={(e) => updateItem(idx, "unit_price", e.target.value)}
                        className="w-24 border border-primary-bg bg-white rounded p-1 text-sm text-right text-primary-dark"
                        min="0"
                        step="0.01"
                      />
                    </td>
                    <td className="p-2">
                      <select
                        value={item.tax_rate_id}
                        onChange={(e) => updateItem(idx, "tax_rate_id", e.target.value)}
                        className="w-full border border-primary-bg bg-white rounded p-1 text-sm text-primary-dark"
                      >
                        <option value="">No Tax</option>
                        {taxRates.map((tr) => (
                          <option key={tr.id} value={tr.id}>
                            {tr.name} ({tr.rate}%)
                          </option>
                        ))}
                      </select>
                    </td>
                    <td className="p-2 text-center">
                      <button
                        type="button"
                        onClick={() => removeItem(idx)}
                        className="text-accent hover:text-accent-dark"
                      >
                        <Trash2 size={16} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <button
            type="button"
            onClick={addItem}
            className="mt-2 text-primary text-sm flex items-center gap-1 hover:underline"
            style={{ fontFamily: bodyFont }}
          >
            <Plus size={16} /> Add Item
          </button>
        </div>

        {/* Totals */}
        <div className="border-t border-primary-bg pt-4 space-y-2">
          <div className="flex justify-end">
            <div className="w-72 space-y-1">
              <div className="flex justify-between text-sm text-primary-dark" style={{ fontFamily: bodyFont }}>
                <span>Taxable Amount:</span>
                <span className="font-medium">₹ {totals.taxableTotal.toFixed(2)}</span>
              </div>
              <div className="flex justify-between text-sm text-primary-dark" style={{ fontFamily: bodyFont }}>
                <span>GST (approx):</span>
                <span className="font-medium">₹ {totals.totalGST.toFixed(2)}</span>
              </div>
              <div className="flex justify-between text-lg font-bold border-t border-primary-bg pt-1 text-primary" style={{ fontFamily: headingFont }}>
                <span>Grand Total:</span>
                <span>₹ {totals.grandTotal.toFixed(2)}</span>
              </div>
              <p className="text-xs text-primary-dark/60" style={{ fontFamily: bodyFont }}>
                * GST will be split as CGST/SGST or IGST based on vendor state.
              </p>
            </div>
          </div>
        </div>

        {/* Actions */}
        <div className="flex flex-wrap gap-3 pt-4 border-t border-primary-bg">
          <button
            type="button"
            onClick={() => navigate("/purchase-invoices")}
            className="border border-primary-bg px-4 py-2 rounded-lg text-sm text-primary-dark hover:bg-primary-bg transition-colors"
            style={{ fontFamily: bodyFont }}
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={saving || createMutation.isPending || updateMutation.isPending}
            className="bg-primary hover:bg-accent text-white px-6 py-2 rounded-lg text-sm flex items-center gap-2 transition disabled:opacity-50"
            style={{ fontFamily: bodyFont }}
          >
            {saving || createMutation.isPending || updateMutation.isPending ? (
              <Loader className="w-4 h-4 animate-spin" />
            ) : (
              <Save size={16} />
            )}
            {isEditing ? "Update Draft" : "Save Draft"}
          </button>
        </div>
      </form>
    </>
  );
}