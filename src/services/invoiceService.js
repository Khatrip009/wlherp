// src/services/invoiceService.js
import { supabase } from "../api/supabase";

// ─── Get the next invoice number from the database ──────────
async function generateUniqueInvoiceNumber() {
  const { data, error } = await supabase.rpc('next_invoice_number');
  if (error) {
    // If the RPC fails, we throw – no fallback to the old broken generator
    throw new Error('Could not generate invoice number: ' + error.message, { cause: error });
  }
  return data;   // e.g. "INV-2026-0001"
}

// ─── INVOICES ──────────────────────────────────────────────
export async function getInvoices(filters = {}, branchId, financialYearId) {
  let query = supabase
    .from("invoices")
    .select(`
      *,
      students(first_name, last_name, admission_no),
      courses(course_name),
      batches(batch_name)
    `)
    .order("invoice_date", { ascending: false });

  if (branchId) query = query.eq("branch_id", branchId);
  if (financialYearId) query = query.eq("financial_year_id", financialYearId);

  if (filters.student_id) query = query.eq("student_id", filters.student_id);
  if (filters.status) query = query.eq("status", filters.status);
  if (filters.start_date) query = query.gte("invoice_date", filters.start_date);
  if (filters.end_date) query = query.lte("invoice_date", filters.end_date);
  if (filters.search) {
    query = query.or(`invoice_number.ilike.%${filters.search}%,students.first_name.ilike.%${filters.search}%`);
  }

  const { data, error } = await query;
  if (error) throw error;
  return data || [];
}

export async function getInvoice(id, branchId, financialYearId) {
  let invoiceQuery = supabase
    .from("invoices")
    .select(`
      *,
      students(first_name, last_name, admission_no, gstin, state_code, billing_address)
    `)
    .eq("id", id);

  if (branchId) invoiceQuery = invoiceQuery.eq("branch_id", branchId);
  if (financialYearId) invoiceQuery = invoiceQuery.eq("financial_year_id", financialYearId);

  const { data: invoice, error } = await invoiceQuery.single();
  if (error) throw error;

  let itemsQuery = supabase
    .from("invoice_items")
    .select("*")
    .eq("invoice_id", id);

  if (branchId) itemsQuery = itemsQuery.eq("branch_id", branchId);
  if (financialYearId) itemsQuery = itemsQuery.eq("financial_year_id", financialYearId);

  const { data: items, error: itemsError } = await itemsQuery;
  if (itemsError) throw itemsError;

  const enrichedItems = await Promise.all(
    (items || []).map(async (item) => {
      let taxRate = null;
      if (item.tax_rate_id) {
        let trQuery = supabase
          .from("tax_rates")
          .select("id, name, rate")
          .eq("id", item.tax_rate_id);
        if (branchId) trQuery = trQuery.eq("branch_id", branchId);
        if (financialYearId) trQuery = trQuery.eq("financial_year_id", financialYearId);
        const { data: tr } = await trQuery.single();
        taxRate = tr;
      }
      let inventoryItem = null;
      if (item.item_type === "product" && item.item_id) {
        let invQuery = supabase
          .from("inventory_items")
          .select("item_name, unit")
          .eq("id", item.item_id);
        if (branchId) invQuery = invQuery.eq("branch_id", branchId);
        if (financialYearId) invQuery = invQuery.eq("financial_year_id", financialYearId);
        const { data: inv } = await invQuery.single();
        inventoryItem = inv;
      }
      return { ...item, tax_rates: taxRate, inventory_items: inventoryItem };
    })
  );

  return { ...invoice, invoice_items: enrichedItems };
}

