// src/services/emailService.js
import { supabase } from "../api/supabase";

// ─── Existing: direct email send (for custom messages) ────────────────
/**
 * Send an email directly (bypasses the template system).
 * @param {Object} options
 * @param {string|string[]} options.to - recipient email(s)
 * @param {string} options.subject
 * @param {string} options.html
 * @param {string} [options.from] - optional sender override
 */
export async function sendEmail({ to, subject, html, from }) {
  // Note: this does not use templates; it's a raw send.
  // For template‑based emails, use sendTemplateEmail() instead.
  const { data, error } = await supabase.functions.invoke("send-email", {
    body: { to, subject, html, from },
  });
  if (error) throw error;
  return data;
}

// ─── NEW: template-based email using the Edge Function ────────────────
/**
 * Send an email using a database template (supports Handlebars).
 * @param {Object} options
 * @param {string|string[]} options.to
 * @param {number} options.organizationId
 * @param {string} options.slug - e.g. "fee_receipt", "inquiry_status_change"
 * @param {Record<string, any>} [options.context] - key-value for placeholders
 * @param {number|null} [options.branchId] - optional branch fallback
 * @param {string} [options.from] - optional sender override
 * @param {string} [options.subject] - override template subject
 * @param {string} [options.html] - override template HTML
 */
export async function sendTemplateEmail({
  to,
  organizationId,
  slug,
  context = {},
  branchId = null,
  from,
  subject: overrideSubject,
  html: overrideHtml,
}) {
  const { data, error } = await supabase.functions.invoke("send-email", {
    body: {
      to,
      organizationId,
      slug,
      context,
      branchId,
      from,
      subject: overrideSubject,
      html: overrideHtml,
    },
  });
  if (error) throw error;
  return data;
}

// ─── Utility: send to users by ID ──────────────────────────────────────
/**
 * Send an email to one or more users by their user IDs.
 * Fetches emails from the profiles table.
 * @param {string[]} userIds
 * @param {string} subject
 * @param {string} html
 * @param {string} [from]
 */
export async function sendEmailToUsers(userIds, subject, html, from) {
  if (!userIds?.length) return;

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

// ─── Utility: send to all users with a given role ──────────────────────
/**
 * Send an email to all users of a specific role (e.g., "teacher", "student").
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

// ─── Fee Receipt Email – now uses database template ────────────────────
/**
 * Sends a fee payment receipt email using the "fee_receipt" template.
 * @param {number} paymentId - fee_payments.id
 * @param {object} org - organization object (must have id and company_name)
 */
export async function sendFeeReceiptEmail(paymentId, org) {
  // 1. Fetch payment data with student details (no balance_due)
  const { data: payment, error: paymentError } = await supabase
    .from("fee_payments")
    .select(`
      id, amount, payment_date, payment_mode, transaction_no, receipt_number,
      student_fee_id (
        id,
        students ( first_name, last_name, email )
      )
    `)
    .eq("id", paymentId)
    .single();

  if (paymentError) throw paymentError;
  if (!payment || !payment.student_fee_id?.students?.email) {
    console.warn("No student email found for payment", paymentId);
    return;
  }

  const studentFeeId = payment.student_fee_id.id;
  const student = payment.student_fee_id.students;
  const studentName = `${student.first_name} ${student.last_name}`.trim();

  // 2. Fetch the student_fee record to get final_fee
  const { data: studentFee, error: feeError } = await supabase
    .from("student_fees")
    .select("final_fee")
    .eq("id", studentFeeId)
    .single();

  if (feeError) throw feeError;

  // 3. Fetch all payments for this student_fee (excluding soft-deleted)
  const { data: payments, error: paymentsError } = await supabase
    .from("fee_payments")
    .select("amount")
    .eq("student_fee_id", studentFeeId)
    .is("deleted_at", null); // ✅ no status column – use deleted_at

  if (paymentsError) throw paymentsError;

  const totalPaid = payments.reduce((sum, p) => sum + Number(p.amount), 0);
  const balanceDue = Math.max(Number(studentFee.final_fee) - totalPaid, 0);

  // 4. Build context and send email
  const context = {
    academyName: org?.company_name || "ShreeVidhya Academy",
    studentName,
    receiptNo: payment.receipt_number || "N/A",
    amount: Number(payment.amount).toLocaleString("en-IN"),
    paymentDate: payment.payment_date,
    paymentMode: payment.payment_mode,
    transactionNo: payment.transaction_no || "",
    balanceDue: balanceDue,
  };

  await sendTemplateEmail({
    to: student.email,
    organizationId: org.id,
    slug: "fee_receipt",
    context,
    branchId: org.branch_id, // optional
  });
}