// src/services/teacherService.js
import { supabase } from "../api/supabase";
import { sendTemplateEmail } from "./emailService"; // 👈 Added

// ─── Helpers ──────────────────────────────────────────────────────────

async function getOrganizationFromBranch(branchId) {
  const { data: branch, error: branchError } = await supabase
    .from("branches")
    .select("organization_id")
    .eq("id", branchId)
    .single();
  if (branchError) throw branchError;

  const { data: org, error: orgError } = await supabase
    .from("organization")
    .select("id, company_name")
    .eq("id", branch.organization_id)
    .single();
  if (orgError) throw orgError;
  return org;
}

/**
 * Send a teacher onboarding email using the "teacher_onboarding" template.
 */
async function sendTeacherOnboardingEmail(teacher, context) {
  const { branchId, financialYearId } = context;
  try {
    if (!teacher.email) {
      console.warn(`No email for teacher ${teacher.id}, skipping onboarding email.`);
      return;
    }

    const org = await getOrganizationFromBranch(branchId);
    const fullName = `${teacher.first_name} ${teacher.last_name}`.trim();

    const contextEmail = {
      academyName: org.company_name,
      teacher_name: fullName || 'Teacher',
      employee_code: teacher.employee_code || 'N/A',
      email: teacher.email,
      // We don't have a password here; you can generate one and create auth user if needed.
      // For now, we provide a placeholder.
      temp_password: 'Please set your password using the "Forgot Password" link',
      login_link: `${window.location.origin}/login`, // adjust to your app's login URL
    };

    await sendTemplateEmail({
      to: teacher.email,
      organizationId: org.id,
      slug: "teacher_onboarding",
      context: contextEmail,
      branchId,
    });
    console.log(`✅ Onboarding email sent to teacher ${teacher.email}`);
  } catch (error) {
    console.error("❌ Failed to send teacher onboarding email:", error);
  }
}

// ─── Helper: clean teacher data ──────────────────────────
function cleanTeacherData(data) {
  const allowedFields = [
    'first_name', 'last_name', 'employee_code', 'mobile', 'email',
    'qualification', 'joining_date', 'salary', 'status', 'user_id'
  ];
  const cleaned = {};
  for (const key of allowedFields) {
    if (data[key] !== undefined) {
      let value = data[key];
      if (value === '') value = null;
      if (key === 'salary' && value !== null) {
        const num = Number(value);
        value = isNaN(num) ? null : num;
      }
      if (key === 'joining_date' && value !== null) {
        const d = new Date(value);
        if (isNaN(d.getTime())) value = null;
        else value = d.toISOString().split('T')[0];
      }
      cleaned[key] = value;
    }
  }
  return cleaned;
}

