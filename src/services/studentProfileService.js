import { supabase } from "../api/supabase";

export async function getStudent(id) {
  const { data, error } = await supabase
    .from("students")
    .select("*, mediums(name)")
    .eq("id", id)
    .single();

  if (error) throw error;

  // Add a convenient medium_name property
  return {
    ...data,
    medium_name: data.mediums?.name || "",
  };
}