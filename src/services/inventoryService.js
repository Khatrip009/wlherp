// src/services/inventoryService.js
import { supabase } from "../api/supabase";

// ─── Items ────────────────────────────────
export async function getInventoryItems(filters = {}) {
  let query = supabase.from("inventory_items").select("*").order("item_name");
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
  const { data, error } = await supabase
    .from("inventory_items")
    .insert({ ...payload, branch_id: branchId, financial_year_id: financialYearId })
    .select()
    .single();
  if (error) throw error;
  return data;
}

// context: { branchId, financialYearId }
export async function updateInventoryItem(id, payload, context) {
  const { branchId, financialYearId } = context;
  const { data, error } = await supabase
    .from("inventory_items")
    .update({ ...payload, branch_id: branchId, financial_year_id: financialYearId })
    .eq("id", id)
    .select()
    .single();
  if (error) throw error;
  return data;
}

// Hard delete – RLS protects
export async function deleteInventoryItem(id) {
  const { error } = await supabase.from("inventory_items").delete().eq("id", id);
  if (error) throw error;
}

// ─── Transactions ─────────────────────────
export async function getInventoryTransactions(filters = {}) {
  let query = supabase
    .from("inventory_transactions")
    .select("*, inventory_items(item_name, unit)")
    .order("created_at", { ascending: false });

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