// ─── Create Invoice (uses only the new RPC) ─────────────────
export async function createInvoice(payload, context) {
  const {
    student_id,
    invoice_date,
    due_date,
    payment_terms,
    gst_applicable,
    place_of_supply,
    reverse_charge,
    items,
    student_fee_id,
    fee_installment_id,
  } = payload;

  const { branchId, financialYearId } = context;

  // Determine place of supply from branch
  let orgState = "";
  if (branchId) {
    const { data: branch } = await supabase
      .from("branches")
      .select("state")
      .eq("id", branchId)
      .single();
    orgState = branch?.state || "";
  }
  const placeOfSupply = place_of_supply || orgState;

  // Tax rate resolution
  const taxRateIds = items.map(i => i.tax_rate_id).filter(id => id);
  let taxRateQuery = supabase.from("tax_rates").select("*").in("id", taxRateIds);
  if (branchId) taxRateQuery = taxRateQuery.eq("branch_id", branchId);
  if (financialYearId) taxRateQuery = taxRateQuery.eq("financial_year_id", financialYearId);
  const { data: taxRates } = await taxRateQuery;
  const taxRateMap = {};
  (taxRates || []).forEach(tr => taxRateMap[tr.id] = tr);

  let totalTaxable = 0, totalGST = 0, totalAmount = 0;
  let totalCgst = 0, totalSgst = 0, totalIgst = 0;
  const invoiceItems = items.map(item => {
    const unitPrice = parseFloat(item.unit_price) || 0;
    const qty = parseFloat(item.quantity) || 1;
    const taxable = unitPrice * qty;
    let cgst = 0, sgst = 0, igst = 0;
    if (item.tax_rate_id && taxRateMap[item.tax_rate_id]) {
      const rate = taxRateMap[item.tax_rate_id].rate;
      if (placeOfSupply === orgState) {
        cgst = (rate / 2) / 100 * taxable;
        sgst = (rate / 2) / 100 * taxable;
      } else {
        igst = rate / 100 * taxable;
      }
    }
    const total = taxable + cgst + sgst + igst;
    totalTaxable += taxable;
    totalCgst += cgst;
    totalSgst += sgst;
    totalIgst += igst;
    totalGST += cgst + sgst + igst;
    totalAmount += total;
    return {
      ...item,
      taxable_amount: taxable,
      cgst_amount: cgst,
      sgst_amount: sgst,
      igst_amount: igst,
      total_amount: total,
    };
  });

  const roundOff = Math.round(totalAmount) - totalAmount;
  const grandTotal = totalAmount + roundOff;

  // If an invoice already exists for this fee, reuse it
  const { data: existingInvoice } = await supabase
    .from("invoices")
    .select("*")
    .eq("student_fee_id", student_fee_id)
    .maybeSingle();

  if (existingInvoice) {
    return existingInvoice;
  }

  // Generate the next number using the database sequence
  const invoiceNumber = await generateUniqueInvoiceNumber();

  // Insert the invoice
  const { data: invoice, error } = await supabase
    .from("invoices")
    .insert({
      invoice_number: invoiceNumber,
      invoice_date: invoice_date || new Date().toISOString().split("T")[0],
      student_id,
      due_date: due_date || null,
      payment_terms: payment_terms || "",
      gst_applicable: gst_applicable || false,
      place_of_supply: placeOfSupply,
      reverse_charge: reverse_charge || false,
      total_taxable_amount: totalTaxable,
      total_gst_amount: totalGST,
      total_cess: 0,
      total_amount: totalAmount,
      round_off: roundOff,
      grand_total: grandTotal,
      status: "Draft",
      student_fee_id: student_fee_id || null,
      fee_installment_id: fee_installment_id || null,
      branch_id: branchId,
      financial_year_id: financialYearId,
    })
    .select()
    .single();

  if (error) throw error;

  // Insert items
  const itemInserts = invoiceItems.map(item => ({
    invoice_id: invoice.id,
    item_type: item.item_type,
    item_id: item.item_id || null,
    description: item.description || "",
    hsn_sac_code: item.hsn_sac_code || null,
    quantity: item.quantity,
    unit_price: item.unit_price,
    taxable_amount: item.taxable_amount,
    tax_rate_id: item.tax_rate_id || null,
    cgst_amount: item.cgst_amount || 0,
    sgst_amount: item.sgst_amount || 0,
    igst_amount: item.igst_amount || 0,
    cess_amount: 0,
    total_amount: item.total_amount,
    branch_id: branchId,
    financial_year_id: financialYearId,
  }));
  const { error: insError } = await supabase.from("invoice_items").insert(itemInserts);
  if (insError) throw insError;

  return invoice;
}

