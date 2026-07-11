// src/services/mediumService.js
import { supabase } from "../api/supabase";

export async function getMediums() {
  const { data, error } = await supabase
    .from("mediums")
    .select("id, name")
    .order("name");
  if (error) throw error;
  return data || [];
}

export async function createMedium(payload) {
  const { data, error } = await supabase
    .from("mediums")
    .insert([payload])
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function updateMedium(id, payload) {
  const { data, error } = await supabase
    .from("mediums")
    .update(payload)
    .eq("id", id)
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function deleteMedium(id) {
  const { error } = await supabase
    .from("mediums")
    .delete()
    .eq("id", id);
  if (error) throw error;
}