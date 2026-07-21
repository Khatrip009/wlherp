// src/services/emailService.js
import { supabase } from "../api/supabase";
import { feeReceiptTemplate } from "../emails/feeReceiptTemplate";

/**
 * Send email to one or more email addresses directly.
 * @param {Object} options
 * @param {string|string[]} options.to - recipient email(s)
 * @param {string} options.subject
 * @param {string} options.html
 * @param {string} [options.from]
 */
export async function sendEmail({ to, subject, html, from }) {
  const { data, error } = await supabase.functions.invoke("send-email", {
    body: { to, subject, html, from },
  });
  if (error) throw error;
  return data;
}

/**
 * Send an email to one or more users by their user IDs.
 * Fetches the emails from the profiles table.
 *
 * @param {string[]} userIds - array of auth.user.id
 * @param {string} subject
 * @param {string} html
 * @param {string} [from]
 */
export async function sendEmailToUsers(userIds, subject, html, from) {
  if (!userIds?.length) return;

  // Fetch email addresses from profiles
  const { data: profiles, error } = await supabase
    .from("profiles")
    .select("email")
    .in("id", userIds);

  if (error) throw error;

  const emails = profiles?.map((p) => p.email).filter(Boolean) || [];
  if (!emails.length) return;

  // Resend accepts up to 50 recipients per call – split if necessary
  const BATCH_SIZE = 50;
  for (let i = 0; i < emails.length; i += BATCH_SIZE) {
    const batch = emails.slice(i, i + BATCH_SIZE);
    await sendEmail({ to: batch, subject, html, from });
  }
}

/**
 * Send an email to all users of a specific role.
 * Example: "teacher", "student", "admin"
 */
export async function sendEmailToRole(role, subject, html, from) {
  const { data: profiles, error } = await supabase
    .from("profiles")
    .select("id")
    .eq("role", role);

  if (error) throw error;

  const userIds = profiles?.map((p) => p.id) || [];
  return sendEmailToUsers(userIds, subject, html, from);
}

// ─── NEW: Fee receipt email ────────────────────────────────
/**
 * Sends a fee payment receipt email to the student.
 * @param {number} paymentId - fee_payments.id
 * @param {object} org - organization object (from useOrg)
 */
export async function sendFeeReceiptEmail(paymentId, org) {
  // Fetch payment + student + receipt
  const { data: payment } = await supabase
    .from("fee_payments")
    .select(`id, amount, payment_date, payment_mode, transaction_no, receipt_number,
             student_fee_id,
             student_fees( student_id, balance_due, students(first_name, last_name, email) )`)
    .eq("id", paymentId)
    .single();

  if (!payment || !payment.student_fee_id?.students?.email) return;

  const student = payment.student_fee_id.students;
  const studentEmail = student.email;
  const studentName = `${student.first_name} ${student.last_name}`.trim();

  const html = feeReceiptTemplate({
    studentName,
    receiptNo: payment.receipt_number || "N/A",
    amount: Number(payment.amount).toLocaleString("en-IN"),
    paymentDate: payment.payment_date,
    paymentMode: payment.payment_mode,
    transactionNo: payment.transaction_no,
    balanceDue: payment.student_fee_id?.balance_due || 0,
    academyName: org?.company_name || "ShreeVidhya Academy",
  });

  await sendEmail({
    to: studentEmail,
    subject: "Fee Payment Receipt",
    html,
  });
}