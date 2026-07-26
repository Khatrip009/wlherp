// src/services/courseService.js
import { supabase } from "../api/supabase";

// ─── COURSES ──────────────────────────────────────────────

export async function getCourses({ pageParam = 0, filters = {}, organizationId, financialYearId } = {}) {
  if (!organizationId) throw new Error("organizationId is required");

  const limit = 10;
  const from = pageParam * limit;
  const to = from + limit - 1;

  let query = supabase
    .from("courses")
    .select("*, mediums(name)", { count: "exact" })
    .eq("organization_id", organizationId)
    .is("deleted_at", null)
    .order("id", { ascending: false })
    .range(from, to);

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

export async function getAllCoursesForExport({ filters = {}, organizationId, financialYearId } = {}) {
  if (!organizationId) throw new Error("organizationId is required");

  let query = supabase
    .from("courses")
    .select("*, mediums(name)")
    .eq("organization_id", organizationId)
    .is("deleted_at", null)
    .order("id", { ascending: false });

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

export async function getCourseOptions(organizationId, financialYearId) {
  if (!organizationId) throw new Error("organizationId is required");

  let query = supabase
    .from("courses")
    .select("id, course_name")
    .eq("organization_id", organizationId)
    .is("deleted_at", null);

  if (financialYearId) query = query.eq("financial_year_id", financialYearId);
  const { data, error } = await query;
  if (error) throw error;
  return data || [];
}

export async function createCourse(payload, context) {
  const { organizationId, financialYearId } = context;
  if (!organizationId) throw new Error("organizationId is required in context");

  const { data, error } = await supabase
    .from("courses")
    .insert([{
      ...payload,
      organization_id: organizationId,
      financial_year_id: financialYearId || null,
    }])
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function updateCourse(id, payload, context) {
  const { organizationId, financialYearId } = context;
  if (!organizationId) throw new Error("organizationId is required in context");

  const { data, error } = await supabase
    .from("courses")
    .update({
      ...payload,
      organization_id: organizationId,
      financial_year_id: financialYearId || null,
    })
    .eq("id", id)
    .select()
    .single();
  if (error) throw error;
  return data;
}

/**
 * Soft‑delete a course and ALL its levels (cascade soft delete).
 */
export async function deleteCourse(id, context) {
  const { organizationId, financialYearId } = context;
  if (!organizationId) throw new Error("organizationId is required in context");

  const timestamp = new Date().toISOString();

  // 1. Soft‑delete the course itself
  const { error: courseError } = await supabase
    .from("courses")
    .update({
      deleted_at: timestamp,
      organization_id: organizationId,
      financial_year_id: financialYearId || null,
    })
    .eq("id", id);
  if (courseError) throw courseError;

  // 2. Soft‑delete all levels that are NOT already deleted
  const { error: levelsError } = await supabase
    .from("course_levels")
    .update({ deleted_at: timestamp })   // ← only this column
    .eq("course_id", id)
    .is("deleted_at", null);
  if (levelsError) throw levelsError;
}

// ─── COURSE LEVELS ─────────────────────────────────────────

export async function getCourseLevels(courseId, organizationId, financialYearId) {
  if (!organizationId) throw new Error("organizationId is required");

  let query = supabase
    .from("course_levels")
    .select("*")
    .eq("course_id", courseId)
    .is("deleted_at", null)          // ✅ exclude soft‑deleted levels
    .order("level_number", { ascending: true });

  if (financialYearId) query = query.eq("financial_year_id", financialYearId);

  const { data, error } = await query;
  if (error) throw error;
  return data || [];
}

export async function createCourseLevel(payload, context) {
  const { organizationId, financialYearId } = context;
  if (!organizationId) throw new Error("organizationId is required");

  const { data, error } = await supabase
    .from("course_levels")
    .insert([{
      ...payload,
      organization_id: organizationId,
      financial_year_id: financialYearId || null,
    }])
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function updateCourseLevel(id, payload, context) {
  const { organizationId, financialYearId } = context;
  if (!organizationId) throw new Error("organizationId is required");

  const { data, error } = await supabase
    .from("course_levels")
    .update({
      ...payload,
      organization_id: organizationId,
      financial_year_id: financialYearId || null,
    })
    .eq("id", id)
    .select()
    .single();
  if (error) throw error;
  return data;
}

/**
 * Soft‑delete a single course level (instead of hard delete).
 */
export async function deleteCourseLevel(id, context) {
  const { organizationId, financialYearId } = context;
  if (!organizationId) throw new Error("organizationId is required");

  const { error } = await supabase
    .from("course_levels")
    .update({
      deleted_at: new Date().toISOString(),
      organization_id: organizationId,
      financial_year_id: financialYearId || null,
    })
    .eq("id", id)
    .eq("organization_id", organizationId);
  if (error) throw error;
}

// ─── MEDIUM OPTIONS ─────────────────────────────────────────

export async function getMediumOptions() {
  const { data, error } = await supabase
    .from("mediums")
    .select("id, name")
    .order("name");
  if (error) throw error;
  return data || [];
}