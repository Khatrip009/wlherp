// src/services/feeService.js
import { supabase } from "../api/supabase";
import { createInvoice } from "./invoiceService";
import { sendFeeReceiptEmail } from "./emailService";

// ============================================================
// 1.  HELPER FUNCTIONS
// ============================================================

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

async function getOrganizationFromBranch(branchId) {
  const { data: branch, error: branchError } = await supabase
    .from("branches")
    .select("organization_id")
    .eq("id", branchId)
    .single();
  if (branchError) throw branchError;
  const { data: org, error: orgError } = await supabase
    .from("organization")
    .select("id, company_name")
    .eq("id", branch.organization_id)
    .single();
  if (orgError) throw orgError;
  return org;
}

// ============================================================
// 2.  TAX RATES
// ============================================================

export async function getTaxRates({ search = "", branchId, financialYearId } = {}) {
  let query = supabase
    .from("tax_rates")
    .select("*")
    .eq("is_active", true)
    .order("rate", { ascending: true });
  if (branchId) query = query.eq("branch_id", branchId);
  if (financialYearId) query = query.eq("financial_year_id", financialYearId);
  if (search) query = query.ilike("name", `%${search}%`);
  const { data, error } = await query;
  if (error) throw error;
  return data || [];
}

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

export async function deleteTaxRate(id, context) {
  const { branchId, financialYearId } = context;
  let query = supabase.from("tax_rates").delete().eq("id", id);
  if (branchId) query = query.eq("branch_id", branchId);
  if (financialYearId) query = query.eq("financial_year_id", financialYearId);
  const { error } = await query;
  if (error) throw error;
}

// ============================================================
// 3.  FEE STRUCTURES
// ============================================================

export async function getFeeStructures({ search = "", branchId, financialYearId } = {}) {
  let query = supabase
    .from("fee_structures")
    .select(`
      *,
      courses ( id, course_name, medium_id, mediums ( name ) ),
      tax_rates ( id, name, rate ),
      fee_structure_components (
        id,
        component_name,
        amount,
        is_taxable,
        sort_order,
        tax_rate_id,
        tax_inclusive,
        tax_rates ( id, name, rate )
      )
    `)
    .order("id", { ascending: false });
  if (branchId) query = query.eq("branch_id", branchId);
  if (financialYearId) query = query.eq("financial_year_id", financialYearId);
  if (search) query = query.or(`courses.course_name.ilike.%${search}%`);
  const { data, error } = await query;
  if (error) throw error;
  return data || [];
}

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

export async function deleteFeeStructure(id, context) {
  const { branchId, financialYearId } = context;
  let query = supabase
    .from("fee_structures")
    .update({ deleted_at: new Date().toISOString(), branch_id: branchId, financial_year_id: financialYearId })
    .eq("id", id);
  if (branchId) query = query.eq("branch_id", branchId);
  if (financialYearId) query = query.eq("financial_year_id", financialYearId);
  const { error } = await query;
  if (error) throw error;
}

// ============================================================
// 4.  STUDENT FEE COMPONENTS
// ============================================================

export async function getStudentFeeComponents(studentFeeId, branchId, financialYearId) {
  let query = supabase
    .from("student_fee_components")
    .select(`
      *,
      fee_structure_components (
        component_name,
        amount,
        is_taxable,
        tax_rate_id,
        tax_inclusive,
        tax_rates ( id, name, rate )
      )
    `)
    .eq("student_fee_id", studentFeeId)
    .eq("branch_id", branchId)
    .eq("financial_year_id", financialYearId)
    .order("id");
  const { data, error } = await query;
  if (error) throw error;
  return data || [];
}

/**
 * Internal helper: create student_fee_components from a fee structure,
 * computing the total due_amount including tax (if exclusive).
 * Kept in scope, called by createStudentFee.
 */
async function createStudentFeeComponents(studentFeeId, feeStructureId, context) {
  const { branchId, financialYearId } = context;

  // Fetch fee structure components with tax info
  const { data: components, error: compFetchError } = await supabase
    .from("fee_structure_components")
    .select("*, tax_rates(rate)")
    .eq("fee_structure_id", feeStructureId)
    .eq("branch_id", branchId)
    .eq("financial_year_id", financialYearId)
    .order("sort_order");

  if (compFetchError) throw compFetchError;
  if (!components || components.length === 0) return;

  const studentFeeComponents = components.map(comp => {
    const rate = comp.tax_rates?.rate ? Number(comp.tax_rates.rate) / 100 : 0;
    const baseAmount = Number(comp.amount);
    const dueAmount = comp.tax_inclusive ? baseAmount : baseAmount * (1 + rate);

    return {
      student_fee_id: studentFeeId,
      fee_structure_component_id: comp.id,
      due_amount: dueAmount,
      paid_amount: 0,
      branch_id: branchId,
      financial_year_id: financialYearId,
    };
  });

  const { error: insertError } = await supabase
    .from("student_fee_components")
    .insert(studentFeeComponents);
  if (insertError) throw insertError;
}