// ─── Update Invoice ─────────────────────────────────────────
export async function updateInvoice(id, payload, context) {
  const { items, ...headerData } = payload;
  const { branchId, financialYearId } = context;

  let updateQuery = supabase
    .from("invoices")
    .update({
      ...headerData,
      updated_at: new Date(),
      branch_id: branchId,
      financial_year_id: financialYearId,
    })
    .eq("id", id);
  if (branchId) updateQuery = updateQuery.eq("branch_id", branchId);
  if (financialYearId) updateQuery = updateQuery.eq("financial_year_id", financialYearId);

  const { data: invoice, error } = await updateQuery.select().single();
  if (error) throw error;

  if (items !== undefined) {
    let deleteItemsQuery = supabase.from("invoice_items").delete().eq("invoice_id", id);
    if (branchId) deleteItemsQuery = deleteItemsQuery.eq("branch_id", branchId);
    if (financialYearId) deleteItemsQuery = deleteItemsQuery.eq("financial_year_id", financialYearId);
    await deleteItemsQuery;

    const itemInserts = items.map(item => ({
      invoice_id: id,
      item_type: item.item_type,
      item_id: item.item_id || null,
      description: item.description || "",
      hsn_sac_code: item.hsn_sac_code || null,
      quantity: item.quantity,
      unit_price: item.unit_price,
      taxable_amount: item.taxable_amount,
      tax_rate_id: item.tax_rate_id || null,
      cgst_amount: item.cgst_amount || 0,
      sgst_amount: item.sgst_amount || 0,
      igst_amount: item.igst_amount || 0,
      cess_amount: 0,
      total_amount: item.total_amount,
      branch_id: branchId,
      financial_year_id: financialYearId,
    }));
    await supabase.from("invoice_items").insert(itemInserts);
  }
  return invoice;
}

export async function deleteInvoice(id, branchId, financialYearId) {
  let statusQuery = supabase.from("invoices").select("status").eq("id", id);
  if (branchId) statusQuery = statusQuery.eq("branch_id", branchId);
  if (financialYearId) statusQuery = statusQuery.eq("financial_year_id", financialYearId);
  const { data: invoice } = await statusQuery.single();
  if (invoice?.status !== "Draft") throw new Error("Cannot delete finalized invoice");

  let deleteQuery = supabase.from("invoices").delete().eq("id", id);
  if (branchId) deleteQuery = deleteQuery.eq("branch_id", branchId);
  if (financialYearId) deleteQuery = deleteQuery.eq("financial_year_id", financialYearId);
  const { error } = await deleteQuery;
  if (error) throw error;
}

export async function finalizeInvoice(id, context) {
  const { branchId, financialYearId } = context;
  let query = supabase
    .from("invoices")
    .update({
      status: "Final",
      updated_at: new Date(),
      branch_id: branchId,
      financial_year_id: financialYearId,
    })
    .eq("id", id);
  if (branchId) query = query.eq("branch_id", branchId);
  if (financialYearId) query = query.eq("financial_year_id", financialYearId);
  const { data, error } = await query.select().single();
  if (error) throw error;
  return data;
}

export async function getInvoicesByStudent(studentId, branchId, financialYearId) {
  let query = supabase
    .from("invoices")
    .select("id, invoice_number, grand_total, status, paid_amount, balance_due")
    .eq("student_id", studentId)
    .order("invoice_date", { ascending: false });
  if (branchId) query = query.eq("branch_id", branchId);
  if (financialYearId) query = query.eq("financial_year_id", financialYearId);
  const { data, error } = await query;
  if (error) throw error;
  return data || [];
}

