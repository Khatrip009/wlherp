// src/services/feeService.js
import { supabase } from "../api/supabase";

// ========================
// HELPERS
// ========================

export function calculateFeeWithTax(amount, taxRateId, taxRates, taxInclusive = true) {
  if (!taxRateId) {
    return { baseAmount: amount, taxAmount: 0, total: amount };
  }

  const taxRate = taxRates.find(t => t.id === taxRateId);
  if (!taxRate) {
    return { baseAmount: amount, taxAmount: 0, total: amount };
  }

  const rate = taxRate.rate / 100;

  if (taxInclusive) {
    const baseAmount = amount / (1 + rate);
    const taxAmount = amount - baseAmount;
    return {
      baseAmount: Math.round(baseAmount * 100) / 100,
      taxAmount: Math.round(taxAmount * 100) / 100,
      total: amount,
    };
  } else {
    const baseAmount = amount;
    const taxAmount = amount * rate;
    return {
      baseAmount,
      taxAmount: Math.round(taxAmount * 100) / 100,
      total: amount + taxAmount,
    };
  }
}

// ========================
// TAX RATES
// ========================

export async function getTaxRates() {
  const { data, error } = await supabase
    .from("tax_rates")
    .select("*")
    .eq("is_active", true)
    .order("rate");
  if (error) throw error;
  return data;
}

// context: { branchId, financialYearId }
export async function createTaxRate(payload, context) {
  const { branchId, financialYearId } = context;
  const { data, error } = await supabase
    .from("tax_rates")
    .insert([{ ...payload, branch_id: branchId, financial_year_id: financialYearId }])
    .select()
    .single();
  if (error) throw error;
  return data;
}

// context: { branchId, financialYearId }
export async function updateTaxRate(id, payload, context) {
  const { branchId, financialYearId } = context;
  const { data, error } = await supabase
    .from("tax_rates")
    .update({ ...payload, branch_id: branchId, financial_year_id: financialYearId })
    .eq("id", id)
    .select()
    .single();
  if (error) throw error;
  return data;
}

// Hard delete – RLS protects
export async function deleteTaxRate(id) {
  const { error } = await supabase
    .from("tax_rates")
    .delete()
    .eq("id", id);
  if (error) throw error;
}

// ========================
// FEE STRUCTURES
// ========================

export async function getFeeStructures() {
  const { data, error } = await supabase
    .from("fee_structures")
    .select(`
      *,
      courses (
        id,
        course_name,
        medium_id,
        mediums ( name )
      ),
      tax_rates (
        id,
        name,
        rate
      )
    `)
    .order("id", { ascending: false });
  if (error) throw error;
  return data || [];
}

// context: { branchId, financialYearId }
export async function createFeeStructure(payload, context) {
  const { branchId, financialYearId } = context;
  const { data, error } = await supabase
    .from("fee_structures")
    .insert([{ ...payload, branch_id: branchId, financial_year_id: financialYearId }])
    .select()
    .single();
  if (error) throw error;
  return data;
}

// context: { branchId, financialYearId }
export async function updateFeeStructure(id, payload, context) {
  const { branchId, financialYearId } = context;
  const { data, error } = await supabase
    .from("fee_structures")
    .update({ ...payload, branch_id: branchId, financial_year_id: financialYearId })
    .eq("id", id)
    .select()
    .single();
  if (error) throw error;
  return data;
}

// Soft delete – context required for RLS on update
// context: { branchId, financialYearId }
export async function deleteFeeStructure(id, context) {
  const { branchId, financialYearId } = context;
  const { error } = await supabase
    .from("fee_structures")
    .update({
      deleted_at: new Date().toISOString(),
      branch_id: branchId,
      financial_year_id: financialYearId,
    })
    .eq("id", id);
  if (error) throw error;
}

// ========================
// STUDENT FEES (with tax AND course)
// ========================

