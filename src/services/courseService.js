// src/services/courseService.js
import { supabase } from "../api/supabase";

// Paginated fetch with search filter – now includes medium name
export async function getCourses({ pageParam = 0, filters = {} } = {}) {
  const limit = 10;
  const from = pageParam * limit;
  const to = from + limit - 1;

  let query = supabase
    .from("courses")
    .select("*, mediums(name)", { count: "exact" })
    .order("id", { ascending: false })
    .range(from, to);

  if (filters.search) {
    query = query.ilike("course_name", `%${filters.search}%`);
  }
  if (filters.medium_id) {
    query = query.eq("medium_id", filters.medium_id);
  }

  const { data, error, count } = await query;
  if (error) throw error;

  const enriched = (data || []).map((course) => ({
    ...course,
    medium_name: course.mediums?.name || "",
  }));

  return { data: enriched, count };
}

// Export all courses (unpaginated, respecting search and medium filter)
export async function getAllCoursesForExport(filters = {}) {
  let query = supabase
    .from("courses")
    .select("*, mediums(name)")
    .order("id", { ascending: false });

  if (filters.search) {
    query = query.ilike("course_name", `%${filters.search}%`);
  }
  if (filters.medium_id) {
    query = query.eq("medium_id", filters.medium_id);
  }

  const { data, error } = await query;
  if (error) throw error;
  return (data || []).map((course) => ({
    ...course,
    medium_name: course.mediums?.name || "",
  }));
}

// CRUD – medium_id is accepted inside payload
// context: { branchId, financialYearId }
export async function createCourse(payload, context) {
  const { branchId, financialYearId } = context;
  const { data, error } = await supabase
    .from("courses")
    .insert([{ ...payload, branch_id: branchId, financial_year_id: financialYearId }])
    .select()
    .single();
  if (error) throw error;
  return data;
}

// context: { branchId, financialYearId }
export async function updateCourse(id, payload, context) {
  const { branchId, financialYearId } = context;
  const { data, error } = await supabase
    .from("courses")
    .update({ ...payload, branch_id: branchId, financial_year_id: financialYearId })
    .eq("id", id)
    .select()
    .single();
  if (error) throw error;
  return data;
}

// Soft delete – context needed for RLS on update
// context: { branchId, financialYearId }
export async function deleteCourse(id, context) {
  const { branchId, financialYearId } = context;
  const { error } = await supabase
    .from("courses")
    .update({
      deleted_at: new Date().toISOString(),
      branch_id: branchId,
      financial_year_id: financialYearId,
    })
    .eq("id", id);
  if (error) throw error;
}

export async function getCourseOptions() {
  const { data, error } = await supabase
    .from("courses")
    .select("id, course_name");
  if (error) throw error;
  return data;
}

// ========================
// COURSE LEVELS
// ========================

export async function getCourseLevels(courseId) {
  const { data, error } = await supabase
    .from("course_levels")
    .select("*")
    .eq("course_id", courseId)
    .order("level_number", { ascending: true });
  if (error) throw error;
  return data;
}

// context: { branchId, financialYearId }
export async function createCourseLevel(payload, context) {
  const { branchId, financialYearId } = context;
  const { data, error } = await supabase
    .from("course_levels")
    .insert([{ ...payload, branch_id: branchId, financial_year_id: financialYearId }])
    .select()
    .single();
  if (error) throw error;
  return data;
}

// context: { branchId, financialYearId }
export async function updateCourseLevel(id, payload, context) {
  const { branchId, financialYearId } = context;
  const { data, error } = await supabase
    .from("course_levels")
    .update({ ...payload, branch_id: branchId, financial_year_id: financialYearId })
    .eq("id", id)
    .select()
    .single();
  if (error) throw error;
  return data;
}

// Hard delete – RLS handles access check, no payload needed
export async function deleteCourseLevel(id) {
  const { error } = await supabase
    .from("course_levels")
    .delete()
    .eq("id", id);
  if (error) throw error;
}

// NEW – get mediums for filter dropdowns
export async function getMediumOptions() {
  const { data, error } = await supabase
    .from("mediums")
    .select("id, name")
    .order("name");
  if (error) throw error;
  return data || [];
}