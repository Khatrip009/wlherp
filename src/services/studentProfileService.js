// src/services/studentService.js
import { supabase } from "../api/supabase";

export async function getStudent(id, branchId, financialYearId) {
  let query = supabase
    .from("students")
    .select("*, mediums(name)")
    .eq("id", id);

  if (branchId) query = query.eq("branch_id", branchId);
  if (financialYearId) query = query.eq("financial_year_id", financialYearId);

  const { data, error } = await query.single();

  if (error) throw error;

  // Add a convenient medium_name property
  return {
    ...data,
    medium_name: data.mediums?.name || "",
  };
}