// ─── GET TEACHERS (paginated) ────────────────────────────
export async function getTeachers({
  pageParam = 0,
  filters = {},
  branchId,
  financialYearId,
} = {}) {
  const limit = 10;
  const from = pageParam * limit;
  const to = from + limit - 1;

  let query = supabase
    .from("teachers")
    .select(
      `
      *,
      teacher_mediums ( medium_id, mediums ( name ) ),
      teacher_courses ( course_id, courses ( course_name ) ),
      teacher_course_levels ( course_level_id, course_levels ( level_name ) ),
      teacher_subjects ( subject_id, subjects ( subject_name ) )
    `,
      { count: "exact" }
    )
    .order("id", { ascending: false })
    .range(from, to);

  // Scope main table
  if (branchId) query = query.eq("branch_id", branchId);
  if (financialYearId) query = query.eq("financial_year_id", financialYearId);

  if (filters.search) {
    query = query.or(
      `first_name.ilike.%${filters.search}%,last_name.ilike.%${filters.search}%,employee_code.ilike.%${filters.search}%`
    );
  }

  // Scoped junction filter helper
  const filterByJunction = async (table, column, value) => {
    if (!value) return null;
    let subQuery = supabase
      .from(table)
      .select("teacher_id")
      .eq(column, value);
    if (branchId) subQuery = subQuery.eq("branch_id", branchId);
    if (financialYearId) subQuery = subQuery.eq("financial_year_id", financialYearId);
    const { data: ids, error } = await subQuery;
    if (error) throw error;
    return ids.map((t) => t.teacher_id);
  };

  let teacherIds = null;

  if (filters.medium_id) {
    const ids = await filterByJunction("teacher_mediums", "medium_id", filters.medium_id);
    if (ids === null) return { data: [], count: 0 };
    teacherIds = teacherIds ? teacherIds.filter((id) => ids.includes(id)) : ids;
  }
  if (filters.course_id) {
    const ids = await filterByJunction("teacher_courses", "course_id", filters.course_id);
    if (ids === null) return { data: [], count: 0 };
    teacherIds = teacherIds ? teacherIds.filter((id) => ids.includes(id)) : ids;
  }
  if (filters.course_level_id) {
    const ids = await filterByJunction("teacher_course_levels", "course_level_id", filters.course_level_id);
    if (ids === null) return { data: [], count: 0 };
    teacherIds = teacherIds ? teacherIds.filter((id) => ids.includes(id)) : ids;
  }
  if (filters.subject_id) {
    const ids = await filterByJunction("teacher_subjects", "subject_id", filters.subject_id);
    if (ids === null) return { data: [], count: 0 };
    teacherIds = teacherIds ? teacherIds.filter((id) => ids.includes(id)) : ids;
  }

  if (teacherIds) {
    if (teacherIds.length === 0) return { data: [], count: 0 };
    query = query.in("id", teacherIds);
  }

  const { data, error, count } = await query;
  if (error) throw error;

  const enriched = (data || []).map((teacher) => ({
    ...teacher,
    mediums: teacher.teacher_mediums?.map((tm) => ({
      id: tm.medium_id,
      name: tm.mediums?.name,
    })) || [],
    courses: teacher.teacher_courses?.map((tc) => ({
      id: tc.course_id,
      name: tc.courses?.course_name,
    })) || [],
    course_levels: teacher.teacher_course_levels?.map((tcl) => ({
      id: tcl.course_level_id,
      name: tcl.course_levels?.level_name,
    })) || [],
    subjects: teacher.teacher_subjects?.map((ts) => ({
      id: ts.subject_id,
      name: ts.subjects?.subject_name,
    })) || [],
  }));

  return { data: enriched, count };
}

// ─── EXPORT ALL TEACHERS ──────────────────────────────────
export async function getAllTeachersForExport(
  filters = {},
  branchId,
  financialYearId
) {
  let query = supabase
    .from("teachers")
    .select(
      `
      *,
      teacher_mediums ( medium_id, mediums ( name ) ),
      teacher_courses ( course_id, courses ( course_name ) ),
      teacher_course_levels ( course_level_id, course_levels ( level_name ) ),
      teacher_subjects ( subject_id, subjects ( subject_name ) )
    `
    )
    .order("id", { ascending: false });

  if (branchId) query = query.eq("branch_id", branchId);
  if (financialYearId) query = query.eq("financial_year_id", financialYearId);

  if (filters.search) {
    query = query.or(
      `first_name.ilike.%${filters.search}%,last_name.ilike.%${filters.search}%,employee_code.ilike.%${filters.search}%`
    );
  }

  const filterByJunction = async (table, column, value) => {
    if (!value) return null;
    let subQuery = supabase
      .from(table)
      .select("teacher_id")
      .eq(column, value);
    if (branchId) subQuery = subQuery.eq("branch_id", branchId);
    if (financialYearId) subQuery = subQuery.eq("financial_year_id", financialYearId);
    const { data: ids, error } = await subQuery;
    if (error) throw error;
    return ids.map((t) => t.teacher_id);
  };

  let teacherIds = null;

  if (filters.medium_id) {
    const ids = await filterByJunction("teacher_mediums", "medium_id", filters.medium_id);
    if (ids === null) return [];
    teacherIds = teacherIds ? teacherIds.filter((id) => ids.includes(id)) : ids;
  }
  if (filters.course_id) {
    const ids = await filterByJunction("teacher_courses", "course_id", filters.course_id);
    if (ids === null) return [];
    teacherIds = teacherIds ? teacherIds.filter((id) => ids.includes(id)) : ids;
  }
  if (filters.course_level_id) {
    const ids = await filterByJunction("teacher_course_levels", "course_level_id", filters.course_level_id);
    if (ids === null) return [];
    teacherIds = teacherIds ? teacherIds.filter((id) => ids.includes(id)) : ids;
  }
  if (filters.subject_id) {
    const ids = await filterByJunction("teacher_subjects", "subject_id", filters.subject_id);
    if (ids === null) return [];
    teacherIds = teacherIds ? teacherIds.filter((id) => ids.includes(id)) : ids;
  }

  if (teacherIds) {
    if (teacherIds.length === 0) return [];
    query = query.in("id", teacherIds);
  }

  const { data, error } = await query;
  if (error) throw error;

  return (data || []).map((teacher) => ({
    ...teacher,
    mediums: teacher.teacher_mediums?.map((tm) => tm.mediums?.name).filter(Boolean) || [],
    courses: teacher.teacher_courses?.map((tc) => tc.courses?.course_name).filter(Boolean) || [],
    course_levels: teacher.teacher_course_levels?.map((tcl) => tcl.course_levels?.level_name).filter(Boolean) || [],
    subjects: teacher.teacher_subjects?.map((ts) => ts.subjects?.subject_name).filter(Boolean) || [],
  }));
}

