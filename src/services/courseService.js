// src/services/courseService.js
import { supabase } from "../api/supabase";

// ─── COURSES ──────────────────────────────────────────────

export async function getCourses({ pageParam = 0, filters = {}, branchId, financialYearId } = {}) {
  const limit = 10;
  const from = pageParam * limit;
  const to = from + limit - 1;

  let query = supabase
    .from("courses")
    .select("*, mediums(name)", { count: "exact" })
    .order("id", { ascending: false })
    .range(from, to);

  if (branchId) query = query.eq("branch_id", branchId);
  if (financialYearId) query = query.eq("financial_year_id", financialYearId);

  if (filters.search) query = query.ilike("course_name", `%${filters.search}%`);
  if (filters.medium_id) query = query.eq("medium_id", filters.medium_id);

  const { data, error, count } = await query;
  if (error) throw error;

  const enriched = (data || []).map((course) => ({
    ...course,
    medium_name: course.mediums?.name || "",
  }));

  return { data: enriched, count };
}

export async function getAllCoursesForExport({ filters = {}, branchId, financialYearId } = {}) {
  let query = supabase
    .from("courses")
    .select("*, mediums(name)")
    .order("id", { ascending: false });

  if (branchId) query = query.eq("branch_id", branchId);
  if (financialYearId) query = query.eq("financial_year_id", financialYearId);

  if (filters.search) query = query.ilike("course_name", `%${filters.search}%`);
  if (filters.medium_id) query = query.eq("medium_id", filters.medium_id);

  const { data, error } = await query;
  if (error) throw error;
  return (data || []).map((course) => ({
    ...course,
    medium_name: course.mediums?.name || "",
  }));
}

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

export async function getCourseOptions(branchId, financialYearId) {
  let query = supabase.from("courses").select("id, course_name");
  if (branchId) query = query.eq("branch_id", branchId);
  if (financialYearId) query = query.eq("financial_year_id", financialYearId);
  const { data, error } = await query;
  if (error) throw error;
  return data || [];
}

// ─── COURSE LEVELS ──────────────────────────────────────────

export async function getCourseLevels(courseId, branchId, financialYearId) {
  let query = supabase
    .from("course_levels")
    .select("*")
    .eq("course_id", courseId)
    .order("level_number", { ascending: true });

  if (branchId) query = query.eq("branch_id", branchId);
  if (financialYearId) query = query.eq("financial_year_id", financialYearId);

  const { data, error } = await query;
  if (error) throw error;
  return data || [];
}

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

export async function deleteCourseLevel(id, context) {
  const { branchId, financialYearId } = context;
  let query = supabase.from("course_levels").delete().eq("id", id);
  if (branchId) query = query.eq("branch_id", branchId);
  if (financialYearId) query = query.eq("financial_year_id", financialYearId);
  const { error } = await query;
  if (error) throw error;
}

// ─── MEDIUM OPTIONS ──────────────────────────────────────────

export async function getMediumOptions() {
  const { data, error } = await supabase
    .from("mediums")
    .select("id, name")
    .order("name");
  if (error) throw error;
  return data || [];
}