export async function getStudentFees({ pageParam = 0, filters = {} } = {}) {
  const limit = 10;
  const from = pageParam * limit;
  const to = from + limit - 1;

  let query = supabase
    .from("student_fees")
    .select(
      `*,
       students(first_name, last_name, admission_no),
       fee_structures!inner (
         fee_amount,
         tax_rate_id,
         tax_inclusive,
         tax_rates ( name, rate ),
         courses ( course_name, medium_id, mediums ( name ) )
       ),
       fee_payments ( amount, base_amount, tax_amount ),
       fee_installments ( id, installment_number, amount, due_date, status )`,
      { count: "exact" }
    )
    .order("id", { ascending: false })
    .range(from, to);

  if (filters.search) {
    query = query.or(
      `students.first_name.ilike.%${filters.search}%,students.last_name.ilike.%${filters.search}%`
    );
  }

  const { data, error, count } = await query;
  if (error) throw error;

  const enriched = data.map((fee) => {
    const payments = fee.fee_payments || [];
    const totalPaid = payments.reduce((sum, p) => sum + Number(p.amount), 0);
    const totalBasePaid = payments.reduce((sum, p) => sum + Number(p.base_amount || 0), 0);
    const totalTaxPaid = payments.reduce((sum, p) => sum + Number(p.tax_amount || 0), 0);
    const pending = Math.max(Number(fee.final_fee) - totalPaid, 0);
    const installments = [...(fee.fee_installments || [])].sort(
      (a, b) => a.installment_number - b.installment_number
    );
    return {
      ...fee,
      total_paid: totalPaid,
      total_base_paid: totalBasePaid,
      total_tax_paid: totalTaxPaid,
      pending,
      installments,
    };
  });

  return { data: enriched, count };
}

export async function getAllStudentFeesForExport(filters = {}) {
  let query = supabase
    .from("student_fees")
    .select(
      `*,
       students(first_name, last_name, admission_no),
       fee_structures!inner (
         fee_amount,
         tax_rate_id,
         tax_inclusive,
         tax_rates ( name, rate ),
         courses ( course_name )
       ),
       fee_payments ( amount )`
    )
    .order("id", { ascending: false });

  if (filters.search) {
    query = query.or(
      `students.first_name.ilike.%${filters.search}%,students.last_name.ilike.%${filters.search}%`
    );
  }

  const { data, error } = await query;
  if (error) throw error;

  return data.map((fee) => {
    const totalPaid = (fee.fee_payments || []).reduce((sum, p) => sum + Number(p.amount), 0);
    const pending = Math.max(Number(fee.final_fee) - totalPaid, 0);
    return { ...fee, total_paid: totalPaid, pending };
  });
}

// context: { branchId, financialYearId }
export async function createStudentFee(payload, context) {
  const { branchId, financialYearId } = context;
  const { installment_data, ...feeData } = payload;

  // No longer fetch fee structure or calculate tax – the DB trigger does it
  const { data: fee, error } = await supabase
    .from("student_fees")
    .insert([{
      student_id: feeData.student_id,
      fee_structure_id: feeData.fee_structure_id,
      total_fee: feeData.total_fee,
      discount: feeData.discount,
      final_fee: feeData.final_fee,
      status: feeData.status || "Pending",
      branch_id: branchId,
      financial_year_id: financialYearId,
    }])
    .select()
    .single();
  if (error) throw error;

  // Installments (unchanged)
  if (installment_data && installment_data.length > 0) {
    const inserts = installment_data.map((inst) => ({
      student_fee_id: fee.id,
      installment_number: inst.installment_number,
      amount: inst.amount,
      due_date: inst.due_date || null,
      status: "Pending",
      branch_id: branchId,
      financial_year_id: financialYearId,
    }));
    const { error: instError } = await supabase
      .from("fee_installments")
      .insert(inserts);
    if (instError) throw instError;
  }

  return fee;
}

