// src/pages/POForm.jsx
import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useNavigate, useParams, Link } from "react-router-dom";
import toast from "react-hot-toast";
import { Plus, Trash2, Save, ArrowLeft } from "lucide-react";
import AdminLayout from "../layouts/AdminLayout";
import { supabase } from "../api/supabase";
import { getPOById, createPO } from "../services/poService";
import { useOrg } from "../context/OrganizationContext";   // NEW

export default function POForm() {
  const { id } = useParams();
  const isEditing = !!id;
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  // ── Organisation / Branch / Financial Year context ──
  const { branch, selectedFinancialYear } = useOrg();   // NEW
  const ctx = { branchId: branch?.id, financialYearId: selectedFinancialYear?.id };

  const [form, setForm] = useState({
    vendor: "",
    vendor_address: "",
    vendor_gstin: "",
    vendor_contact_person: "",
    vendor_phone: "",
    vendor_email: "",
    order_date: new Date().toISOString().split("T")[0],
    expected_date: "",
    status: "Draft",
    notes: "",
  });
  const [lines, setLines] = useState([
    { item_id: "", quantity_ordered: "1", unit_price: "", tax_rate_id: "" },
  ]);

  // Fetch inventory items & tax rates
  const { data: items = [] } = useQuery({
    queryKey: ["inventory-items"],
    queryFn: async () => {
      const { data } = await supabase.from("inventory_items").select("id, item_name").order("item_name");
      return data || [];
    },
  });
  const { data: taxRates = [] } = useQuery({
    queryKey: ["tax-rates"],
    queryFn: async () => {
      const { data } = await supabase.from("tax_rates").select("id, name, rate").eq("is_active", true);
      return data || [];
    },
  });

  // Load existing PO for editing
  const { data: existingPO } = useQuery({
    queryKey: ["purchase-order", id],
    queryFn: () => getPOById(id),
    enabled: isEditing,
  });

  useEffect(() => {
    if (existingPO) {
      setForm({
        vendor: existingPO.vendor || "",
        vendor_address: existingPO.vendor_address || "",
        vendor_gstin: existingPO.vendor_gstin || "",
        vendor_contact_person: existingPO.vendor_contact_person || "",
        vendor_phone: existingPO.vendor_phone || "",
        vendor_email: existingPO.vendor_email || "",
        order_date: existingPO.order_date || new Date().toISOString().split("T")[0],
        expected_date: existingPO.expected_date || "",
        status: existingPO.status || "Draft",
        notes: existingPO.notes || "",
      });
      const poLines = (existingPO.purchase_order_items || []).map((item) => ({
        item_id: item.item_id ? String(item.item_id) : "",
        quantity_ordered: String(item.quantity_ordered || 1),
        unit_price: String(item.unit_price || ""),
        tax_rate_id: item.tax_rate_id ? String(item.tax_rate_id) : "",
      }));
      if (poLines.length > 0) setLines(poLines);
    }
  }, [existingPO]);

  // ── Create / Update mutation – now includes context ──
  const saveMutation = useMutation({
    mutationFn: async () => {
      // Prepare line items
      const payloadItems = lines.map((l) => ({
        item_id: l.item_id ? parseInt(l.item_id) : null,
        quantity_ordered: parseInt(l.quantity_ordered) || 0,
        unit_price: parseFloat(l.unit_price) || 0,
        tax_rate_id: l.tax_rate_id || null,
      }));

      // Compute total
      const total = payloadItems.reduce((s, i) => s + i.quantity_ordered * i.unit_price, 0);

      if (isEditing) {
        // Update PO header (add branch & FY for RLS)
        const { error: poError } = await supabase
          .from("purchase_orders")
          .update({
            ...form,
            total_amount: total,
            branch_id: ctx.branchId,
            financial_year_id: ctx.financialYearId,
          })
          .eq("id", id);
        if (poError) throw poError;

        // Delete old items
        const { error: delError } = await supabase
          .from("purchase_order_items")
          .delete()
          .eq("purchase_order_id", id);
        if (delError) throw delError;

        // Insert new items with branch & FY
        if (payloadItems.length > 0) {
          const itemsToInsert = payloadItems.map((item) => ({
            ...item,
            purchase_order_id: id,
            branch_id: ctx.branchId,
            financial_year_id: ctx.financialYearId,
          }));
          const { error: insError } = await supabase
            .from("purchase_order_items")
            .insert(itemsToInsert);
          if (insError) throw insError;
        }
      } else {
        // Create new PO – pass context to service
        await createPO({ ...form, total_amount: total, items: payloadItems }, ctx);
      }
    },
    onSuccess: () => {
      toast.success(isEditing ? "PO updated" : "PO created");
      queryClient.invalidateQueries(["purchase-orders"]);
      navigate("/purchase-orders");
    },
    onError: (err) => {
      console.error(err);
      toast.error(err.message || "Save failed");
    },
  });

  const addLine = () =>
    setLines([...lines, { item_id: "", quantity_ordered: "1", unit_price: "", tax_rate_id: "" }]);
  const removeLine = (idx) => setLines(lines.filter((_, i) => i !== idx));
  const updateLine = (idx, field, value) => {
    const updated = [...lines];
    updated[idx][field] = value;
    setLines(updated);
  };

  const subtotal = lines.reduce(
    (s, l) => s + (parseInt(l.quantity_ordered) || 0) * (parseFloat(l.unit_price) || 0),
    0
  );

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!form.vendor.trim()) { toast.error("Vendor name required"); return; }
    if (lines.some((l) => !l.item_id || !l.quantity_ordered || !l.unit_price)) {
      toast.error("Fill all item fields");
      return;
    }
    saveMutation.mutate();
  };

  return (
    <AdminLayout>
      <Link to="/purchase-orders" className="inline-flex items-center gap-2 text-secondary hover:text-primary-dark mb-4 text-sm">
        <ArrowLeft size={18} /> Back to POs
      </Link>
      <h1 className="text-3xl font-righteous text-primary-dark mb-6">
        {isEditing ? "Edit Purchase Order" : "New Purchase Order"}
      </h1>

      <form onSubmit={handleSubmit} className="bg-white rounded-xl p-6 shadow-sm space-y-6">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div>
            <label className="block text-sm mb-1">Vendor Name *</label>
            <input type="text" value={form.vendor} onChange={(e) => setForm({ ...form, vendor: e.target.value })} className="w-full border rounded p-2.5 text-sm" required />
          </div>
          <div>
            <label className="block text-sm mb-1">Vendor Address</label>
            <input type="text" value={form.vendor_address} onChange={(e) => setForm({ ...form, vendor_address: e.target.value })} className="w-full border rounded p-2.5 text-sm" />
          </div>
          <div>
            <label className="block text-sm mb-1">GSTIN</label>
            <input type="text" value={form.vendor_gstin} onChange={(e) => setForm({ ...form, vendor_gstin: e.target.value })} className="w-full border rounded p-2.5 text-sm" />
          </div>
          <div>
            <label className="block text-sm mb-1">Contact Person</label>
            <input type="text" value={form.vendor_contact_person} onChange={(e) => setForm({ ...form, vendor_contact_person: e.target.value })} className="w-full border rounded p-2.5 text-sm" />
          </div>
          <div>
            <label className="block text-sm mb-1">Phone</label>
            <input type="text" value={form.vendor_phone} onChange={(e) => setForm({ ...form, vendor_phone: e.target.value })} className="w-full border rounded p-2.5 text-sm" />
          </div>
          <div>
            <label className="block text-sm mb-1">Email</label>
            <input type="email" value={form.vendor_email} onChange={(e) => setForm({ ...form, vendor_email: e.target.value })} className="w-full border rounded p-2.5 text-sm" />
          </div>
          <div>
            <label className="block text-sm mb-1">Order Date *</label>
            <input type="date" value={form.order_date} onChange={(e) => setForm({ ...form, order_date: e.target.value })} className="w-full border rounded p-2.5 text-sm" required />
          </div>
          <div>
            <label className="block text-sm mb-1">Expected Date</label>
            <input type="date" value={form.expected_date} onChange={(e) => setForm({ ...form, expected_date: e.target.value })} className="w-full border rounded p-2.5 text-sm" />
          </div>
          <div>
            <label className="block text-sm mb-1">Status</label>
            <select value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })} className="w-full border rounded p-2.5 text-sm">
              <option value="Draft">Draft</option>
              <option value="Sent">Sent</option>
              <option value="Received">Received</option>
              <option value="Partially Received">Partially Received</option>
              <option value="Cancelled">Cancelled</option>
            </select>
          </div>
          <div className="sm:col-span-2">
            <label className="block text-sm mb-1">Notes</label>
            <input type="text" value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} className="w-full border rounded p-2.5 text-sm" />
          </div>
        </div>

        {/* Items */}
        <div>
          <h2 className="text-lg font-semibold mb-3">Items</h2>
          {lines.map((line, idx) => (
            <div key={idx} className="grid grid-cols-5 gap-2 items-end border p-2 rounded mb-2">
              <div>
                <select value={line.item_id} onChange={(e) => updateLine(idx, "item_id", e.target.value)} className="w-full border rounded p-2 text-sm">
                  <option value="">Select item</option>
                  {items.map((i) => (
                    <option key={i.id} value={i.id}>{i.item_name}</option>
                  ))}
                </select>
              </div>
              <div>
                <input type="number" min="1" value={line.quantity_ordered} onChange={(e) => updateLine(idx, "quantity_ordered", e.target.value)} className="w-full border rounded p-2 text-sm" placeholder="Qty" />
              </div>
              <div>
                <input type="number" min="0" step="0.01" value={line.unit_price} onChange={(e) => updateLine(idx, "unit_price", e.target.value)} className="w-full border rounded p-2 text-sm" placeholder="Unit Price" />
              </div>
              <div>
                <select value={line.tax_rate_id} onChange={(e) => updateLine(idx, "tax_rate_id", e.target.value)} className="w-full border rounded p-2 text-sm">
                  <option value="">No Tax</option>
                  {taxRates.map((t) => (
                    <option key={t.id} value={t.id}>{t.name}</option>
                  ))}
                </select>
              </div>
              <div className="flex items-end">
                {lines.length > 1 && (
                  <button type="button" onClick={() => removeLine(idx)} className="text-red-500 p-2">
                    <Trash2 size={18} />
                  </button>
                )}
              </div>
            </div>
          ))}
          <button type="button" onClick={addLine} className="mt-2 text-primary text-sm flex items-center gap-1">
            <Plus size={16} /> Add Item
          </button>
        </div>

        {/* Totals */}
        <div className="border-t pt-4 flex justify-between items-center">
          <span className="text-lg font-bold">Total: ₹ {subtotal.toLocaleString("en-IN")}</span>
          <button type="submit" disabled={saveMutation.isPending} className="bg-primary text-white px-6 py-2.5 rounded-lg text-sm flex items-center gap-2">
            <Save size={16} /> {isEditing ? "Update PO" : "Save PO"}
          </button>
        </div>
      </form>
    </AdminLayout>
  );
}