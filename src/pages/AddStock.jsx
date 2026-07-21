// src/pages/AddStock.jsx
import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import toast from "react-hot-toast";
import { Plus, Trash2, Save } from "lucide-react";
import { supabase } from "../api/supabase";
import { useOrg } from "../context/OrganizationContext";
import { sendTemplateEmail } from "../services/emailService"; // 👈 Import

export default function AddStock() {
  const queryClient = useQueryClient();
  const { branch, selectedFinancialYear, org } = useOrg(); // 👈 Added org
  const branchId = branch?.id;
  const financialYearId = selectedFinancialYear?.id;

  const [vendor, setVendor] = useState("");
  const [reference, setReference] = useState("");
  const [date, setDate] = useState(new Date().toISOString().split("T")[0]);
  const [taxRateId, setTaxRateId] = useState("");
  const [lines, setLines] = useState([
    { item_id: "", quantity: "1", unit_price: "", total: 0 },
  ]);

  // ─── Helper: get admin emails ────────────────────────────────────
  async function getAdminEmails() {
    if (!org?.id) return [];
    const { data, error } = await supabase
      .from("profiles")
      .select("email")
      .eq("organization_id", org.id)
      .in("role", ["admin", "super_admin", "organization_admin"])
      .eq("is_active", true);
    if (error) {
      console.error("Failed to fetch admin emails:", error);
      return [];
    }
    return data?.map(p => p.email).filter(Boolean) || [];
  }

  // ─── Items, Tax Rates, Accounts queries (unchanged) ─────────────
  const { data: items = [] } = useQuery({
    queryKey: ["inventory-items", branchId, financialYearId],
    queryFn: async () => {
      const { data } = await supabase
        .from("inventory_items")
        .select("id, item_name")
        .eq("branch_id", branchId)
        .eq("financial_year_id", financialYearId)
        .order("item_name");
      return data || [];
    },
    enabled: !!branchId && !!financialYearId,
    staleTime: 5 * 60 * 1000,
  });

  const { data: taxRates = [] } = useQuery({
    queryKey: ["tax-rates", branchId, financialYearId],
    queryFn: async () => {
      const { data } = await supabase
        .from("tax_rates")
        .select("id, name, rate")
        .eq("is_active", true)
        .eq("branch_id", branchId)
        .eq("financial_year_id", financialYearId);
      return data || [];
    },
    enabled: !!branchId && !!financialYearId,
  });

  const { data: accounts } = useQuery({
    queryKey: ["account-ids-stock", branchId, financialYearId],
    queryFn: async () => {
      const inv = await supabase
        .from("chart_of_accounts")
        .select("id")
        .eq("account_code", "1004")
        .eq("branch_id", branchId)
        .eq("financial_year_id", financialYearId)
        .single();
      const cash = await supabase
        .from("chart_of_accounts")
        .select("id")
        .eq("account_code", "1001")
        .eq("branch_id", branchId)
        .eq("financial_year_id", financialYearId)
        .single();
      const cgst = await supabase
        .from("chart_of_accounts")
        .select("id")
        .eq("account_code", "2504")
        .eq("branch_id", branchId)
        .eq("financial_year_id", financialYearId)
        .maybeSingle();
      const sgst = await supabase
        .from("chart_of_accounts")
        .select("id")
        .eq("account_code", "2505")
        .eq("branch_id", branchId)
        .eq("financial_year_id", financialYearId)
        .maybeSingle();
      return {
        invAssetId: inv.data?.id || null,
        cashId: cash.data?.id || null,
        inputCgstId: cgst.data?.id || null,
        inputSgstId: sgst.data?.id || null,
      };
    },
    enabled: !!branchId && !!financialYearId,
    staleTime: Infinity,
  });

  // ─── Mutation with email notification ────────────────────────────
  const addStockMutation = useMutation({
    mutationFn: async () => {
      const acc = accounts;
      if (!acc.invAssetId || !acc.cashId) {
        throw new Error("Required accounts (1004 & 1001) are missing. Create them in Chart of Accounts.");
      }

      const selectedTax = taxRates.find((t) => t.id == taxRateId);
      const taxRate = selectedTax ? parseFloat(selectedTax.rate) : 0;

      // We'll collect transaction details for the email
      let totalSubtotal = 0;
      let totalTax = 0;
      let totalGrand = 0;
      let itemNames = [];

      for (const line of lines) {
        const itemId = parseInt(line.item_id, 10);
        const qty = parseInt(line.quantity, 10) || 0;
        const price = parseFloat(line.unit_price) || 0;
        const total = qty * price;

        if (!itemId || qty <= 0 || price <= 0) continue;

        // Get item name for summary
        const item = items.find(i => i.id === itemId);
        if (item) itemNames.push(`${item.item_name} x ${qty}`);

        totalSubtotal += total;

        // 1. Insert inventory transaction
        const { data: tx, error: txError } = await supabase
          .from("inventory_transactions")
          .insert({
            item_id: itemId,
            transaction_type: "purchase",
            quantity: qty,
            unit_price: price,
            reference: reference || `Purchase on ${date}`,
            notes: `Vendor: ${vendor || "Unknown"}`,
            branch_id: branchId,
            financial_year_id: financialYearId,
          })
          .select("id")
          .single();

        if (txError) throw txError;

        // 2. Journal entry
        if (taxRate > 0 && acc.inputCgstId && acc.inputSgstId) {
          const taxAmount = total * (taxRate / 100);
          const taxHalf = Math.round((taxAmount / 2) * 100) / 100;
          totalTax += taxAmount;

          const { data: journal } = await supabase
            .from("journal_entries")
            .insert({
              entry_date: date,
              reference: reference || `Stock #${tx.id}`,
              description: `Purchase with tax ${taxRate}%`,
              is_posted: true,
              branch_id: branchId,
              financial_year_id: financialYearId,
            })
            .select("id")
            .single();

          await supabase.from("journal_entry_lines").insert([
            { journal_entry_id: journal.id, account_id: acc.invAssetId, debit: total, credit: 0, branch_id: branchId, financial_year_id: financialYearId },
            { journal_entry_id: journal.id, account_id: acc.inputCgstId, debit: taxHalf, credit: 0, branch_id: branchId, financial_year_id: financialYearId },
            { journal_entry_id: journal.id, account_id: acc.inputSgstId, debit: taxHalf, credit: 0, branch_id: branchId, financial_year_id: financialYearId },
            { journal_entry_id: journal.id, account_id: acc.cashId, debit: 0, credit: total + taxHalf * 2, branch_id: branchId, financial_year_id: financialYearId },
          ]);
        } else {
          const { data: journal } = await supabase
            .from("journal_entries")
            .insert({
              entry_date: date,
              reference: reference || `Stock #${tx.id}`,
              description: "Purchase without tax",
              is_posted: true,
              branch_id: branchId,
              financial_year_id: financialYearId,
            })
            .select("id")
            .single();

          await supabase.from("journal_entry_lines").insert([
            { journal_entry_id: journal.id, account_id: acc.invAssetId, debit: total, credit: 0, branch_id: branchId, financial_year_id: financialYearId },
            { journal_entry_id: journal.id, account_id: acc.cashId, debit: 0, credit: total, branch_id: branchId, financial_year_id: financialYearId },
          ]);
        }
      }

      totalGrand = totalSubtotal + totalTax;

      return {
        success: true,
        vendor,
        reference,
        date,
        totalSubtotal,
        totalTax,
        totalGrand,
        taxRate,
        itemNames,
      };
    },
    onSuccess: async (result) => {
      toast.success("Stock added successfully");
      queryClient.invalidateQueries(["inventory-items"]);
      queryClient.invalidateQueries(["inventory-transactions"]);
      setLines([{ item_id: "", quantity: "1", unit_price: "", total: 0 }]);
      setVendor("");
      setReference("");
      setTaxRateId("");

      // ─── Send email to admins ──────────────────────────────────
      try {
        if (!org?.id) {
          console.warn("No organization ID, skipping admin notification.");
          return;
        }

        const adminEmails = await getAdminEmails();
        if (adminEmails.length === 0) {
          console.warn("No admin emails found, skipping notification.");
          return;
        }

        const message = `New stock has been added:\n` +
          `Branch: ${branch?.branch_name || 'N/A'}\n` +
          `Date: ${result.date}\n` +
          `Vendor: ${result.vendor || 'N/A'}\n` +
          `Reference: ${result.reference || 'N/A'}\n` +
          `Items: ${result.itemNames.join(', ')}\n` +
          `Subtotal: ₹${result.totalSubtotal.toLocaleString('en-IN')}\n` +
          `Tax (${result.taxRate || 0}%): ₹${result.totalTax.toLocaleString('en-IN')}\n` +
          `Grand Total: ₹${result.totalGrand.toLocaleString('en-IN')}`;

        await sendTemplateEmail({
          to: adminEmails,
          organizationId: org.id,
          slug: "system_announcement",
          context: {
            academyName: org.company_name || "Academy",
            title: "New Stock Added",
            message,
            target_type: "Admin",
          },
          branchId,
        });
        console.log("✅ Admin stock notification sent.");
      } catch (emailError) {
        console.error("❌ Failed to send admin stock notification:", emailError);
      }
    },
    onError: (err) => toast.error(err.message || "Failed to add stock"),
  });

  // ─── Rest of the component (addLine, removeLine, updateLine, handlers) unchanged ──
  // ... (all the existing JSX and handlers remain exactly as before)

  const addLine = () => setLines([...lines, { item_id: "", quantity: "1", unit_price: "", total: 0 }]);
  const removeLine = (idx) => setLines(lines.filter((_, i) => i !== idx));
  const updateLine = (idx, field, value) => {
    const updated = [...lines];
    updated[idx][field] = value;
    if (field === "quantity" || field === "unit_price") {
      const qty = parseInt(updated[idx].quantity, 10) || 0;
      const price = parseFloat(updated[idx].unit_price) || 0;
      updated[idx].total = qty * price;
    }
    setLines(updated);
  };

  const subtotal = lines.reduce((s, l) => s + (parseFloat(l.total) || 0), 0);
  const selectedTax = taxRates.find((t) => t.id == taxRateId);
  const taxPercent = selectedTax ? parseFloat(selectedTax.rate) : 0;
  const taxAmount = subtotal * (taxPercent / 100);
  const grandTotal = subtotal + taxAmount;

  const handleSubmit = (e) => {
    e.preventDefault();
    if (lines.some((l) => !l.item_id || !l.quantity || !l.unit_price)) {
      toast.error("Please fill all item fields");
      return;
    }
    addStockMutation.mutate();
  };

  return (
    <div className="space-y-6 px-4 sm:px-6 lg:px-0">
      {/* Header */}
      <div>
        <h1 className="text-2xl sm:text-3xl font-bold" style={{ fontFamily: "var(--font-heading)", color: "var(--color-primary)" }}>
          Add Stock / Purchase
        </h1>
        <p className="text-sm text-gray-600 dark:text-gray-400 mt-1" style={{ fontFamily: "var(--font-body)" }}>
          Record inventory purchases with tax
        </p>
      </div>

      {/* Form */}
      <form onSubmit={handleSubmit} className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 p-6 space-y-6">
        {/* Top fields */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1" style={{ fontFamily: "var(--font-body)" }}>
              Date
            </label>
            <input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className="w-full border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 rounded-lg p-2.5 text-sm"
              required
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1" style={{ fontFamily: "var(--font-body)" }}>
              Vendor
            </label>
            <input
              type="text"
              value={vendor}
              onChange={(e) => setVendor(e.target.value)}
              placeholder="Vendor name"
              className="w-full border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 rounded-lg p-2.5 text-sm"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1" style={{ fontFamily: "var(--font-body)" }}>
              Reference
            </label>
            <input
              type="text"
              value={reference}
              onChange={(e) => setReference(e.target.value)}
              placeholder="e.g., INV-001"
              className="w-full border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 rounded-lg p-2.5 text-sm"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1" style={{ fontFamily: "var(--font-body)" }}>
              Tax Rate
            </label>
            <select
              value={taxRateId}
              onChange={(e) => setTaxRateId(e.target.value)}
              className="w-full border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 rounded-lg p-2.5 text-sm"
            >
              <option value="">No Tax</option>
              {taxRates.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name} ({t.rate}%)
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Items */}
        <div>
          <h2 className="text-lg font-semibold mb-3" style={{ fontFamily: "var(--font-heading)", color: "var(--color-primary)" }}>
            Items
          </h2>
          {lines.map((line, idx) => (
            <div
              key={idx}
              className="grid grid-cols-1 sm:grid-cols-6 gap-2 items-end border border-gray-200 dark:border-gray-600 bg-gray-50 dark:bg-gray-700 p-3 rounded-lg mb-2"
            >
              <div className="col-span-2">
                <label className="text-xs font-medium text-gray-600 dark:text-gray-400 mb-1 block" style={{ fontFamily: "var(--font-body)" }}>
                  Item *
                </label>
                <select
                  value={line.item_id}
                  onChange={(e) => updateLine(idx, "item_id", e.target.value)}
                  className="w-full border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-600 text-gray-900 dark:text-gray-100 rounded p-2 text-sm"
                  required
                >
                  <option value="">Select item</option>
                  {items.map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.item_name}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="text-xs font-medium text-gray-600 dark:text-gray-400 mb-1 block" style={{ fontFamily: "var(--font-body)" }}>
                  Qty *
                </label>
                <input
                  type="number"
                  min="1"
                  value={line.quantity}
                  onChange={(e) => updateLine(idx, "quantity", e.target.value)}
                  className="w-full border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-600 text-gray-900 dark:text-gray-100 rounded p-2 text-sm"
                  required
                />
              </div>
              <div>
                <label className="text-xs font-medium text-gray-600 dark:text-gray-400 mb-1 block" style={{ fontFamily: "var(--font-body)" }}>
                  Unit Price *
                </label>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={line.unit_price}
                  onChange={(e) => updateLine(idx, "unit_price", e.target.value)}
                  className="w-full border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-600 text-gray-900 dark:text-gray-100 rounded p-2 text-sm"
                  required
                />
              </div>
              <div>
                <label className="text-xs font-medium text-gray-600 dark:text-gray-400 mb-1 block" style={{ fontFamily: "var(--font-body)" }}>
                  Total
                </label>
                <input
                  type="text"
                  value={`₹ ${(parseFloat(line.total) || 0).toLocaleString("en-IN")}`}
                  readOnly
                  className="w-full border border-gray-300 dark:border-gray-600 bg-gray-100 dark:bg-gray-500 text-gray-700 dark:text-gray-300 rounded p-2 text-sm"
                />
              </div>
              <div className="flex items-end justify-end sm:justify-start">
                {lines.length > 1 && (
                  <button type="button" onClick={() => removeLine(idx)} className="text-red-500 hover:text-red-700 p-1 transition-colors">
                    <Trash2 size={18} />
                  </button>
                )}
              </div>
            </div>
          ))}
          <button
            type="button"
            onClick={addLine}
            className="mt-2 inline-flex items-center gap-1 text-sm font-medium text-primary hover:underline"
          >
            <Plus size={16} /> Add Item
          </button>
        </div>

        {/* Totals */}
        <div className="border-t border-gray-200 dark:border-gray-700 pt-4 flex flex-col items-end space-y-1 text-sm">
          <div className="flex justify-between w-full sm:w-64">
            <span className="text-gray-600 dark:text-gray-400" style={{ fontFamily: "var(--font-body)" }}>Subtotal:</span>
            <span className="font-medium text-gray-800 dark:text-gray-200">₹ {subtotal.toLocaleString("en-IN")}</span>
          </div>
          {taxPercent > 0 && (
            <>
              <div className="flex justify-between w-full sm:w-64">
                <span className="text-gray-600 dark:text-gray-400" style={{ fontFamily: "var(--font-body)" }}>CGST ({taxPercent / 2}%)</span>
                <span className="text-gray-800 dark:text-gray-200">₹ {(taxAmount / 2).toLocaleString("en-IN")}</span>
              </div>
              <div className="flex justify-between w-full sm:w-64">
                <span className="text-gray-600 dark:text-gray-400" style={{ fontFamily: "var(--font-body)" }}>SGST ({taxPercent / 2}%)</span>
                <span className="text-gray-800 dark:text-gray-200">₹ {(taxAmount / 2).toLocaleString("en-IN")}</span>
              </div>
            </>
          )}
          <div className="flex justify-between w-full sm:w-64 font-bold text-lg border-t border-gray-200 dark:border-gray-700 pt-2">
            <span className="text-gray-800 dark:text-gray-100" style={{ fontFamily: "var(--font-heading)" }}>Grand Total:</span>
            <span style={{ color: "var(--color-primary)" }}>₹ {grandTotal.toLocaleString("en-IN")}</span>
          </div>
        </div>

        <button
          type="submit"
          disabled={addStockMutation.isPending}
          className="inline-flex items-center gap-2 px-6 py-2.5 bg-primary hover:bg-primary-light text-white rounded-lg transition-colors text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed"
          style={{ fontFamily: "var(--font-body)" }}
        >
          <Save size={16} />
          {addStockMutation.isPending ? "Saving…" : "Add Stock"}
        </button>
      </form>
    </div>
  );
}