// src/services/admissionService.js
import { supabase } from "../api/supabase";

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

    return { success: true };
  } catch (error) {
    console.error(error);
    return { success: false, error };
  }
}