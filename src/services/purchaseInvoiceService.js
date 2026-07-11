// src/services/purchaseInvoiceService.js
import { supabase } from "../api/supabase";

// ─── HELPERS ───────────────────────────────────────────────
async function generateInvoiceNumber() {
  const { data, error } = await supabase.rpc("generate_purchase_invoice_number");
  if (error) throw error;
  return data;
}

async function computeTaxableAmounts(item, vendorState, orgState) {
  const taxable = parseFloat(item.quantity) * parseFloat(item.unit_price);
  let cgst = 0, sgst = 0, igst = 0, cess = 0;
  if (item.tax_rate_id) {
    const { data: taxRate } = await supabase
      .from("tax_rates")
      .select("rate")
      .eq("id", item.tax_rate_id)
      .single();
    const rate = taxRate?.rate || 0;
    if (rate > 0) {
      const isInterState = vendorState !== orgState && vendorState !== "" && orgState !== "";
      if (isInterState) {
        igst = taxable * (rate / 100);
      } else {
        cgst = taxable * (rate / 2 / 100);
        sgst = taxable * (rate / 2 / 100);
      }
    }
  }
  const total = taxable + cgst + sgst + igst + cess;
  return { taxable, cgst, sgst, igst, cess, total };
}

// ─── CRUD ──────────────────────────────────────────────────
export async function getPurchaseInvoices(filters = {}) {
  let query = supabase
    .from("purchase_invoices")
    .select(`
      *,
      vendors(id, vendor_name, gstin),
      purchase_orders(po_number)
    `)
    .order("invoice_date", { ascending: false });

  if (filters.vendor_id) query = query.eq("vendor_id", filters.vendor_id);
  if (filters.status) query = query.eq("status", filters.status);
  if (filters.start_date) query = query.gte("invoice_date", filters.start_date);
  if (filters.end_date) query = query.lte("invoice_date", filters.end_date);
  if (filters.search) {
    query = query.or(
      `invoice_number.ilike.%${filters.search}%,vendors.vendor_name.ilike.%${filters.search}%`
    );
  }

  const { data, error } = await query;
  if (error) throw error;
  return data || [];
}

export async function getPurchaseInvoice(id) {
  const { data, error } = await supabase
    .from("purchase_invoices")
    .select(`
      *,
      vendors(id, vendor_name, gstin, address, state_code),
      purchase_orders(po_number),
      purchase_invoice_items(
        *,
        inventory_items(item_name, unit),
        tax_rates(id, name, rate)
      )
    `)
    .eq("id", id)
    .single();
  if (error) throw error;
  return data;
}

// context: { branchId, financialYearId }
export async function createPurchaseInvoice(payload, context) {
  const { vendor_id, invoice_date, purchase_order_id, reference, notes, items } = payload;
  const { branchId, financialYearId } = context;

  // Fetch vendor state
  const { data: vendor } = await supabase
    .from("vendors")
    .select("state_code")
    .eq("id", vendor_id)
    .single();
  if (!vendor) throw new Error("Vendor not found");

  // Fetch organization state
  const { data: org } = await supabase
    .from("organization")
    .select("state_code")
    .eq("id", 1)
    .single();
  const orgState = org?.state_code || "";
  const vendorState = vendor?.state_code || "";

  let totalTaxable = 0, totalGST = 0, totalCess = 0, grandTotal = 0;

  // Compute each item
  const computedItems = await Promise.all(
    items.map(async (item) => {
      const result = await computeTaxableAmounts(item, vendorState, orgState);
      totalTaxable += result.taxable;
      totalGST += result.cgst + result.sgst + result.igst;
      totalCess += result.cess || 0;
      grandTotal += result.total;
      return { ...item, ...result };
    })
  );

  const invoiceNumber = await generateInvoiceNumber();

  // Insert invoice header
  const { data: invoice, error } = await supabase
    .from("purchase_invoices")
    .insert({
      invoice_number: invoiceNumber,
      invoice_date: invoice_date || new Date().toISOString().split("T")[0],
      vendor_id,
      purchase_order_id: purchase_order_id || null,
      total_taxable_amount: totalTaxable,
      total_gst_amount: totalGST,
      total_cess: totalCess,
      grand_total: grandTotal,
      status: "Draft",
      reference: reference || "",
      notes: notes || "",
      branch_id: branchId,
      financial_year_id: financialYearId,
    })
    .select()
    .single();
  if (error) throw error;

  // Insert items
  const itemInserts = computedItems.map((item) => ({
    purchase_invoice_id: invoice.id,
    item_id: item.item_id,
    description: item.description || "",
    hsn_sac_code: item.hsn_sac_code || null,
    quantity: parseFloat(item.quantity),
    unit_price: parseFloat(item.unit_price),
    taxable_amount: item.taxable,
    tax_rate_id: item.tax_rate_id || null,
    cgst_amount: item.cgst,
    sgst_amount: item.sgst,
    igst_amount: item.igst,
    cess_amount: item.cess || 0,
    total_amount: item.total,
    branch_id: branchId,
    financial_year_id: financialYearId,
  }));
  const { error: insError } = await supabase
    .from("purchase_invoice_items")
    .insert(itemInserts);
  if (insError) throw insError;

  return invoice;
}

