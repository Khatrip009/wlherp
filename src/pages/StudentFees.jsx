// src/pages/StudentFees.jsx
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
  Coins,
  Eye,
  Wallet,
  User,
  BookOpen,
  DollarSign,
  Percent,
  Tag,
  X,
  Download,
  Upload,
  FileText,
  Loader,
} from "lucide-react";
import Papa from "papaparse";
import AdminLayout from "../layouts/AdminLayout";
import CollectPaymentModal from "../components/CollectPaymentModal";
import ConfirmDialog from "../components/ConfirmDialog";
import BackButton from "../components/BackButton";
import {
  getStudentFees,
  createStudentFee,
  updateStudentFee,
  deleteStudentFee,
  getPayments,
  getAllStudentFeesForExport,
  generateInvoiceFromStudentFee,
  generateInvoicesForInstallments,
} from "../services/feeService";
import { supabase } from "../api/supabase";
import { useOrg } from "../context/OrganizationContext";

export default function StudentFees() {
  const queryClient = useQueryClient();

  // ── Get branch, financial year, and org details from context ──
  const { org, branch, selectedFinancialYear } = useOrg();
  const branchId = branch?.id;
  const financialYearId = selectedFinancialYear?.id;
  const ctx = { branchId, financialYearId };
  const darkLogo = org?.logo_dark_url || "/ShreeVidhyaDark.png";
  const orgName = org?.company_name || "Academy";

  const [search, setSearch] = useState("");
  const filters = { search };

  // Paginated student fees – scoped
  const {
    data,
    isLoading,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
  } = useInfiniteQuery({
    queryKey: ["studentFees", filters, branchId, financialYearId],
    queryFn: ({ pageParam = 0 }) =>
      getStudentFees({ pageParam, filters, branchId, financialYearId }),
    getNextPageParam: (lastPage, allPages) => {
      const totalFetched = allPages.reduce((sum, page) => sum + page.data.length, 0);
      if (lastPage.count && totalFetched < lastPage.count) {
        return allPages.length;
      }
      return undefined;
    },
    initialPageParam: 0,
    enabled: !!branchId && !!financialYearId,
    staleTime: 2 * 60 * 1000,
  });

  const studentFees = data?.pages.flatMap((page) => page.data) || [];

  // Students dropdown – scoped
  const { data: students = [] } = useQuery({
    queryKey: ["students-dropdown", branchId, financialYearId],
    queryFn: async () => {
      let query = supabase
        .from("students")
        .select("id, first_name, last_name, admission_no")
        .order("first_name");
      if (branchId) query = query.eq("branch_id", branchId);
      if (financialYearId) query = query.eq("financial_year_id", financialYearId);
      const { data } = await query;
      return data || [];
    },
    enabled: !!branchId && !!financialYearId,
    staleTime: 10 * 60 * 1000,
  });

  // Fee structures dropdown – scoped
  const { data: feeStructures = [] } = useQuery({
    queryKey: ["feeStructures-dropdown", branchId, financialYearId],
    queryFn: async () => {
      let query = supabase
        .from("fee_structures")
        .select(
          `id,
          fee_amount,
          installment_allowed,
          tax_rate_id,
          tax_inclusive,
          courses(course_name),
          tax_rates ( id, name, rate )`
        )
        .order("id");
      if (branchId) query = query.eq("branch_id", branchId);
      if (financialYearId) query = query.eq("financial_year_id", financialYearId);
      const { data } = await query;
      return data || [];
    },
    enabled: !!branchId && !!financialYearId,
    staleTime: 10 * 60 * 1000,
  });

  const createMutation = useMutation({
    mutationFn: (payload) => createStudentFee(payload, ctx),
    onSuccess: () => {
      toast.success("Fee assigned");
      queryClient.invalidateQueries({ queryKey: ["studentFees"] });
      setShowAssignForm(false);
    },
    onError: () => toast.error("Failed to assign fee"),
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, payload }) => updateStudentFee(id, payload, ctx),
    onSuccess: () => {
      toast.success("Fee updated");
      queryClient.invalidateQueries({ queryKey: ["studentFees"] });
      setEditingFee(null);
      setShowAssignForm(false);
    },
    onError: () => toast.error("Failed to update fee"),
  });

  const deleteMutation = useMutation({
    mutationFn: (id) => deleteStudentFee(id, ctx),
    onSuccess: () => {
      toast.success("Fee record deleted");
      queryClient.invalidateQueries({ queryKey: ["studentFees"] });
    },
    onError: () => toast.error("Delete failed"),
  });

  const generateInvoiceMutation = useMutation({
    mutationFn: async ({ feeId, installmentId }) => {
      if (installmentId) {
        return await generateInvoiceFromStudentFee(feeId, installmentId, ctx);
      } else {
        const { data: insts } = await supabase
          .from("fee_installments")
          .select("id")
          .eq("student_fee_id", feeId);
        if (insts && insts.length > 0) {
          return await generateInvoicesForInstallments(feeId, ctx);
        } else {
          return await generateInvoiceFromStudentFee(feeId, null, ctx);
        }
      }
    },
    onSuccess: () => {
      toast.success("Invoice(s) generated successfully");
      queryClient.invalidateQueries({ queryKey: ["studentFees"] });
    },
    onError: (err) => toast.error(err.message),
  });

  const [showAssignForm, setShowAssignForm] = useState(false);
  const [editingFee, setEditingFee] = useState(null);
  const [collectingFee, setCollectingFee] = useState(null);
  const [viewPayments, setViewPayments] = useState(null);
  const [selectedFeeForPayments, setSelectedFeeForPayments] = useState(null);
  const [confirmDelete, setConfirmDelete] = useState(null);
  const [confirmInvoice, setConfirmInvoice] = useState(null);
  const fileInputRef = useRef(null);

  // Payment history – scoped
  const { data: payments = [], isLoading: paymentsLoading } = useQuery({
    queryKey: ["payments", selectedFeeForPayments?.id, branchId, financialYearId],
    queryFn: () =>
      getPayments(selectedFeeForPayments.id, branchId, financialYearId),
    enabled: !!selectedFeeForPayments && !!branchId && !!financialYearId,
    staleTime: 0,
  });

  const [form, setForm] = useState({
    student_id: "",
    fee_structure_id: "",
    total_fee: "",
    discount: 0,
    final_fee: "",
    status: "Pending",
    tax_rate_id: null,
    tax_inclusive: true,
    base_amount: 0,
    tax_amount: 0,
    total_payable: 0,
  });

  const [enableInstallments, setEnableInstallments] = useState(false);
  const [installmentCount, setInstallmentCount] = useState(1);
  const [installments, setInstallments] = useState([]);

  // Recalculate tax function (unchanged)
  const recalculateTax = (finalFee, structureId, taxInclusive, taxRateId) => {
    if (!structureId) {
      setForm((prev) => ({
        ...prev,
        base_amount: finalFee,
        tax_amount: 0,
        total_payable: finalFee,
      }));
      return;
    }

    const structure = feeStructures.find((s) => s.id === parseInt(structureId));
    if (!structure) {
      setForm((prev) => ({
        ...prev,
        base_amount: finalFee,
        tax_amount: 0,
        total_payable: finalFee,
      }));
      return;
    }

    const taxRate = structure.tax_rates;
    const rate = taxRate ? taxRate.rate / 100 : 0;
    if (rate === 0 || !taxRateId) {
      setForm((prev) => ({
        ...prev,
        base_amount: finalFee,
        tax_amount: 0,
        total_payable: finalFee,
      }));
      return;
    }

    let baseAmount, taxAmount, totalPayable;
    if (taxInclusive) {
      baseAmount = finalFee / (1 + rate);
      taxAmount = finalFee - baseAmount;
      totalPayable = finalFee;
    } else {
      baseAmount = finalFee;
      taxAmount = finalFee * rate;
      totalPayable = baseAmount + taxAmount;
    }
    baseAmount = Math.round(baseAmount * 100) / 100;
    taxAmount = Math.round(taxAmount * 100) / 100;
    totalPayable = Math.round(totalPayable * 100) / 100;

    setForm((prev) => ({
      ...prev,
      base_amount: baseAmount,
      tax_amount: taxAmount,
      total_payable: totalPayable,
    }));
  };

  useEffect(() => {
    if (form.fee_structure_id && form.final_fee && feeStructures.length > 0) {
      recalculateTax(
        Number(form.final_fee),
        form.fee_structure_id,
        form.tax_inclusive,
        form.tax_rate_id
      );
    }
  }, [form.fee_structure_id, form.final_fee, form.tax_inclusive, form.tax_rate_id, feeStructures]);

  // CSV handlers (scoped)
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
              student_id: row.student_id,
              fee_structure_id: row.fee_structure_id,
              total_fee: Number(row.total_fee),
              discount: Number(row.discount) || 0,
              final_fee: Number(row.final_fee),
              status: row.status || "Pending",
            };
            await createStudentFee(payload, ctx);
            successCount++;
          } catch (err) {
            console.error(err);
          }
        }
        toast.success(`${successCount} fee records imported`);
        queryClient.invalidateQueries({ queryKey: ["studentFees"] });
      },
      error: () => toast.error("CSV parsing error"),
    });
  }

  async function handleCSVExport() {
    try {
      const allData = await getAllStudentFeesForExport(
        { search },
        branchId,
        financialYearId
      );
      const csv = Papa.unparse(
        allData.map((f) => ({
          student: `${f.students?.first_name} ${f.students?.last_name}`,
          course: f.fee_structures?.courses?.course_name,
          total_fee: f.total_fee,
          discount: f.discount,
          final_fee: f.final_fee,
          base_amount: f.base_amount || 0,
          tax_amount: f.tax_amount || 0,
          paid: f.total_paid,
          pending: f.pending,
          status: f.status,
        }))
      );
      const blob = new Blob([csv], { type: "text/csv" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "student_fees.csv";
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      toast.error("Export failed");
    }
  }

  // Form helpers (unchanged)
  function openAssign() {
    setForm({
      student_id: "",
      fee_structure_id: "",
      total_fee: "",
      discount: 0,
      final_fee: "",
      status: "Pending",
      tax_rate_id: null,
      tax_inclusive: true,
      base_amount: 0,
      tax_amount: 0,
      total_payable: 0,
    });
    setEnableInstallments(false);
    setInstallmentCount(1);
    setInstallments([]);
    setEditingFee(null);
    setShowAssignForm(true);
  }

  function openEdit(fee) {
    setForm({
      student_id: fee.student_id,
      fee_structure_id: fee.fee_structure_id,
      total_fee: fee.total_fee,
      discount: fee.discount,
      final_fee: fee.final_fee,
      status: fee.status,
      tax_rate_id: fee.fee_structures?.tax_rate_id || null,
      tax_inclusive: fee.fee_structures?.tax_inclusive !== undefined ? fee.fee_structures.tax_inclusive : true,
      base_amount: fee.base_amount || 0,
      tax_amount: fee.tax_amount || 0,
      total_payable: Number(fee.final_fee) + Number(fee.tax_amount || 0),
    });

    if (fee.installments && fee.installments.length > 0) {
      setEnableInstallments(true);
      setInstallmentCount(fee.installments.length);
      setInstallments(
        fee.installments.map((inst) => ({
          amount: inst.amount,
          due_date: inst.due_date || "",
        }))
      );
    } else {
      setEnableInstallments(false);
      setInstallmentCount(1);
      setInstallments([]);
    }
    setEditingFee(fee);
    setShowAssignForm(true);
  }

  function handleFeeStructureChange(structureId) {
    const structure = feeStructures.find((s) => s.id === parseInt(structureId));
    if (!structure) return;

    const total = Number(structure.fee_amount);
    const discount = Number(form.discount) || 0;
    const final = total - discount;

    const taxRateId = structure.tax_rate_id || null;
    const taxInclusive = structure.tax_inclusive !== undefined ? structure.tax_inclusive : true;

    setForm((prev) => ({
      ...prev,
      fee_structure_id: structureId,
      total_fee: total,
      final_fee: final,
      tax_rate_id: taxRateId,
      tax_inclusive: taxInclusive,
    }));

    if (!structure.installment_allowed) {
      setEnableInstallments(false);
      setInstallments([]);
      setInstallmentCount(1);
    }
  }

  function handleDiscountChange(value) {
    const discount = Number(value) || 0;
    const total = Number(form.total_fee) || 0;
    const final = total - discount;
    setForm((prev) => ({ ...prev, discount, final_fee: final }));
  }

  function handleInstallmentCountChange(count) {
    const num = parseInt(count) || 1;
    setInstallmentCount(num);
    const totalPayable = form.total_payable || Number(form.final_fee);
    const equalAmount = Math.floor(totalPayable / num);
    let remainder = totalPayable - equalAmount * num;
    const newInstallments = [];
    for (let i = 0; i < num; i++) {
      let amt = equalAmount + (i === 0 ? remainder : 0);
      newInstallments.push({
        amount: amt,
        due_date: "",
      });
    }
    setInstallments(newInstallments);
  }

  function updateInstallment(index, field, value) {
    setInstallments((prev) => {
      const updated = [...prev];
      updated[index] = { ...updated[index], [field]: value };
      return updated;
    });
  }

  function handleSubmit(e) {
    e.preventDefault();
    if (!form.student_id || !form.fee_structure_id) {
      toast.error("Student and fee structure are required");
      return;
    }

    if (enableInstallments) {
      const totalInstallment = installments.reduce((sum, i) => sum + Number(i.amount), 0);
      const totalPayable = form.total_payable || Number(form.final_fee);
      if (Math.abs(totalInstallment - totalPayable) > 0.01) {
        toast.error(`Installment amounts must total the final payable amount (₹${totalPayable.toFixed(2)})`);
        return;
      }
    }

    const payload = {
      student_id: form.student_id,
      fee_structure_id: form.fee_structure_id,
      total_fee: Number(form.total_fee),
      discount: Number(form.discount),
      final_fee: Number(form.final_fee),
      status: form.status,
      installment_data: enableInstallments
        ? installments.map((inst, idx) => ({
            installment_number: idx + 1,
            amount: Number(inst.amount),
            due_date: inst.due_date || null,
          }))
        : null,
    };

    if (editingFee) {
      updateMutation.mutate({ id: editingFee.id, payload });
    } else {
      createMutation.mutate(payload);
    }
  }

  function handleViewPayments(fee) {
    setSelectedFeeForPayments(fee);
    setViewPayments({ fee, payments: [] });
  }

  useEffect(() => {
    if (selectedFeeForPayments && payments) {
      setViewPayments({ fee: selectedFeeForPayments, payments });
    }
  }, [payments, selectedFeeForPayments]);

  const selectedStructure = feeStructures.find(
    (s) => s.id === parseInt(form.fee_structure_id)
  );
  const structureAllowsInstallments = selectedStructure?.installment_allowed;

  return (
    <AdminLayout>
      <BackButton to="/accounting" label="Finance & Accounting Hub" />
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-6 gap-4">
        <div>
          <h1 className="text-3xl font-righteous text-primary-dark">Student Fees</h1>
          <p className="text-sm text-secondary-dark font-montserrat mt-1">
            Assign and manage fee records with tax breakdown
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button onClick={openAssign} className="bg-primary hover:bg-primary-light text-white px-5 py-2.5 rounded-lg transition font-montserrat text-sm flex items-center gap-2">
            <Plus size={18} /> Assign Fee
          </button>
          <button onClick={handleCSVExport} className="border border-secondary-light px-4 py-2.5 rounded-lg text-secondary-dark hover:bg-secondary-bg font-montserrat text-sm flex items-center gap-2">
            <Download size={18} /> Export
          </button>
          <button onClick={() => fileInputRef.current?.click()} className="border border-secondary-light px-4 py-2.5 rounded-lg text-secondary-dark hover:bg-secondary-bg font-montserrat text-sm flex items-center gap-2">
            <Upload size={18} /> Import
          </button>
          <input type="file" ref={fileInputRef} className="hidden" accept=".csv" onChange={handleCSVImport} />
        </div>
      </div>

      {/* Search */}
      <div className="relative mb-6 max-w-md">
        <Search size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-secondary" />
        <input
          type="text"
          placeholder="Search by student name..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full border border-secondary-light rounded-lg pl-10 pr-4 py-2.5 text-sm focus:ring-1 focus:ring-primary focus:border-primary outline-none placeholder-secondary-light"
        />
      </div>

      {/* Fees Table */}
      <div className="bg-white rounded-xl shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[1100px]">
            <thead className="bg-slate-100 border-b border-secondary-light">
              <tr>
                <th className="p-3 text-left text-sm font-montserrat text-secondary-dark">Student</th>
                <th className="text-left text-sm font-montserrat text-secondary-dark">Course</th>
                <th className="text-left text-sm font-montserrat text-secondary-dark">Base Amount</th>
                <th className="text-left text-sm font-montserrat text-secondary-dark">Tax</th>
                <th className="text-left text-sm font-montserrat text-secondary-dark">Total</th>
                <th className="text-left text-sm font-montserrat text-secondary-dark">Paid</th>
                <th className="text-left text-sm font-montserrat text-secondary-dark">Pending</th>
                <th className="text-left text-sm font-montserrat text-secondary-dark">Status</th>
                <th className="text-left text-sm font-montserrat text-secondary-dark">Actions</th>
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                <tr><td colSpan={9} className="p-6 text-center text-secondary">Loading…</td></tr>
              ) : studentFees.length === 0 ? (
                <tr>
                  <td colSpan={9} className="p-6 text-center text-secondary">
                    <div className="flex flex-col items-center gap-2">
                      <Coins size={32} className="text-secondary-light" />
                      <span>No fee records found</span>
                    </div>
                  </td>
                </tr>
              ) : (
                studentFees.map((f) => (
                  <tr key={f.id} className="border-b border-secondary-light hover:bg-primary-bg transition">
                    <td className="p-3 text-sm">
                      <div className="font-medium">{f.students?.first_name} {f.students?.last_name}</div>
                      <div className="text-xs text-secondary-light">{f.students?.admission_no}</div>
                    </td>
                    <td className="text-sm">{f.fee_structures?.courses?.course_name}</td>
                    <td className="text-sm">₹{Number(f.base_amount || f.final_fee).toLocaleString()}</td>
                    <td className="text-sm text-primary">₹{Number(f.tax_amount || 0).toLocaleString()}</td>
                    <td className="text-sm font-semibold">₹{Number(f.final_fee).toLocaleString()}</td>
                    <td className="text-sm text-green-600">₹{(f.total_paid || 0).toLocaleString()}</td>
                    <td className="text-sm text-red-600">₹{(f.pending || 0).toLocaleString()}</td>
                    <td className="text-sm">
                      <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${f.status === "Paid" ? "bg-green-100 text-green-700" : "bg-yellow-100 text-yellow-700"}`}>
                        {f.status}
                      </span>
                    </td>
                    <td className="text-sm">
                      <div className="flex flex-wrap gap-1">
                        <button onClick={() => openEdit(f)} className="p-1 text-blue-600 hover:bg-blue-50 rounded" title="Edit"><Edit3 size={15} /></button>
                        <button onClick={() => setCollectingFee(f)} className="p-1 text-green-600 hover:bg-green-50 rounded" title="Collect Payment"><Wallet size={15} /></button>
                        <button onClick={() => handleViewPayments(f)} className="p-1 text-purple-600 hover:bg-purple-50 rounded" title="View Payments"><Eye size={15} /></button>
                        <button
                          onClick={() => setConfirmInvoice(f.id)}
                          disabled={generateInvoiceMutation.isPending}
                          className="p-1 text-indigo-600 hover:bg-indigo-50 rounded disabled:opacity-50"
                          title="Generate Invoice(s)"
                        >
                          {generateInvoiceMutation.isPending ? <Loader size={15} className="animate-spin" /> : <FileText size={15} />}
                        </button>
                        <button
                          onClick={() => setConfirmDelete(f.id)}
                          className="p-1 text-red-600 hover:bg-red-50 rounded"
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

      {hasNextPage && (
        <div className="flex justify-center mt-6">
          <button onClick={() => fetchNextPage()} disabled={isFetchingNextPage} className="bg-primary hover:bg-primary-light text-white px-6 py-2.5 rounded-lg font-montserrat text-sm transition disabled:opacity-60">
            {isFetchingNextPage ? "Loading more…" : "Load More"}
          </button>
        </div>
      )}

      {/* Assign/Edit Modal */}
      {showAssignForm && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl w-full max-w-lg shadow-xl max-h-[90vh] overflow-y-auto">
            <div className="sticky top-0 bg-white border-b border-secondary-light px-6 py-4 flex items-center justify-between rounded-t-xl">
              <div className="flex items-center gap-3">
                <img src={darkLogo} alt={orgName} className="h-10 w-auto" />
                <h2 className="text-xl font-righteous text-primary-dark">{editingFee ? "Edit Fee" : "Assign Fee"}</h2>
              </div>
              <button onClick={() => setShowAssignForm(false)} className="p-2 hover:bg-secondary-bg rounded-lg"><X size={20} className="text-secondary-dark" /></button>
            </div>
            <form onSubmit={handleSubmit} className="p-6 space-y-4">
              {/* Student */}
              <div>
                <label className="block text-sm font-montserrat text-secondary-dark mb-1"><User size={14} className="inline mr-1" /> Student *</label>
                <select value={form.student_id} onChange={(e) => setForm({ ...form, student_id: e.target.value })} className="w-full border border-secondary-light rounded p-2.5 focus:ring-1 focus:ring-primary focus:border-primary outline-none" required>
                  <option value="">Select</option>
                  {students.map((s) => <option key={s.id} value={s.id}>{s.first_name} {s.last_name} ({s.admission_no})</option>)}
                </select>
              </div>

              {/* Fee Structure */}
              <div>
                <label className="block text-sm font-montserrat text-secondary-dark mb-1"><BookOpen size={14} className="inline mr-1" /> Fee Structure *</label>
                <select value={form.fee_structure_id} onChange={(e) => handleFeeStructureChange(e.target.value)} className="w-full border border-secondary-light rounded p-2.5 focus:ring-1 focus:ring-primary focus:border-primary outline-none" required>
                  <option value="">Select</option>
                  {feeStructures.map((fs) => (
                    <option key={fs.id} value={fs.id}>
                      {fs.courses?.course_name} (₹{fs.fee_amount}){fs.tax_rate_id ? ` + Tax (${fs.tax_rates?.name || ''})` : ''}
                    </option>
                  ))}
                </select>
              </div>

              {/* Total Fee */}
              <div>
                <label className="block text-sm font-montserrat text-secondary-dark mb-1"><DollarSign size={14} className="inline mr-1" /> Total Fee</label>
                <input type="number" value={form.total_fee} disabled className="w-full border border-secondary-light rounded p-2.5 bg-gray-100 text-secondary-dark" />
              </div>

              {/* Discount */}
              <div>
                <label className="block text-sm font-montserrat text-secondary-dark mb-1"><Percent size={14} className="inline mr-1" /> Discount</label>
                <input type="number" value={form.discount} onChange={(e) => handleDiscountChange(e.target.value)} className="w-full border border-secondary-light rounded p-2.5 focus:ring-1 focus:ring-primary focus:border-primary outline-none" />
              </div>

              {/* Final Fee */}
              <div>
                <label className="block text-sm font-montserrat text-secondary-dark mb-1">
                  {form.tax_inclusive ? "Final Fee (incl. tax)" : "Base Amount (excl. tax)"}
                </label>
                <input type="number" value={form.final_fee} disabled className="w-full border border-secondary-light rounded p-2.5 bg-gray-100 text-secondary-dark" />
              </div>

              {/* Tax Breakdown */}
              {form.tax_rate_id && Number(form.final_fee) > 0 && (
                <div className="bg-gray-50 rounded-lg p-3 space-y-1 text-sm">
                  <p className="flex justify-between"><span className="text-gray-600">Base Amount:</span><span className="font-medium">₹{Number(form.base_amount).toFixed(2)}</span></p>
                  <p className="flex justify-between"><span className="text-gray-600">Tax Amount:</span><span className="font-medium text-primary">₹{Number(form.tax_amount).toFixed(2)}</span></p>
                  <p className="flex justify-between border-t border-gray-200 pt-1 font-bold">
                    <span>Total Payable:</span>
                    <span>₹{Number(form.total_payable || (Number(form.base_amount) + Number(form.tax_amount))).toFixed(2)}</span>
                  </p>
                </div>
              )}

              {/* Status */}
              <div>
                <label className="block text-sm font-montserrat text-secondary-dark mb-1"><Tag size={14} className="inline mr-1" /> Status</label>
                <select value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })} className="w-full border border-secondary-light rounded p-2.5 focus:ring-1 focus:ring-primary focus:border-primary outline-none">
                  <option>Pending</option>
                  <option>Paid</option>
                </select>
              </div>

              {/* Installments */}
              {structureAllowsInstallments && (
                <div className="border-t border-secondary-light pt-4 mt-4">
                  <div className="flex items-center justify-between mb-3">
                    <label className="flex items-center gap-2 text-sm font-montserrat text-secondary-dark cursor-pointer">
                      <input
                        type="checkbox"
                        checked={enableInstallments}
                        onChange={(e) => {
                          const checked = e.target.checked;
                          setEnableInstallments(checked);
                          if (checked) {
                            if (installments.length === 0) {
                              handleInstallmentCountChange(1);
                            }
                          } else {
                            setInstallments([]);
                            setInstallmentCount(1);
                          }
                        }}
                        className="rounded accent-primary h-4 w-4"
                      />
                      <span className="font-medium">Enable Installments</span>
                    </label>
                    {enableInstallments && (
                      <span className="text-xs text-green-600 bg-green-50 px-2 py-1 rounded-full">Active</span>
                    )}
                  </div>
                  {enableInstallments && (
                    <div className="space-y-3">
                      <div>
                        <label className="text-xs font-montserrat text-secondary-dark">Number of Installments</label>
                        <input
                          type="number"
                          min="1"
                          value={installmentCount}
                          onChange={(e) => handleInstallmentCountChange(e.target.value)}
                          className="w-full border border-secondary-light rounded p-2 text-sm focus:ring-1 focus:ring-primary outline-none"
                        />
                      </div>
                      {installments.map((inst, idx) => (
                        <div key={idx} className="grid grid-cols-2 gap-3">
                          <div>
                            <label className="text-xs font-montserrat text-secondary-dark">Amount {idx+1}</label>
                            <input
                              type="number"
                              value={inst.amount}
                              onChange={(e) => updateInstallment(idx, "amount", Number(e.target.value))}
                              className="w-full border border-secondary-light rounded p-2 text-sm focus:ring-1 focus:ring-primary outline-none"
                            />
                          </div>
                          <div>
                            <label className="text-xs font-montserrat text-secondary-dark">Due Date {idx+1}</label>
                            <input
                              type="date"
                              value={inst.due_date}
                              onChange={(e) => updateInstallment(idx, "due_date", e.target.value)}
                              className="w-full border border-secondary-light rounded p-2 text-sm focus:ring-1 focus:ring-primary outline-none"
                            />
                          </div>
                        </div>
                      ))}
                      <p className="text-xs text-secondary mt-1">
                        Total installments sum should equal ₹{Number(form.total_payable || form.final_fee).toFixed(2)}
                      </p>
                      {editingFee && (
                        <p className="text-xs text-amber-600 mt-1">
                          ⚠️ Disabling installments will remove all existing installment records.
                        </p>
                      )}
                    </div>
                  )}
                </div>
              )}

              <div className="flex flex-col sm:flex-row-reverse gap-3 pt-2">
                <button type="submit" className="w-full sm:w-auto bg-primary hover:bg-primary-light text-white px-6 py-2.5 rounded-lg font-montserrat transition">
                  {editingFee ? "Update Fee" : "Assign Fee"}
                </button>
                <button type="button" onClick={() => setShowAssignForm(false)} className="w-full sm:w-auto border border-secondary-light text-secondary-dark hover:bg-secondary-bg px-6 py-2.5 rounded-lg font-montserrat transition">
                  Cancel
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ── Delete confirmation (default danger variant) ── */}
      {confirmDelete && (
        <ConfirmDialog
          message="Delete this fee record?"
          onConfirm={() => { deleteMutation.mutate(confirmDelete); setConfirmDelete(null); }}
          onCancel={() => setConfirmDelete(null)}
          confirmText="Delete"
          variant="danger"
        />
      )}

      {/* ── Invoice generation confirmation (now shows "Generate" button) ── */}
      {confirmInvoice && (
        <ConfirmDialog
          message="Generate invoice(s) for this fee?"
          onConfirm={() => { generateInvoiceMutation.mutate({ feeId: confirmInvoice }); setConfirmInvoice(null); }}
          onCancel={() => setConfirmInvoice(null)}
          confirmText="Generate"
          cancelText="Cancel"
          variant="primary"
        />
      )}

      {/* Collect Payment Modal */}
      {collectingFee && (
        <CollectPaymentModal
          fee={collectingFee}
          onClose={() => setCollectingFee(null)}
          onSuccess={() => {
            setCollectingFee(null);
            queryClient.invalidateQueries({ queryKey: ["studentFees"] });
          }}
        />
      )}

      {/* View Payments Modal */}
      {viewPayments && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl w-full max-w-xl shadow-xl max-h-[90vh] overflow-y-auto">
            <div className="sticky top-0 bg-white border-b border-secondary-light px-6 py-4 flex items-center justify-between rounded-t-xl">
              <div className="flex items-center gap-3">
                <img src={darkLogo} alt={orgName} className="h-10 w-auto" />
                <h2 className="text-xl font-righteous text-primary-dark">Payment History</h2>
              </div>
              <button onClick={() => { setViewPayments(null); setSelectedFeeForPayments(null); }} className="p-2 hover:bg-secondary-bg rounded-lg"><X size={20} className="text-secondary-dark" /></button>
            </div>
            <div className="p-6">
              <p className="text-sm text-secondary-dark font-montserrat mb-4">
                <span className="font-medium">{viewPayments.fee.students?.first_name} {viewPayments.fee.students?.last_name}</span> – {viewPayments.fee.fee_structures?.courses?.course_name}
              </p>
              {paymentsLoading ? (
                <p className="text-center text-secondary">Loading payments…</p>
              ) : viewPayments.payments.length === 0 ? (
                <p className="text-secondary text-center">No payments yet</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[500px]">
                    <thead className="bg-slate-50">
                      <tr>
                        <th className="text-left p-2 text-sm font-montserrat text-secondary-dark">Date</th>
                        <th className="text-left p-2 text-sm font-montserrat text-secondary-dark">Base Amount</th>
                        <th className="text-left p-2 text-sm font-montserrat text-secondary-dark">Tax</th>
                        <th className="text-left p-2 text-sm font-montserrat text-secondary-dark">Total</th>
                        <th className="text-left p-2 text-sm font-montserrat text-secondary-dark">Mode</th>
                      </tr>
                    </thead>
                    <tbody>
                      {viewPayments.payments.map((p) => (
                        <tr key={p.id} className="border-b border-secondary-light">
                          <td className="p-2 text-sm">{p.payment_date}</td>
                          <td className="p-2 text-sm">₹{Number(p.base_amount || p.amount).toFixed(2)}</td>
                          <td className="p-2 text-sm text-primary">₹{Number(p.tax_amount || 0).toFixed(2)}</td>
                          <td className="p-2 text-sm font-medium">₹{Number(p.amount).toFixed(2)}</td>
                          <td className="p-2 text-sm">{p.payment_mode}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </AdminLayout>
  );
}