// src/components/IssueInventoryModal.jsx
import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "../api/supabase";
import { useOrg } from "../context/OrganizationContext";
import { useTheme } from "../context/ThemeContext";
import toast from "react-hot-toast";

export default function IssueInventoryModal({ studentId, studentName, onClose }) {
  const { branch, selectedFinancialYear } = useOrg();
  const theme = useTheme();
  const branchId = branch?.id;
  const financialYearId = selectedFinancialYear?.id;
  const queryClient = useQueryClient();

  const headingFont = theme?.font_heading || "Righteous";
  const bodyFont = theme?.font_body || "Montserrat";

  const [selectedItemId, setSelectedItemId] = useState("");
  const [quantity, setQuantity] = useState(1);
  const [notes, setNotes] = useState("");

  // ── Fetch items with stock ──
  const { data: items = [] } = useQuery({
    queryKey: ["inventory-items-for-issue", branchId, financialYearId],
    queryFn: async () => {
      let query = supabase
        .from("inventory_items")
        .select("id, item_name, unit, current_stock")
        .eq("branch_id", branchId)
        .eq("financial_year_id", financialYearId)
        .order("item_name");
      const { data } = await query;
      return data || [];
    },
    enabled: !!branchId && !!financialYearId,
    staleTime: 5 * 60 * 1000,
  });

  // ── Issue mutation ──
  const issueMutation = useMutation({
    mutationFn: async () => {
      // 1. Insert transaction – the trigger will handle stock update
      const { error: txError } = await supabase
        .from("inventory_transactions")
        .insert({
          item_id: parseInt(selectedItemId),
          transaction_type: "issue",
          quantity: -quantity, // negative quantity
          unit_price: null,
          reference: `Student: ${studentName} (ID: ${studentId})`,
          notes: notes || null,
          student_id: studentId,
          branch_id: branchId,
          financial_year_id: financialYearId,
        });
      if (txError) throw txError;

      // Note: Stock is automatically updated by the trigger `trg_update_stock`
      // No need for RPC call
    },
    onSuccess: () => {
      const itemName = items.find(i => i.id == selectedItemId)?.item_name || "Item";
      toast.success(`${quantity} ${itemName} issued to student`);
      queryClient.invalidateQueries(["inventory-transactions"]);
      queryClient.invalidateQueries(["inventory-items"]);
      onClose();
    },
    onError: (err) => {
      if (err?.code === '23505') {
        toast.error("Voucher number conflict – please try again.");
      } else {
        toast.error(err.message || "Failed to issue item");
      }
    },
  });

  const selectedItem = items.find(i => i.id == selectedItemId);

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl max-w-md w-full p-6 shadow-xl border border-primary-bg">
        <h2
          className="text-xl font-bold text-primary mb-4"
          style={{ fontFamily: headingFont }}
        >
          Issue Inventory to Student
        </h2>
        <p
          className="text-sm text-primary-dark mb-4"
          style={{ fontFamily: bodyFont }}
        >
          Student: <strong>{studentName}</strong>
        </p>

        <div className="space-y-4">
          <div>
            <label
              className="block text-sm mb-1 text-primary-dark"
              style={{ fontFamily: bodyFont }}
            >
              Item *
            </label>
            <select
              value={selectedItemId}
              onChange={(e) => setSelectedItemId(e.target.value)}
              className="w-full border border-primary-bg rounded p-2.5 text-sm bg-white text-primary-dark focus:ring-1 focus:ring-primary"
              required
            >
              <option value="">Select item</option>
              {items.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.item_name} (Stock: {item.current_stock} {item.unit})
                </option>
              ))}
            </select>
          </div>

          <div>
            <label
              className="block text-sm mb-1 text-primary-dark"
              style={{ fontFamily: bodyFont }}
            >
              Quantity *
            </label>
            <input
              type="number"
              min="1"
              value={quantity}
              onChange={(e) => setQuantity(parseInt(e.target.value) || 1)}
              className="w-full border border-primary-bg rounded p-2.5 text-sm bg-white text-primary-dark focus:ring-1 focus:ring-primary"
            />
            {selectedItem && quantity > selectedItem.current_stock && (
              <p
                className="text-accent-dark text-xs mt-1"
                style={{ fontFamily: bodyFont }}
              >
                Not enough stock (available: {selectedItem.current_stock})
              </p>
            )}
          </div>

          <div>
            <label
              className="block text-sm mb-1 text-primary-dark"
              style={{ fontFamily: bodyFont }}
            >
              Notes
            </label>
            <textarea
              rows={2}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              className="w-full border border-primary-bg rounded p-2.5 text-sm bg-white text-primary-dark placeholder-primary-dark/40 focus:ring-1 focus:ring-primary"
              placeholder="Optional remarks"
              style={{ fontFamily: bodyFont }}
            />
          </div>

          <div className="flex justify-end gap-3 mt-4">
            <button
              onClick={onClose}
              className="border border-primary-bg px-4 py-2 rounded-lg text-sm text-primary-dark hover:bg-primary-bg transition-colors"
              style={{ fontFamily: bodyFont }}
            >
              Cancel
            </button>
            <button
              onClick={() => issueMutation.mutate()}
              disabled={!selectedItemId || !quantity || quantity < 1 || (selectedItem && quantity > selectedItem.current_stock)}
              className="bg-primary hover:bg-primary-light text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors disabled:opacity-50"
              style={{ fontFamily: bodyFont }}
            >
              Issue Item
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}