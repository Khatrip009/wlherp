// src/pages/InventoryTransactions.jsx
import React, { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Filter, Search, Box, Mail } from "lucide-react";

import BackButton from "../components/BackButton";
import { supabase } from "../api/supabase";
import { useOrg } from "../context/OrganizationContext";
import { sendEmail } from "../services/emailService";

export default function InventoryTransactions({ studentId: propStudentId = null, standalone = true }) {
  const [search, setSearch] = useState("");
  const [itemFilter, setItemFilter] = useState("");
  const [typeFilter, setTypeFilter] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");

  const { branch, selectedFinancialYear, org } = useOrg();
  const branchId = branch?.id;
  const financialYearId = selectedFinancialYear?.id;

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
    if (transactions.length === 0) {
      alert("No transactions to send.");
      return;
    }

    try {
      const adminEmails = await getAdminEmails();
      if (adminEmails.length === 0) {
        alert("No admin emails found.");
        return;
      }

      // Build HTML table rows
      let tableRows = transactions.map((tx) => {
        const date = new Date(tx.created_at).toLocaleDateString("en-IN");
        const itemName = tx.inventory_items?.item_name || "—";
        const unit = tx.inventory_items?.unit || "";
        const type = tx.transaction_type;
        const qty = Math.abs(tx.quantity);
        const unitPrice = tx.unit_price ? `₹ ${Number(tx.unit_price).toLocaleString('en-IN')}` : "—";
        const total = tx.unit_price ? `₹ ${(qty * Number(tx.unit_price)).toLocaleString('en-IN')}` : "—";
        const ref = tx.reference || "—";
        const notes = tx.notes || "—";

        const typeColor = type === "purchase" ? "#2e7d32" : type === "issue" ? "#c62828" : "#1565C0";
        const typeBg = type === "purchase" ? "#e8f5e9" : type === "issue" ? "#ffebee" : "#e3f2fd";

        return `
          <tr>
            <td style="padding:4px 8px;border:1px solid #ddd;">${date}</td>
            <td style="padding:4px 8px;border:1px solid #ddd;">${itemName}${unit ? ` (${unit})` : ''}</td>
            <td style="padding:4px 8px;border:1px solid #ddd;">
              <span style="background:${typeBg};color:${typeColor};padding:2px 8px;border-radius:12px;font-size:10px;font-weight:600;">${type}</span>
            </td>
            <td style="padding:4px 8px;border:1px solid #ddd;text-align:center;">${qty}</td>
            <td style="padding:4px 8px;border:1px solid #ddd;text-align:right;">${unitPrice}</td>
            <td style="padding:4px 8px;border:1px solid #ddd;text-align:right;font-weight:bold;">${total}</td>
            <td style="padding:4px 8px;border:1px solid #ddd;">${ref}</td>
            <td style="padding:4px 8px;border:1px solid #ddd;">${notes}</td>
          </tr>
        `;
      }).join('');

      const totalPurchases = transactions
        .filter(tx => tx.transaction_type === "purchase")
        .reduce((sum, tx) => sum + (Math.abs(tx.quantity) * Number(tx.unit_price || 0)), 0);
      const totalIssues = transactions
        .filter(tx => tx.transaction_type === "issue")
        .reduce((sum, tx) => sum + (Math.abs(tx.quantity) * Number(tx.unit_price || 0)), 0);

      const htmlBody = `
        <div style="font-family:Arial,sans-serif;max-width:800px;margin:0 auto;">
          <h2 style="color:#0D47A1;">Inventory Transactions Report</h2>
          <p><strong>Branch:</strong> ${branch?.branch_name || 'N/A'}</p>
          <p><strong>Period:</strong> ${startDate || 'Start'} – ${endDate || 'End'}</p>
          <p><strong>Total Transactions:</strong> ${transactions.length}</p>
          ${propStudentId ? `<p><strong>Student ID:</strong> ${propStudentId}</p>` : ''}
          <hr />
          <div style="display:flex;gap:20px;margin-bottom:15px;">
            <div><strong>Total Purchase Value:</strong> ₹ ${totalPurchases.toLocaleString('en-IN')}</div>
            <div><strong>Total Issue Value:</strong> ₹ ${totalIssues.toLocaleString('en-IN')}</div>
          </div>
          <table style="width:100%;border-collapse:collapse;font-size:11px;border:1px solid #ddd;">
            <thead style="background:#e3f2fd;">
              <tr>
                <th style="padding:4px 8px;border:1px solid #ddd;text-align:left;">Date</th>
                <th style="padding:4px 8px;border:1px solid #ddd;text-align:left;">Item</th>
                <th style="padding:4px 8px;border:1px solid #ddd;text-align:left;">Type</th>
                <th style="padding:4px 8px;border:1px solid #ddd;text-align:center;">Qty</th>
                <th style="padding:4px 8px;border:1px solid #ddd;text-align:right;">Unit Price</th>
                <th style="padding:4px 8px;border:1px solid #ddd;text-align:right;">Total</th>
                <th style="padding:4px 8px;border:1px solid #ddd;text-align:left;">Reference</th>
                <th style="padding:4px 8px;border:1px solid #ddd;text-align:left;">Notes</th>
              </tr>
            </thead>
            <tbody>
              ${tableRows}
            </tbody>
          </table>
          <p style="color:#888;font-size:10px;margin-top:20px;">Computer‑generated report from ${org?.company_name || 'Academy'}</p>
        </div>
      `;

      await sendEmail({
        to: adminEmails,
        subject: `Inventory Transactions Report - ${new Date().toLocaleDateString()}`,
        html: htmlBody,
       // from: org?.email || undefined,
      });

      alert("Report sent to admins.");
    } catch (err) {
      console.error("Failed to send report:", err);
      alert("Failed to send report. Check console for details.");
    }
  };

  // Fetch items for dropdown
  const { data: items = [] } = useQuery({
    queryKey: ["inventory-items-list", branchId, financialYearId],
    queryFn: async () => {
      let query = supabase.from("inventory_items").select("id, item_name").order("item_name");
      if (branchId) query = query.eq("branch_id", branchId);
      if (financialYearId) query = query.eq("financial_year_id", financialYearId);
      const { data } = await query;
      return data || [];
    },
    enabled: !!branchId && !!financialYearId,
    staleTime: 5 * 60 * 1000,
  });

  // Fetch transactions
  const { data: transactions = [], isLoading } = useQuery({
    queryKey: ["inventory-transactions", search, itemFilter, typeFilter, startDate, endDate, branchId, financialYearId, propStudentId],
    queryFn: async () => {
      let query = supabase
        .from("inventory_transactions")
        .select(`
          id,
          transaction_type,
          quantity,
          unit_price,
          reference,
          notes,
          created_at,
          inventory_items(item_name, unit)
        `)
        .order("created_at", { ascending: false });

      if (branchId) query = query.eq("branch_id", branchId);
      if (financialYearId) query = query.eq("financial_year_id", financialYearId);
      if (propStudentId) query = query.eq("student_id", propStudentId);

      if (search) query = query.or(`reference.ilike.%${search}%,notes.ilike.%${search}%`);
      if (itemFilter) query = query.eq("item_id", itemFilter);
      if (typeFilter) query = query.eq("transaction_type", typeFilter);
      if (startDate) query = query.gte("created_at", startDate);
      if (endDate) query = query.lte("created_at", endDate + "T23:59:59");

      const { data, error } = await query.limit(100);
      if (error) throw error;
      return data || [];
    },
    enabled: !!branchId && !!financialYearId,
    staleTime: 2 * 60 * 1000,
  });

  const content = (
    <>
      {/* Header – only if standalone */}
      {standalone && (
        <div className="flex justify-between items-center mb-6">
          <div>
            <h1 className="text-3xl font-righteous text-primary-dark">Stock Transactions</h1>
            <p className="text-sm text-secondary-dark">Purchase, Issue & Adjustment history</p>
          </div>
          {/* 👇 Send Report button */}
          <button
            onClick={sendReportEmail}
            className="inline-flex items-center gap-2 px-4 py-2.5 bg-green-600 hover:bg-green-700 text-white rounded-lg transition-colors text-sm font-medium"
          >
            <Mail size={18} /> Send Report
          </button>
        </div>
      )}

      {/* Filters */}
      <div className="flex flex-wrap gap-4 mb-6">
        <div className="relative max-w-xs flex-1">
          <Search size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-secondary" />
          <input
            type="text"
            placeholder="Search reference or notes..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-10 pr-4 py-2.5 border rounded-lg text-sm"
          />
        </div>
        <select value={itemFilter} onChange={(e) => setItemFilter(e.target.value)} className="border rounded p-2 text-sm">
          <option value="">All Items</option>
          {items.map((item) => (
            <option key={item.id} value={item.id}>{item.item_name}</option>
          ))}
        </select>
        <select value={typeFilter} onChange={(e) => setTypeFilter(e.target.value)} className="border rounded p-2 text-sm">
          <option value="">All Types</option>
          <option value="purchase">Purchase</option>
          <option value="issue">Issue</option>
          <option value="adjustment">Adjustment</option>
        </select>
        <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} className="border rounded p-2 text-sm" />
        <input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} className="border rounded p-2 text-sm" />
      </div>

      {/* Transactions Table */}
      <div className="bg-white rounded-xl shadow-sm overflow-hidden">
        <table className="w-full">
          <thead className="bg-slate-100">
            <tr>
              <th className="p-3 text-left text-sm">Date</th>
              <th className="p-3 text-left text-sm">Item</th>
              <th className="p-3 text-left text-sm">Type</th>
              <th className="p-3 text-center text-sm">Quantity</th>
              <th className="p-3 text-right text-sm">Unit Price</th>
              <th className="p-3 text-right text-sm">Total</th>
              <th className="p-3 text-left text-sm">Reference</th>
              <th className="p-3 text-left text-sm">Notes</th>
            </tr>
          </thead>
          <tbody>
            {isLoading ? (
              <tr><td colSpan={8} className="p-6 text-center">Loading…</td></tr>
            ) : transactions.length === 0 ? (
              <tr><td colSpan={8} className="p-6 text-center text-secondary">No transactions found.</td></tr>
            ) : (
              transactions.map((tx) => (
                <tr key={tx.id} className="border-t hover:bg-gray-50">
                  <td className="p-3 text-sm">{new Date(tx.created_at).toLocaleDateString("en-IN")}</td>
                  <td className="p-3 text-sm font-medium">
                    {tx.inventory_items?.item_name || "—"}
                    {tx.inventory_items?.unit ? ` (${tx.inventory_items.unit})` : ""}
                  </td>
                  <td className="p-3 text-sm">
                    <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                      tx.transaction_type === "purchase" ? "bg-green-100 text-green-700" :
                      tx.transaction_type === "issue" ? "bg-red-100 text-red-700" :
                      "bg-blue-100 text-blue-700"
                    }`}>
                      {tx.transaction_type}
                    </span>
                  </td>
                  <td className="p-3 text-sm text-center">{Math.abs(tx.quantity)}</td>
                  <td className="p-3 text-sm text-right">
                    {tx.unit_price ? `₹ ${Number(tx.unit_price).toLocaleString("en-IN")}` : "—"}
                  </td>
                  <td className="p-3 text-sm text-right">
                    {tx.unit_price ? `₹ ${(Math.abs(tx.quantity) * Number(tx.unit_price)).toLocaleString("en-IN")}` : "—"}
                  </td>
                  <td className="p-3 text-sm">{tx.reference || "—"}</td>
                  <td className="p-3 text-sm">{tx.notes || "—"}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </>
  );

  if (!standalone) {
    return <div>{content}</div>;
  }

  return <div className="max-w-7xl mx-auto p-6">{content}</div>;
}