// context: { branchId, financialYearId }
export async function updatePurchaseInvoice(id, payload, context) {
  const { vendor_id, invoice_date, purchase_order_id, reference, notes, items } = payload;
  const { branchId, financialYearId } = context;

  // Fetch existing invoice to delete old items
  const { data: existing } = await supabase
    .from("purchase_invoices")
    .select("status")
    .eq("id", id)
    .single();
  if (existing.status !== "Draft") throw new Error("Only draft invoices can be edited");

  // Compute totals similarly to create
  const { data: vendor } = await supabase
    .from("vendors")
    .select("state_code")
    .eq("id", vendor_id)
    .single();
  const { data: org } = await supabase
    .from("organization")
    .select("state_code")
    .eq("id", 1)
    .single();
  const orgState = org?.state_code || "";
  const vendorState = vendor?.state_code || "";

  let totalTaxable = 0, totalGST = 0, totalCess = 0, grandTotal = 0;
  const computedItems = await Promise.all(
    items.map(async (item) => {
      const result = await computeTaxableAmounts(item, vendorState, orgState);
      totalTaxable += result.taxable;
      totalGST += result.cgst + result.sgst + result.igst;
      totalCess += result.cess || 0;
      grandTotal += result.total;
      return { ...item, ...result };
    })
  );

  // Update header
  const { data: invoice, error } = await supabase
    .from("purchase_invoices")
    .update({
      vendor_id,
      invoice_date,
      purchase_order_id: purchase_order_id || null,
      total_taxable_amount: totalTaxable,
      total_gst_amount: totalGST,
      total_cess: totalCess,
      grand_total: grandTotal,
      reference: reference || "",
      notes: notes || "",
      updated_at: new Date(),
      branch_id: branchId,
      financial_year_id: financialYearId,
    })
    .eq("id", id)
    .select()
    .single();
  if (error) throw error;

  // Delete old items and insert new ones
  await supabase
    .from("purchase_invoice_items")
    .delete()
    .eq("purchase_invoice_id", id);

  const itemInserts = computedItems.map((item) => ({
    purchase_invoice_id: id,
    item_id: item.item_id,
    description: item.description || "",
    hsn_sac_code: item.hsn_sac_code || null,
    quantity: parseFloat(item.quantity),
    unit_price: parseFloat(item.unit_price),
    taxable_amount: item.taxable,
    tax_rate_id: item.tax_rate_id || null,
    cgst_amount: item.cgst,
    sgst_amount: item.sgst,
    igst_amount: item.igst,
    cess_amount: item.cess || 0,
    total_amount: item.total,
    branch_id: branchId,
    financial_year_id: financialYearId,
  }));
  const { error: insError } = await supabase
    .from("purchase_invoice_items")
    .insert(itemInserts);
  if (insError) throw insError;

  return invoice;
}

// context: { branchId, financialYearId }
export async function finalizePurchaseInvoice(id, context) {
  const { branchId, financialYearId } = context;
  const { data, error } = await supabase
    .from("purchase_invoices")
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

export async function deletePurchaseInvoice(id) {
  const { data: invoice } = await supabase
    .from("purchase_invoices")
    .select("status")
    .eq("id", id)
    .single();
  if (invoice.status !== "Draft") throw new Error("Cannot delete finalized invoice");
  const { error } = await supabase.from("purchase_invoices").delete().eq("id", id);
  if (error) throw error;
}