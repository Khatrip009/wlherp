// src/pages/PurchaseOrders.jsx
import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { Plus, Eye, Trash2, Truck, Edit3, Mail } from "lucide-react";
import toast from "react-hot-toast";

import BackButton from "../components/BackButton";
import {
  getPurchaseOrders,
  receivePO,
  deletePO,
} from "../services/poService";
import { useOrg } from "../context/OrganizationContext";
import { supabase } from "../api/supabase";
import { sendEmail, sendTemplateEmail } from "../services/emailService";

export default function PurchaseOrders() {
  const queryClient = useQueryClient();
  const [statusFilter, setStatusFilter] = useState("");

  const { branch, selectedFinancialYear, org } = useOrg();
  const branchId = branch?.id;
  const financialYearId = selectedFinancialYear?.id;
  const ctx = { branchId, financialYearId };

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
    if (pos.length === 0) {
      alert("No purchase orders to send.");
      return;
    }

    try {
      const adminEmails = await getAdminEmails();
      if (adminEmails.length === 0) {
        alert("No admin emails found.");
        return;
      }

      // Build HTML table rows
      let tableRows = pos.map((po) => {
        const statusColor = po.status === "Received" ? "#2e7d32" :
                            po.status === "Partially Received" ? "#e65100" :
                            po.status === "Sent" ? "#1565C0" :
                            po.status === "Cancelled" ? "#c62828" : "#757575";
        const statusBg = po.status === "Received" ? "#e8f5e9" :
                         po.status === "Partially Received" ? "#fff3e0" :
                         po.status === "Sent" ? "#e3f2fd" :
                         po.status === "Cancelled" ? "#ffebee" : "#f5f5f5";
        const itemCount = po.purchase_order_items?.length || 0;
        return `
          <tr>
            <td style="padding:4px 8px;border:1px solid #ddd;">${po.po_number}</td>
            <td style="padding:4px 8px;border:1px solid #ddd;">${po.vendor}</td>
            <td style="padding:4px 8px;border:1px solid #ddd;">${po.order_date}</td>
            <td style="padding:4px 8px;border:1px solid #ddd;">${po.expected_date || '—'}</td>
            <td style="padding:4px 8px;border:1px solid #ddd;text-align:center;">${itemCount}</td>
            <td style="padding:4px 8px;border:1px solid #ddd;">
              <span style="background:${statusBg};color:${statusColor};padding:2px 8px;border-radius:12px;font-size:10px;font-weight:600;">${po.status}</span>
            </td>
          </tr>
        `;
      }).join('');

      const totalPOs = pos.length;
      const totalItems = pos.reduce((sum, po) => sum + (po.purchase_order_items?.length || 0), 0);

      const htmlBody = `
        <div style="font-family:Arial,sans-serif;max-width:800px;margin:0 auto;">
          <h2 style="color:#0D47A1;">Purchase Order Report</h2>
          <p><strong>Branch:</strong> ${branch?.branch_name || 'N/A'}</p>
          <p><strong>Status Filter:</strong> ${statusFilter || 'All'}</p>
          <p><strong>Total POs:</strong> ${totalPOs}</p>
          <p><strong>Total Items:</strong> ${totalItems}</p>
          <hr />
          <table style="width:100%;border-collapse:collapse;font-size:11px;border:1px solid #ddd;">
            <thead style="background:#e3f2fd;">
              <tr>
                <th style="padding:4px 8px;border:1px solid #ddd;text-align:left;">PO Number</th>
                <th style="padding:4px 8px;border:1px solid #ddd;text-align:left;">Vendor</th>
                <th style="padding:4px 8px;border:1px solid #ddd;text-align:left;">Order Date</th>
                <th style="padding:4px 8px;border:1px solid #ddd;text-align:left;">Expected</th>
                <th style="padding:4px 8px;border:1px solid #ddd;text-align:center;">Items</th>
                <th style="padding:4px 8px;border:1px solid #ddd;text-align:left;">Status</th>
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
        subject: `Purchase Order Report - ${new Date().toLocaleDateString()}`,
        html: htmlBody,
        from: org?.email || undefined,
      });

      alert("Report sent to admins.");
    } catch (err) {
      console.error("Failed to send report:", err);
      alert("Failed to send report. Check console for details.");
    }
  };

  // ─── Send PO email to vendor ───────────────────────────────────────
  const sendPOEmail = async (po) => {
    if (!po.vendor_email) {
      toast.error("No vendor email address.");
      return;
    }

    try {
      const items = po.purchase_order_items || [];
      const itemsList = items
        .map(item => {
          const name = item.inventory_items?.item_name || 'Unknown Item';
          return `${name} x ${item.quantity_ordered} @ ₹${item.unit_price}`;
        })
        .join('; ');
      const subtotal = items.reduce((s, i) => s + i.quantity_ordered * i.unit_price, 0);
      const grandTotal = po.total_amount || subtotal;

      const context = {
        academyName: org?.company_name || "Academy",
        vendor_name: po.vendor || 'Vendor',
        po_number: po.po_number,
        order_date: po.order_date,
        expected_date: po.expected_date || 'Not specified',
        total_amount: grandTotal,
        items_list: itemsList || 'No items',
      };

      await sendTemplateEmail({
        to: po.vendor_email,
        organizationId: org?.id,
        slug: "po_sent",
        context,
        branchId,
      });

      toast.success(`PO sent to ${po.vendor_email}`);
    } catch (err) {
      console.error("Email error:", err);
      toast.error("Failed to send PO email.");
    }
  };

  // ─── Data fetching ──────────────────────────────────────────────────
  const { data: pos = [], isLoading } = useQuery({
    queryKey: ["purchase-orders", statusFilter, branchId, financialYearId],
    queryFn: () => getPurchaseOrders({ status: statusFilter }, branchId, financialYearId),
    enabled: !!branchId && !!financialYearId,
    staleTime: 2 * 60 * 1000,
  });

  // ─── Mutations ──────────────────────────────────────────────────────
  const receiveMut = useMutation({
    mutationFn: (poId) => receivePO(poId, ctx),
    onSuccess: () => {
      toast.success("PO received – stock updated");
      queryClient.invalidateQueries(["purchase-orders"]);
    },
    onError: () => toast.error("Failed to receive PO"),
  });

  const deleteMut = useMutation({
    mutationFn: (poId) => deletePO(poId, branchId, financialYearId),
    onSuccess: () => {
      toast.success("PO deleted");
      queryClient.invalidateQueries(["purchase-orders"]);
    },
    onError: () => toast.error("Delete failed"),
  });

  return (
    <>
      <BackButton to="/accounting" label="Finance & Accounting" />
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-6 gap-3">
        <h1 className="text-3xl font-righteous text-primary-dark">Purchase Orders</h1>
        <div className="flex gap-2">
          {/* 👇 Send Report button */}
          <button
            onClick={sendReportEmail}
            className="bg-green-600 hover:bg-green-700 text-white px-4 py-2 rounded-lg text-sm flex items-center gap-2"
          >
            <Mail size={16} /> Send Report
          </button>
          <Link
            to="/purchase-orders/new"
            className="bg-primary text-white px-4 py-2 rounded-lg text-sm flex items-center gap-2"
          >
            <Plus size={16} /> New PO
          </Link>
        </div>
      </div>

      <div className="mb-4">
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="border rounded p-2 text-sm"
        >
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
              pos.map((po) => (
                <tr key={po.id} className="border-t hover:bg-gray-50">
                  <td className="p-3 text-sm font-medium">{po.po_number}</td>
                  <td className="text-sm">{po.vendor}</td>
                  <td className="text-sm">{po.order_date}</td>
                  <td className="text-sm">{po.expected_date || "—"}</td>
                  <td className="text-sm text-right">{po.purchase_order_items?.length || 0}</td>
                  <td className="text-sm">
                    <span
                      className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                        po.status === "Received"
                          ? "bg-green-100 text-green-700"
                          : po.status === "Partially Received"
                          ? "bg-yellow-100 text-yellow-700"
                          : po.status === "Sent"
                          ? "bg-blue-100 text-blue-700"
                          : po.status === "Cancelled"
                          ? "bg-red-100 text-red-700"
                          : "bg-gray-100 text-gray-700"
                      }`}
                    >
                      {po.status}
                    </span>
                  </td>
                  <td className="text-sm">
                    <div className="flex gap-2">
                      {/* 👇 Send PO email to vendor */}
                      <button
                        onClick={() => sendPOEmail(po)}
                        className="text-blue-600 hover:underline"
                        title="Send PO to vendor"
                        disabled={!po.vendor_email}
                      >
                        <Mail size={15} />
                      </button>
                      <Link
                        to={`/purchase-orders/${po.id}/edit`}
                        className="text-blue-600"
                      >
                        <Edit3 size={15} />
                      </Link>
                      <Link
                        to={`/purchase-orders/${po.id}`}
                        className="text-blue-600"
                      >
                        <Eye size={15} />
                      </Link>
                      {po.status !== "Received" && po.status !== "Cancelled" && (
                        <button
                          onClick={() => receiveMut.mutate(po.id)}
                          className="text-green-600"
                          title="Receive"
                        >
                          <Truck size={15} />
                        </button>
                      )}
                      <button
                        onClick={() => {
                          if (window.confirm("Delete?")) deleteMut.mutate(po.id);
                        }}
                        className="text-red-600"
                      >
                        <Trash2 size={15} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </>
  );
}