// ─── CREATE TEACHER ──────────────────────────────────────
export async function createTeacher(payload, context) {
  const {
    email,
    password,        // ignored for now; you can use it to create auth user
    medium_ids,
    course_ids,
    course_level_ids,
    subject_ids,
    ...teacherData
  } = payload;

  const { branchId, financialYearId } = context;
  const cleanedTeacher = cleanTeacherData({ ...teacherData, email });

  const { data: teacher, error } = await supabase
    .from("teachers")
    .insert([{
      ...cleanedTeacher,
      user_id: null,
      branch_id: branchId,
      financial_year_id: financialYearId,
    }])
    .select()
    .single();
  if (error) throw error;

  const insertJunction = async (table, idField, ids) => {
    if (!ids || ids.length === 0) return;
    const rows = ids.map((id) => ({
      teacher_id: teacher.id,
      [idField]: id,
      branch_id: branchId,
      financial_year_id: financialYearId,
    }));
    const { error: err } = await supabase.from(table).insert(rows);
    if (err) throw err;
  };

  await insertJunction("teacher_mediums", "medium_id", medium_ids);
  await insertJunction("teacher_courses", "course_id", course_ids);
  await insertJunction("teacher_course_levels", "course_level_id", course_level_ids);
  await insertJunction("teacher_subjects", "subject_id", subject_ids);

  // ─── Send onboarding email if email is provided ────────
  if (email) {
    await sendTeacherOnboardingEmail({ ...teacher, email }, context);
  }

  return teacher;
}

// ─── UPDATE TEACHER ──────────────────────────────────────
export async function updateTeacher(id, payload, context) {
  const {
    medium_ids,
    course_ids,
    course_level_ids,
    subject_ids,
    ...teacherData
  } = payload;

  const { branchId, financialYearId } = context;
  const cleanedTeacher = cleanTeacherData(teacherData);

  // Update teacher record with scope
  let updateQuery = supabase
    .from("teachers")
    .update({ ...cleanedTeacher, branch_id: branchId, financial_year_id: financialYearId })
    .eq("id", id);

  if (branchId) updateQuery = updateQuery.eq("branch_id", branchId);
  if (financialYearId) updateQuery = updateQuery.eq("financial_year_id", financialYearId);

  const { data: teacher, error } = await updateQuery.select().single();
  if (error) throw error;

  // Replace junction records – scoped deletions and inserts
  const replaceJunction = async (table, idField, ids) => {
    // Delete existing scoped to teacher_id, branch, FY
    let deleteQuery = supabase
      .from(table)
      .delete()
      .eq("teacher_id", id);
    if (branchId) deleteQuery = deleteQuery.eq("branch_id", branchId);
    if (financialYearId) deleteQuery = deleteQuery.eq("financial_year_id", financialYearId);
    await deleteQuery;

    if (ids && ids.length > 0) {
      const rows = ids.map((val) => ({
        teacher_id: id,
        [idField]: val,
        branch_id: branchId,
        financial_year_id: financialYearId,
      }));
      const { error: err } = await supabase.from(table).insert(rows);
      if (err) throw err;
    }
  };

  await replaceJunction("teacher_mediums", "medium_id", medium_ids);
  await replaceJunction("teacher_courses", "course_id", course_ids);
  await replaceJunction("teacher_course_levels", "course_level_id", course_level_ids);
  await replaceJunction("teacher_subjects", "subject_id", subject_ids);

  return teacher;
}

