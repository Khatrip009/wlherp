// src/services/subjectService.js
import { supabase } from "../api/supabase";

// Paginated fetch with search filter – now scoped by branch & FY
export async function getSubjects({ pageParam = 0, filters = {}, branchId, financialYearId } = {}) {
  const limit = 50;
  const from = pageParam * limit;
  const to = from + limit - 1;

  let query = supabase
    .from("subjects")
    .select("*, courses(course_name, medium_id, mediums(name))", { count: "exact" })
    .order("course_id, id")
    .range(from, to);

  // Scope main table
   if (branchId) query = query.eq("branch_id", branchId);
  if (financialYearId) query = query.eq("financial_year_id", financialYearId);

  if (filters.search) {
    query = query.or(
      `subject_name.ilike.%${filters.search}%,courses.course_name.ilike.%${filters.search}%`
    );
  }
  if (filters.medium_id) {
    // Courses are organisation-wide – no branch/FY filter needed here
    const { data: courseIds } = await supabase
      .from("courses")
      .select("id")
      .eq("medium_id", filters.medium_id);
    const ids = courseIds?.map((c) => c.id) || [];
    if (ids.length > 0) query = query.in("course_id", ids);
    else return { data: [], count: 0 };
  }

  const { data, error, count } = await query;
  if (error) throw error;

  // Flatten medium name
  const enriched = (data || []).map((subject) => ({
    ...subject,
    medium_name: subject.courses?.mediums?.name || "",
  }));

  return { data: enriched, count };
}

// Export all subjects – scoped
export async function getAllSubjectsForExport(filters = {}, branchId, financialYearId) {
  let query = supabase
    .from("subjects")
    .select("*, courses(course_name, medium_id, mediums(name))")
    .order("course_id, id");

  // Scope
  if (branchId) query = query.eq("branch_id", branchId);
  if (financialYearId) query = query.eq("financial_year_id", financialYearId);

  if (filters.search) {
    query = query.or(
      `subject_name.ilike.%${filters.search}%,courses.course_name.ilike.%${filters.search}%`
    );
  }
  if (filters.medium_id) {
    const { data: courseIds } = await supabase
      .from("courses")
      .select("id")
      .eq("medium_id", filters.medium_id);
    const ids = courseIds?.map((c) => c.id) || [];
    if (ids.length > 0) query = query.in("course_id", ids);
    else return [];
  }

  const { data, error } = await query;
  if (error) throw error;
  return (data || []).map((subject) => ({
    ...subject,
    medium_name: subject.courses?.mediums?.name || "",
  }));
}

// CRUD – context: { branchId, financialYearId }
export async function createSubject(payload, context) {
  const { branchId, financialYearId } = context;
  const { data, error } = await supabase
    .from("subjects")
    .insert([{ ...payload, branch_id: branchId, financial_year_id: financialYearId }])
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function updateSubject(id, payload, context) {
  const { branchId, financialYearId } = context;

  let query = supabase
    .from("subjects")
    .update({ ...payload, branch_id: branchId, financial_year_id: financialYearId })
    .eq("id", id);

  // Scope to prevent cross‑branch edits
  if (branchId) query = query.eq("branch_id", branchId);
  if (financialYearId) query = query.eq("financial_year_id", financialYearId);

  const { data, error } = await query.select().single();
  if (error) throw error;
  return data;
}

// Hard delete – now scoped to prevent cross‑branch deletion
export async function deleteSubject(id, branchId, financialYearId) {
  let query = supabase
    .from("subjects")
    .delete()
    .eq("id", id);

  if (branchId) query = query.eq("branch_id", branchId);
  if (financialYearId) query = query.eq("financial_year_id", financialYearId);

  const { error } = await query;
  if (error) throw error;
}

// Course dropdown (unchanged, organisation‑wide)
export async function getCoursesForDropdown() {
  const { data, error } = await supabase
    .from("courses")
    .select("id, course_name")
    .order("course_name");
  if (error) throw error;
  return data;
}

// Mediums (unchanged, organisation‑wide)
export async function getMediumOptions() {
  const { data, error } = await supabase
    .from("mediums")
    .select("id, name")
    .order("name");
  if (error) throw error;
  return data || [];
}