// src/services/vendorService.js
import { supabase } from "../api/supabase";

export async function getVendors(filters = {}) {
  let query = supabase.from("vendors").select("*").order("vendor_name");
  if (filters.search) {
    query = query.ilike("vendor_name", `%${filters.search}%`);
  }
  const { data, error } = await query;
  if (error) throw error;
  return data || [];
}

export async function getVendor(id) {
  const { data, error } = await supabase.from("vendors").select("*").eq("id", id).single();
  if (error) throw error;
  return data;
}

// context: { branchId, financialYearId }
export async function createVendor(payload, context) {
  const { branchId, financialYearId } = context;
  const { data, error } = await supabase
    .from("vendors")
    .insert({ ...payload, branch_id: branchId, financial_year_id: financialYearId })
    .select()
    .single();
  if (error) throw error;
  return data;
}

// context: { branchId, financialYearId }
export async function updateVendor(id, payload, context) {
  const { branchId, financialYearId } = context;
  const { data, error } = await supabase
    .from("vendors")
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

export async function deleteVendor(id) {
  const { error } = await supabase.from("vendors").delete().eq("id", id);
  if (error) throw error;
}