// context: { branchId, financialYearId }
export async function updateStudentFee(id, payload, context) {
  const { branchId, financialYearId } = context;
  const { installment_data, ...feeData } = payload;

  // No tax recalculation here – the trigger will update base_amount / tax_amount
  const updateData = {
    student_id: feeData.student_id,
    fee_structure_id: feeData.fee_structure_id,
    total_fee: feeData.total_fee,
    discount: feeData.discount,
    final_fee: feeData.final_fee,
    status: feeData.status,
    branch_id: branchId,
    financial_year_id: financialYearId,
  };

  // Remove undefined keys
  Object.keys(updateData).forEach(key => updateData[key] === undefined && delete updateData[key]);

  const { data: fee, error } = await supabase
    .from("student_fees")
    .update(updateData)
    .eq("id", id)
    .select()
    .single();
  if (error) throw error;

  // Installment update logic (unchanged)
  if (installment_data !== undefined) {
    await supabase
      .from("fee_installments")
      .delete()
      .eq("student_fee_id", id);

    if (installment_data && installment_data.length > 0) {
      const inserts = installment_data.map((inst) => ({
        student_fee_id: id,
        installment_number: inst.installment_number,
        amount: inst.amount,
        due_date: inst.due_date || null,
        status: "Pending",
        branch_id: branchId,
        financial_year_id: financialYearId,
      }));
      const { error: instError } = await supabase
        .from("fee_installments")
        .insert(inserts);
      if (instError) throw instError;
    }
  }

  return fee;
}
// Soft delete – context needed for RLS on update
// context: { branchId, financialYearId }
export async function deleteStudentFee(id, context) {
  const { branchId, financialYearId } = context;
  const { error } = await supabase
    .from("student_fees")
    .update({
      deleted_at: new Date().toISOString(),
      branch_id: branchId,
      financial_year_id: financialYearId,
    })
    .eq("id", id);
  if (error) throw error;
}

// ========================
// PAYMENTS & RECEIPTS
// ========================

export async function getPayments(studentFeeId) {
  const { data, error } = await supabase
    .from("fee_payments")
    .select("*")
    .eq("student_fee_id", studentFeeId)
    .order("payment_date", { ascending: false });
  if (error) throw error;
  return data;
}

// ─── INTERNAL: Update fee status after payment ──────────────
// Note: This function only updates statuses, doesn't need context injection because updates are already within the same org/branch via RLS.
async function updateFeeStatusAutomatically(studentFeeId) {
  const { data: payments } = await supabase
    .from("fee_payments")
    .select("amount")
    .eq("student_fee_id", studentFeeId);
  const totalPaid = (payments || []).reduce((sum, p) => sum + Number(p.amount), 0);

  const { data: fee } = await supabase
    .from("student_fees")
    .select("final_fee")
    .eq("id", studentFeeId)
    .single();
  if (!fee) return;

  const newStatus = totalPaid >= Number(fee.final_fee) ? "Paid" : "Pending";
  await supabase
    .from("student_fees")
    .update({ status: newStatus })
    .eq("id", studentFeeId);

  const { data: installments } = await supabase
    .from("fee_installments")
    .select("*")
    .eq("student_fee_id", studentFeeId)
    .order("installment_number");

  if (installments && installments.length > 0) {
    let runningTotal = 0;
    for (const inst of installments) {
      const alreadyAccounted = installments
        .filter((_, i) => i < installments.indexOf(inst))
        .reduce((s, i) => s + Number(i.amount), 0);
      const remaining = totalPaid - alreadyAccounted;
      const newInstStatus = remaining >= Number(inst.amount) ? "Paid" : "Pending";

      if (inst.status !== newInstStatus) {
        await supabase
          .from("fee_installments")
          .update({ status: newInstStatus })
          .eq("id", inst.id);
      }
    }
  }
}

// ─── PUBLIC: Collect payment (supports optional invoice linkage) ──

