// src/services/admissionService.js
import { supabase } from "../api/supabase";
import { sendTemplateEmail } from "./emailService"; // 👈 Added import

export async function convertInquiryToStudent(inquiry, branchId, financialYearId) {
  try {
    // 1. Create Parent
    const { data: parent, error: parentError } = await supabase
      .from("parents")
      .insert([{
        father_name: inquiry.parent_name,
        mobile: inquiry.mobile,
        whatsapp: inquiry.whatsapp,
        branch_id: branchId,
        financial_year_id: financialYearId,
      }])
      .select()
      .single();

    if (parentError) throw parentError;

    // 2. Create Student
    const admissionNo = `SVA-${Date.now()}`;

    const studentPayload = {
      admission_no: admissionNo,
      first_name: inquiry.student_name,
      mobile: inquiry.mobile,
      joining_date: new Date().toISOString(),
      branch_id: branchId,
      financial_year_id: financialYearId,
    };

    if (inquiry.medium_id) {
      studentPayload.medium_id = inquiry.medium_id;
    }

    const { data: student, error: studentError } = await supabase
      .from("students")
      .insert([studentPayload])
      .select()
      .single();

    if (studentError) throw studentError;

    // 3. Create Student-Parent Mapping
    const { error: mappingError } = await supabase
      .from("student_parents")
      .insert([{
        student_id: student.id,
        parent_id: parent.id,
        relation: "Father",
        branch_id: branchId,
        financial_year_id: financialYearId,
      }]);

    if (mappingError) throw mappingError;

    // 4. Update Inquiry status → 'Admitted'
    const { error: inquiryError } = await supabase
      .from("inquiries")
      .update({ status: "Admitted" })
      .eq("id", inquiry.id);

    if (inquiryError) throw inquiryError;

    // ─── 5. Send Admission Confirmation Email ──────────────────────────
    // Fetch organization and branch details for the email context
    try {
      // Get branch details
      const { data: branch, error: branchError } = await supabase
        .from("branches")
        .select("branch_name, organization_id")
        .eq("id", branchId)
        .single();

      if (branchError) throw branchError;

      // Get organization details
      const { data: org, error: orgError } = await supabase
        .from("organization")
        .select("company_name, id")
        .eq("id", branch.organization_id)
        .single();

      if (orgError) throw orgError;

      // Get course name (if available)
      let courseName = "N/A";
      if (inquiry.interested_course_id) {
        const { data: course, error: courseError } = await supabase
          .from("courses")
          .select("course_name")
          .eq("id", inquiry.interested_course_id)
          .single();

        if (!courseError && course) {
          courseName = course.course_name;
        }
      }

      // Build the email context
      const context = {
        academyName: org.company_name,
        student_name: inquiry.student_name,
        admission_no: admissionNo,
        course_name: courseName,
        batch_name: "N/A", // You can assign a batch later if needed
        joining_date: new Date().toISOString().split("T")[0],
        branch_name: branch.branch_name,
      };

      // Send the email to the parent (inquiry.email) – or you can use student.email if available
      await sendTemplateEmail({
        to: inquiry.email,
        organizationId: org.id,
        slug: "admission_confirmation",
        context,
        branchId: branchId,
      });

      console.log("✅ Admission confirmation email sent to", inquiry.email);

    } catch (emailError) {
      // Email failure should not block the conversion – log the error
      console.error("❌ Failed to send admission confirmation email:", emailError);
    }

    return { success: true };
  } catch (error) {
    console.error(error);
    return { success: false, error };
  }
}