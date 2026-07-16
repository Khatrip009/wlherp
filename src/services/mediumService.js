// src/services/mediumService.js
import { supabase } from "../api/supabase";

// Mediums are organization‑wide – no branch/FY columns
export async function getMediums({ search = "" } = {}) {
  let query = supabase.from("mediums").select("*").order("name");
  if (search) {
    query = query.ilike("name", `%${search}%`);
  }
  const { data, error } = await query;
  if (error) throw error;
  return data || [];
}

// Create, update, delete also don't need branch/FY (unless you add them)
export async function createMedium(payload, context) {
  // If your mediums table does NOT have branch_id/financial_year_id, omit them
  const { data, error } = await supabase
    .from("mediums")
    .insert([payload])
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function updateMedium(id, payload, context) {
  const { data, error } = await supabase
    .from("mediums")
    .update(payload)
    .eq("id", id)
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function deleteMedium(id, context) {
  const { error } = await supabase
    .from("mediums")
    .delete()
    .eq("id", id);
  if (error) throw error;
}