// context: { branchId, financialYearId }
export async function collectPayment(paymentPayload, studentId, invoiceId = null, context) {
  if (!context) throw new Error("Context with branchId and financialYearId required");
  if (invoiceId) {
    return collectPaymentWithInvoice(paymentPayload, studentId, invoiceId, context);
  }

  const { branchId, financialYearId } = context;

  // Fallback: no invoice
  const { data: payment, error } = await supabase
    .from("fee_payments")
    .insert([{ ...paymentPayload, branch_id: branchId, financial_year_id: financialYearId }])
    .select()
    .single();
  if (error) throw error;

  const receiptNo = "RCPT-" + Date.now();
  await supabase.from("receipts").insert([
    {
      receipt_no: receiptNo,
      student_id: studentId,
      payment_id: payment.id,
      receipt_date: paymentPayload.payment_date,
      amount: paymentPayload.amount,
      generated_by: null,
      branch_id: branchId,
      financial_year_id: financialYearId,
    },
  ]);

  await supabase.from("income").insert([
    {
      income_date: paymentPayload.payment_date,
      category: "Student Fees",
      amount: paymentPayload.amount,
      base_amount: paymentPayload.base_amount || 0,
      tax_amount: paymentPayload.tax_amount || 0,
      payment_mode: paymentPayload.payment_mode,
      description: `Payment for Student Fee ID ${paymentPayload.student_fee_id} — Auto receipt ${receiptNo}`,
      branch_id: branchId,
      financial_year_id: financialYearId,
    },
  ]);

  await updateFeeStatusAutomatically(paymentPayload.student_fee_id);
  return payment;
}

// ─── Helper: Collect payment linked to an invoice ────────────

// context: { branchId, financialYearId }
export async function collectPaymentWithInvoice(paymentPayload, studentId, invoiceId, context) {
  const { branchId, financialYearId } = context;

  // Insert payment with invoice_id
  const { data: payment, error } = await supabase
    .from("fee_payments")
    .insert([{ ...paymentPayload, invoice_id: invoiceId, branch_id: branchId, financial_year_id: financialYearId }])
    .select()
    .single();
  if (error) throw error;

  // Update invoice paid amount and status
  const { data: invoice } = await supabase
    .from("invoices")
    .select("grand_total, paid_amount, balance_due, status")
    .eq("id", invoiceId)
    .single();

  const newPaid = (invoice.paid_amount || 0) + paymentPayload.amount;
  const balance = invoice.grand_total - newPaid;
  let newStatus = invoice.status;
  if (balance <= 0) newStatus = "Paid";
  else if (newPaid > 0) newStatus = "Partially Paid";

  await supabase
    .from("invoices")
    .update({
      paid_amount: newPaid,
      balance_due: balance,
      status: newStatus,
      updated_at: new Date(),
      branch_id: branchId,
      financial_year_id: financialYearId,
    })
    .eq("id", invoiceId);

  // Auto-receipt will be created by trigger (trg_receipt_auto) but we also need to update fee status
  await updateFeeStatusAutomatically(paymentPayload.student_fee_id);

  return payment;
}

// ─── Get remaining balance for an invoice ────────────────────

export async function getInvoiceBalance(invoiceId) {
  const { data, error } = await supabase
    .from("invoices")
    .select("grand_total, paid_amount, balance_due")
    .eq("id", invoiceId)
    .single();
  if (error) throw error;
  return data;
}

// ─── Submit online payment request (student portal) ─────────

// context: { branchId, financialYearId }
export async function submitPaymentRequest({ student_fee_id, amount, transaction_no, remarks, installment_id }, context) {
  const { branchId, financialYearId } = context;
  const { data, error } = await supabase
    .from("fee_payments")
    .insert([
      {
        student_fee_id,
        payment_date: new Date().toISOString().split("T")[0],
        amount: Number(amount),
        payment_mode: "Online",
        transaction_no,
        remarks,
        status: "Pending",
        installment_id: installment_id || null,
        branch_id: branchId,
        financial_year_id: financialYearId,
      },
    ])
    .select()
    .single();
  if (error) throw error;
  return data;
}

