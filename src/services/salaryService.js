// src/services/salaryService.js
import { supabase } from '../api/supabase';

// ─── GET SALARY PAYMENTS (with optional filters) ──────────
export async function getSalaryPayments(filters = {}) {
  let query = supabase
    .from('salary_payments')
    .select('*, teachers(first_name, last_name, employee_code)')
    .order('payment_date', { ascending: false });

  if (filters.teacher_id) query = query.eq('teacher_id', filters.teacher_id);
  if (filters.start_date) query = query.gte('payment_date', filters.start_date);
  if (filters.end_date) query = query.lte('payment_date', filters.end_date);

  const { data, error } = await query;
  if (error) throw error;
  return data || [];
}

// ─── CHECK EXISTING PAYMENTS FOR A MONTH ──────────────────
export async function getExistingSalaryPayments(month, year) {
  const startDate = `${year}-${String(month).padStart(2, '0')}-01`;
  const endDate = new Date(year, month, 0).toISOString().split('T')[0];
  const { data, error } = await supabase
    .from('salary_payments')
    .select('teacher_id')
    .gte('payment_date', startDate)
    .lte('payment_date', endDate);
  if (error) throw error;
  return data || [];
}

// ─── GET TOTAL LECTURES FOR A TEACHER IN A MONTH ──────────
async function getTeacherLectureCount(teacherId, startDate, endDate) {
  const { data } = await supabase
    .from('attendance_sessions')
    .select('teacher_id')
    .gte('attendance_date', startDate)
    .lte('attendance_date', endDate)
    .eq('teacher_id', teacherId);
  return (data || []).length;
}

// ─── GENERATE SALARY FOR A SINGLE TEACHER ─────────────────
// If grossAmount is provided (from the frontend), use it directly.
// Otherwise calculate it from the teacher's settings and actual lecture count.
// context: { branchId, financialYearId }
export async function generateTeacherSalary(teacherId, month, year, grossAmount = null, context) {
  const { branchId, financialYearId } = context;

  // 1. Get teacher details
  const { data: teacher, error: tErr } = await supabase
    .from('teachers')
    .select('*')
    .eq('id', teacherId)
    .single();
  if (tErr) throw tErr;

  const startDate = `${year}-${String(month).padStart(2, '0')}-01`;
  const endDate = new Date(year, month, 0).toISOString().split('T')[0]; // last day

  let finalGross = grossAmount;
  let totalLectures = 0;

  // If no gross amount passed (e.g. from bulk generation), compute it
  if (finalGross === null) {
    if (teacher.salary_type === 'fixed') {
      finalGross = teacher.monthly_salary || 0;
    } else if (teacher.salary_type === 'lecture_based') {
      totalLectures = await getTeacherLectureCount(teacherId, startDate, endDate);
      finalGross = totalLectures * (teacher.per_lecture_rate || 0);
    }
  } else {
    // grossAmount was passed – still we might want to show lecture count for record
    if (teacher.salary_type === 'lecture_based') {
      totalLectures = await getTeacherLectureCount(teacherId, startDate, endDate);
    }
  }

  const tdsPercent = teacher.tds_percentage || 10;
  const tdsAmount = (finalGross * tdsPercent) / 100;
  const netAmount = finalGross - tdsAmount;

  // 2. Insert salary payment
  const { data: payment, error: pErr } = await supabase
    .from('salary_payments')
    .insert({
      teacher_id: teacherId,
      payment_date: `${year}-${String(month).padStart(2, '0')}-15`,
      amount: finalGross,
      tds_percentage: tdsPercent,
      tds_amount: tdsAmount,
      net_amount: netAmount,
      total_lectures: totalLectures,
      payment_type: teacher.salary_type,
      payment_mode: 'Bank Transfer',
      remarks: `Salary for ${month}/${year}`,
      branch_id: branchId,
      financial_year_id: financialYearId,
    })
    .select()
    .single();
  if (pErr) throw pErr;
  return payment;
}

// ─── BULK GENERATE SALARIES FOR ALL ACTIVE TEACHERS ──────
// context: { branchId, financialYearId }
export async function generateAllSalaries(month, year, context) {
  const { data: teachers, error } = await supabase
    .from('teachers')
    .select('id')
    .eq('status', 'active');
  if (error) throw error;

  const results = [];
  for (const t of teachers) {
    try {
      const result = await generateTeacherSalary(t.id, month, year, null, context);
      results.push({ ...result, error: null });
    } catch (err) {
      results.push({ teacher_id: t.id, error: err.message });
    }
  }
  return results;
}

// ─── GET ACTIVE TEACHERS WITH SALARY SETTINGS ─────────────
export async function getTeachersForSalary() {
  const { data, error } = await supabase
    .from('teachers')
    .select('id, first_name, last_name, employee_code, salary_type, monthly_salary, per_lecture_rate, tds_percentage')
    .eq('status', 'active')
    .order('first_name');
  if (error) throw error;
  return data || [];
}

// ─── ALIAS for SalarySetup (same as getTeachersForSalary) ──
export async function getActiveTeachers() {
  return getTeachersForSalary();
}

// ─── UPDATE TEACHER SALARY SETTINGS (used in SalarySetup) ──
// context: { branchId, financialYearId }
export async function updateTeacherSalary(teacherId, payload, context) {
  const { branchId, financialYearId } = context;
  const { data, error } = await supabase
    .from('teachers')
    .update({
      salary_type: payload.salary_type,
      monthly_salary: payload.monthly_salary,
      per_lecture_rate: payload.per_lecture_rate,
      tds_percentage: payload.tds_percentage,
      branch_id: branchId,
      financial_year_id: financialYearId,
    })
    .eq('id', teacherId)
    .select()
    .single();
  if (error) throw error;
  return data;
}