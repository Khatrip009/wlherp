// src/services/feeService.js
import { supabase } from "../api/supabase";
import { createInvoice } from "./invoiceService";
import { sendFeeReceiptEmail } from "./emailService"; // 👈 Added

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

/**
 * Fetch organization details from a branch ID.
 */
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

// ========================
// TAX RATES
// ========================

export async function getTaxRates({ search = "", branchId, financialYearId } = {}) {
  let query = supabase
    .from("tax_rates")
    .select("*")
    .eq("is_active", true)
    .order("rate", { ascending: true });

  if (branchId) query = query.eq("branch_id", branchId);
  if (financialYearId) query = query.eq("financial_year_id", financialYearId);

  if (search) {
    query = query.ilike("name", `%${search}%`);
  }

  const { data, error } = await query;
  if (error) throw error;
  return data || [];
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

// Hard delete – scoped to prevent cross‑branch deletion
export async function deleteTaxRate(id, context) {
  const { branchId, financialYearId } = context;
  let query = supabase
    .from("tax_rates")
    .delete()
    .eq("id", id);
  if (branchId) query = query.eq("branch_id", branchId);
  if (financialYearId) query = query.eq("financial_year_id", financialYearId);
  const { error } = await query;
  if (error) throw error;
}

// ========================
// FEE STRUCTURES
// ========================

export async function getFeeStructures({ search = "", branchId, financialYearId } = {}) {
  let query = supabase
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
      ),
      fee_structure_components (
        id,
        component_name,
        amount,
        is_taxable,
        sort_order,
        tax_rate_id
      )
    `)
    .order("id", { ascending: false });

  if (branchId) query = query.eq("branch_id", branchId);
  if (financialYearId) query = query.eq("financial_year_id", financialYearId);

  if (search) {
    query = query.or(`courses.course_name.ilike.%${search}%`);
  }

  const { data, error } = await query;
  if (error) throw error;
  return data || [];
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

// Soft delete – scoped to prevent cross‑branch deletion
// context: { branchId, financialYearId }
export async function deleteFeeStructure(id, context) {
  const { branchId, financialYearId } = context;

  let query = supabase
    .from("fee_structures")
    .update({
      deleted_at: new Date().toISOString(),
      branch_id: branchId,
      financial_year_id: financialYearId,
    })
    .eq("id", id);

  if (branchId) query = query.eq("branch_id", branchId);
  if (financialYearId) query = query.eq("financial_year_id", financialYearId);

  const { error } = await query;
  if (error) throw error;
}

// ========================
// STUDENT FEES (with tax AND course)
// ========================

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

  // Scoping
  if (branchId) query = query.eq("branch_id", branchId);
  if (financialYearId) query = query.eq("financial_year_id", financialYearId);

  // ── EXCLUDE SOFT‑DELETED RECORDS ──
  query = query.is("deleted_at", null);

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

  // Scoping
  if (branchId) query = query.eq("branch_id", branchId);
  if (financialYearId) query = query.eq("financial_year_id", financialYearId);

  // ── EXCLUDE SOFT‑DELETED RECORDS ──
  query = query.is("deleted_at", null);

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

  let updateQuery = supabase
    .from("student_fees")
    .update(updateData)
    .eq("id", id);

  if (branchId) updateQuery = updateQuery.eq("branch_id", branchId);
  if (financialYearId) updateQuery = updateQuery.eq("financial_year_id", financialYearId);

  const { data: fee, error } = await updateQuery.select().single();
  if (error) throw error;

  // Installment update: delete old (scoped) then insert new
  if (installment_data !== undefined) {
    let deleteQuery = supabase
      .from("fee_installments")
      .delete()
      .eq("student_fee_id", id);

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
      const { error: instError } = await supabase
        .from("fee_installments")
        .insert(inserts);
      if (instError) throw instError;
    }
  }

  return fee;
}

// Soft delete – scoped
// context: { branchId, financialYearId }
export async function deleteStudentFee(id, context) {
  const { branchId, financialYearId } = context;

  let query = supabase
    .from("student_fees")
    .update({
      deleted_at: new Date().toISOString(),
      branch_id: branchId,
      financial_year_id: financialYearId,
    })
    .eq("id", id);

  if (branchId) query = query.eq("branch_id", branchId);
  if (financialYearId) query = query.eq("financial_year_id", financialYearId);

  const { error } = await query;
  if (error) throw error;
}

// ========================
// PAYMENTS & RECEIPTS
// ========================

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

// ─── INTERNAL: Update fee status after payment (now scoped) ──
async function updateFeeStatusAutomatically(studentFeeId, context) {
  const { branchId, financialYearId } = context;

  let paymentsQuery = supabase
    .from("fee_payments")
    .select("amount")
    .eq("student_fee_id", studentFeeId);

  if (branchId) paymentsQuery = paymentsQuery.eq("branch_id", branchId);
  if (financialYearId) paymentsQuery = paymentsQuery.eq("financial_year_id", financialYearId);

  const { data: payments } = await paymentsQuery;
  const totalPaid = (payments || []).reduce((sum, p) => sum + Number(p.amount), 0);

  let feeQuery = supabase
    .from("student_fees")
    .select("final_fee")
    .eq("id", studentFeeId);

  if (branchId) feeQuery = feeQuery.eq("branch_id", branchId);
  if (financialYearId) feeQuery = feeQuery.eq("financial_year_id", financialYearId);

  const { data: fee } = await feeQuery.single();
  if (!fee) return;

  const newStatus = totalPaid >= Number(fee.final_fee) ? "Paid" : "Pending";

  let updateQuery = supabase
    .from("student_fees")
    .update({ status: newStatus })
    .eq("id", studentFeeId);

  if (branchId) updateQuery = updateQuery.eq("branch_id", branchId);
  if (financialYearId) updateQuery = updateQuery.eq("financial_year_id", financialYearId);

  await updateQuery;

  let instQuery = supabase
    .from("fee_installments")
    .select("*")
    .eq("student_fee_id", studentFeeId)
    .order("installment_number");

  if (branchId) instQuery = instQuery.eq("branch_id", branchId);
  if (financialYearId) instQuery = instQuery.eq("financial_year_id", financialYearId);

  const { data: installments } = await instQuery;

  if (installments && installments.length > 0) {
    let runningTotal = 0;
    for (const inst of installments) {
      const alreadyAccounted = installments
        .filter((_, i) => i < installments.indexOf(inst))
        .reduce((s, i) => s + Number(i.amount), 0);
      const remaining = totalPaid - alreadyAccounted;
      const newInstStatus = remaining >= Number(inst.amount) ? "Paid" : "Pending";

      if (inst.status !== newInstStatus) {
        let instUpdateQuery = supabase
          .from("fee_installments")
          .update({ status: newInstStatus })
          .eq("id", inst.id);

        if (branchId) instUpdateQuery = instUpdateQuery.eq("branch_id", branchId);
        if (financialYearId) instUpdateQuery = instUpdateQuery.eq("financial_year_id", financialYearId);

        await instUpdateQuery;
      }
    }
  }
}

// ─── PUBLIC: Collect payment (supports optional invoice linkage) ──
// context: { branchId, financialYearId }
export async function collectPayment(paymentPayload, studentId, generatedBy, invoiceId = null, context) {
  if (!context) throw new Error("Context with branchId and financialYearId required");
  const { branchId, financialYearId } = context;

  // Unique placeholder – avoids the trigger (which only fires when receipt_number IS NULL)
  // and prevents duplicate‑key errors.
  const fullPaymentPayload = {
    ...paymentPayload,
    receipt_number: "AUTO-" + Date.now() + "-" + Math.random().toString(36).slice(2),
    branch_id: branchId,
    financial_year_id: financialYearId,
  };

  if (invoiceId) {
    return collectPaymentWithInvoice(fullPaymentPayload, studentId, generatedBy, invoiceId, context);
  }

  // 1. Insert payment
  const { data: payment, error } = await supabase
    .from("fee_payments")
    .insert([fullPaymentPayload])
    .select()
    .single();
  if (error) throw error;

  // 2. Create receipt manually (with correct generated_by)
  const receiptNo = "RCPT-" + Date.now();
  await supabase.from("receipts").insert([
    {
      receipt_no: receiptNo,
      student_id: studentId,
      payment_id: payment.id,
      receipt_date: paymentPayload.payment_date,
      amount: paymentPayload.amount,
      generated_by: generatedBy,
      branch_id: branchId,
      financial_year_id: financialYearId,
    },
  ]);

  // 3. Insert income – NO generated_by (the column doesn’t exist)
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

  await updateFeeStatusAutomatically(paymentPayload.student_fee_id, context);

  // ─── Send fee receipt email ───────────────────────────────────
  try {
    const org = await getOrganizationFromBranch(branchId);
    await sendFeeReceiptEmail(payment.id, org);
  } catch (emailError) {
    console.error("❌ Failed to send fee receipt email:", emailError);
  }

  return payment;
}

export async function collectPaymentWithInvoice(paymentPayload, studentId, generatedBy, invoiceId, context) {
  const { branchId, financialYearId } = context;

  const fullPaymentPayload = {
    ...paymentPayload,
    receipt_number: "AUTO-" + Date.now() + "-" + Math.random().toString(36).slice(2),
    invoice_id: invoiceId,
    branch_id: branchId,
    financial_year_id: financialYearId,
  };

  const { data: payment, error } = await supabase
    .from("fee_payments")
    .insert([fullPaymentPayload])
    .select()
    .single();
  if (error) throw error;

  // Update invoice
  let invQuery = supabase
    .from("invoices")
    .select("grand_total, paid_amount, balance_due, status")
    .eq("id", invoiceId);
  if (branchId) invQuery = invQuery.eq("branch_id", branchId);
  if (financialYearId) invQuery = invQuery.eq("financial_year_id", financialYearId);
  const { data: invoice } = await invQuery.single();

  const newPaid = (invoice.paid_amount || 0) + paymentPayload.amount;
  const balance = invoice.grand_total - newPaid;
  let newStatus = invoice.status;
  if (balance <= 0) newStatus = "Paid";
  else if (newPaid > 0) newStatus = "Partially Paid";

  let updateInvQuery = supabase
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
  if (branchId) updateInvQuery = updateInvQuery.eq("branch_id", branchId);
  if (financialYearId) updateInvQuery = updateInvQuery.eq("financial_year_id", financialYearId);
  await updateInvQuery;

  // Create receipt manually
  const receiptNo = "RCPT-" + Date.now();
  await supabase.from("receipts").insert([
    {
      receipt_no: receiptNo,
      student_id: studentId,
      payment_id: payment.id,
      receipt_date: paymentPayload.payment_date,
      amount: paymentPayload.amount,
      generated_by: generatedBy,
      branch_id: branchId,
      financial_year_id: financialYearId,
    },
  ]);

  await updateFeeStatusAutomatically(paymentPayload.student_fee_id, context);

  // ─── Send fee receipt email ───────────────────────────────────
  try {
    const org = await getOrganizationFromBranch(branchId);
    await sendFeeReceiptEmail(payment.id, org);
  } catch (emailError) {
    console.error("❌ Failed to send fee receipt email:", emailError);
  }

  return payment;
}

// ─── Get remaining balance for an invoice (scoped) ──
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

// ─── Submit online payment request (scoped) ──
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

// ─── Generate invoice from student fee (now works with context) ──
/**
 * Generate a single invoice for the entire student fee or a specific installment.
 * Requires context: { branchId, financialYearId }
 */
export async function generateInvoiceFromStudentFee(studentFeeId, installmentId = null, context) {
  const { branchId, financialYearId } = context;

  // Read fee with scoping
  let feeQuery = supabase
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
    .eq("id", studentFeeId);

  if (branchId) feeQuery = feeQuery.eq("branch_id", branchId);
  if (financialYearId) feeQuery = feeQuery.eq("financial_year_id", financialYearId);

  const { data: fee, error } = await feeQuery.single();
  if (error) throw error;

  let amount = 0;
  let components = [];
  if (installmentId) {
    let instQuery = supabase
      .from("fee_installments")
      .select("*")
      .eq("id", installmentId);

    if (branchId) instQuery = instQuery.eq("branch_id", branchId);
    if (financialYearId) instQuery = instQuery.eq("financial_year_id", financialYearId);

    const { data: installment } = await instQuery.single();
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
    student_fee_id: studentFeeId,
    fee_installment_id: installmentId || null,
  };

  return await createInvoice(invoicePayload, context);
}

/**
 * Generate invoices for each installment of a student fee.
 * Requires context: { branchId, financialYearId }
 */
export async function generateInvoicesForInstallments(studentFeeId, context) {
  const { branchId, financialYearId } = context;
  let instQuery = supabase
    .from("fee_installments")
    .select("id")
    .eq("student_fee_id", studentFeeId)
    .order("installment_number");

  if (branchId) instQuery = instQuery.eq("branch_id", branchId);
  if (financialYearId) instQuery = instQuery.eq("financial_year_id", financialYearId);

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