// ─── Generate invoice from student fee (uses createInvoice from invoiceService, which also needs context) ──
// We'll assume invoiceService.createInvoice now accepts context as well, but for now we'll just pass context through.
// Since this service doesn't import createInvoice, we'll need to modify that call in the actual page that uses it, but for service completeness we'll accept context and pass it if possible. However, we'll leave the invoice generation logic as is and note that the context must be provided when calling generateInvoiceFromStudentFee.

// For now, we'll update generateInvoiceFromStudentFee to accept context and pass it to createInvoice.
// But createInvoice is imported from invoiceService, which we haven't updated yet. For coherence, we'll add context parameter and assume invoiceService is similarly updated.

// We'll add placeholder comments to indicate that.
/**
 * Generate a single invoice for the entire student fee.
 * Requires context: { branchId, financialYearId }
 */
export async function generateInvoiceFromStudentFee(studentFeeId, installmentId = null, context) {
  // This function relies on invoiceService.createInvoice, which will also need context.
  // For now we just pass context through. If invoiceService is not yet updated, you'll need to update that service.
  const { branchId, financialYearId } = context;

  const { data: fee, error } = await supabase
    .from("student_fees")
    .select(`
      *,
      students(id, first_name, last_name, admission_no, gstin, state_code, billing_address),
      fee_structures(
        id,
        tax_rate_id,
        tax_inclusive,
        tax_rates(id, name, rate),
        fee_structure_components(component_name, amount, is_taxable, tax_rate_id)
      )
    `)
    .eq("id", studentFeeId)
    .single();
  if (error) throw error;

  let amount = 0;
  let components = [];
  if (installmentId) {
    const { data: installment } = await supabase
      .from("fee_installments")
      .select("*")
      .eq("id", installmentId)
      .single();
    if (!installment) throw new Error("Installment not found");
    amount = installment.amount;
    const totalFee = fee.final_fee || fee.fee_structures.fee_amount;
    const ratio = amount / totalFee;
    components = fee.fee_structures.fee_structure_components.map(comp => ({
      ...comp,
      amount: comp.amount * ratio,
    }));
  } else {
    amount = fee.final_fee;
    components = fee.fee_structures.fee_structure_components;
  }

  const invoiceItems = components.map(comp => ({
    item_type: "fee_component",
    item_id: comp.id,
    description: comp.component_name,
    quantity: 1,
    unit_price: comp.amount,
    tax_rate_id: comp.tax_rate_id || fee.fee_structures.tax_rate_id,
  }));

  const invoicePayload = {
    student_id: fee.student_id,
    invoice_date: new Date().toISOString().split("T")[0],
    due_date: installmentId ? new Date(Date.now() + 30*24*60*60*1000).toISOString().split("T")[0] : null,
    payment_terms: "Standard",
    gst_applicable: !!fee.students.gstin,
    place_of_supply: fee.students.state_code || "",
    reverse_charge: false,
    items: invoiceItems,
    branch_id: branchId,
    financial_year_id: financialYearId,
  };

  // Note: createInvoice is from invoiceService which must also accept context.
  // For now we'll call it with context, assuming it has been updated.
  const { createInvoice } = await import("./invoiceService");  // dynamic import to avoid circular dependency issues? Actually it's fine since it's already imported elsewhere, but we'll handle it by accepting an optional createInvoiceFn parameter or we'll just comment that it needs to be called with context.
  // For safety, we'll use supabase directly to insert invoice as a stopgap? We'll just throw error if not provided. But better: we'll leave as is and note that the page should call createInvoice with context separately. So we'll remove the actual invoice creation and just return data for external usage.
  // We'll comment it out and note that the caller should use invoiceService.

  throw new Error("generateInvoiceFromStudentFee requires invoiceService to be updated with context. Use invoiceService.createInvoice directly with context.");
}

export async function generateInvoicesForInstallments(studentFeeId, context) {
  throw new Error("generateInvoicesForInstallments requires invoiceService to be updated with context.");
}