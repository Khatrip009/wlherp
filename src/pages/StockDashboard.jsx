// src/pages/StockDashboard.jsx
import { useQuery } from "@tanstack/react-query";
import { AlertTriangle, Package, TrendingDown, TrendingUp } from "lucide-react";
import { Link } from "react-router-dom";

import { supabase } from "../api/supabase";
import { useOrg } from "../context/OrganizationContext";
import { useTheme } from "../context/ThemeContext"; // ✅ dynamic theme

export default function StockDashboard() {
  // ── Branch & Financial Year context ──
  const { branch, selectedFinancialYear } = useOrg();
  const theme = useTheme();                                     // ✅ theme hook
  const branchId = branch?.id;
  const financialYearId = selectedFinancialYear?.id;

  const headingFont = theme?.font_heading || "Righteous";
  const bodyFont = theme?.font_body || "Montserrat";

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
        <h1 className="text-3xl font-bold text-primary" style={{ fontFamily: headingFont }}>
          Stock Dashboard
        </h1>
        <Link to="/add-stock" className="bg-primary hover:bg-primary-light text-white px-4 py-2 rounded-lg text-sm flex items-center gap-2 transition-colors" style={{ fontFamily: bodyFont }}>
          <Package size={16} /> Add Stock
        </Link>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-8">
        <div className="bg-white rounded-xl p-5 shadow-sm border border-primary-bg text-center">
          <p className="text-xs text-primary-dark" style={{ fontFamily: bodyFont }}>Total Items</p>
          <p className="text-2xl font-bold text-primary mt-1" style={{ fontFamily: headingFont }}>{totalItems}</p>
        </div>
        <div className="bg-white rounded-xl p-5 shadow-sm border border-primary-bg text-center">
          <p className="text-xs text-primary-dark" style={{ fontFamily: bodyFont }}>Total Stock Value</p>
          <p className="text-2xl font-bold text-primary mt-1" style={{ fontFamily: headingFont }}>₹ {totalStockValue.toLocaleString("en-IN")}</p>
        </div>
        <div className={`bg-white rounded-xl p-5 shadow-sm border text-center ${lowStockItems.length > 0 ? "border-accent" : "border-primary-bg"}`}>
          <p className="text-xs text-primary-dark" style={{ fontFamily: bodyFont }}>Low Stock Items</p>
          <p className={`text-2xl font-bold mt-1 ${lowStockItems.length > 0 ? "text-accent-dark" : "text-accent"}`} style={{ fontFamily: headingFont }}>
            {lowStockItems.length}
          </p>
        </div>
      </div>

      {/* Low Stock Alerts */}
      {lowStockItems.length > 0 && (
        <div className="mb-8">
          <h2 className="text-lg font-semibold text-accent-dark flex items-center gap-2 mb-4" style={{ fontFamily: headingFont }}>
            <AlertTriangle size={20} /> Low Stock Alerts
          </h2>
          <div className="bg-accent-bg rounded-xl p-4 border border-accent">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left">
                  <th className="p-2 text-primary-dark" style={{ fontFamily: bodyFont }}>Item</th>
                  <th className="p-2 text-primary-dark" style={{ fontFamily: bodyFont }}>Category</th>
                  <th className="p-2 text-right text-primary-dark" style={{ fontFamily: bodyFont }}>Current Stock</th>
                  <th className="p-2 text-right text-primary-dark" style={{ fontFamily: bodyFont }}>Reorder Level</th>
                </tr>
              </thead>
              <tbody>
                {lowStockItems.map((item) => (
                  <tr key={item.id} className="border-t border-accent-bg">
                    <td className="p-2 font-medium text-primary-dark" style={{ fontFamily: bodyFont }}>{item.item_name}</td>
                    <td className="p-2 text-primary-dark" style={{ fontFamily: bodyFont }}>{item.inventory_categories?.name || "—"}</td>
                    <td className="p-2 text-right text-accent-dark font-bold" style={{ fontFamily: bodyFont }}>{item.current_stock}</td>
                    <td className="p-2 text-right text-primary-dark" style={{ fontFamily: bodyFont }}>{item.reorder_level}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* All Stock Items */}
      <div className="bg-white rounded-xl shadow-sm overflow-hidden border border-primary-bg">
        <h2 className="text-lg font-semibold p-4 border-b border-primary-bg text-primary" style={{ fontFamily: headingFont }}>
          All Stock Items
        </h2>
        {isLoading ? (
          <p className="p-4 text-center text-primary-dark/60" style={{ fontFamily: bodyFont }}>Loading…</p>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-primary-bg">
              <tr>
                <th className="p-3 text-left text-primary-dark uppercase" style={{ fontFamily: bodyFont }}>Item</th>
                <th className="p-3 text-left text-primary-dark uppercase" style={{ fontFamily: bodyFont }}>Category</th>
                <th className="p-3 text-left text-primary-dark uppercase" style={{ fontFamily: bodyFont }}>Unit</th>
                <th className="p-3 text-right text-primary-dark uppercase" style={{ fontFamily: bodyFont }}>Unit Price</th>
                <th className="p-3 text-right text-primary-dark uppercase" style={{ fontFamily: bodyFont }}>In Stock</th>
                <th className="p-3 text-right text-primary-dark uppercase" style={{ fontFamily: bodyFont }}>Reorder Level</th>
                <th className="p-3 text-right text-primary-dark uppercase" style={{ fontFamily: bodyFont }}>Stock Value</th>
                <th className="p-3 text-center text-primary-dark uppercase" style={{ fontFamily: bodyFont }}>Status</th>
              </tr>
            </thead>
            <tbody>
              {items.map((item) => {
                const isLow = item.current_stock <= item.reorder_level;
                return (
                  <tr key={item.id} className={`border-t border-primary-bg hover:bg-primary-bg ${isLow ? "bg-accent-bg" : ""}`}>
                    <td className="p-3 font-medium text-primary-dark" style={{ fontFamily: bodyFont }}>{item.item_name}</td>
                    <td className="p-3 text-primary-dark" style={{ fontFamily: bodyFont }}>{item.inventory_categories?.name || "—"}</td>
                    <td className="p-3 text-primary-dark" style={{ fontFamily: bodyFont }}>{item.unit}</td>
                    <td className="p-3 text-right text-primary-dark" style={{ fontFamily: bodyFont }}>₹ {Number(item.unit_price).toLocaleString("en-IN")}</td>
                    <td className="p-3 text-right font-medium text-primary-dark" style={{ fontFamily: bodyFont }}>{item.current_stock}</td>
                    <td className="p-3 text-right text-primary-dark" style={{ fontFamily: bodyFont }}>{item.reorder_level}</td>
                    <td className="p-3 text-right text-primary" style={{ fontFamily: bodyFont }}>₹ {(item.current_stock * Number(item.unit_price)).toLocaleString("en-IN")}</td>
                    <td className="p-3 text-center">
                      {isLow ? (
                        <span className="px-2 py-0.5 bg-accent-bg text-accent-dark rounded-full text-xs font-medium">
                          Low Stock
                        </span>
                      ) : (
                        <span className="px-2 py-0.5 bg-primary-bg text-primary-dark rounded-full text-xs font-medium">
                          OK
                        </span>
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