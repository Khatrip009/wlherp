// src/pages/IssueInventory.jsx
import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import toast from "react-hot-toast";
import { User, Box } from "lucide-react";
import AdminLayout from "../layouts/AdminLayout";
import { getInventoryItems, addInventoryTransaction } from "../services/inventoryService";
import { supabase } from "../api/supabase";

export default function IssueInventory() {
  const queryClient = useQueryClient();
  const [studentId, setStudentId] = useState("");
  const [itemId, setItemId] = useState("");
  const [quantity, setQuantity] = useState(1);
  const [notes, setNotes] = useState("");

  const { data: students = [] } = useQuery({
    queryKey: ["students-list"],
    queryFn: async () => {
      const { data } = await supabase.from("students").select("id, first_name, last_name, admission_no").order("first_name");
      return data || [];
    },
  });

  const { data: items = [] } = useQuery({
    queryKey: ["inv-items"],
    queryFn: getInventoryItems,
  });

  const issueMutation = useMutation({
    mutationFn: async () => {
      const selectedStudent = students.find(s => s.id == studentId);
      const studentName = selectedStudent ? `${selectedStudent.first_name} ${selectedStudent.last_name}` : "Unknown";

      // Get the item's unit price (cost)
      const { data: itemData, error: itemError } = await supabase
        .from('inventory_items')
        .select('unit_price')
        .eq('id', itemId)
        .single();
      if (itemError) throw itemError;

      const unitPrice = itemData?.unit_price || 0;
      const quantityNum = parseInt(quantity, 10);
      const totalAmount = unitPrice * quantityNum;

      const payload = {
        item_id: parseInt(itemId, 10),
        transaction_type: "issue",
        quantity: quantityNum,
        unit_price: unitPrice,
        // total_amount is computed in the DB if you have a generated column
        reference: `Student: ${studentName} (${selectedStudent?.admission_no || ""})`,
        notes,
      };

      await addInventoryTransaction(payload);
    },
    onSuccess: () => {
      toast.success("Item issued to student");
      queryClient.invalidateQueries(["inv-transactions"]);
      queryClient.invalidateQueries(["inventory-items"]);
      setStudentId("");
      setItemId("");
      setQuantity(1);
      setNotes("");
    },
    onError: (err) => {
      console.error("Issue error:", err);
      toast.error(err.message || "Failed to issue item");
    },
  });

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!studentId || !itemId) {
      toast.error("Select student and item");
      return;
    }
    if (parseInt(quantity, 10) <= 0) {
      toast.error("Quantity must be at least 1");
      return;
    }
    issueMutation.mutate();
  };

  return (
    <AdminLayout>
      <h1 className="text-3xl font-righteous text-primary-dark mb-6">Issue Inventory to Student</h1>
      <form onSubmit={handleSubmit} className="bg-white rounded-xl p-6 shadow-sm max-w-xl space-y-4">
        <div>
          <label className="block text-sm mb-1"><User size={14} className="inline mr-1" /> Student</label>
          <select
            value={studentId}
            onChange={(e) => setStudentId(e.target.value)}
            className="w-full border rounded p-2.5 text-sm"
            required
          >
            <option value="">Select student</option>
            {students.map((s) => (
              <option key={s.id} value={s.id}>
                {s.first_name} {s.last_name} ({s.admission_no})
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="block text-sm mb-1"><Box size={14} className="inline mr-1" /> Item</label>
          <select
            value={itemId}
            onChange={(e) => setItemId(e.target.value)}
            className="w-full border rounded p-2.5 text-sm"
            required
          >
            <option value="">Select item</option>
            {items.map((i) => (
              <option key={i.id} value={i.id}>
                {i.item_name} (stock: {i.current_stock}, cost: ₹{i.unit_price || 0})
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="block text-sm mb-1">Quantity</label>
          <input
            type="number"
            value={quantity}
            onChange={(e) => setQuantity(e.target.value)}
            min={1}
            className="w-full border rounded p-2.5 text-sm"
            required
          />
        </div>

        <div>
          <label className="block text-sm mb-1">Notes</label>
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={2}
            className="w-full border rounded p-2.5 text-sm"
          />
        </div>

        <button
          type="submit"
          disabled={issueMutation.isPending}
          className="bg-primary text-white px-6 py-2.5 rounded-lg"
        >
          {issueMutation.isPending ? "Issuing..." : "Issue Item"}
        </button>
      </form>
    </AdminLayout>
  );
}