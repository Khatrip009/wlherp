// src/pages/Invoices.jsx
import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { getInvoices, deleteInvoice, finalizeInvoice } from "../services/invoiceService";
import toast from "react-hot-toast";
import BackButton from "../components/BackButton";
import { useOrg } from "../context/OrganizationContext";
import { Search, Plus, Eye, Edit3, Trash2, CheckCircle, Mail } from "lucide-react";
import { supabase } from "../api/supabase";
import { sendEmail } from "../services/emailService";

export default function Invoices() {
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
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
    if (invoices.length === 0) {
      alert("No invoices to send.");
      return;
    }

    try {
      const adminEmails = await getAdminEmails();
      if (adminEmails.length === 0) {
        alert("No admin emails found.");
        return;
      }

      // Build HTML table rows
      let tableRows = invoices.map((inv) => {
        const studentName = inv.students ? `${inv.students.first_name || ''} ${inv.students.last_name || ''}`.trim() : '—';
        const statusColor = inv.status === "Final" ? "#2e7d32" :
                            inv.status === "Draft" ? "#757575" :
                            inv.status === "Paid" ? "#1565C0" :
                            inv.status === "Partially Paid" ? "#e65100" : "#c62828";
        const statusBg = inv.status === "Final" ? "#e8f5e9" :
                         inv.status === "Draft" ? "#f5f5f5" :
                         inv.status === "Paid" ? "#e3f2fd" :
                         inv.status === "Partially Paid" ? "#fff3e0" : "#ffebee";

        return `
          <tr>
            <td style="padding:4px 8px;border:1px solid #ddd;">${inv.invoice_number}</td>
            <td style="padding:4px 8px;border:1px solid #ddd;">${studentName}</td>
            <td style="padding:4px 8px;border:1px solid #ddd;">${inv.invoice_date}</td>
            <td style="padding:4px 8px;border:1px solid #ddd;text-align:right;">₹ ${Number(inv.grand_total).toLocaleString('en-IN')}</td>
            <td style="padding:4px 8px;border:1px solid #ddd;">
              <span style="background:${statusBg};color:${statusColor};padding:2px 8px;border-radius:12px;font-size:10px;font-weight:600;">${inv.status}</span>
            </td>
          </tr>
        `;
      }).join('');

      const totalAmount = invoices.reduce((sum, inv) => sum + Number(inv.grand_total), 0);
      const draftCount = invoices.filter(inv => inv.status === "Draft").length;
      const finalCount = invoices.filter(inv => inv.status === "Final" || inv.status === "Paid" || inv.status === "Partially Paid").length;

      const htmlBody = `
        <div style="font-family:Arial,sans-serif;max-width:800px;margin:0 auto;">
          <h2 style="color:#0D47A1;">Invoice Report</h2>
          <p><strong>Branch:</strong> ${branch?.branch_name || 'N/A'}</p>
          <p><strong>Filters:</strong> Status: ${statusFilter || 'All'} | Search: ${search || 'None'}</p>
          <p><strong>Total Invoices:</strong> ${invoices.length}</p>
          <p><strong>Total Amount:</strong> ₹ ${totalAmount.toLocaleString('en-IN')}</p>
          <p><strong>Draft:</strong> ${draftCount} | <strong>Final/Paid:</strong> ${finalCount}</p>
          <hr />
          <table style="width:100%;border-collapse:collapse;font-size:11px;border:1px solid #ddd;">
            <thead style="background:#e3f2fd;">
              <tr>
                <th style="padding:4px 8px;border:1px solid #ddd;text-align:left;">Invoice No</th>
                <th style="padding:4px 8px;border:1px solid #ddd;text-align:left;">Student</th>
                <th style="padding:4px 8px;border:1px solid #ddd;text-align:left;">Date</th>
                <th style="padding:4px 8px;border:1px solid #ddd;text-align:right;">Total</th>
                <th style="padding:4px 8px;border:1px solid #ddd;text-align:left;">Status</th>
              </tr>
            </thead>
            <tbody>
              ${tableRows}
            </tbody>
            <tfoot style="font-weight:bold;background:#f5f5f5;">
              <tr>
                <td colspan="3" style="padding:4px 8px;border:1px solid #ddd;text-align:right;">Grand Total</td>
                <td style="padding:4px 8px;border:1px solid #ddd;text-align:right;">₹ ${totalAmount.toLocaleString('en-IN')}</td>
                <td></td>
              </tr>
            </tfoot>
          </table>
          <p style="color:#888;font-size:10px;margin-top:20px;">Computer‑generated report from ${org?.company_name || 'Academy'}</p>
        </div>
      `;

      await sendEmail({
        to: adminEmails,
        subject: `Invoice Report - ${new Date().toLocaleDateString()}`,
        html: htmlBody,
       // from: org?.email || undefined,
      });

      alert("Report sent to admins.");
    } catch (err) {
      console.error("Failed to send report:", err);
      alert("Failed to send report. Check console for details.");
    }
  };

  const { data: invoices = [], isLoading } = useQuery({
    queryKey: ["invoices", search, statusFilter, branchId, financialYearId],
    queryFn: () => getInvoices({ search, status: statusFilter }, branchId, financialYearId),
    enabled: !!branchId && !!financialYearId,
    staleTime: 5 * 60 * 1000,
  });

  const deleteMutation = useMutation({
    mutationFn: (id) => deleteInvoice(id, branchId, financialYearId),
    onSuccess: () => {
      toast.success("Invoice deleted");
      queryClient.invalidateQueries(["invoices"]);
    },
    onError: (err) => toast.error(err.message),
  });

  const finalizeMutation = useMutation({
    mutationFn: (id) => finalizeInvoice(id, ctx),
    onSuccess: () => {
      toast.success("Invoice finalized");
      queryClient.invalidateQueries(["invoices"]);
    },
    onError: (err) => toast.error(err.message),
  });

  const handleDelete = (id) => {
    if (window.confirm("Are you sure you want to delete this invoice?")) {
      deleteMutation.mutate(id);
    }
  };

  const handleFinalize = (id) => {
    if (window.confirm("Finalize this invoice? This action cannot be undone.")) {
      finalizeMutation.mutate(id);
    }
  };

  return (
    <>
      <BackButton to="/accounting" label="Finance & Accounting" />
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-6 gap-3">
        <h1 className="text-3xl font-righteous text-primary-dark">Invoices</h1>
        <div className="flex gap-2">
          {/* 👇 Send Report button */}
          <button
            onClick={sendReportEmail}
            className="bg-green-600 hover:bg-green-700 text-white px-4 py-2 rounded-lg text-sm flex items-center gap-2 transition"
          >
            <Mail size={16} /> Send Report
          </button>
          <Link
            to="/invoices/new"
            className="bg-primary text-white px-4 py-2 rounded-lg text-sm flex items-center gap-2 transition"
          >
            <Plus size={16} /> Create Invoice
          </Link>
        </div>
      </div>

      <div className="flex flex-col sm:flex-row gap-3 mb-4">
        <div className="relative flex-1">
          <Search size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-secondary" />
          <input
            type="text"
            placeholder="Search by invoice number or student name..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-10 pr-4 py-2.5 border rounded-lg text-sm"
          />
        </div>
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="border rounded-lg px-4 py-2.5 text-sm"
        >
          <option value="">All Statuses</option>
          <option value="Draft">Draft</option>
          <option value="Final">Final</option>
          <option value="Paid">Paid</option>
          <option value="Partially Paid">Partially Paid</option>
          <option value="Cancelled">Cancelled</option>
        </select>
      </div>

      <div className="bg-white rounded-xl shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[700px]">
            <thead className="bg-slate-100">
              <tr>
                <th className="p-3 text-left text-sm">Invoice No</th>
                <th className="p-3 text-left text-sm">Student</th>
                <th className="p-3 text-left text-sm">Date</th>
                <th className="p-3 text-right text-sm">Total</th>
                <th className="p-3 text-left text-sm">Status</th>
                <th className="p-3 text-left text-sm">Actions</th>
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                <tr><td colSpan={6} className="p-6 text-center text-secondary">Loading…</td></tr>
              ) : invoices.length === 0 ? (
                <tr><td colSpan={6} className="p-6 text-center text-secondary">No invoices found.</td></tr>
              ) : (
                invoices.map((inv) => (
                  <tr key={inv.id} className="border-t hover:bg-gray-50 transition">
                    <td className="p-3 text-sm font-medium">{inv.invoice_number}</td>
                    <td className="p-3 text-sm">{inv.students?.first_name} {inv.students?.last_name}</td>
                    <td className="p-3 text-sm">{inv.invoice_date}</td>
                    <td className="p-3 text-right text-sm font-medium">₹ {Number(inv.grand_total).toLocaleString("en-IN")}</td>
                    <td className="p-3 text-sm">
                      <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                        inv.status === "Final" ? "bg-green-100 text-green-700" :
                        inv.status === "Draft" ? "bg-gray-100 text-gray-700" :
                        inv.status === "Paid" ? "bg-blue-100 text-blue-700" :
                        inv.status === "Partially Paid" ? "bg-yellow-100 text-yellow-700" :
                        "bg-red-100 text-red-700"
                      }`}>
                        {inv.status}
                      </span>
                    </td>
                    <td className="p-3 text-sm">
                      <div className="flex gap-2">
                        <Link to={`/invoices/${inv.id}`} className="text-blue-600 hover:underline"><Eye size={15} /></Link>
                        {inv.status === "Draft" && (
                          <>
                            <Link to={`/invoices/${inv.id}/edit`} className="text-yellow-600 hover:underline"><Edit3 size={15} /></Link>
                            <button onClick={() => handleFinalize(inv.id)} className="text-green-600 hover:underline" title="Finalize"><CheckCircle size={15} /></button>
                          </>
                        )}
                        {inv.status === "Draft" && (
                          <button onClick={() => handleDelete(inv.id)} className="text-red-600 hover:underline"><Trash2 size={15} /></button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}