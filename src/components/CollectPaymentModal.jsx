// src/components/CollectPaymentModal.jsx
import { useState, useEffect } from "react";
import toast from "react-hot-toast";
import {
  X, Calendar, IndianRupee, CreditCard, Hash, FileText, User,
  ChevronDown, List, Receipt,
} from "lucide-react";
import { collectPayment } from "../services/feeService";
import { createInvoice } from "../services/invoiceService";
import { supabase } from "../api/supabase";
import { useOrgDarkLogo } from "../hooks/useOrgDarkLogo";
import { useOrg } from "../context/OrganizationContext";

export default function CollectPaymentModal({ fee, onClose, onSuccess }) {
  const darkLogo = useOrgDarkLogo();
  const { branch, selectedFinancialYear } = useOrg();
  const branchId = branch?.id;
  const financialYearId = selectedFinancialYear?.id;

  const [form, setForm] = useState({
    payment_date: new Date().toISOString().split("T")[0],
    amount: "",
    payment_mode: "Cash",
    transaction_no: "",
    remarks: "",
    installment_id: "",
  });
  const [installments, setInstallments] = useState([]);
  const [loadingInstallments, setLoadingInstallments] = useState(true);
  const [taxInfo, setTaxInfo] = useState(null);
  const [creatingInvoice, setCreatingInvoice] = useState(false);

  // Fetch installments and tax info – scoped
  useEffect(() => {
    if (!branchId || !financialYearId) return;
    async function loadData() {
      // 1. Fetch installments (scoped)
      const { data: instData, error: instError } = await supabase
        .from("fee_installments")
        .select("*")
        .eq("student_fee_id", fee.id)
        .eq("branch_id", branchId)
        .eq("financial_year_id", financialYearId)
        .order("installment_number");
      if (instError) {
        toast.error("Could not load installments");
      } else {
        setInstallments(instData || []);
      }
      setLoadingInstallments(false);

      // 2. Fetch tax info from fee structure
      if (fee.fee_structures?.tax_rate_id) {
        const taxRateId = fee.fee_structures.tax_rate_id;
        const taxInclusive = fee.fee_structures.tax_inclusive !== undefined
          ? fee.fee_structures.tax_inclusive
          : true;
        const taxRate = fee.fee_structures.tax_rates; // already joined

        if (taxRate) {
          setTaxInfo({
            rate: Number(taxRate.rate),
            name: taxRate.name,
            taxInclusive: taxInclusive,
            baseAmount: Number(fee.base_amount || 0),
            taxAmount: Number(fee.tax_amount || 0),
            finalFee: Number(fee.final_fee),
          });
        } else {
          // Fetch tax rate separately – scoped
          const { data: taxRateData } = await supabase
            .from("tax_rates")
            .select("rate, name")
            .eq("id", taxRateId)
            .eq("branch_id", branchId)
            .eq("financial_year_id", financialYearId)
            .single();
          if (taxRateData) {
            setTaxInfo({
              rate: Number(taxRateData.rate),
              name: taxRateData.name,
              taxInclusive: taxInclusive,
              baseAmount: Number(fee.base_amount || 0),
              taxAmount: Number(fee.tax_amount || 0),
              finalFee: Number(fee.final_fee),
            });
          }
        }
      }
    }
    loadData();
  }, [fee, branchId, financialYearId]);

  // When an installment is selected, auto-fill the amount
  const selectedInstallment = installments.find(
    (inst) => inst.id === Number(form.installment_id)
  );

  useEffect(() => {
    if (selectedInstallment) {
      setForm((prev) => ({ ...prev, amount: selectedInstallment.amount.toString() }));
    }
  }, [selectedInstallment]);

  function handleChange(e) {
    const { name, value } = e.target;
    setForm((prev) => ({ ...prev, [name]: value }));
  }

  async function handleSubmit(e) {
    e.preventDefault();
    if (!form.amount || Number(form.amount) <= 0) {
      toast.error("Enter a valid amount");
      return;
    }

    const paymentAmount = Number(form.amount);

    // Calculate base_amount and tax_amount based on taxInfo
    let baseAmount = paymentAmount;
    let taxAmount = 0;

    if (taxInfo && taxInfo.rate > 0) {
      const rate = taxInfo.rate / 100;
      if (taxInfo.taxInclusive) {
        baseAmount = paymentAmount / (1 + rate);
        taxAmount = paymentAmount - baseAmount;
      } else {
        taxAmount = paymentAmount * rate;
      }
      baseAmount = Math.round(baseAmount * 100) / 100;
      taxAmount = Math.round(taxAmount * 100) / 100;
    }

    try {
      const paymentPayload = {
        student_fee_id: fee.id,
        payment_date: form.payment_date,
        amount: paymentAmount,
        base_amount: baseAmount,
        tax_amount: taxAmount,
        payment_mode: form.payment_mode,
        transaction_no: form.transaction_no,
        remarks: form.remarks,
        installment_id: form.installment_id || null,
      };

      const context = {
        branchId: branchId,
        financialYearId: financialYearId,
      };

      // 1. Collect the payment
      await collectPayment(paymentPayload, fee.student_id, null, context);

      // 2. Auto‑generate invoice for this payment
     // 2. Auto‑generate invoice for this payment – with retry
setCreatingInvoice(true);
let invoiceCreated = false;
let attempts = 0;
const maxAttempts = 3;

while (!invoiceCreated && attempts < maxAttempts) {
  try {
    const invoicePayload = {
      student_id: fee.student_id,
      invoice_date: form.payment_date,
      due_date: null,
      payment_terms: "Immediate",
      gst_applicable: taxInfo && taxInfo.rate > 0,
      place_of_supply: fee.students?.state_code || "",
      reverse_charge: false,
      items: [
        {
          item_type: "fee_payment",
          description: `Fee Payment - ${fee.fee_structures?.courses?.course_name || "N/A"}`,
          quantity: 1,
          unit_price: baseAmount,
          hsn_sac_code: "9992",
          tax_rate_id: fee.fee_structures?.tax_rate_id || null,
        },
      ],
      student_fee_id: fee.id,
      fee_installment_id: form.installment_id || null,
    };
    await createInvoice(invoicePayload, context);
    invoiceCreated = true;
    toast.success("Payment collected and invoice generated");
  } catch (err) {
    attempts++;
    console.error("Invoice generation error (attempt " + attempts + "):", err);
    if (attempts >= maxAttempts) {
      toast.error(err?.message || "Invoice generation failed. You can generate it manually from the fee list.");
    }
    // If duplicate key error, loop will try again with a new number automatically
  }
}
setCreatingInvoice(false);

      if (onSuccess) onSuccess();
      onClose();
    } catch (err) {
      console.error(err);
      toast.error(err?.message || "Payment failed");
    }
  }

  const hasTax = taxInfo && taxInfo.rate > 0;

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl w-full max-w-md shadow-xl max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="sticky top-0 bg-white border-b border-secondary-light px-6 py-4 flex items-center justify-between rounded-t-xl z-10">
          <div className="flex items-center gap-3">
            <img
              src={darkLogo}
              alt="ShreeVidhya Academy"
              className="h-10 w-auto"
            />
            <h2 className="text-xl font-righteous text-primary-dark">
              Collect Payment
            </h2>
          </div>
          <button
            onClick={onClose}
            className="p-2 hover:bg-secondary-bg rounded-lg transition"
          >
            <X size={20} className="text-secondary-dark" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-5">
          {/* Student Info */}
          <div className="bg-primary-bg rounded-lg p-4 flex items-start gap-3">
            <User size={20} className="text-primary mt-0.5" />
            <div>
              <p className="font-semibold text-primary-dark">
                {fee.students?.first_name} {fee.students?.last_name}
              </p>
              <p className="text-sm text-secondary-dark mt-1">
                Final Fee:{" "}
                <span className="font-bold text-primary">
                  ₹{Number(fee.final_fee).toLocaleString("en-IN")}
                </span>
              </p>
              {fee.total_paid > 0 && (
                <p className="text-sm text-green-700">
                  Already paid: ₹{Number(fee.total_paid).toLocaleString("en-IN")}
                </p>
              )}
              {hasTax && (
                <p className="text-xs text-secondary mt-1">
                  Tax rate: {taxInfo.name} ({taxInfo.rate}%) – {taxInfo.taxInclusive ? "Inclusive" : "Exclusive"}
                </p>
              )}
            </div>
          </div>

          {/* Installments Section */}
          {loadingInstallments ? (
            <p className="text-sm text-secondary">Loading installments...</p>
          ) : installments.length > 0 ? (
            <div>
              <label className="block text-sm font-montserrat text-secondary-dark mb-1">
                <List size={14} className="inline mr-1" />
                Installments (optional)
              </label>
              <select
                name="installment_id"
                value={form.installment_id}
                onChange={handleChange}
                className="w-full border border-secondary-light rounded p-2.5 focus:ring-1 focus:ring-primary focus:border-primary outline-none"
              >
                <option value="">No specific installment (lump sum)</option>
                {installments.map((inst) => (
                  <option key={inst.id} value={inst.id}>
                    #{inst.installment_number} – ₹{Number(inst.amount).toLocaleString("en-IN")}
                    {inst.due_date ? ` (Due ${inst.due_date})` : ""}
                    {inst.status === "Paid" ? " ✓ Paid" : ""}
                  </option>
                ))}
              </select>
              {selectedInstallment && (
                <p className="text-xs text-secondary mt-1">
                  Amount auto‑filled with installment amount. You can still change it.
                </p>
              )}
            </div>
          ) : null}

          {/* Date */}
          <div>
            <label className="block text-sm font-montserrat text-secondary-dark mb-1">
              <Calendar size={14} className="inline mr-1" />
              Date *
            </label>
            <input
              type="date"
              name="payment_date"
              value={form.payment_date}
              onChange={handleChange}
              className="w-full border border-secondary-light rounded p-2.5 focus:ring-1 focus:ring-primary focus:border-primary outline-none"
              required
            />
          </div>

          {/* Amount */}
          <div>
            <label className="block text-sm font-montserrat text-secondary-dark mb-1">
              <IndianRupee size={14} className="inline mr-1" />
              Amount *
            </label>
            <input
              type="number"
              name="amount"
              value={form.amount}
              onChange={handleChange}
              placeholder="Enter amount"
              className="w-full border border-secondary-light rounded p-2.5 focus:ring-1 focus:ring-primary focus:border-primary outline-none placeholder-secondary-light"
              required
              step="0.01"
            />
            {hasTax && form.amount && Number(form.amount) > 0 && (
              <div className="mt-2 bg-gray-50 rounded p-2 text-xs text-gray-600 space-y-0.5">
                <p className="flex justify-between">
                  <span>Base Amount:</span>
                  <span className="font-medium">
                    ₹{(() => {
                      const amt = Number(form.amount);
                      const rate = taxInfo.rate / 100;
                      if (taxInfo.taxInclusive) {
                        const base = amt / (1 + rate);
                        return base.toFixed(2);
                      } else {
                        return amt.toFixed(2);
                      }
                    })()}
                  </span>
                </p>
                <p className="flex justify-between">
                  <span>Tax ({taxInfo.rate}%):</span>
                  <span className="font-medium text-primary">
                    ₹{(() => {
                      const amt = Number(form.amount);
                      const rate = taxInfo.rate / 100;
                      if (taxInfo.taxInclusive) {
                        const base = amt / (1 + rate);
                        return (amt - base).toFixed(2);
                      } else {
                        return (amt * rate).toFixed(2);
                      }
                    })()}
                  </span>
                </p>
                <p className="flex justify-between border-t border-gray-200 pt-0.5 font-medium">
                  <span>Total:</span>
                  <span>₹{Number(form.amount).toFixed(2)}</span>
                </p>
              </div>
            )}
          </div>

          {/* Payment Mode */}
          <div>
            <label className="block text-sm font-montserrat text-secondary-dark mb-1">
              <CreditCard size={14} className="inline mr-1" />
              Payment Mode
            </label>
            <select
              name="payment_mode"
              value={form.payment_mode}
              onChange={handleChange}
              className="w-full border border-secondary-light rounded p-2.5 focus:ring-1 focus:ring-primary focus:border-primary outline-none"
            >
              <option>Cash</option>
              <option>UPI</option>
              <option>Bank Transfer</option>
              <option>Cheque</option>
            </select>
          </div>

          {/* Transaction No */}
          <div>
            <label className="block text-sm font-montserrat text-secondary-dark mb-1">
              <Hash size={14} className="inline mr-1" />
              Transaction No / Reference
            </label>
            <input
              type="text"
              name="transaction_no"
              value={form.transaction_no}
              onChange={handleChange}
              placeholder="e.g., UTR or Cheque No"
              className="w-full border border-secondary-light rounded p-2.5 focus:ring-1 focus:ring-primary focus:border-primary outline-none placeholder-secondary-light"
            />
          </div>

          {/* Remarks */}
          <div>
            <label className="block text-sm font-montserrat text-secondary-dark mb-1">
              <FileText size={14} className="inline mr-1" />
              Remarks
            </label>
            <input
              type="text"
              name="remarks"
              value={form.remarks}
              onChange={handleChange}
              placeholder="Any additional note"
              className="w-full border border-secondary-light rounded p-2.5 focus:ring-1 focus:ring-primary focus:border-primary outline-none placeholder-secondary-light"
            />
          </div>

          {/* Buttons */}
          <div className="flex flex-col sm:flex-row-reverse gap-3 pt-2">
            <button
              type="submit"
              disabled={creatingInvoice}
              className="w-full sm:w-auto bg-accent hover:bg-accent-light text-white px-6 py-2.5 rounded-lg font-montserrat transition flex items-center justify-center gap-2"
            >
              <IndianRupee size={16} />
              {creatingInvoice ? "Processing..." : "Collect Payment"}
            </button>
            <button
              type="button"
              onClick={onClose}
              className="w-full sm:w-auto border border-secondary-light text-secondary-dark hover:bg-secondary-bg px-6 py-2.5 rounded-lg font-montserrat transition"
            >
              Cancel
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}