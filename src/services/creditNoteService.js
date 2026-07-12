// src/services/creditNoteService.js
import { supabase } from "../api/supabase";

export async function getCreditNotes(filters = {}, branchId, financialYearId) {
  let query = supabase
    .from("credit_notes")
    .select(`
      *,
      invoices(
        invoice_number,
        grand_total,
        students(first_name, last_name, admission_no)
      )
    `)
    .order("date", { ascending: false });

  // Scope to current branch & financial year
  if (branchId) query = query.eq("credit_notes.branch_id", branchId);
  if (financialYearId) query = query.eq("credit_notes.financial_year_id", financialYearId);

  if (filters.status) query = query.eq("status", filters.status);
  if (filters.invoice_id) query = query.eq("invoice_id", filters.invoice_id);

  const { data, error } = await query;
  if (error) throw error;
  return data || [];
}

export async function getCreditNote(id, branchId, financialYearId) {
  let query = supabase
    .from("credit_notes")
    .select(`
      *,
      invoices(
        *,
        students(first_name, last_name, admission_no, gstin, state_code)
      )
    `)
    .eq("id", id);

  if (branchId) query = query.eq("branch_id", branchId);
  if (financialYearId) query = query.eq("financial_year_id", financialYearId);

  const { data, error } = await query.single();
  if (error) throw error;
  return data;
}

// context: { branchId, financialYearId }
export async function createCreditNote(payload, context) {
  const { branchId, financialYearId } = context;
  // Generate credit note number
  const { data: number } = await supabase.rpc("generate_credit_note_number");
  const { data, error } = await supabase
    .from("credit_notes")
    .insert({
      credit_note_number: number,
      invoice_id: payload.invoice_id,
      date: payload.date || new Date().toISOString().split("T")[0],
      reason: payload.reason,
      taxable_amount: payload.taxable_amount || 0,
      cgst: payload.cgst || 0,
      sgst: payload.sgst || 0,
      igst: payload.igst || 0,
      total_tax_amount: payload.total_tax_amount || 0,
      total_amount: payload.total_amount,
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

export async function finalizeCreditNote(id) {
  const { data, error } = await supabase.rpc("finalize_credit_note", { note_id: id });
  if (error) throw error;
  return data;
}

export async function deleteCreditNote(id, branchId, financialYearId) {
  let query = supabase
    .from("credit_notes")
    .delete()
    .eq("id", id);

  if (branchId) query = query.eq("branch_id", branchId);
  if (financialYearId) query = query.eq("financial_year_id", financialYearId);

  const { error } = await query;
  if (error) throw error;
}