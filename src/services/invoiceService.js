// src/services/invoiceService.js
import { supabase } from "../api/supabase";

// ─── HELPERS ───────────────────────────────────────────────
async function generateInvoiceNumber() {
  const { data, error } = await supabase.rpc("generate_invoice_number");
  if (error) throw error;
  return data;
}

// ─── INVOICES ──────────────────────────────────────────────

export async function getInvoices(filters = {}) {
  let query = supabase
    .from("invoices")
    .select(`
      *,
      students(first_name, last_name, admission_no),
      courses(course_name),
      batches(batch_name)
    `)
    .order("invoice_date", { ascending: false });

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

export async function getInvoice(id) {
  // 1. Fetch invoice header
  const { data: invoice, error } = await supabase
    .from("invoices")
    .select(`
      *,
      students(first_name, last_name, admission_no, gstin, state_code, billing_address)
    `)
    .eq("id", id)
    .single();
  if (error) throw error;

  // 2. Fetch invoice items
  const { data: items, error: itemsError } = await supabase
    .from("invoice_items")
    .select("*")
    .eq("invoice_id", id);
  if (itemsError) throw itemsError;

  // 3. Enrich items with tax rates and inventory items
  const enrichedItems = await Promise.all(
    (items || []).map(async (item) => {
      let taxRate = null;
      if (item.tax_rate_id) {
        const { data: tr } = await supabase
          .from("tax_rates")
          .select("id, name, rate")
          .eq("id", item.tax_rate_id)
          .single();
        taxRate = tr;
      }
      let inventoryItem = null;
      if (item.item_type === "product" && item.item_id) {
        const { data: inv } = await supabase
          .from("inventory_items")
          .select("item_name, unit")
          .eq("id", item.item_id)
          .single();
        inventoryItem = inv;
      }
      return {
        ...item,
        tax_rates: taxRate,
        inventory_items: inventoryItem,
      };
    })
  );

  return {
    ...invoice,
    invoice_items: enrichedItems,
  };
}

// context: { branchId, financialYearId }
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

  // Get org state
  const { data: org } = await supabase.from("organization").select("state_code").eq("id", 1).single();
  const orgState = org?.state_code || "";
  const placeOfSupply = place_of_supply || orgState;

  // Fetch tax rates for items
  const taxRateIds = items.map(i => i.tax_rate_id).filter(id => id);
  const { data: taxRates } = await supabase.from("tax_rates").select("*").in("id", taxRateIds);
  const taxRateMap = {};
  taxRates.forEach(tr => taxRateMap[tr.id] = tr);

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

  const invoiceNumber = await generateInvoiceNumber();

  // Insert header
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

export async function updateInvoice(id, payload, context) {
  const { items, ...headerData } = payload;
  const { branchId, financialYearId } = context;

  const { data: invoice, error } = await supabase
    .from("invoices")
    .update({
      ...headerData,
      updated_at: new Date(),
      branch_id: branchId,
      financial_year_id: financialYearId,
    })
    .eq("id", id)
    .select()
    .single();
  if (error) throw error;

  if (items !== undefined) {
    await supabase.from("invoice_items").delete().eq("invoice_id", id);
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

export async function deleteInvoice(id) {
  const { data: invoice } = await supabase.from("invoices").select("status").eq("id", id).single();
  if (invoice.status !== "Draft") throw new Error("Cannot delete finalized invoice");
  const { error } = await supabase.from("invoices").delete().eq("id", id);
  if (error) throw error;
}

export async function finalizeInvoice(id, context) {
  const { branchId, financialYearId } = context;
  const { data, error } = await supabase
    .from("invoices")
    .update({
      status: "Final",
      updated_at: new Date(),
      branch_id: branchId,
      financial_year_id: financialYearId,
    })
    .eq("id", id)
    .select()
    .single();
  if (error) throw error;
  return data;
}

// ─── CREDIT NOTES ──────────────────────────────────────────

export async function getCreditNotes(filters = {}) {
  let query = supabase.from("credit_notes").select("*").order("date", { ascending: false });
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
  const { data, error } = await supabase
    .from("credit_notes")
    .update({
      status: "Final",
      branch_id: branchId,
      financial_year_id: financialYearId,
    })
    .eq("id", id)
    .select()
    .single();
  if (error) throw error;
  return data;
}

// ─── DEBIT NOTES ───────────────────────────────────────────

export async function getDebitNotes(filters = {}) {
  let query = supabase.from("debit_notes").select("*").order("date", { ascending: false });
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
  const { data, error } = await supabase
    .from("debit_notes")
    .update({
      status: "Final",
      branch_id: branchId,
      financial_year_id: financialYearId,
    })
    .eq("id", id)
    .select()
    .single();
  if (error) throw error;
  return data;
}