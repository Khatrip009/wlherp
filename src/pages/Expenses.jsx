// src/pages/Expenses.jsx
import React, { useState, useRef } from "react";
import {
  useInfiniteQuery,
  useMutation,
  useQueryClient,
} from "@tanstack/react-query";
import toast from "react-hot-toast";
import {
  Search,
  Plus,
  Edit3,
  Trash2,
  Filter,
  Download,
  Upload,
  X,
  Calendar,
  IndianRupee,
  CreditCard,
  FileText,
  Hash,
} from "lucide-react";
import Papa from "papaparse";
import AdminLayout from "../layouts/AdminLayout";
import BackButton from "../components/BackButton";

import {
  getExpenses,
  createExpense,
  updateExpense,
  deleteExpense,
  getAllExpensesForExport,
} from "../services/financeService";
import { useOrgDarkLogo } from "../hooks/useOrgDarkLogo";
import { useOrg } from "../context/OrganizationContext";

export default function Expenses() {
  const queryClient = useQueryClient();
  const darkLogo = useOrgDarkLogo();

  // ── Organisation / Branch / Financial Year context ──
  const { branch, selectedFinancialYear } = useOrg();
  const branchId = branch?.id;
  const financialYearId = selectedFinancialYear?.id;
  const ctx = { branchId, financialYearId };

  // Filters
  const [search, setSearch] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [showFilters, setShowFilters] = useState(false);
  const allFilters = { search, startDate, endDate };

  // UI state
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState({
    expense_date: new Date().toISOString().split("T")[0],
    category: "",
    amount: "",
    payment_mode: "Cash",
    description: "",
    bill_number: "",
  });
  const fileInputRef = useRef(null);

  // Infinite query – scoped with branchId & financialYearId
  const {
    data,
    isLoading,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
  } = useInfiniteQuery({
    queryKey: ["expenses", allFilters, branchId, financialYearId],
    queryFn: ({ pageParam = 0 }) =>
      getExpenses({ pageParam, filters: allFilters, branchId, financialYearId }),
    getNextPageParam: (lastPage, allPages) => {
      const totalFetched = allPages.reduce((sum, page) => sum + page.data.length, 0);
      if (lastPage.count && totalFetched < lastPage.count) {
        return allPages.length;
      }
      return undefined;
    },
    initialPageParam: 0,
    enabled: !!branchId && !!financialYearId,
    staleTime: 5 * 60 * 1000,
  });

  const expenses = data?.pages.flatMap((page) => page.data) || [];

  // Mutations – pass context (branchId & financialYearId) where needed
  const createMutation = useMutation({
    mutationFn: (payload) => createExpense(payload, ctx),
    onSuccess: () => {
      toast.success("Expense added");
      queryClient.invalidateQueries({ queryKey: ["expenses"] });
      setShowForm(false);
    },
    onError: () => toast.error("Failed to add expense"),
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, payload }) => updateExpense(id, payload, ctx),
    onSuccess: () => {
      toast.success("Expense updated");
      queryClient.invalidateQueries({ queryKey: ["expenses"] });
      setEditing(null);
    },
    onError: () => toast.error("Failed to update expense"),
  });

  const deleteMutation = useMutation({
    mutationFn: (id) => deleteExpense(id, ctx),
    onSuccess: () => {
      toast.success("Record deleted");
      queryClient.invalidateQueries({ queryKey: ["expenses"] });
    },
    onError: () => toast.error("Delete failed"),
  });

  // CSV Import – use context for createExpense
  async function handleCSVImport(event) {
    const file = event.target.files[0];
    if (!file) return;
    Papa.parse(file, {
      header: true,
      skipEmptyLines: true,
      complete: async (results) => {
        let successCount = 0;
        for (const row of results.data) {
          try {
            const payload = {
              expense_date: row.expense_date || new Date().toISOString().split("T")[0],
              category: row.category,
              amount: Number(row.amount),
              payment_mode: row.payment_mode || "Cash",
              description: row.description || "",
              bill_number: row.bill_number || null,
            };
            await createExpense(payload, ctx);
            successCount++;
          } catch (err) {
            console.error(err);
          }
        }
        toast.success(`${successCount} expense records imported`);
        queryClient.invalidateQueries({ queryKey: ["expenses"] });
      },
      error: () => toast.error("CSV parsing error"),
    });
  }

  // CSV Export – now scoped
  async function handleCSVExport() {
    try {
      const allData = await getAllExpensesForExport(allFilters, branchId, financialYearId);
      const csv = Papa.unparse(allData);
      const blob = new Blob([csv], { type: "text/csv" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "expenses.csv";
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      toast.error("Export failed");
    }
  }

  // Form helpers
  function openCreate() {
    setForm({
      expense_date: new Date().toISOString().split("T")[0],
      category: "",
      amount: "",
      payment_mode: "Cash",
      description: "",
      bill_number: "",
    });
    setEditing(null);
    setShowForm(true);
  }

  function openEdit(item) {
    setForm({
      expense_date: item.expense_date,
      category: item.category,
      amount: item.amount,
      payment_mode: item.payment_mode,
      description: item.description || "",
      bill_number: item.bill_number || "",
    });
    setEditing(item);
    setShowForm(true);
  }

  function handleSubmit(e) {
    e.preventDefault();
    if (!form.category || !form.amount) {
      toast.error("Category and amount are required");
      return;
    }
    const payload = { ...form, amount: Number(form.amount) };
    if (editing) {
      updateMutation.mutate({ id: editing.id, payload });
    } else {
      createMutation.mutate(payload);
    }
  }

  return (
    <AdminLayout>
      <BackButton to="/accounting" label="Finance & Accounting" />
      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-6 gap-4">
        <div>
          <h1 className="text-3xl font-righteous text-primary-dark">Expenses</h1>
          <p className="text-sm text-secondary-dark font-montserrat mt-1">
            Track all expenses
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            onClick={openCreate}
            className="bg-accent hover:bg-accent-light text-white px-5 py-2.5 rounded-lg transition font-montserrat text-sm flex items-center gap-2"
          >
            <IndianRupee size={18} /> Add Expense
          </button>
          <button
            onClick={handleCSVExport}
            className="border border-secondary-light px-4 py-2.5 rounded-lg text-secondary-dark hover:bg-secondary-bg font-montserrat text-sm flex items-center gap-2"
          >
            <Download size={18} /> Export
          </button>
          <button
            onClick={() => fileInputRef.current?.click()}
            className="border border-secondary-light px-4 py-2.5 rounded-lg text-secondary-dark hover:bg-secondary-bg font-montserrat text-sm flex items-center gap-2"
          >
            <Upload size={18} /> Import
          </button>
          <input
            type="file"
            ref={fileInputRef}
            className="hidden"
            accept=".csv"
            onChange={handleCSVImport}
          />
        </div>
      </div>

      {/* Search & Filter Toggle */}
      <div className="flex flex-col sm:flex-row gap-3 mb-4">
        <div className="relative flex-1">
          <Search
            size={18}
            className="absolute left-3 top-1/2 -translate-y-1/2 text-secondary"
          />
          <input
            type="text"
            placeholder="Search by category, description, or bill no..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full border border-secondary-light rounded-lg pl-10 pr-4 py-2.5 text-sm focus:ring-1 focus:ring-primary focus:border-primary outline-none placeholder-secondary-light"
          />
        </div>
        <button
          onClick={() => setShowFilters(!showFilters)}
          className="border border-secondary-light px-4 py-2.5 rounded-lg text-secondary-dark hover:bg-secondary-bg font-montserrat text-sm flex items-center gap-2"
        >
          <Filter size={18} /> Filters
          {showFilters && <X size={16} />}
        </button>
      </div>

      {/* Advanced Filters Panel */}
      {showFilters && (
        <div className="bg-white rounded-xl p-4 shadow-sm mb-4 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 border border-secondary-light">
          <div>
            <label className="text-xs font-montserrat text-secondary-dark">
              <Calendar size={14} className="inline mr-1" />
              From Date
            </label>
            <input
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              className="w-full border border-secondary-light rounded p-2 text-sm mt-1 focus:ring-1 focus:ring-primary"
            />
          </div>
          <div>
            <label className="text-xs font-montserrat text-secondary-dark">
              <Calendar size={14} className="inline mr-1" />
              To Date
            </label>
            <input
              type="date"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              className="w-full border border-secondary-light rounded p-2 text-sm mt-1 focus:ring-1 focus:ring-primary"
            />
          </div>
          <div className="flex items-end">
            <button
              onClick={() => {
                setSearch("");
                setStartDate("");
                setEndDate("");
              }}
              className="text-primary text-sm hover:underline"
            >
              Clear Filters
            </button>
          </div>
        </div>
      )}

      {/* Expenses Table (unchanged) */}
      <div className="bg-white rounded-xl shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[800px]">
            <thead className="bg-slate-100 border-b border-secondary-light">
              <tr>
                <th className="p-3 text-left text-sm font-montserrat text-secondary-dark">Date</th>
                <th className="text-left text-sm font-montserrat text-secondary-dark">Category</th>
                <th className="text-left text-sm font-montserrat text-secondary-dark">Amount</th>
                <th className="text-left text-sm font-montserrat text-secondary-dark">Mode</th>
                <th className="text-left text-sm font-montserrat text-secondary-dark">Bill No</th>
                <th className="text-left text-sm font-montserrat text-secondary-dark">Description</th>
                <th className="text-left text-sm font-montserrat text-secondary-dark">Actions</th>
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                <tr>
                  <td colSpan={7} className="p-6 text-center text-secondary">Loading expenses…</td>
                </tr>
              ) : expenses.length === 0 ? (
                <tr>
                  <td colSpan={7} className="p-6 text-center text-secondary">
                    <div className="flex flex-col items-center gap-2">
                      <IndianRupee size={32} className="text-secondary-light" />
                      <span>No expense records found</span>
                      <span className="text-xs text-secondary-light">
                        {search || startDate || endDate
                          ? "Try adjusting your filters"
                          : "Add a new expense to get started"}
                      </span>
                    </div>
                  </td>
                </tr>
              ) : (
                expenses.map((item) => (
                  <tr
                    key={item.id}
                    className="border-b border-secondary-light hover:bg-primary-bg transition"
                  >
                    <td className="p-3 text-sm">{item.expense_date}</td>
                    <td className="text-sm">{item.category}</td>
                    <td className="text-sm font-semibold">
                      ₹{Number(item.amount).toLocaleString()}
                    </td>
                    <td className="text-sm">{item.payment_mode}</td>
                    <td className="text-sm">{item.bill_number || "-"}</td>
                    <td className="text-sm max-w-[200px] truncate">
                      {item.description || "-"}
                    </td>
                    <td className="text-sm">
                      <div className="flex gap-2">
                        <button
                          onClick={() => openEdit(item)}
                          className="text-blue-600 hover:underline"
                          title="Edit"
                        >
                          <Edit3 size={15} />
                        </button>
                        <button
                          onClick={() => {
                            if (!window.confirm("Delete this expense record?")) return;
                            deleteMutation.mutate(item.id);
                          }}
                          className="text-red-600 hover:underline"
                          title="Delete"
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
      </div>

      {/* Load More (unchanged) */}
      {hasNextPage && (
        <div className="flex justify-center mt-6">
          <button
            onClick={() => fetchNextPage()}
            disabled={isFetchingNextPage}
            className="bg-primary hover:bg-primary-light text-white px-6 py-2.5 rounded-lg font-montserrat text-sm transition disabled:opacity-60"
          >
            {isFetchingNextPage ? "Loading more…" : "Load More"}
          </button>
        </div>
      )}

      {/* Expense Form Modal (branded, unchanged) */}
      {showForm && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl w-full max-w-md shadow-xl">
            <div className="sticky top-0 bg-white border-b border-secondary-light px-6 py-4 flex items-center justify-between rounded-t-xl">
              <div className="flex items-center gap-3">
                <img
                  src={darkLogo}
                  alt="ShreeVidhya Academy"
                  className="h-10 w-auto"
                />
                <h2 className="text-xl font-righteous text-primary-dark">
                  {editing ? "Edit Expense" : "Add Expense"}
                </h2>
              </div>
              <button
                onClick={() => setShowForm(false)}
                className="p-2 hover:bg-secondary-bg rounded-lg"
              >
                <X size={20} className="text-secondary-dark" />
              </button>
            </div>
            <form onSubmit={handleSubmit} className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-montserrat text-secondary-dark mb-1">
                  <Calendar size={14} className="inline mr-1" />
                  Date *
                </label>
                <input
                  type="date"
                  value={form.expense_date}
                  onChange={(e) =>
                    setForm({ ...form, expense_date: e.target.value })
                  }
                  className="w-full border border-secondary-light rounded p-2.5 focus:ring-1 focus:ring-primary focus:border-primary outline-none"
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-montserrat text-secondary-dark mb-1">
                  <FileText size={14} className="inline mr-1" />
                  Category *
                </label>
                <input
                  type="text"
                  placeholder="e.g., Rent, Salary"
                  value={form.category}
                  onChange={(e) =>
                    setForm({ ...form, category: e.target.value })
                  }
                  className="w-full border border-secondary-light rounded p-2.5 focus:ring-1 focus:ring-primary focus:border-primary outline-none placeholder-secondary-light"
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-montserrat text-secondary-dark mb-1">
                  <IndianRupee size={14} className="inline mr-1" />
                  Amount *
                </label>
                <input
                  type="number"
                  placeholder="Amount"
                  value={form.amount}
                  onChange={(e) =>
                    setForm({ ...form, amount: e.target.value })
                  }
                  className="w-full border border-secondary-light rounded p-2.5 focus:ring-1 focus:ring-primary focus:border-primary outline-none placeholder-secondary-light"
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-montserrat text-secondary-dark mb-1">
                  <CreditCard size={14} className="inline mr-1" />
                  Payment Mode
                </label>
                <select
                  value={form.payment_mode}
                  onChange={(e) =>
                    setForm({ ...form, payment_mode: e.target.value })
                  }
                  className="w-full border border-secondary-light rounded p-2.5 focus:ring-1 focus:ring-primary focus:border-primary outline-none"
                >
                  <option>Cash</option>
                  <option>UPI</option>
                  <option>Bank Transfer</option>
                  <option>Cheque</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-montserrat text-secondary-dark mb-1">
                  <Hash size={14} className="inline mr-1" />
                  Bill Number
                </label>
                <input
                  type="text"
                  placeholder="Optional bill number"
                  value={form.bill_number}
                  onChange={(e) =>
                    setForm({ ...form, bill_number: e.target.value })
                  }
                  className="w-full border border-secondary-light rounded p-2.5 focus:ring-1 focus:ring-primary focus:border-primary outline-none placeholder-secondary-light"
                />
              </div>
              <div>
                <label className="block text-sm font-montserrat text-secondary-dark mb-1">
                  Description
                </label>
                <textarea
                  placeholder="Optional description"
                  value={form.description}
                  onChange={(e) =>
                    setForm({ ...form, description: e.target.value })
                  }
                  rows={2}
                  className="w-full border border-secondary-light rounded p-2.5 focus:ring-1 focus:ring-primary focus:border-primary outline-none placeholder-secondary-light resize-none"
                />
              </div>
              <div className="flex flex-col sm:flex-row-reverse gap-3 pt-2">
                <button
                  type="submit"
                  className="w-full sm:w-auto bg-primary hover:bg-primary-light text-white px-6 py-2.5 rounded-lg font-montserrat transition"
                >
                  {editing ? "Update" : "Add"}
                </button>
                <button
                  type="button"
                  onClick={() => setShowForm(false)}
                  className="w-full sm:w-auto border border-secondary-light text-secondary-dark hover:bg-secondary-bg px-6 py-2.5 rounded-lg font-montserrat transition"
                >
                  Cancel
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </AdminLayout>
  );
}