// ─── DELETE (soft) ────────────────────────────────────────
export async function deleteTeacher(id, context) {
  const { branchId, financialYearId } = context;

  let query = supabase
    .from("teachers")
    .update({
      deleted_at: new Date().toISOString(),
      branch_id: branchId,
      financial_year_id: financialYearId,
    })
    .eq("id", id);

  if (branchId) query = query.eq("branch_id", branchId);
  if (financialYearId) query = query.eq("financial_year_id", financialYearId);

  const { error } = await query;
  if (error) throw error;
}

// ─── OPTIONS ──────────────────────────────────────────────
export async function getTeacherOptions(branchId, financialYearId) {
  let query = supabase
    .from("teachers")
    .select("id, first_name, last_name");

  if (branchId) query = query.eq("branch_id", branchId);
  if (financialYearId) query = query.eq("financial_year_id", financialYearId);

  const { data, error } = await query;
  if (error) throw error;
  return data;
}

export async function getMediumOptions() {
  const { data, error } = await supabase
    .from("mediums")
    .select("id, name")
    .order("name");
  if (error) throw error;
  return data || [];
}

export async function getCourseOptions() {
  const { data, error } = await supabase
    .from("courses")
    .select("id, course_name")
    .order("course_name");
  if (error) throw error;
  return data || [];
}

export async function getCourseLevelOptions() {
  const { data, error } = await supabase
    .from("course_levels")
    .select("id, level_name, course_id")
    .order("level_number");
  if (error) throw error;
  return data || [];
}

export async function getSubjectOptions() {
  const { data, error } = await supabase
    .from("subjects")
    .select("id, subject_name, course_id")
    .order("subject_name");
  if (error) throw error;
  return data || [];
}

// ─── SALARY & ACTIVE TEACHERS ──────────────────────────────
export async function updateTeacherSalary(teacherId, payload, context) {
  const { branchId, financialYearId } = context;

  let query = supabase
    .from('teachers')
    .update({
      salary_type: payload.salary_type,
      monthly_salary: payload.monthly_salary,
      per_lecture_rate: payload.per_lecture_rate,
      tds_percentage: payload.tds_percentage,
      branch_id: branchId,
      financial_year_id: financialYearId,
    })
    .eq('id', teacherId);

  if (branchId) query = query.eq('branch_id', branchId);
  if (financialYearId) query = query.eq('financial_year_id', financialYearId);

  const { data, error } = await query.select().single();
  if (error) throw error;
  return data;
}

export async function getTeacherWithSalary(id, branchId, financialYearId) {
  let query = supabase
    .from('teachers')
    .select('*')
    .eq('id', id);

  if (branchId) query = query.eq('branch_id', branchId);
  if (financialYearId) query = query.eq('financial_year_id', financialYearId);

  const { data, error } = await query.single();
  if (error) throw error;
  return data;
}

export async function getTeachersForSalary(branchId, financialYearId) {
  let query = supabase
    .from('teachers')
    .select('id, first_name, last_name, salary_type, monthly_salary, per_lecture_rate, tds_percentage')
    .eq('status', 'active');

  if (branchId) query = query.eq('branch_id', branchId);
  if (financialYearId) query = query.eq('financial_year_id', financialYearId);

  const { data, error } = await query;
  if (error) throw error;
  return data || [];
}

export async function getActiveTeachers(branchId, financialYearId) {
  let query = supabase
    .from('teachers')
    .select('id, first_name, last_name, employee_code, salary_type, monthly_salary, per_lecture_rate, tds_percentage')
    .eq('status', 'active')
    .order('first_name');

  if (branchId) query = query.eq('branch_id', branchId);
  if (financialYearId) query = query.eq('financial_year_id', financialYearId);

  const { data, error } = await query;
  if (error) throw error;
  return data || [];
}

// ─── HELPER: get current teacher ID from auth (cross‑branch, no scope) ──
export async function getCurrentTeacherId() {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;
  const { data: teacher, error } = await supabase
    .from('teachers')
    .select('id')
    .eq('user_id', user.id)
    .maybeSingle();
  if (error) throw error;
  return teacher?.id || null;
}