export async function getInvoiceByStudentFee(studentFeeId, branchId, financialYearId) {
  let query = supabase
    .from("invoices")
    .select("id, invoice_number, grand_total, status")
    .eq("student_fee_id", studentFeeId)
    .order("invoice_date", { ascending: false })
    .limit(1);
  if (branchId) query = query.eq("branch_id", branchId);
  if (financialYearId) query = query.eq("financial_year_id", financialYearId);
  const { data, error } = await query;
  if (error) throw error;
  return data?.[0] || null;
}

// ─── CREDIT NOTES ──────────────────────────────────────────
export async function getCreditNotes(filters = {}, branchId, financialYearId) {
  let query = supabase.from("credit_notes").select("*").order("date", { ascending: false });
  if (branchId) query = query.eq("branch_id", branchId);
  if (financialYearId) query = query.eq("financial_year_id", financialYearId);
  if (filters.invoice_id) query = query.eq("invoice_id", filters.invoice_id);
  if (filters.status) query = query.eq("status", filters.status);
  const { data, error } = await query;
  if (error) throw error;
  return data || [];
}

export async function createCreditNote(payload, context) {
  const { branchId, financialYearId } = context;
  const { data: number } = await supabase.rpc("generate_credit_note_number");
  const { data, error } = await supabase
    .from("credit_notes")
    .insert({
      credit_note_number: number,
      invoice_id: payload.invoice_id,
      date: payload.date || new Date().toISOString().split("T")[0],
      reason: payload.reason,
      amount: payload.amount,
      gst_breakdown: payload.gst_breakdown || {},
      status: "Draft",
      branch_id: branchId,
      financial_year_id: financialYearId,
    })
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function finalizeCreditNote(id, context) {
  const { branchId, financialYearId } = context;
  let query = supabase
    .from("credit_notes")
    .update({ status: "Final", branch_id: branchId, financial_year_id: financialYearId })
    .eq("id", id);
  if (branchId) query = query.eq("branch_id", branchId);
  if (financialYearId) query = query.eq("financial_year_id", financialYearId);
  const { data, error } = await query.select().single();
  if (error) throw error;
  return data;
}

// ─── DEBIT NOTES ───────────────────────────────────────────
export async function getDebitNotes(filters = {}, branchId, financialYearId) {
  let query = supabase.from("debit_notes").select("*").order("date", { ascending: false });
  if (branchId) query = query.eq("branch_id", branchId);
  if (financialYearId) query = query.eq("financial_year_id", financialYearId);
  if (filters.invoice_id) query = query.eq("invoice_id", filters.invoice_id);
  if (filters.status) query = query.eq("status", filters.status);
  const { data, error } = await query;
  if (error) throw error;
  return data || [];
}

export async function createDebitNote(payload, context) {
  const { branchId, financialYearId } = context;
  const { data: number } = await supabase.rpc("generate_debit_note_number");
  const { data, error } = await supabase
    .from("debit_notes")
    .insert({
      debit_note_number: number,
      invoice_id: payload.invoice_id,
      date: payload.date || new Date().toISOString().split("T")[0],
      reason: payload.reason,
      amount: payload.amount,
      gst_breakdown: payload.gst_breakdown || {},
      status: "Draft",
      branch_id: branchId,
      financial_year_id: financialYearId,
    })
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function finalizeDebitNote(id, context) {
  const { branchId, financialYearId } = context;
  let query = supabase
    .from("debit_notes")
    .update({ status: "Final", branch_id: branchId, financial_year_id: financialYearId })
    .eq("id", id);
  if (branchId) query = query.eq("branch_id", branchId);
  if (financialYearId) query = query.eq("financial_year_id", financialYearId);
  const { data, error } = await query.select().single();
  if (error) throw error;
  return data;
}