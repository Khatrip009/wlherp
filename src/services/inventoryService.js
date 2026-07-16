// src/services/inventoryService.js
import { supabase } from "../api/supabase";

// ─── Items ────────────────────────────────
export async function getInventoryItems(filters = {}, branchId, financialYearId) {
  let query = supabase.from("inventory_items").select("*").order("item_name");

  // Scope
  if (branchId) query = query.eq("branch_id", branchId);
  if (financialYearId) query = query.eq("financial_year_id", financialYearId);

  if (filters.search) {
    query = query.ilike("item_name", `%${filters.search}%`);
  }
  const { data, error } = await query;
  if (error) throw error;
  return data || [];
}

// context: { branchId, financialYearId }
export async function createInventoryItem(payload, context) {
  const { branchId, financialYearId } = context;
  // ✅ Remove id from payload if present (let DB generate it)
  const { id, ...cleanPayload } = payload;
  const { data, error } = await supabase
    .from("inventory_items")
    .insert({ ...cleanPayload, branch_id: branchId, financial_year_id: financialYearId })
    .select()
    .single();
  if (error) throw error;
  return data;
}

// context: { branchId, financialYearId }
export async function updateInventoryItem(id, payload, context) {
  const { branchId, financialYearId } = context;

  let query = supabase
    .from("inventory_items")
    .update({ ...payload, branch_id: branchId, financial_year_id: financialYearId })
    .eq("id", id);

  if (branchId) query = query.eq("branch_id", branchId);
  if (financialYearId) query = query.eq("financial_year_id", financialYearId);

  const { data, error } = await query.select().single();
  if (error) throw error;
  return data;
}

// Hard delete – scoped
export async function deleteInventoryItem(id, branchId, financialYearId) {
  let query = supabase.from("inventory_items").delete().eq("id", id);
  if (branchId) query = query.eq("branch_id", branchId);
  if (financialYearId) query = query.eq("financial_year_id", financialYearId);
  const { error } = await query;
  if (error) throw error;
}

// ─── Transactions ─────────────────────────
export async function getInventoryTransactions(filters = {}, branchId, financialYearId) {
  let query = supabase
    .from("inventory_transactions")
    .select("*, inventory_items(item_name, unit)")
    .order("created_at", { ascending: false });

  // Scope
  if (branchId) query = query.eq("branch_id", branchId);
  if (financialYearId) query = query.eq("financial_year_id", financialYearId);

  if (filters.item_id) query = query.eq("item_id", filters.item_id);
  if (filters.start_date) query = query.gte("created_at", filters.start_date);
  if (filters.end_date) query = query.lte("created_at", filters.end_date);

  const { data, error } = await query;
  if (error) throw error;
  return data || [];
}

// context: { branchId, financialYearId }
export async function addInventoryTransaction(payload, context) {
  const { branchId, financialYearId } = context;
  const { data, error } = await supabase
    .from("inventory_transactions")
    .insert({ ...payload, branch_id: branchId, financial_year_id: financialYearId })
    .select()
    .single();
  if (error) throw error;
  return data;
}