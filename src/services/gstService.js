// src/services/gstService.js
import { supabase } from "../api/supabase";

export async function getGSTSettings() {
  const { data, error } = await supabase
    .from("organization")
    .select("gst_registered, business_legal_name, trade_name, state_code, place_of_supply, registration_type, fiscal_year_start, financial_year, gstin")
    .eq("id", 1)
    .single();
  if (error) throw error;
  return data;
}

export async function updateGSTSettings(payload) {
  const { data, error } = await supabase
    .from("organization")
    .update(payload)
    .eq("id", 1)
    .select()
    .single();
  if (error) throw error;
  return data;
}