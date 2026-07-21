// src/pages/Income.jsx
import React, { useState, useRef, useEffect } from "react";
import {
  useInfiniteQuery,
  useMutation,
  useQueryClient,
  useQuery,
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
  TrendingUp,
  Calendar,
  IndianRupee,
  CreditCard,
  FileText,
  Receipt,
  Mail,
} from "lucide-react";
import Papa from "papaparse";

import BackButton from "../components/BackButton";

import {
  getIncomes,
  createIncome,
  updateIncome,
  deleteIncome,
  getAllIncomesForExport,
} from "../services/financeService";
import { supabase } from "../api/supabase";
import { useOrgDarkLogo } from "../hooks/useOrgDarkLogo";
import { useOrg } from "../context/OrganizationContext";
import { sendEmail } from "../services/emailService";

export default function Income() {
  const queryClient = useQueryClient();
  const darkLogo = useOrgDarkLogo();

  const { branch, selectedFinancialYear, org } = useOrg();
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
    income_date: new Date().toISOString().split("T")[0],
    category: "",
    amount: "",
    payment_mode: "Cash",
    description: "",
    tax_rate_id: "",
    tax_inclusive: true,
    base_amount: "",
    tax_amount: "",
  });
  const fileInputRef = useRef(null);

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
    if (incomes.length === 0) {
      alert("No income records to send.");
      return;
    }

    try {
      const adminEmails = await getAdminEmails();
      if (adminEmails.length === 0) {
        alert("No admin emails found.");
        return;
      }

      // Build HTML table rows
      let tableRows = incomes.map((item) => `
        <tr>
          <td style="padding:4px 8px;border:1px solid #ddd;">${item.income_date}</td>
          <td style="padding:4px 8px;border:1px solid #ddd;">${item.category}</td>
          <td style="padding:4px 8px;border:1px solid #ddd;text-align:right;">₹ ${Number(item.base_amount || item.amount).toLocaleString('en-IN')}</td>
          <td style="padding:4px 8px;border:1px solid #ddd;text-align:right;">${item.tax_amount ? '₹ ' + Number(item.tax_amount).toLocaleString('en-IN') : '-'}</td>
          <td style="padding:4px 8px;border:1px solid #ddd;text-align:right;font-weight:bold;">₹ ${Number(item.amount).toLocaleString('en-IN')}</td>
          <td style="padding:4px 8px;border:1px solid #ddd;">${item.payment_mode}</td>
        </tr>
      `).join('');

      const totalBase = incomes.reduce((s, i) => s + Number(i.base_amount || i.amount), 0);
      const totalTax = incomes.reduce((s, i) => s + (i.tax_amount || 0), 0);
      const totalAmount = incomes.reduce((s, i) => s + Number(i.amount), 0);

      const htmlBody = `
        <div style="font-family:Arial,sans-serif;max-width:800px;margin:0 auto;">
          <h2 style="color:#0D47A1;">Income Report</h2>
          <p><strong>Branch:</strong> ${branch?.branch_name || 'N/A'}</p>
          <p><strong>Period:</strong> ${startDate || 'Start'} – ${endDate || 'End'}</p>
          <p><strong>Total Records:</strong> ${incomes.length}</p>
          <hr />
          <table style="width:100%;border-collapse:collapse;font-size:12px;">
            <thead>
              <tr style="background:#e3f2fd;">
                <th style="padding:4px 8px;border:1px solid #ddd;text-align:left;">Date</th>
                <th style="padding:4px 8px;border:1px solid #ddd;text-align:left;">Category</th>
                <th style="padding:4px 8px;border:1px solid #ddd;text-align:right;">Base</th>
                <th style="padding:4px 8px;border:1px solid #ddd;text-align:right;">Tax</th>
                <th style="padding:4px 8px;border:1px solid #ddd;text-align:right;">Total</th>
                <th style="padding:4px 8px;border:1px solid #ddd;text-align:left;">Mode</th>
              </tr>
            </thead>
            <tbody>
              ${tableRows}
            </tbody>
            <tfoot style="font-weight:bold;background:#f5f5f5;">
              <tr>
                <td colspan="2" style="padding:4px 8px;border:1px solid #ddd;text-align:right;">Totals</td>
                <td style="padding:4px 8px;border:1px solid #ddd;text-align:right;">₹ ${totalBase.toLocaleString('en-IN')}</td>
                <td style="padding:4px 8px;border:1px solid #ddd;text-align:right;">₹ ${totalTax.toLocaleString('en-IN')}</td>
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
        subject: `Income Report - ${new Date().toLocaleDateString()}`,
        html: htmlBody,
        from: org?.email || undefined,
      });

      alert("Report sent to admins.");
    } catch (err) {
      console.error("Failed to send report:", err);
      alert("Failed to send report. Check console for details.");
    }
  };

  // ─── Fetch tax rates ──────────────────────────────────────────────
  const { data: taxRates = [] } = useQuery({
    queryKey: ["tax-rates", branchId, financialYearId],
    queryFn: async () => {
      let query = supabase
        .from("tax_rates")
        .select("id, name, rate")
        .eq("is_active", true);

      if (branchId) query = query.eq("branch_id", branchId);
      if (financialYearId) query = query.eq("financial_year_id", financialYearId);

      const { data } = await query;
      return data || [];
    },
    enabled: !!branchId && !!financialYearId,
    staleTime: 10 * 60 * 1000,
  });

  // Auto-calculate tax
  useEffect(() => {
    if (!form.amount || !form.tax_rate_id) {
      setForm((prev) => ({
        ...prev,
        base_amount: form.amount || "",
        tax_amount: "",
      }));
      return;
    }

    const taxRate = taxRates.find((t) => t.id === Number(form.tax_rate_id));
    if (!taxRate) return;

    const amount = parseFloat(form.amount) || 0;
    const rate = taxRate.rate / 100;

    let baseAmount, taxAmount;
    if (form.tax_inclusive) {
      baseAmount = amount / (1 + rate);
      taxAmount = amount - baseAmount;
    } else {
      baseAmount = amount;
      taxAmount = amount * rate;
    }

    setForm((prev) => ({
      ...prev,
      base_amount: Math.round(baseAmount * 100) / 100,
      tax_amount: Math.round(taxAmount * 100) / 100,
    }));
  }, [form.amount, form.tax_rate_id, form.tax_inclusive, taxRates]);

  // ─── Infinite query ─────────────────────────────────────────────────
  const {
    data,
    isLoading,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
  } = useInfiniteQuery({
    queryKey: ["incomes", allFilters, branchId, financialYearId],
    queryFn: ({ pageParam = 0 }) =>
      getIncomes({ pageParam, filters: allFilters, branchId, financialYearId }),
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

  const incomes = data?.pages.flatMap((page) => page.data) || [];

  // ─── Mutations ──────────────────────────────────────────────────────
  const createMutation = useMutation({
    mutationFn: (payload) => createIncome(payload, ctx),
    onSuccess: () => {
      toast.success("Income added");
      queryClient.invalidateQueries({ queryKey: ["incomes"] });
      setShowForm(false);
    },
    onError: () => toast.error("Failed to add income"),
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, payload }) => updateIncome(id, payload, ctx),
    onSuccess: () => {
      toast.success("Income updated");
      queryClient.invalidateQueries({ queryKey: ["incomes"] });
      setEditing(null);
    },
    onError: () => toast.error("Failed to update income"),
  });

  const deleteMutation = useMutation({
    mutationFn: (id) => deleteIncome(id, ctx),
    onSuccess: () => {
      toast.success("Record deleted");
      queryClient.invalidateQueries({ queryKey: ["incomes"] });
    },
    onError: () => toast.error("Delete failed"),
  });

  // ─── CSV handlers ──────────────────────────────────────────────────
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
              income_date: row.income_date || new Date().toISOString().split("T")[0],
              category: row.category,
              amount: Number(row.amount),
              payment_mode: row.payment_mode || "Cash",
              description: row.description || "",
              tax_rate_id: row.tax_rate_id ? Number(row.tax_rate_id) : null,
              tax_inclusive: row.tax_inclusive ? row.tax_inclusive === "true" : true,
            };
            await createIncome(payload, ctx);
            successCount++;
          } catch (err) {
            console.error(err);
          }
        }
        toast.success(`${successCount} income records imported`);
        queryClient.invalidateQueries({ queryKey: ["incomes"] });
      },
      error: () => toast.error("CSV parsing error"),
    });
  }

  async function handleCSVExport() {
    try {
      const allData = await getAllIncomesForExport(allFilters, branchId, financialYearId);
      const csv = Papa.unparse(allData);
      const blob = new Blob([csv], { type: "text/csv" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "income.csv";
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      toast.error("Export failed");
    }
  }

  // ─── Form helpers ──────────────────────────────────────────────────
  function openCreate() {
    setForm({
      income_date: new Date().toISOString().split("T")[0],
      category: "",
      amount: "",
      payment_mode: "Cash",
      description: "",
      tax_rate_id: "",
      tax_inclusive: true,
      base_amount: "",
      tax_amount: "",
    });
    setEditing(null);
    setShowForm(true);
  }

  function openEdit(item) {
    setForm({
      income_date: item.income_date,
      category: item.category,
      amount: item.amount,
      payment_mode: item.payment_mode,
      description: item.description || "",
      tax_rate_id: item.tax_rate_id || "",
      tax_inclusive: item.tax_inclusive !== undefined ? item.tax_inclusive : true,
      base_amount: item.base_amount || "",
      tax_amount: item.tax_amount || "",
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
    const payload = {
      income_date: form.income_date,
      category: form.category,
      amount: Number(form.amount),
      payment_mode: form.payment_mode,
      description: form.description,
      tax_rate_id: form.tax_rate_id ? Number(form.tax_rate_id) : null,
      tax_inclusive: form.tax_inclusive,
      base_amount: form.base_amount ? Number(form.base_amount) : null,
      tax_amount: form.tax_amount ? Number(form.tax_amount) : null,
    };
    if (editing) {
      updateMutation.mutate({ id: editing.id, payload });
    } else {
      createMutation.mutate(payload);
    }
  }

  return (
    <>
      <BackButton to="/accounting" label="Finance & Accounting" />

      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-6 gap-4">
        <div>
          <h1 className="text-3xl font-righteous text-primary-dark">Income</h1>
          <p className="text-sm text-secondary-dark font-montserrat mt-1">
            Track all income sources with tax breakdown
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {/* 👇 Send Report button */}
          <button
            onClick={sendReportEmail}
            className="bg-green-600 hover:bg-green-700 text-white px-5 py-2.5 rounded-lg transition font-montserrat text-sm flex items-center gap-2"
          >
            <Mail size={18} /> Send Report
          </button>
          <button
            onClick={openCreate}
            className="bg-accent hover:bg-accent-light text-white px-5 py-2.5 rounded-lg transition font-montserrat text-sm flex items-center gap-2"
          >
            <IndianRupee size={18} /> Add Income
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
            placeholder="Search by category or description..."
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

      {/* Incomes Table */}
      <div className="bg-white rounded-xl shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[900px]">
            <thead className="bg-slate-100 border-b border-secondary-light">
              <tr>
                <th className="p-3 text-left text-sm font-montserrat text-secondary-dark">Date</th>
                <th className="text-left text-sm font-montserrat text-secondary-dark">Category</th>
                <th className="text-left text-sm font-montserrat text-secondary-dark">Base Amount</th>
                <th className="text-left text-sm font-montserrat text-secondary-dark">Tax</th>
                <th className="text-left text-sm font-montserrat text-secondary-dark">Total</th>
                <th className="text-left text-sm font-montserrat text-secondary-dark">Mode</th>
                <th className="text-left text-sm font-montserrat text-secondary-dark">Actions</th>
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                <tr>
                  <td colSpan={7} className="p-6 text-center text-secondary">Loading income records…</td>
                </tr>
              ) : incomes.length === 0 ? (
                <tr>
                  <td colSpan={7} className="p-6 text-center text-secondary">
                    <div className="flex flex-col items-center gap-2">
                      <IndianRupee size={32} className="text-secondary-light" />
                      <span>No income records found</span>
                      <span className="text-xs text-secondary-light">
                        {search || startDate || endDate
                          ? "Try adjusting your filters"
                          : "Add a new income record to get started"}
                      </span>
                    </div>
                  </td>
                </tr>
              ) : (
                incomes.map((item) => (
                  <tr
                    key={item.id}
                    className="border-b border-secondary-light hover:bg-primary-bg transition"
                  >
                    <td className="p-3 text-sm">{item.income_date}</td>
                    <td className="text-sm">{item.category}</td>
                    <td className="text-sm">
                      ₹{Number(item.base_amount || item.amount).toLocaleString()}
                    </td>
                    <td className="text-sm text-primary">
                      {item.tax_amount ? (
                        <span className="font-medium">₹{Number(item.tax_amount).toLocaleString()}</span>
                      ) : (
                        <span className="text-gray-400">-</span>
                      )}
                    </td>
                    <td className="text-sm font-semibold">
                      ₹{Number(item.amount).toLocaleString()}
                    </td>
                    <td className="text-sm">{item.payment_mode}</td>
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
                            if (!window.confirm("Delete this income record?")) return;
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

      {/* Load More */}
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

      {/* Income Form Modal */}
      {showForm && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl w-full max-w-md shadow-xl max-h-[90vh] overflow-y-auto">
            <div className="sticky top-0 bg-white border-b border-secondary-light px-6 py-4 flex items-center justify-between rounded-t-xl">
              <div className="flex items-center gap-3">
                <img
                  src={darkLogo}
                  alt="ShreeVidhya Academy"
                  className="h-10 w-auto"
                />
                <h2 className="text-xl font-righteous text-primary-dark">
                  {editing ? "Edit Income" : "Add Income"}
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
                  value={form.income_date}
                  onChange={(e) =>
                    setForm({ ...form, income_date: e.target.value })
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
                  placeholder="e.g., Fees, Donation"
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
                  Total Amount *
                </label>
                <input
                  type="number"
                  placeholder="Total amount (including tax if applicable)"
                  value={form.amount}
                  onChange={(e) =>
                    setForm({ ...form, amount: e.target.value })
                  }
                  className="w-full border border-secondary-light rounded p-2.5 focus:ring-1 focus:ring-primary focus:border-primary outline-none placeholder-secondary-light"
                  required
                  step="0.01"
                />
              </div>
              <div>
                <label className="block text-sm font-montserrat text-secondary-dark mb-1">
                  <Receipt size={14} className="inline mr-1" />
                  Tax Rate
                </label>
                <select
                  value={form.tax_rate_id}
                  onChange={(e) =>
                    setForm({ ...form, tax_rate_id: e.target.value })
                  }
                  className="w-full border border-secondary-light rounded p-2.5 focus:ring-1 focus:ring-primary focus:border-primary outline-none"
                >
                  <option value="">No Tax</option>
                  {taxRates.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.name} ({t.rate}%)
                    </option>
                  ))}
                </select>
              </div>
              {form.tax_rate_id && (
                <div className="flex items-center gap-3">
                  <input
                    type="checkbox"
                    id="tax_inclusive"
                    checked={form.tax_inclusive}
                    onChange={(e) =>
                      setForm({ ...form, tax_inclusive: e.target.checked })
                    }
                    className="w-4 h-4 text-primary border-gray-300 rounded focus:ring-primary"
                  />
                  <label htmlFor="tax_inclusive" className="text-sm text-gray-700">
                    Amount includes tax (tax-inclusive)
                  </label>
                </div>
              )}
              {form.tax_rate_id && form.amount && (
                <div className="bg-gray-50 rounded-lg p-3 space-y-1 text-sm">
                  <p className="flex justify-between">
                    <span className="text-gray-600">Base Amount:</span>
                    <span className="font-medium">
                      ₹{form.base_amount ? Number(form.base_amount).toFixed(2) : "0.00"}
                    </span>
                  </p>
                  <p className="flex justify-between">
                    <span className="text-gray-600">Tax Amount:</span>
                    <span className="font-medium text-primary">
                      ₹{form.tax_amount ? Number(form.tax_amount).toFixed(2) : "0.00"}
                    </span>
                  </p>
                  <p className="flex justify-between border-t border-gray-200 pt-1">
                    <span className="font-medium">Total:</span>
                    <span className="font-bold">
                      ₹{form.amount ? Number(form.amount).toFixed(2) : "0.00"}
                    </span>
                  </p>
                </div>
              )}
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
                  disabled={createMutation.isPending || updateMutation.isPending}
                  className="w-full sm:w-auto bg-primary hover:bg-primary-light text-white px-6 py-2.5 rounded-lg font-montserrat transition disabled:opacity-60"
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
    </>
  );
}