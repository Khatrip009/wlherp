// src/pages/StockDashboard.jsx
import { useQuery } from "@tanstack/react-query";
import { AlertTriangle, Package, TrendingDown, TrendingUp } from "lucide-react";
import { Link } from "react-router-dom";

import { supabase } from "../api/supabase";
import { useOrg } from "../context/OrganizationContext";

export default function StockDashboard() {
  // ── Branch & Financial Year context ──
  const { branch, selectedFinancialYear } = useOrg();
  const branchId = branch?.id;
  const financialYearId = selectedFinancialYear?.id;

  // Fetch all items with category – now scoped to branch & FY
  const { data: items = [], isLoading } = useQuery({
    queryKey: ["inventory-items", branchId, financialYearId],
    queryFn: async () => {
      let query = supabase
        .from("inventory_items")
        .select("*, inventory_categories(name)")
        .order("item_name");

      if (branchId) query = query.eq("branch_id", branchId);
      if (financialYearId) query = query.eq("financial_year_id", financialYearId);

      const { data } = await query;
      return data || [];
    },
    enabled: !!branchId && !!financialYearId,
    staleTime: 2 * 60 * 1000,
  });

  // Low stock items (current stock <= reorder level)
  const lowStockItems = items.filter((item) => item.current_stock <= item.reorder_level);
  const totalItems = items.length;
  const totalStockValue = items.reduce((s, item) => s + item.current_stock * parseFloat(item.unit_price), 0);

  return (
    <>
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-3xl font-righteous text-primary-dark">Stock Dashboard</h1>
        <Link to="/add-stock" className="bg-primary text-white px-4 py-2 rounded-lg text-sm flex items-center gap-2">
          <Package size={16} /> Add Stock
        </Link>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-8">
        <div className="bg-white rounded-xl p-5 shadow-sm border text-center">
          <p className="text-xs text-secondary-dark">Total Items</p>
          <p className="text-2xl font-bold text-primary-dark mt-1">{totalItems}</p>
        </div>
        <div className="bg-white rounded-xl p-5 shadow-sm border text-center">
          <p className="text-xs text-secondary-dark">Total Stock Value</p>
          <p className="text-2xl font-bold text-primary-dark mt-1">₹ {totalStockValue.toLocaleString("en-IN")}</p>
        </div>
        <div className={`bg-white rounded-xl p-5 shadow-sm border text-center ${lowStockItems.length > 0 ? "border-red-300" : ""}`}>
          <p className="text-xs text-secondary-dark">Low Stock Items</p>
          <p className={`text-2xl font-bold mt-1 ${lowStockItems.length > 0 ? "text-red-600" : "text-green-600"}`}>
            {lowStockItems.length}
          </p>
        </div>
      </div>

      {/* Low Stock Alerts */}
      {lowStockItems.length > 0 && (
        <div className="mb-8">
          <h2 className="text-lg font-semibold text-red-600 flex items-center gap-2 mb-4">
            <AlertTriangle size={20} /> Low Stock Alerts
          </h2>
          <div className="bg-red-50 rounded-xl p-4 border border-red-200">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left">
                  <th className="p-2">Item</th>
                  <th className="p-2">Category</th>
                  <th className="p-2 text-right">Current Stock</th>
                  <th className="p-2 text-right">Reorder Level</th>
                </tr>
              </thead>
              <tbody>
                {lowStockItems.map((item) => (
                  <tr key={item.id} className="border-t border-red-100">
                    <td className="p-2 font-medium">{item.item_name}</td>
                    <td className="p-2">{item.inventory_categories?.name || "—"}</td>
                    <td className="p-2 text-right text-red-600 font-bold">{item.current_stock}</td>
                    <td className="p-2 text-right">{item.reorder_level}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* All Stock Items */}
      <div className="bg-white rounded-xl shadow-sm overflow-hidden">
        <h2 className="text-lg font-semibold p-4 border-b">All Stock Items</h2>
        {isLoading ? (
          <p className="p-4 text-center">Loading…</p>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-slate-100">
              <tr>
                <th className="p-3 text-left">Item</th>
                <th className="p-3 text-left">Category</th>
                <th className="p-3 text-left">Unit</th>
                <th className="p-3 text-right">Unit Price</th>
                <th className="p-3 text-right">In Stock</th>
                <th className="p-3 text-right">Reorder Level</th>
                <th className="p-3 text-right">Stock Value</th>
                <th className="p-3 text-center">Status</th>
              </tr>
            </thead>
            <tbody>
              {items.map((item) => {
                const isLow = item.current_stock <= item.reorder_level;
                return (
                  <tr key={item.id} className={`border-t hover:bg-gray-50 ${isLow ? "bg-red-50" : ""}`}>
                    <td className="p-3 font-medium">{item.item_name}</td>
                    <td className="p-3">{item.inventory_categories?.name || "—"}</td>
                    <td className="p-3">{item.unit}</td>
                    <td className="p-3 text-right">₹ {Number(item.unit_price).toLocaleString("en-IN")}</td>
                    <td className="p-3 text-right font-medium">{item.current_stock}</td>
                    <td className="p-3 text-right">{item.reorder_level}</td>
                    <td className="p-3 text-right">₹ {(item.current_stock * Number(item.unit_price)).toLocaleString("en-IN")}</td>
                    <td className="p-3 text-center">
                      {isLow ? (
                        <span className="px-2 py-0.5 bg-red-100 text-red-700 rounded-full text-xs">Low Stock</span>
                      ) : (
                        <span className="px-2 py-0.5 bg-green-100 text-green-700 rounded-full text-xs">OK</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </>
  );
}