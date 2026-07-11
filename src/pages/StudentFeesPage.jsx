import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import toast from "react-hot-toast";
import {
  IndianRupee, FileText, ChevronDown, ChevronUp, Calendar,
  CheckCircle, AlertCircle, CreditCard, Send, List,
} from "lucide-react";
import AdminLayout from "../layouts/AdminLayout";
import BackButton from "../components/BackButton";

import { useStudentId } from "../hooks/useStudentId";
import { supabase } from "../api/supabase";
import { submitPaymentRequest } from "../services/feeService";
import { useOrg } from "../context/OrganizationContext";   // NEW

export default function StudentFeesPage() {
  const { studentId, isLoading: idLoading } = useStudentId();
  const queryClient = useQueryClient();

  // ── Get branch & financial year for context ──
  const { branch, selectedFinancialYear } = useOrg();
  const ctx = { branchId: branch?.id, financialYearId: selectedFinancialYear?.id };

  const [expandedFeeId, setExpandedFeeId] = useState(null);
  const [payingFee, setPayingFee] = useState(null);
  const [paymentForm, setPaymentForm] = useState({
    amount: "",
    transaction_no: "",
    remarks: "",
    installment_id: "",
  });

  // Fetch fee records with installments and payments
  const { data: fees = [], isLoading } = useQuery({
    queryKey: ["student-fees-list", studentId],
    queryFn: async () => {
      if (!studentId) return [];
      const { data: feeData, error: feeError } = await supabase
        .from("student_fees")
        .select(`*, fee_structures(fee_amount, courses(course_name))`)
        .eq("student_id", studentId);
      if (feeError) throw feeError;
      if (!feeData || feeData.length === 0) return [];

      const enriched = await Promise.all(
        feeData.map(async (fee) => {
          const { data: payments } = await supabase
            .from("fee_payments")
            .select("*")
            .eq("student_fee_id", fee.id)
            .order("payment_date", { ascending: false });

          const { data: installments } = await supabase
            .from("fee_installments")
            .select("*")
            .eq("student_fee_id", fee.id)
            .order("installment_number");

          const totalPaid = (payments || [])
            .filter((p) => p.status === "Approved")
            .reduce((sum, p) => sum + Number(p.amount), 0);
          const finalFee = Number(fee.final_fee);
          const pending = Math.max(finalFee - totalPaid, 0);

          return {
            ...fee,
            total_paid: totalPaid,
            pending,
            payments: payments || [],
            installments: installments || [],
          };
        })
      );
      return enriched;
    },
    enabled: !!studentId,
  });

  const toggleExpand = (id) => {
    setExpandedFeeId((prev) => (prev === id ? null : id));
  };

  // Open payment form – reset fields
  const openPayModal = (fee) => {
    setPayingFee(fee);
    setPaymentForm({ amount: "", transaction_no: "", remarks: "", installment_id: "" });
  };

  // Auto‑fill amount when an installment is selected
  const selectedInstallment =
    payingFee?.installments.find((inst) => inst.id === Number(paymentForm.installment_id));

  const handleInstallmentChange = (e) => {
    const instId = e.target.value;
    const inst = payingFee?.installments.find((i) => i.id === Number(instId));
    setPaymentForm((prev) => ({
      ...prev,
      installment_id: instId,
      amount: inst ? inst.amount.toString() : prev.amount,
    }));
  };

  const handleSubmitPayment = async (e) => {
    e.preventDefault();
    if (!paymentForm.amount || Number(paymentForm.amount) <= 0) {
      toast.error("Enter a valid amount");
      return;
    }
    try {
      await submitPaymentRequest(
        {
          student_fee_id: payingFee.id,
          amount: Number(paymentForm.amount),
          transaction_no: paymentForm.transaction_no,
          remarks: paymentForm.remarks,
          installment_id: paymentForm.installment_id || null,
        },
        ctx   // pass context with branchId & financialYearId
      );
      toast.success("Payment request submitted for approval");
      setPayingFee(null);
      queryClient.invalidateQueries({ queryKey: ["student-fees-list", studentId] });
    } catch (err) {
      toast.error(err.message || "Failed to submit payment request");
    }
  };

  if (idLoading || isLoading) {
    return (
      <AdminLayout>
      <BackButton to="/student" label="My Dashboard" />
        <div className="p-8 text-center text-secondary">Loading your fees…</div>
      </AdminLayout>
    );
  }

  return (
    <AdminLayout>
      <h1 className="text-3xl font-righteous text-primary-dark mb-6">My Fees</h1>

      {fees.length === 0 ? (
        <div className="bg-white rounded-xl p-8 shadow-sm border border-secondary-light text-center">
          <FileText size={32} className="text-secondary-light mx-auto mb-2" />
          <p className="text-secondary">No fee records found.</p>
        </div>
      ) : (
        <div className="space-y-6">
          {fees.map((fee) => (
            <div
              key={fee.id}
              className="bg-white rounded-xl shadow-sm border border-secondary-light overflow-hidden"
            >
              <div className="p-5">
                <div className="flex justify-between items-start">
                  <div>
                    <h2 className="font-bold text-lg text-primary-dark">
                      {fee.fee_structures?.courses?.course_name}
                    </h2>
                    <div className="flex flex-wrap gap-3 mt-2 text-sm">
                      <div className="flex items-center gap-1">
                        <IndianRupee size={16} className="text-secondary" />
                        <span className="font-medium">
                          Total: ₹{Number(fee.final_fee).toLocaleString("en-IN")}
                        </span>
                      </div>
                      {fee.total_paid > 0 && (
                        <div className="flex items-center gap-1">
                          <CheckCircle size={16} className="text-green-600" />
                          <span className="text-green-600 font-medium">
                            Paid: ₹{fee.total_paid.toLocaleString("en-IN")}
                          </span>
                        </div>
                      )}
                      {fee.pending > 0 && (
                        <div className="flex items-center gap-1">
                          <AlertCircle size={16} className="text-red-500" />
                          <span className="text-red-500 font-medium">
                            Pending: ₹{fee.pending.toLocaleString("en-IN")}
                          </span>
                        </div>
                      )}
                      <span
                        className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                          fee.status === "Paid"
                            ? "bg-green-100 text-green-700"
                            : "bg-yellow-100 text-yellow-700"
                        }`}
                      >
                        {fee.status}
                      </span>
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    {fee.pending > 0 && (
                      <button
                        onClick={() => openPayModal(fee)}
                        className="bg-primary hover:bg-primary-light text-white px-4 py-2 rounded-lg text-sm flex items-center gap-1"
                      >
                        <Send size={16} /> Pay Now
                      </button>
                    )}
                    <button
                      onClick={() => toggleExpand(fee.id)}
                      className="text-primary hover:underline text-sm flex items-center gap-1"
                    >
                      {expandedFeeId === fee.id ? (
                        <>
                          <ChevronUp size={16} /> Hide Details
                        </>
                      ) : (
                        <>
                          <ChevronDown size={16} /> View Details
                        </>
                      )}
                    </button>
                  </div>
                </div>
              </div>

              {/* Expanded details */}
              {expandedFeeId === fee.id && (
                <div className="border-t border-secondary-light bg-gray-50 p-5 space-y-5">
                  {/* Installments */}
                  {fee.installments.length > 0 && (
                    <div>
                      <h3 className="font-semibold text-sm text-secondary-dark mb-2 flex items-center gap-1">
                        <Calendar size={16} /> Installments
                      </h3>
                      <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                          <thead className="bg-slate-100">
                            <tr>
                              <th className="text-left p-2">#</th>
                              <th className="text-left p-2">Amount</th>
                              <th className="text-left p-2">Due Date</th>
                              <th className="text-left p-2">Status</th>
                            </tr>
                          </thead>
                          <tbody>
                            {fee.installments.map((inst) => (
                              <tr key={inst.id} className="border-b border-secondary-light">
                                <td className="p-2">{inst.installment_number}</td>
                                <td className="p-2">
                                  ₹{Number(inst.amount).toLocaleString("en-IN")}
                                </td>
                                <td className="p-2">{inst.due_date || "—"}</td>
                                <td className="p-2">
                                  <span
                                    className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                                      inst.status === "Paid"
                                        ? "bg-green-100 text-green-700"
                                        : "bg-yellow-100 text-yellow-700"
                                    }`}
                                  >
                                    {inst.status}
                                  </span>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  )}

                  {/* Payment History */}
                  <div>
                    <h3 className="font-semibold text-sm text-secondary-dark mb-2 flex items-center gap-1">
                      <CreditCard size={16} /> Payment History
                    </h3>
                    {fee.payments.length === 0 ? (
                      <p className="text-sm text-secondary">No payments recorded yet.</p>
                    ) : (
                      <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                          <thead className="bg-slate-100">
                            <tr>
                              <th className="text-left p-2">Date</th>
                              <th className="text-left p-2">Amount</th>
                              <th className="text-left p-2">Mode</th>
                              <th className="text-left p-2">Transaction</th>
                              <th className="text-left p-2">Status</th>
                            </tr>
                          </thead>
                          <tbody>
                            {fee.payments.map((p) => (
                              <tr key={p.id} className="border-b border-secondary-light">
                                <td className="p-2">{p.payment_date}</td>
                                <td className="p-2 font-medium">
                                  ₹{Number(p.amount).toLocaleString("en-IN")}
                                </td>
                                <td className="p-2">{p.payment_mode}</td>
                                <td className="p-2">{p.transaction_no || "—"}</td>
                                <td className="p-2">
                                  <span
                                    className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                                      p.status === "Approved"
                                        ? "bg-green-100 text-green-700"
                                        : "bg-blue-100 text-blue-700"
                                    }`}
                                  >
                                    {p.status}
                                  </span>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Pay Now Modal */}
      {payingFee && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl w-full max-w-md shadow-xl max-h-[90vh] overflow-y-auto">
            <div className="sticky top-0 bg-white border-b border-secondary-light px-6 py-4 flex items-center justify-between rounded-t-xl">
              <h2 className="text-xl font-righteous text-primary-dark">Submit Payment</h2>
              <button
                onClick={() => setPayingFee(null)}
                className="p-2 hover:bg-secondary-bg rounded-lg"
              >
                ✕
              </button>
            </div>
            <form onSubmit={handleSubmitPayment} className="p-6 space-y-4">
              <div>
                <p className="text-sm text-secondary-dark">
                  <strong>Course:</strong> {payingFee.fee_structures?.courses?.course_name}
                </p>
                <p className="text-sm text-secondary">
                  Total Fee: ₹{Number(payingFee.final_fee).toLocaleString("en-IN")}
                </p>
                <p className="text-sm text-green-600">
                  Already Paid (Approved): ₹{Number(payingFee.total_paid).toLocaleString("en-IN")}
                </p>
              </div>

              {/* Installment selector */}
              {payingFee.installments.length > 0 && (
                <div>
                  <label className="block text-sm font-montserrat text-secondary-dark mb-1">
                    <List size={14} className="inline mr-1" />
                    Select Installment (optional)
                  </label>
                  <select
                    value={paymentForm.installment_id}
                    onChange={handleInstallmentChange}
                    className="w-full border border-secondary-light rounded p-2.5 focus:ring-1 focus:ring-primary outline-none"
                  >
                    <option value="">No specific installment</option>
                    {payingFee.installments.map((inst) => (
                      <option key={inst.id} value={inst.id}>
                        #{inst.installment_number} – ₹{Number(inst.amount).toLocaleString("en-IN")}
                        {inst.due_date ? ` (Due ${inst.due_date})` : ""}
                        {inst.status === "Paid" ? " ✓ Paid" : ""}
                      </option>
                    ))}
                  </select>
                  {selectedInstallment && (
                    <p className="text-xs text-secondary mt-1">
                      Amount auto‑filled with installment amount. You can change it.
                    </p>
                  )}
                </div>
              )}

              <div>
                <label className="block text-sm font-montserrat text-secondary-dark mb-1">
                  Amount to Pay *
                </label>
                <input
                  type="number"
                  value={paymentForm.amount}
                  onChange={(e) => setPaymentForm({ ...paymentForm, amount: e.target.value })}
                  className="w-full border border-secondary-light rounded p-2.5 focus:ring-1 focus:ring-primary outline-none"
                  required
                  placeholder="Enter amount"
                />
              </div>
              <div>
                <label className="block text-sm font-montserrat text-secondary-dark mb-1">
                  Transaction Reference / UTR
                </label>
                <input
                  type="text"
                  value={paymentForm.transaction_no}
                  onChange={(e) => setPaymentForm({ ...paymentForm, transaction_no: e.target.value })}
                  className="w-full border border-secondary-light rounded p-2.5 focus:ring-1 focus:ring-primary outline-none"
                  placeholder="e.g., UTR123456"
                />
              </div>
              <div>
                <label className="block text-sm font-montserrat text-secondary-dark mb-1">
                  Remarks
                </label>
                <textarea
                  value={paymentForm.remarks}
                  onChange={(e) => setPaymentForm({ ...paymentForm, remarks: e.target.value })}
                  rows={2}
                  className="w-full border border-secondary-light rounded p-2.5 focus:ring-1 focus:ring-primary outline-none"
                  placeholder="Any additional note"
                />
              </div>
              <div className="flex flex-col sm:flex-row-reverse gap-3 pt-2">
                <button
                  type="submit"
                  className="w-full sm:w-auto bg-primary hover:bg-primary-light text-white px-6 py-2.5 rounded-lg font-montserrat transition"
                >
                  Submit for Approval
                </button>
                <button
                  type="button"
                  onClick={() => setPayingFee(null)}
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