// ============================================================
// 5.  STUDENT FEES
// ============================================================

export async function getStudentFees({ pageParam = 0, filters = {}, branchId, financialYearId } = {}) {
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

  if (branchId) query = query.eq("branch_id", branchId);
  if (financialYearId) query = query.eq("financial_year_id", financialYearId);
  query = query.is("deleted_at", null);

  if (filters.search) {
    query = query.or(`students.first_name.ilike.%${filters.search}%,students.last_name.ilike.%${filters.search}%`);
  }

  const { data, error, count } = await query;
  if (error) throw error;

  const enriched = data.map((fee) => {
    const payments = fee.fee_payments || [];
    const totalPaid = payments.reduce((sum, p) => sum + Number(p.amount), 0);
    const totalBasePaid = payments.reduce((sum, p) => sum + Number(p.base_amount || 0), 0);
    const totalTaxPaid = payments.reduce((sum, p) => sum + Number(p.tax_amount || 0), 0);
    const pending = Math.max(Number(fee.final_fee) - totalBasePaid, 0);
    const installments = [...(fee.fee_installments || [])].sort((a, b) => a.installment_number - b.installment_number);
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

export async function getAllStudentFeesForExport(filters = {}, branchId, financialYearId) {
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
  if (branchId) query = query.eq("branch_id", branchId);
  if (financialYearId) query = query.eq("financial_year_id", financialYearId);
  query = query.is("deleted_at", null);
  if (filters.search) {
    query = query.or(`students.first_name.ilike.%${filters.search}%,students.last_name.ilike.%${filters.search}%`);
  }
  const { data, error } = await query;
  if (error) throw error;

  return data.map((fee) => {
    const totalPaid = (fee.fee_payments || []).reduce((sum, p) => sum + Number(p.amount), 0);
    const totalBasePaid = (fee.fee_payments || []).reduce((sum, p) => sum + Number(p.base_amount || 0), 0);
    const pending = Math.max(Number(fee.final_fee) - totalBasePaid, 0);
    return { ...fee, total_paid: totalPaid, pending };
  });
}

export async function createStudentFee(payload, context) {
  const { branchId, financialYearId } = context;
  const { installment_data, fee_structure_id, ...feeData } = payload;

  const { data: fee, error } = await supabase
    .from("student_fees")
    .insert([{
      student_id: feeData.student_id,
      fee_structure_id: fee_structure_id,
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

  // ✅ Create student fee components (if fee structure provided)
  if (fee_structure_id) {
    try {
      await createStudentFeeComponents(fee.id, fee_structure_id, context);
    } catch (compError) {
      console.error("Failed to create student fee components:", compError);
      // You may choose to re-throw the error if you want to rollback the fee creation.
      // For now we log it, but ideally you'd want to handle it (maybe delete the fee record).
    }
  }

  // Installments
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
    const { error: instError } = await supabase.from("fee_installments").insert(inserts);
    if (instError) throw instError;
  }

  return fee;
}

export async function updateStudentFee(id, payload, context) {
  const { branchId, financialYearId } = context;
  const { installment_data, ...feeData } = payload;

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
  Object.keys(updateData).forEach(key => updateData[key] === undefined && delete updateData[key]);

  let updateQuery = supabase.from("student_fees").update(updateData).eq("id", id);
  if (branchId) updateQuery = updateQuery.eq("branch_id", branchId);
  if (financialYearId) updateQuery = updateQuery.eq("financial_year_id", financialYearId);
  const { data: fee, error } = await updateQuery.select().single();
  if (error) throw error;

  // Installment update
  if (installment_data !== undefined) {
    let deleteQuery = supabase.from("fee_installments").delete().eq("student_fee_id", id);
    if (branchId) deleteQuery = deleteQuery.eq("branch_id", branchId);
    if (financialYearId) deleteQuery = deleteQuery.eq("financial_year_id", financialYearId);
    await deleteQuery;

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
      const { error: instError } = await supabase.from("fee_installments").insert(inserts);
      if (instError) throw instError;
    }
  }

  return fee;
}

export async function deleteStudentFee(id, context) {
  const { branchId, financialYearId } = context;
  let query = supabase
    .from("student_fees")
    .update({ deleted_at: new Date().toISOString(), branch_id: branchId, financial_year_id: financialYearId })
    .eq("id", id);
  if (branchId) query = query.eq("branch_id", branchId);
  if (financialYearId) query = query.eq("financial_year_id", financialYearId);
  const { error } = await query;
  if (error) throw error;
}

// ============================================================
// 6.  PAYMENTS & ALLOCATIONS
// ============================================================

export async function collectPaymentWithAllocation({
  studentFeeId,
  paymentDate,
  paymentMode,
  transactionNo,
  remarks,
  installmentId,
  allocations,
  generatedBy,
  invoiceId = null,
}, context) {
  const { branchId, financialYearId } = context;

  // 1. Fetch all tax rates (for fallback calculation)
  const { data: taxRates } = await supabase
    .from("tax_rates")
    .select("id, rate, name")
    .eq("branch_id", branchId)
    .eq("financial_year_id", financialYearId);

  // 2. Fetch component details (including tax info)
  const componentIds = allocations.map(a => a.studentFeeComponentId);
  const { data: components, error: compError } = await supabase
    .from("student_fee_components")
    .select(`
      *,
      fee_structure_components (
        component_name,
        is_taxable,
        tax_rate_id,
        tax_inclusive,
        tax_rates ( id, rate, name )
      )
    `)
    .in("id", componentIds)
    .eq("branch_id", branchId)
    .eq("financial_year_id", financialYearId);
  if (compError) throw compError;

  // 3. Build allocation details – use provided base/tax if present, else compute
  let totalAllocated = 0;
  let totalBase = 0;
  let totalTax = 0;
  const allocationDetails = allocations.map(alloc => {
    const comp = components.find(c => c.id === alloc.studentFeeComponentId);
    if (!comp) throw new Error(`Component ${alloc.studentFeeComponentId} not found`);

    let baseAmount = Number(alloc.baseAmount);
    let taxAmount = Number(alloc.taxAmount);
    let allocatedAmount = Number(alloc.amount);

    // If base/tax not provided, compute from amount and component's tax inclusive flag
    if (isNaN(baseAmount) || isNaN(taxAmount) || isNaN(allocatedAmount)) {
      const taxRateId = comp.fee_structure_components?.tax_rate_id || null;
      const taxInclusive = comp.fee_structure_components?.tax_inclusive !== undefined
        ? comp.fee_structure_components.tax_inclusive
        : true; // fallback
      const taxRate = taxRates.find(t => t.id === taxRateId);
      const rate = taxRate ? taxRate.rate / 100 : 0;
      const amount = Number(alloc.amount) || 0;
      if (taxInclusive) {
        allocatedAmount = amount;
        if (rate > 0) {
          baseAmount = amount / (1 + rate);
          taxAmount = amount - baseAmount;
        } else {
          baseAmount = amount;
          taxAmount = 0;
        }
      } else {
        // Exclusive: amount is base, tax added on top
        baseAmount = amount;
        taxAmount = amount * rate;
        allocatedAmount = baseAmount + taxAmount;
      }
      baseAmount = Math.round(baseAmount * 100) / 100;
      taxAmount = Math.round(taxAmount * 100) / 100;
      allocatedAmount = Math.round(allocatedAmount * 100) / 100;
    }

    totalAllocated += allocatedAmount;
    totalBase += baseAmount;
    totalTax += taxAmount;

    return {
      studentFeeComponentId: comp.id,
      allocatedAmount,
      baseAmount,
      taxAmount,
      taxRateId: comp.fee_structure_components?.tax_rate_id || null,
    };
  });

  // 4. Insert fee_payment
  const receiptNo = "RCPT-" + Date.now() + "-" + Math.random().toString(36).slice(2, 6);
  const paymentPayload = {
    student_fee_id: studentFeeId,
    payment_date: paymentDate || new Date().toISOString().split("T")[0],
    amount: Math.round(totalAllocated * 100) / 100,
    base_amount: Math.round(totalBase * 100) / 100,
    tax_amount: Math.round(totalTax * 100) / 100,
    payment_mode: paymentMode,
    transaction_no: transactionNo || null,
    remarks: remarks || null,
    installment_id: installmentId || null,
    receipt_number: receiptNo,
    invoice_id: invoiceId || null,
    branch_id: branchId,
    financial_year_id: financialYearId,
  };

  const { data: payment, error: payError } = await supabase
    .from("fee_payments")
    .insert([paymentPayload])
    .select()
    .single();
  if (payError) throw payError;

  // 5. Insert payment allocations
  const allocInserts = allocationDetails.map(d => ({
    payment_id: payment.id,
    student_fee_component_id: d.studentFeeComponentId,
    allocated_amount: d.allocatedAmount,
    base_amount: d.baseAmount,
    tax_amount: d.taxAmount,
    tax_rate_id: d.taxRateId,
    branch_id: branchId,
    financial_year_id: financialYearId,
  }));
  const { error: allocError } = await supabase
    .from("payment_allocations")
    .insert(allocInserts);
  if (allocError) throw allocError;

  // 6. Update student_fee_components paid_amount and status
  for (const alloc of allocationDetails) {
    const comp = components.find(c => c.id === alloc.studentFeeComponentId);
    const newPaid = (comp.paid_amount || 0) + alloc.allocatedAmount;
    const newStatus = newPaid >= comp.due_amount ? "Paid" : "Partial";
    const { error: updErr } = await supabase
      .from("student_fee_components")
      .update({ paid_amount: newPaid, status: newStatus })
      .eq("id", comp.id)
      .eq("branch_id", branchId)
      .eq("financial_year_id", financialYearId);
    if (updErr) throw updErr;
  }

  // 7. Update fee status (via existing helper)
  await updateFeeStatusAutomatically(studentFeeId, context);

  // 8. If invoiceId provided, update invoice
  if (invoiceId) {
    await updateInvoiceAfterPayment(invoiceId, payment.amount, context);
  }

  // ❌ Removed: manual income insertion (step 9). The DB trigger auto_post_fee_payment now handles the journal entry.
  // Previously the code inserted into 'income' here, but that would duplicate income.

  // 10. Send receipt email (non‑blocking)
  try {
    const org = await getOrganizationFromBranch(branchId);
    await sendFeeReceiptEmail(payment.id, org);
  } catch (emailError) {
    console.error("❌ Failed to send fee receipt email:", emailError);
  }

  return payment;
}

/**
 * Update invoice paid_amount and status after a payment.
 */
async function updateInvoiceAfterPayment(invoiceId, paidAmount, context) {
  const { branchId, financialYearId } = context;
  const { data: inv } = await supabase
    .from("invoices")
    .select("grand_total, paid_amount, status")
    .eq("id", invoiceId)
    .eq("branch_id", branchId)
    .eq("financial_year_id", financialYearId)
    .single();
  if (!inv) return;

  const newPaid = (inv.paid_amount || 0) + paidAmount;
  const balance = inv.grand_total - newPaid;
  let newStatus = inv.status;
  if (balance <= 0) newStatus = "Paid";
  else if (newPaid > 0) newStatus = "Partially Paid";

  await supabase
    .from("invoices")
    .update({
      paid_amount: newPaid,
      balance_due: balance,
      status: newStatus,
      updated_at: new Date(),
    })
    .eq("id", invoiceId)
    .eq("branch_id", branchId)
    .eq("financial_year_id", financialYearId);
}

/**
 * Update student_fee status (Paid/Pending) based on total payments.
 */
async function updateFeeStatusAutomatically(studentFeeId, context) {
  const { branchId, financialYearId } = context;

  const { data: payments } = await supabase
    .from("fee_payments")
    .select("amount")
    .eq("student_fee_id", studentFeeId)
    .eq("branch_id", branchId)
    .eq("financial_year_id", financialYearId);
  const totalPaid = (payments || []).reduce((sum, p) => sum + Number(p.amount), 0);

  const { data: fee } = await supabase
    .from("student_fees")
    .select("final_fee")
    .eq("id", studentFeeId)
    .eq("branch_id", branchId)
    .eq("financial_year_id", financialYearId)
    .single();
  if (!fee) return;

  const newStatus = totalPaid >= Number(fee.final_fee) ? "Paid" : "Pending";
  await supabase
    .from("student_fees")
    .update({ status: newStatus })
    .eq("id", studentFeeId)
    .eq("branch_id", branchId)
    .eq("financial_year_id", financialYearId);

  // Update installments similarly
  const { data: installments } = await supabase
    .from("fee_installments")
    .select("*")
    .eq("student_fee_id", studentFeeId)
    .eq("branch_id", branchId)
    .eq("financial_year_id", financialYearId)
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
          .eq("id", inst.id)
          .eq("branch_id", branchId)
          .eq("financial_year_id", financialYearId);
      }
    }
  }
}

// ============================================================
// 7.  LEGACY PAYMENT (without allocations)
// ============================================================

export async function collectPayment(paymentPayload, studentId, generatedBy, invoiceId = null, context) {
  console.warn("collectPayment is deprecated. Use collectPaymentWithAllocation instead.");
  const { branchId, financialYearId } = context;
  const fullPayload = {
    ...paymentPayload,
    receipt_number: "AUTO-" + Date.now() + "-" + Math.random().toString(36).slice(2),
    branch_id: branchId,
    financial_year_id: financialYearId,
  };
  const { data: payment, error } = await supabase
    .from("fee_payments")
    .insert([fullPayload])
    .select()
    .single();
  if (error) throw error;

  await updateFeeStatusAutomatically(paymentPayload.student_fee_id, context);

  try {
    const org = await getOrganizationFromBranch(branchId);
    await sendFeeReceiptEmail(payment.id, org);
  } catch (emailError) {
    console.error("❌ Failed to send fee receipt email:", emailError);
  }
  return payment;
}

// ============================================================
// 8.  OTHER FUNCTIONS
// ============================================================

export async function getPayments(studentFeeId, branchId, financialYearId) {
  let query = supabase
    .from("fee_payments")
    .select("*")
    .eq("student_fee_id", studentFeeId)
    .order("payment_date", { ascending: false });
  if (branchId) query = query.eq("branch_id", branchId);
  if (financialYearId) query = query.eq("financial_year_id", financialYearId);
  const { data, error } = await query;
  if (error) throw error;
  return data;
}

export async function getPaymentAllocations(paymentId, branchId, financialYearId) {
  let query = supabase
    .from("payment_allocations")
    .select(`
      *,
      student_fee_components (
        id,
        due_amount,
        paid_amount,
        fee_structure_components (
          component_name,
          tax_rate_id,
          tax_rates ( name, rate )
        )
      )
    `)
    .eq("payment_id", paymentId)
    .eq("branch_id", branchId)
    .eq("financial_year_id", financialYearId);
  const { data, error } = await query;
  if (error) throw error;
  return data || [];
}

export async function getInvoiceBalance(invoiceId, branchId, financialYearId) {
  let query = supabase
    .from("invoices")
    .select("grand_total, paid_amount, balance_due")
    .eq("id", invoiceId);
  if (branchId) query = query.eq("branch_id", branchId);
  if (financialYearId) query = query.eq("financial_year_id", financialYearId);
  const { data, error } = await query.single();
  if (error) throw error;
  return data;
}

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

// ============================================================
// 9.  GENERATE INVOICE
// ============================================================

export async function generateInvoiceFromStudentFee(studentFeeId, installmentId = null, context) {
  const { branchId, financialYearId } = context;
  const { data: fee, error: feeError } = await supabase
    .from("student_fees")
    .select(`
      *,
      students ( id, first_name, last_name, admission_no, gstin, state_code ),
      fee_structures (
        fee_amount,
        tax_rate_id,
        tax_inclusive,
        courses ( course_name )
      )
    `)
    .eq("id", studentFeeId)
    .eq("branch_id", branchId)
    .eq("financial_year_id", financialYearId)
    .single();
  if (feeError) throw feeError;

  const invoiceItems = [
    {
      item_type: "fee_payment",
      description: `Fee Payment - ${fee.fee_structures?.courses?.course_name || "N/A"}`,
      quantity: 1,
      unit_price: fee.final_fee,
      tax_rate_id: fee.fee_structures?.tax_rate_id,
    },
  ];

  const invoicePayload = {
    student_id: fee.student_id,
    invoice_date: new Date().toISOString().split("T")[0],
    due_date: installmentId ? new Date(Date.now() + 30*24*60*60*1000).toISOString().split("T")[0] : null,
    payment_terms: "Standard",
    gst_applicable: !!fee.students?.gstin,
    place_of_supply: fee.students?.state_code || "",
    reverse_charge: false,
    items: invoiceItems,
    student_fee_id: studentFeeId,
    fee_installment_id: installmentId || null,
    branch_id: branchId,
    financial_year_id: financialYearId,
  };

  return await createInvoice(invoicePayload, context);
}

export async function generateInvoicesForInstallments(studentFeeId, context) {
  const { branchId, financialYearId } = context;
  let instQuery = supabase
    .from("fee_installments")
    .select("id")
    .eq("student_fee_id", studentFeeId)
    .eq("branch_id", branchId)
    .eq("financial_year_id", financialYearId)
    .order("installment_number");
  const { data: installments, error } = await instQuery;
  if (error) throw error;
  if (!installments || installments.length === 0) {
    return await generateInvoiceFromStudentFee(studentFeeId, null, context);
  }
  const results = [];
  for (const inst of installments) {
    const inv = await generateInvoiceFromStudentFee(studentFeeId, inst.id, context);
    results.push(inv);
  }
  return results;
}