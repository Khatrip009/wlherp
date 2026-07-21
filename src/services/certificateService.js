// src/services/certificateService.js
import { supabase } from "../api/supabase";
import { sendTemplateEmail } from "./emailService"; // 👈 Added

// ─── Helper: send certificate issued email ─────────────────────────────
async function sendCertificateEmail(certificate, context) {
  const { branchId, financialYearId } = context;
  try {
    // 1. Fetch student details
    const { data: student, error: studentError } = await supabase
      .from("students")
      .select("first_name, last_name, email, admission_no, branch_id")
      .eq("id", certificate.student_id)
      .single();
    if (studentError) throw studentError;

    // 2. Fetch parent email (prefer parent, fallback to student email)
    const { data: parent, error: parentError } = await supabase
      .from("student_parents")
      .select("parents!inner(email, father_name, mother_name)")
      .eq("student_id", certificate.student_id)
      .maybeSingle();
    // parentError is ignored – we just may not have a parent

    let recipientEmail = student.email;
    if (parent && parent.parents && parent.parents.email) {
      recipientEmail = parent.parents.email;
    }

    // 3. Fetch course and level names
    const { data: course, error: courseError } = await supabase
      .from("courses")
      .select("course_name")
      .eq("id", certificate.course_id)
      .single();
    if (courseError) throw courseError;

    let levelName = null;
    if (certificate.level_id) {
      const { data: level, error: levelError } = await supabase
        .from("course_levels")
        .select("level_name")
        .eq("id", certificate.level_id)
        .single();
      if (!levelError && level) {
        levelName = level.level_name;
      }
    }

    // 4. Fetch organization details from branch
    const { data: branch, error: branchError } = await supabase
      .from("branches")
      .select("organization_id")
      .eq("id", branchId)
      .single();
    if (branchError) throw branchError;

    const { data: org, error: orgError } = await supabase
      .from("organization")
      .select("company_name, id")
      .eq("id", branch.organization_id)
      .single();
    if (orgError) throw orgError;

    // 5. Build context for email template
    const contextEmail = {
      academyName: org.company_name,
      student_name: `${student.first_name} ${student.last_name}`,
      certificate_no: certificate.certificate_no,
      course_name: course.course_name,
      level_name: levelName || '',
      issue_date: certificate.issue_date,
      download_link: certificate.certificate_url || '',
    };

    // 6. Send email
    await sendTemplateEmail({
      to: recipientEmail,
      organizationId: org.id,
      slug: "certificate_issued",
      context: contextEmail,
      branchId,
    });

    console.log(`✅ Certificate email sent to ${recipientEmail} for certificate ${certificate.certificate_no}`);
  } catch (error) {
    // Email failure should not block certificate creation – log the error
    console.error("❌ Failed to send certificate email:", error);
  }
}

// ─── Existing functions ─────────────────────────────────────────────────

export async function getCertificates() {
  const { data, error } = await supabase
    .from("certificates")
    .select(`
      *,
      students ( first_name, last_name, admission_no ),
      courses ( course_name ),
      course_levels ( level_name )
    `)
    .order("issue_date", { ascending: false });
  if (error) throw error;
  return data;
}

export async function getAllCertificatesForExport() {
  const { data, error } = await supabase
    .from("certificates")
    .select(`
      *,
      students ( first_name, last_name, admission_no ),
      courses ( course_name ),
      course_levels ( level_name )
    `)
    .order("issue_date", { ascending: false });
  if (error) throw error;
  return data || [];
}

// ─── Create Certificate – now sends email ──────────────────────────────
// context: { branchId, financialYearId }
export async function createCertificate(payload, context) {
  const { branchId, financialYearId } = context;
  const { data, error } = await supabase
    .from("certificates")
    .insert([{ ...payload, branch_id: branchId, financial_year_id: financialYearId }])
    .select()
    .single();
  if (error) throw error;

  // ─── Send certificate email ──────────────────────────────
  await sendCertificateEmail(data, context);

  return data;
}

// Soft delete – still needs context to satisfy RLS (WITH CHECK may need explicit values)
// context: { branchId, financialYearId }
export async function deleteCertificate(id, context) {
  const { branchId, financialYearId } = context;
  const { error } = await supabase
    .from("certificates")
    .update({
      deleted_at: new Date().toISOString(),
      branch_id: branchId,
      financial_year_id: financialYearId,
    })
    .eq("id", id);
  if (error) throw error;
}

export async function getStudentOptions() {
  const { data, error } = await supabase
    .from("students")
    .select("id, first_name, last_name, admission_no")
    .order("first_name");
  if (error) throw error;
  return data;
}

export async function getCourseOptions() {
  const { data, error } = await supabase
    .from("courses")
    .select("id, course_name")
    .order("course_name");
  if (error) throw error;
  return data;
}

export async function getLevelsByCourse(courseId) {
  const { data, error } = await supabase
    .from("course_levels")
    .select("id, level_name")
    .eq("course_id", courseId)
    .order("level_number");
  if (error) throw error;
  return data;
}