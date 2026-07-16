// src/pages/InventoryTransactions.jsx
import React, { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Filter, Search, Box } from "lucide-react";

import BackButton from "../components/BackButton";
import { supabase } from "../api/supabase";
import { useOrg } from "../context/OrganizationContext";

export default function InventoryTransactions({ studentId: propStudentId = null, standalone = true }) {
  const [search, setSearch] = useState("");
  const [itemFilter, setItemFilter] = useState("");
  const [typeFilter, setTypeFilter] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");

  const { branch, selectedFinancialYear } = useOrg();
  const branchId = branch?.id;
  const financialYearId = selectedFinancialYear?.id;

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

}