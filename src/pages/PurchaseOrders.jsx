// src/pages/PurchaseOrders.jsx
import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { Plus, Eye, Trash2, Truck, Edit3 } from "lucide-react";
import toast from "react-hot-toast";
import AdminLayout from "../layouts/AdminLayout";
import BackButton from "../components/BackButton";

import { getPurchaseOrders, receivePO, deletePO } from "../services/poService";
import { useOrg } from "../context/OrganizationContext";   // NEW

export default function PurchaseOrders() {
  const queryClient = useQueryClient();
  const [statusFilter, setStatusFilter] = useState("");

  // ── Organisation / Branch / Financial Year context ──
  const { branch, selectedFinancialYear } = useOrg();   // NEW
  const ctx = { branchId: branch?.id, financialYearId: selectedFinancialYear?.id };

  const { data: pos = [], isLoading } = useQuery({
    queryKey: ["purchase-orders", statusFilter],
    queryFn: () => getPurchaseOrders({ status: statusFilter }),
    staleTime: 2 * 60 * 1000,
  });

  const receiveMut = useMutation({
    mutationFn: (poId) => receivePO(poId, ctx),   // pass context
    onSuccess: () => {
      toast.success("PO received – stock updated");
      queryClient.invalidateQueries(["purchase-orders"]);
    },
    onError: () => toast.error("Failed to receive PO"),
  });

  const deleteMut = useMutation({
    mutationFn: deletePO,   // no context needed
    onSuccess: () => {
      toast.success("PO deleted");
      queryClient.invalidateQueries(["purchase-orders"]);
    },
    onError: () => toast.error("Delete failed"),
  });

  return (
    <AdminLayout>
      <BackButton to="/accounting" label="Finance & Accounting" />
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-3xl font-righteous text-primary-dark">Purchase Orders</h1>
        <Link to="/purchase-orders/new" className="bg-primary text-white px-4 py-2 rounded-lg text-sm flex items-center gap-2">
          <Plus size={16} /> New PO
        </Link>
      </div>

      <div className="mb-4">
        <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)} className="border rounded p-2 text-sm">
          <option value="">All Statuses</option>
          <option value="Draft">Draft</option>
          <option value="Sent">Sent</option>
          <option value="Received">Received</option>
          <option value="Partially Received">Partially Received</option>
          <option value="Cancelled">Cancelled</option>
        </select>
      </div>

      <div className="bg-white rounded-xl shadow-sm overflow-hidden">
        <table className="w-full">
          <thead className="bg-slate-100">
            <tr>
              <th className="p-3 text-left text-sm">PO Number</th>
              <th className="p-3 text-left text-sm">Vendor</th>
              <th className="p-3 text-left text-sm">Date</th>
              <th className="p-3 text-left text-sm">Expected</th>
              <th className="p-3 text-right text-sm">Items</th>
              <th className="p-3 text-left text-sm">Status</th>
              <th className="p-3 text-left text-sm">Actions</th>
            </tr>
          </thead>
          <tbody>
            {isLoading ? (
              <tr><td colSpan={7} className="p-6 text-center">Loading…</td></tr>
            ) : pos.length === 0 ? (
              <tr><td colSpan={7} className="p-6 text-center text-secondary">No purchase orders.</td></tr>
            ) : (
              pos.map(po => (
                <tr key={po.id} className="border-t hover:bg-gray-50">
                  <td className="p-3 text-sm font-medium">{po.po_number}</td>
                  <td className="text-sm">{po.vendor}</td>
                  <td className="text-sm">{po.order_date}</td>
                  <td className="text-sm">{po.expected_date || "—"}</td>
                  <td className="text-sm text-right">{po.purchase_order_items?.length || 0}</td>
                  <td className="text-sm">
                    <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                      po.status === "Received" ? "bg-green-100 text-green-700" :
                      po.status === "Partially Received" ? "bg-yellow-100 text-yellow-700" :
                      po.status === "Sent" ? "bg-blue-100 text-blue-700" :
                      po.status === "Cancelled" ? "bg-red-100 text-red-700" :
                      "bg-gray-100 text-gray-700"
                    }`}>{po.status}</span>
                  </td>
                  <td className="text-sm">
                    <div className="flex gap-2">
                      <Link to={`/purchase-orders/${po.id}/edit`} className="text-blue-600">
                        <Edit3 size={15} />
                      </Link>
                      <Link to={`/purchase-orders/${po.id}`} className="text-blue-600"><Eye size={15} /></Link>
                      {(po.status !== "Received" && po.status !== "Cancelled") && (
                        <button onClick={() => receiveMut.mutate(po.id)} className="text-green-600" title="Receive"><Truck size={15} /></button>
                      )}
                      <button onClick={() => { if (window.confirm("Delete?")) deleteMut.mutate(po.id); }} className="text-red-600"><Trash2 size={15} /></button>
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </AdminLayout>
  );
}