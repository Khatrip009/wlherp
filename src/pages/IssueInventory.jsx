// src/pages/IssueInventory.jsx
import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import toast from "react-hot-toast";
import { User, Box, Mail } from "lucide-react";

import {
  getInventoryItems,
  addInventoryTransaction,
} from "../services/inventoryService";
import { supabase } from "../api/supabase";
import { useOrg } from "../context/OrganizationContext";
import { sendEmail } from "../services/emailService";

export default function IssueInventory() {
  const queryClient = useQueryClient();

  const { branch, selectedFinancialYear, org } = useOrg();
  const branchId = branch?.id;
  const financialYearId = selectedFinancialYear?.id;
  const ctx = { branchId, financialYearId };

  const [studentId, setStudentId] = useState("");
  const [itemId, setItemId] = useState("");
  const [quantity, setQuantity] = useState(1);
  const [notes, setNotes] = useState("");

  // ─── Helper: get admin emails ──────────────────────────────────────
  const getAdminEmails = async () => {
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
  };

  // ─── Send Report Email ─────────────────────────────────────────────
  const sendReportEmail = async () => {
    try {
      const adminEmails = await getAdminEmails();
      if (adminEmails.length === 0) {
        alert("No admin emails found.");
        return;
      }

      // Fetch recent issue transactions (last 100) with student and item details
      let query = supabase
        .from("inventory_transactions")
        .select(`
          id,
          created_at,
          quantity,
          unit_price,
          notes,
          reference,
          students ( first_name, last_name, admission_no ),
          inventory_items ( item_name, unit )
        `)
        .eq("transaction_type", "issue")
        .eq("branch_id", branchId)
        .eq("financial_year_id", financialYearId)
        .order("created_at", { ascending: false })
        .limit(100);

      const { data: transactions, error } = await query;
      if (error) throw error;

      if (!transactions || transactions.length === 0) {
        alert("No issue transactions found.");
        return;
      }

      // Build HTML table rows
      let tableRows = transactions.map((tx) => {
        const date = new Date(tx.created_at).toLocaleDateString("en-IN");
        const student = tx.students || {};
        const studentName = student.first_name ? `${student.first_name} ${student.last_name}` : "—";
        const admissionNo = student.admission_no || "—";
        const itemName = tx.inventory_items?.item_name || "—";
        const unit = tx.inventory_items?.unit || "";
        const qty = Math.abs(tx.quantity);
        const unitPrice = tx.unit_price ? `₹ ${Number(tx.unit_price).toLocaleString('en-IN')}` : "—";
        const total = tx.unit_price ? `₹ ${(qty * Number(tx.unit_price)).toLocaleString('en-IN')}` : "—";
        const notes = tx.notes || "—";

        return `
          <tr>
            <td style="padding:4px 8px;border:1px solid #ddd;">${date}</td>
            <td style="padding:4px 8px;border:1px solid #ddd;">${studentName}</td>
            <td style="padding:4px 8px;border:1px solid #ddd;">${admissionNo}</td>
            <td style="padding:4px 8px;border:1px solid #ddd;">${itemName}${unit ? ` (${unit})` : ''}</td>
            <td style="padding:4px 8px;border:1px solid #ddd;text-align:center;">${qty}</td>
            <td style="padding:4px 8px;border:1px solid #ddd;text-align:right;">${unitPrice}</td>
            <td style="padding:4px 8px;border:1px solid #ddd;text-align:right;font-weight:bold;">${total}</td>
            <td style="padding:4px 8px;border:1px solid #ddd;">${notes}</td>
          </tr>
        `;
      }).join('');

      const totalItems = transactions.reduce((sum, tx) => sum + Math.abs(tx.quantity), 0);
      const totalValue = transactions.reduce((sum, tx) => sum + (Math.abs(tx.quantity) * Number(tx.unit_price || 0)), 0);

      const htmlBody = `
        <div style="font-family:Arial,sans-serif;max-width:800px;margin:0 auto;">
          <h2 style="color:#0D47A1;">Inventory Issue Report</h2>
          <p><strong>Branch:</strong> ${branch?.branch_name || 'N/A'}</p>
          <p><strong>Total Issues:</strong> ${transactions.length}</p>
          <p><strong>Total Items Issued:</strong> ${totalItems}</p>
          <p><strong>Total Value:</strong> ₹ ${totalValue.toLocaleString('en-IN')}</p>
          <hr />
          <table style="width:100%;border-collapse:collapse;font-size:11px;border:1px solid #ddd;">
            <thead style="background:#e3f2fd;">
              <tr>
                <th style="padding:4px 8px;border:1px solid #ddd;text-align:left;">Date</th>
                <th style="padding:4px 8px;border:1px solid #ddd;text-align:left;">Student</th>
                <th style="padding:4px 8px;border:1px solid #ddd;text-align:left;">Admission No</th>
                <th style="padding:4px 8px;border:1px solid #ddd;text-align:left;">Item</th>
                <th style="padding:4px 8px;border:1px solid #ddd;text-align:center;">Qty</th>
                <th style="padding:4px 8px;border:1px solid #ddd;text-align:right;">Unit Price</th>
                <th style="padding:4px 8px;border:1px solid #ddd;text-align:right;">Total</th>
                <th style="padding:4px 8px;border:1px solid #ddd;text-align:left;">Notes</th>
              </tr>
            </thead>
            <tbody>
              ${tableRows}
            </tbody>
            <tfoot style="font-weight:bold;background:#f5f5f5;">
              <tr>
                <td colspan="4" style="padding:4px 8px;border:1px solid #ddd;text-align:right;">Totals</td>
                <td style="padding:4px 8px;border:1px solid #ddd;text-align:center;">${totalItems}</td>
                <td></td>
                <td style="padding:4px 8px;border:1px solid #ddd;text-align:right;">₹ ${totalValue.toLocaleString('en-IN')}</td>
                <td></td>
              </tr>
            </tfoot>
          </table>
          <p style="color:#888;font-size:10px;margin-top:20px;">Computer‑generated report from ${org?.company_name || 'Academy'}</p>
        </div>
      `;

      await sendEmail({
        to: adminEmails,
        subject: `Inventory Issue Report - ${new Date().toLocaleDateString()}`,
        html: htmlBody,
        from: org?.email || undefined,
      });

      alert("Report sent to admins.");
    } catch (err) {
      console.error("Failed to send report:", err);
      alert("Failed to send report. Check console for details.");
    }
  };

  // ─── Students ──────────────────────────────────────────────────────
  const { data: students = [] } = useQuery({
    queryKey: ["students-list", branchId, financialYearId],
    queryFn: async () => {
      let query = supabase
        .from("students")
        .select("id, first_name, last_name, admission_no")
        .order("first_name");

      if (branchId) query = query.eq("branch_id", branchId);
      if (financialYearId) query = query.eq("financial_year_id", financialYearId);

      const { data } = await query;
      return data || [];
    },
    enabled: !!branchId && !!financialYearId,
    staleTime: 5 * 60 * 1000,
  });

  // ─── Inventory items ──────────────────────────────────────────────
  const { data: items = [] } = useQuery({
    queryKey: ["inv-items", branchId, financialYearId],
    queryFn: () => getInventoryItems({}, branchId, financialYearId),
    enabled: !!branchId && !!financialYearId,
    staleTime: 5 * 60 * 1000,
  });

  // ─── Issue mutation ────────────────────────────────────────────────
  const issueMutation = useMutation({
    mutationFn: async () => {
      const selectedStudent = students.find((s) => s.id == studentId);
      const studentName = selectedStudent
        ? `${selectedStudent.first_name} ${selectedStudent.last_name}`
        : "Unknown";

      let itemQuery = supabase
        .from("inventory_items")
        .select("unit_price")
        .eq("id", itemId);

      if (branchId) itemQuery = itemQuery.eq("branch_id", branchId);
      if (financialYearId) itemQuery = itemQuery.eq("financial_year_id", financialYearId);

      const { data: itemData, error: itemError } = await itemQuery.single();
      if (itemError) throw itemError;

      const unitPrice = itemData?.unit_price || 0;
      const quantityNum = parseInt(quantity, 10);

      const payload = {
        item_id: parseInt(itemId, 10),
        transaction_type: "issue",
        quantity: quantityNum,
        unit_price: unitPrice,
        reference: `Student: ${studentName} (${selectedStudent?.admission_no || ""})`,
        notes,
        student_id: parseInt(studentId, 10), // 👈 Added student_id for better tracking
      };

      await addInventoryTransaction(payload, ctx);
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
    <>
      {/* Header with title and Send Report button */}
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-3xl font-righteous text-primary-dark">
          Issue Inventory to Student
        </h1>
        <button
          onClick={sendReportEmail}
          className="inline-flex items-center gap-2 px-4 py-2.5 bg-green-600 hover:bg-green-700 text-white rounded-lg transition-colors text-sm font-medium"
        >
          <Mail size={18} /> Send Report
        </button>
      </div>

      <form
        onSubmit={handleSubmit}
        className="bg-white rounded-xl p-6 shadow-sm max-w-xl space-y-4"
      >
        <div>
          <label className="block text-sm mb-1">
            <User size={14} className="inline mr-1" /> Student
          </label>
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
          <label className="block text-sm mb-1">
            <Box size={14} className="inline mr-1" /> Item
          </label>
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
    </>
  );
}