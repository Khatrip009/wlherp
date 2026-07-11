// src/services/subjectService.js
import { supabase } from "../api/supabase";

// Paginated fetch with search filter – now includes medium name
export async function getSubjects({ pageParam = 0, filters = {} } = {}) {
  const limit = 50;
  const from = pageParam * limit;
  const to = from + limit - 1;

  let query = supabase
    .from("subjects")
    .select("*, courses(course_name, medium_id, mediums(name))", { count: "exact" })
    .order("course_id, id")
    .range(from, to);

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

// Export all subjects (unpaginated, respecting search and medium filter)
export async function getAllSubjectsForExport(filters = {}) {
  let query = supabase
    .from("subjects")
    .select("*, courses(course_name, medium_id, mediums(name))")
    .order("course_id, id");

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
  const { data, error } = await supabase
    .from("subjects")
    .update({ ...payload, branch_id: branchId, financial_year_id: financialYearId })
    .eq("id", id)
    .select()
    .single();
  if (error) throw error;
  return data;
}

// Hard delete – RLS protects, no additional context needed
export async function deleteSubject(id) {
  const { error } = await supabase
    .from("subjects")
    .delete()
    .eq("id", id);
  if (error) throw error;
}

// Course dropdown (unchanged)
export async function getCoursesForDropdown() {
  const { data, error } = await supabase
    .from("courses")
    .select("id, course_name")
    .order("course_name");
  if (error) throw error;
  return data;
}

// NEW – get mediums for filter dropdown
export async function getMediumOptions() {
  const { data, error } = await supabase
    .from("mediums")
    .select("id, name")
    .order("name");
  if (error) throw error;
  return data || [];
}