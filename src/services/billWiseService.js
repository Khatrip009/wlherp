// src/services/billWiseService.js
import { supabase } from "../api/supabase";

// Fetch all bill‑wise entries with optional filters
export async function getBillWiseEntries(
  filters = {},
  branchId,
  financialYearId
) {
  let query = supabase
    .from("bill_wise_entries")
    .select("*")
    .order("due_date", { ascending: true });

  // Scoping
  if (branchId) query = query.eq("branch_id", branchId);
  if (financialYearId) query = query.eq("financial_year_id", financialYearId);

  // User filters
  if (filters.status) query = query.eq("status", filters.status);
  if (filters.start_date) query = query.gte("due_date", filters.start_date);
  if (filters.end_date) query = query.lte("due_date", filters.end_date);
  if (filters.search) {
    query = query.or(
      `reference.ilike.%${filters.search}%,vendor_customer_name.ilike.%${filters.search}%`
    );
  }

  const { data, error } = await query;
  if (error) throw error;
  return data || [];
}

// Create a new bill‑wise entry
// context: { branchId, financialYearId }
export async function createBillWiseEntry(payload, context) {
  const { branchId, financialYearId } = context;
  const { data, error } = await supabase
    .from("bill_wise_entries")
    .insert({
      ...payload,
      outstanding_amount: payload.original_amount,
      branch_id: branchId,
      financial_year_id: financialYearId,
    })
    .select()
    .single();
  if (error) throw error;
  return data;
}

// Update an entry (e.g., when a payment is made)
// context: { branchId, financialYearId }
export async function updateBillWiseEntry(id, payload, context) {
  const { branchId, financialYearId } = context;
  const { data, error } = await supabase
    .from("bill_wise_entries")
    .update({
      ...payload,
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

// Delete an entry – now scoped to prevent cross‑branch deletion
export async function deleteBillWiseEntry(id, branchId, financialYearId) {
  let query = supabase
    .from("bill_wise_entries")
    .delete()
    .eq("id", id);

  if (branchId) query = query.eq("branch_id", branchId);
  if (financialYearId) query = query.eq("financial_year_id", financialYearId);

  const { error } = await query;
  if (error) throw error;
}

// Record a payment against a bill (reduce outstanding_amount, update status)
// context: { branchId, financialYearId }
export async function recordBillPayment(entryId, paymentAmount, context) {
  const { branchId, financialYearId } = context;

  // 1. Fetch current entry – scope with branch/FY
  let fetchQuery = supabase
    .from("bill_wise_entries")
    .select("outstanding_amount, original_amount, reference")
    .eq("id", entryId);

  if (branchId) fetchQuery = fetchQuery.eq("branch_id", branchId);
  if (financialYearId) fetchQuery = fetchQuery.eq("financial_year_id", financialYearId);

  const { data: entry } = await fetchQuery.single();
  if (!entry) throw new Error("Bill not found");

  const newOutstanding = Math.max(entry.outstanding_amount - paymentAmount, 0);
  let newStatus = "Partially Paid";
  if (newOutstanding <= 0) newStatus = "Paid";

  // 2. Update entry – include branch & FY in payload
  let updateQuery = supabase
    .from("bill_wise_entries")
    .update({
      outstanding_amount: newOutstanding,
      status: newStatus,
      updated_at: new Date(),
      branch_id: branchId,
      financial_year_id: financialYearId,
    })
    .eq("id", entryId);

  // Also filter by branch/FY to prevent accidental cross‑branch updates
  if (branchId) updateQuery = updateQuery.eq("branch_id", branchId);
  if (financialYearId) updateQuery = updateQuery.eq("financial_year_id", financialYearId);

  const { error } = await updateQuery;
  if (error) throw error;

  return { success: true, new_outstanding: newOutstanding, status: newStatus };
}

// Get aged payables/receivables summary – now scoped
export async function getAgedPayablesReceivables(branchId, financialYearId) {
  let query = supabase
    .from("bill_wise_entries")
    .select("*")
    .neq("status", "Paid")
    .order("due_date");

  if (branchId) query = query.eq("branch_id", branchId);
  if (financialYearId) query = query.eq("financial_year_id", financialYearId);

  const { data, error } = await query;
  if (error) throw error;

  const now = new Date();
  const buckets = {
    "0-30 days": { count: 0, total: 0 },
    "31-60 days": { count: 0, total: 0 },
    "61-90 days": { count: 0, total: 0 },
    "90+ days": { count: 0, total: 0 },
  };

  (data || []).forEach((bill) => {
    if (!bill.due_date) return;
    const diffDays = Math.floor((now - new Date(bill.due_date)) / 86400000);
    let bucket = "0-30 days";
    if (diffDays > 30 && diffDays <= 60) bucket = "31-60 days";
    else if (diffDays > 60 && diffDays <= 90) bucket = "61-90 days";
    else if (diffDays > 90) bucket = "90+ days";
    buckets[bucket].count += 1;
    buckets[bucket].total += parseFloat(bill.outstanding_amount);
  });

  return buckets;
}