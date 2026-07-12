// src/pages/Invoices.jsx
import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import {
  getInvoices,
  deleteInvoice,
  finalizeInvoice,
} from "../services/invoiceService";
import toast from "react-hot-toast";
import AdminLayout from "../layouts/AdminLayout";
import BackButton from "../components/BackButton";
import { useOrg } from "../context/OrganizationContext"; // NEW

import {
  Search,
  Plus,
  Eye,
  Edit3,
  Trash2,
  CheckCircle,
  XCircle,
} from "lucide-react";

export default function Invoices() {
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("");

  // ── Branch & Financial Year context ──
  const { branch, selectedFinancialYear } = useOrg(); // NEW
  const branchId = branch?.id;
  const financialYearId = selectedFinancialYear?.id;
  const ctx = { branchId, financialYearId };

  // Fetch invoices – scoped
  const {
    data: invoices = [],
    isLoading,
  } = useQuery({
    queryKey: ["invoices", search, statusFilter, branchId, financialYearId],
    queryFn: () =>
      getInvoices({ search, status: statusFilter }, branchId, financialYearId),
    enabled: !!branchId && !!financialYearId,
    staleTime: 5 * 60 * 1000,
  });

  // Mutations – now pass context / IDs
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
    if (
      window.confirm("Finalize this invoice? This action cannot be undone.")
    ) {
      finalizeMutation.mutate(id);
    }
  };

  return (
    <AdminLayout>
      <BackButton to="/accounting" label="Finance & Accounting" />
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-3xl font-righteous text-primary-dark">
          Invoices
        </h1>
        <Link
          to="/invoices/new"
          className="bg-primary text-white px-4 py-2 rounded-lg text-sm flex items-center gap-2"
        >
          <Plus size={16} /> Create Invoice
        </Link>
      </div>

      <div className="flex flex-col sm:flex-row gap-3 mb-4">
        <div className="relative flex-1">
          <Search
            size={18}
            className="absolute left-3 top-1/2 -translate-y-1/2 text-secondary"
          />
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
                <tr>
                  <td
                    colSpan={6}
                    className="p-6 text-center text-secondary"
                  >
                    Loading…
                  </td>
                </tr>
              ) : invoices.length === 0 ? (
                <tr>
                  <td
                    colSpan={6}
                    className="p-6 text-center text-secondary"
                  >
                    No invoices found.
                  </td>
                </tr>
              ) : (
                invoices.map((inv) => (
                  <tr
                    key={inv.id}
                    className="border-t hover:bg-gray-50 transition"
                  >
                    <td className="p-3 text-sm font-medium">
                      {inv.invoice_number}
                    </td>
                    <td className="p-3 text-sm">
                      {inv.students?.first_name} {inv.students?.last_name}
                    </td>
                    <td className="p-3 text-sm">
                      {inv.invoice_date}
                    </td>
                    <td className="p-3 text-right text-sm font-medium">
                      ₹{" "}
                      {Number(inv.grand_total).toLocaleString(
                        "en-IN"
                      )}
                    </td>
                    <td className="p-3 text-sm">
                      <span
                        className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                          inv.status === "Final"
                            ? "bg-green-100 text-green-700"
                            : inv.status === "Draft"
                            ? "bg-gray-100 text-gray-700"
                            : inv.status === "Paid"
                            ? "bg-blue-100 text-blue-700"
                            : inv.status === "Partially Paid"
                            ? "bg-yellow-100 text-yellow-700"
                            : "bg-red-100 text-red-700"
                        }`}
                      >
                        {inv.status}
                      </span>
                    </td>
                    <td className="p-3 text-sm">
                      <div className="flex gap-2">
                        <Link
                          to={`/invoices/${inv.id}`}
                          className="text-blue-600 hover:underline"
                        >
                          <Eye size={15} />
                        </Link>
                        {inv.status === "Draft" && (
                          <>
                            <Link
                              to={`/invoices/${inv.id}/edit`}
                              className="text-yellow-600 hover:underline"
                            >
                              <Edit3 size={15} />
                            </Link>
                            <button
                              onClick={() =>
                                handleFinalize(inv.id)
                              }
                              className="text-green-600 hover:underline"
                              title="Finalize"
                            >
                              <CheckCircle size={15} />
                            </button>
                          </>
                        )}
                        {inv.status === "Draft" && (
                          <button
                            onClick={() =>
                              handleDelete(inv.id)
                            }
                            className="text-red-600 hover:underline"
                          >
                            <Trash2 size={15} />
                          </button>
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
    </AdminLayout>
  );
}