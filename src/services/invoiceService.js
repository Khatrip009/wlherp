// src/services/invoiceService.js
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

async function getStudentParentEmail(studentId) {
  // Fetch student email
  const { data: student, error: studentError } = await supabase
    .from("students")
    .select("email, first_name, last_name")
    .eq("id", studentId)
    .single();
  if (studentError) return null;

  // Try to find a parent
  const { data: parent, error: parentError } = await supabase
    .from("student_parents")
    .select("parents!inner(email, father_name, mother_name)")
    .eq("student_id", studentId)
    .maybeSingle();

  if (!parentError && parent && parent.parents && parent.parents.email) {
    return { email: parent.parents.email, name: parent.parents.father_name || parent.parents.mother_name || student.first_name };
  }
  return { email: student.email, name: `${student.first_name} ${student.last_name}` };
}

async function sendInvoiceNotification(invoice, branchId, financialYearId) {
  try {
    const org = await getOrganizationFromBranch(branchId);
    const recipient = await getStudentParentEmail(invoice.student_id);
    if (!recipient || !recipient.email) {
      console.warn(`No email found for student ${invoice.student_id}, skipping invoice notification.`);
      return;
    }

    const message = `A new invoice has been generated:\n` +
      `Invoice Number: ${invoice.invoice_number}\n` +
      `Date: ${invoice.invoice_date}\n` +
      `Total Amount: ₹${Number(invoice.grand_total).toLocaleString('en-IN')}\n` +
      `Status: ${invoice.status}\n\n` +
      `Please log in to view the full invoice.`;

    await sendTemplateEmail({
      to: recipient.email,
      organizationId: org.id,
      slug: "system_announcement",
      context: {
        academyName: org.company_name,
        title: "New Invoice Generated",
        message,
        target_type: "Student/Parent",
      },
      branchId,
    });
    console.log(`✅ Invoice notification sent to ${recipient.email}`);
  } catch (error) {
    console.error("❌ Failed to send invoice notification:", error);
  }
}

async function notifyAdmins(orgId, title, message, branchId) {
  try {
    const { data: admins, error } = await supabase
      .from("profiles")
      .select("email")
      .eq("organization_id", orgId)
      .in("role", ["admin", "super_admin", "organization_admin"])
      .eq("is_active", true);
    if (error) throw error;
    const adminEmails = admins?.map(a => a.email).filter(Boolean);
    if (!adminEmails || adminEmails.length === 0) return;

    await sendTemplateEmail({
      to: adminEmails,
      organizationId: orgId,
      slug: "system_announcement",
      context: {
        academyName: "", // not required for admins, but pass something
        title,
        message,
        target_type: "Admin",
      },
      branchId,
    });
    console.log(`✅ Admin notification sent for: ${title}`);
  } catch (error) {
    console.error("❌ Failed to send admin notification:", error);
  }
}

// ─── INVOICES ──────────────────────────────────────────────────────────

// ─── Get the next invoice number from the database ──────────
async function generateUniqueInvoiceNumber() {
  const { data, error } = await supabase.rpc('next_invoice_number');
  if (error) {
    throw new Error('Could not generate invoice number: ' + error.message, { cause: error });
  }
  return data;   // e.g. "INV-2026-0001"
}

export async function getInvoices(filters = {}, branchId, financialYearId) {
  let query = supabase
    .from("invoices")
    .select(`
      *,
      students(first_name, last_name, admission_no),
      courses(course_name),
      batches(batch_name)
    `)
    .order("invoice_date", { ascending: false });

  if (branchId) query = query.eq("branch_id", branchId);
  if (financialYearId) query = query.eq("financial_year_id", financialYearId);

  if (filters.student_id) query = query.eq("student_id", filters.student_id);
  if (filters.status) query = query.eq("status", filters.status);
  if (filters.start_date) query = query.gte("invoice_date", filters.start_date);
  if (filters.end_date) query = query.lte("invoice_date", filters.end_date);
  if (filters.search) {
    query = query.or(`invoice_number.ilike.%${filters.search}%,students.first_name.ilike.%${filters.search}%`);
  }

  const { data, error } = await query;
  if (error) throw error;
  return data || [];
}

export async function getInvoice(id, branchId, financialYearId) {
  let invoiceQuery = supabase
    .from("invoices")
    .select(`
      *,
      students(first_name, last_name, admission_no, gstin, state_code, billing_address)
    `)
    .eq("id", id);

  if (branchId) invoiceQuery = invoiceQuery.eq("branch_id", branchId);
  if (financialYearId) invoiceQuery = invoiceQuery.eq("financial_year_id", financialYearId);

  const { data: invoice, error } = await invoiceQuery.single();
  if (error) throw error;

  let itemsQuery = supabase
    .from("invoice_items")
    .select("*")
    .eq("invoice_id", id);

  if (branchId) itemsQuery = itemsQuery.eq("branch_id", branchId);
  if (financialYearId) itemsQuery = itemsQuery.eq("financial_year_id", financialYearId);

  const { data: items, error: itemsError } = await itemsQuery;
  if (itemsError) throw itemsError;

  const enrichedItems = await Promise.all(
    (items || []).map(async (item) => {
      let taxRate = null;
      if (item.tax_rate_id) {
        let trQuery = supabase
          .from("tax_rates")
          .select("id, name, rate")
          .eq("id", item.tax_rate_id);
        if (branchId) trQuery = trQuery.eq("branch_id", branchId);
        if (financialYearId) trQuery = trQuery.eq("financial_year_id", financialYearId);
        const { data: tr } = await trQuery.single();
        taxRate = tr;
      }
      let inventoryItem = null;
      if (item.item_type === "product" && item.item_id) {
        let invQuery = supabase
          .from("inventory_items")
          .select("item_name, unit")
          .eq("id", item.item_id);
        if (branchId) invQuery = invQuery.eq("branch_id", branchId);
        if (financialYearId) invQuery = invQuery.eq("financial_year_id", financialYearId);
        const { data: inv } = await invQuery.single();
        inventoryItem = inv;
      }
      return { ...item, tax_rates: taxRate, inventory_items: inventoryItem };
    })
  );

  return { ...invoice, invoice_items: enrichedItems };
}

// ─── Create Invoice ────────────────────────────────────────────────

export async function createInvoice(payload, context) {
  const {
    student_id,
    invoice_date,
    due_date,
    payment_terms,
    gst_applicable,
    place_of_supply,
    reverse_charge,
    items,
    student_fee_id,
    fee_installment_id,
  } = payload;

  const { branchId, financialYearId } = context;

  let orgState = "";
  if (branchId) {
    const { data: branch } = await supabase
      .from("branches")
      .select("state")
      .eq("id", branchId)
      .single();
    orgState = branch?.state || "";
  }
  const placeOfSupply = place_of_supply || orgState;

  const taxRateIds = items.map(i => i.tax_rate_id).filter(id => id);
  let taxRateQuery = supabase.from("tax_rates").select("*").in("id", taxRateIds);
  if (branchId) taxRateQuery = taxRateQuery.eq("branch_id", branchId);
  if (financialYearId) taxRateQuery = taxRateQuery.eq("financial_year_id", financialYearId);
  const { data: taxRates } = await taxRateQuery;
  const taxRateMap = {};
  (taxRates || []).forEach(tr => taxRateMap[tr.id] = tr);

  let totalTaxable = 0, totalGST = 0, totalAmount = 0;
  let totalCgst = 0, totalSgst = 0, totalIgst = 0;
  const invoiceItems = items.map(item => {
    const unitPrice = parseFloat(item.unit_price) || 0;
    const qty = parseFloat(item.quantity) || 1;
    const taxable = unitPrice * qty;
    let cgst = 0, sgst = 0, igst = 0;
    if (item.tax_rate_id && taxRateMap[item.tax_rate_id]) {
      const rate = taxRateMap[item.tax_rate_id].rate;
      if (placeOfSupply === orgState) {
        cgst = (rate / 2) / 100 * taxable;
        sgst = (rate / 2) / 100 * taxable;
      } else {
        igst = rate / 100 * taxable;
      }
    }
    const total = taxable + cgst + sgst + igst;
    totalTaxable += taxable;
    totalCgst += cgst;
    totalSgst += sgst;
    totalIgst += igst;
    totalGST += cgst + sgst + igst;
    totalAmount += total;
    return {
      ...item,
      taxable_amount: taxable,
      cgst_amount: cgst,
      sgst_amount: sgst,
      igst_amount: igst,
      total_amount: total,
    };
  });

  const roundOff = Math.round(totalAmount) - totalAmount;
  const grandTotal = totalAmount + roundOff;

  // If an invoice already exists for this fee, reuse it
  const { data: existingInvoice } = await supabase
    .from("invoices")
    .select("*")
    .eq("student_fee_id", student_fee_id)
    .maybeSingle();

  if (existingInvoice) {
    return existingInvoice;
  }

  const invoiceNumber = await generateUniqueInvoiceNumber();

  const { data: invoice, error } = await supabase
    .from("invoices")
    .insert({
      invoice_number: invoiceNumber,
      invoice_date: invoice_date || new Date().toISOString().split("T")[0],
      student_id,
      due_date: due_date || null,
      payment_terms: payment_terms || "",
      gst_applicable: gst_applicable || false,
      place_of_supply: placeOfSupply,
      reverse_charge: reverse_charge || false,
      total_taxable_amount: totalTaxable,
      total_gst_amount: totalGST,
      total_cess: 0,
      total_amount: totalAmount,
      round_off: roundOff,
      grand_total: grandTotal,
      status: "Draft", // default
      student_fee_id: student_fee_id || null,
      fee_installment_id: fee_installment_id || null,
      branch_id: branchId,
      financial_year_id: financialYearId,
    })
    .select()
    .single();

  if (error) throw error;

  const itemInserts = invoiceItems.map(item => ({
    invoice_id: invoice.id,
    item_type: item.item_type,
    item_id: item.item_id || null,
    description: item.description || "",
    hsn_sac_code: item.hsn_sac_code || null,
    quantity: item.quantity,
    unit_price: item.unit_price,
    taxable_amount: item.taxable_amount,
    tax_rate_id: item.tax_rate_id || null,
    cgst_amount: item.cgst_amount || 0,
    sgst_amount: item.sgst_amount || 0,
    igst_amount: item.igst_amount || 0,
    cess_amount: 0,
    total_amount: item.total_amount,
    branch_id: branchId,
    financial_year_id: financialYearId,
  }));
  const { error: insError } = await supabase.from("invoice_items").insert(itemInserts);
  if (insError) throw insError;

  // If status is "Final", send email immediately
  if (payload.status === "Final") {
    await sendInvoiceNotification(invoice, branchId, financialYearId);
  }

  return invoice;
}

// ─── Update Invoice ──────────────────────────────────────────────────

export async function updateInvoice(id, payload, context) {
  const { items, ...headerData } = payload;
  const { branchId, financialYearId } = context;

  let updateQuery = supabase
    .from("invoices")
    .update({
      ...headerData,
      updated_at: new Date(),
      branch_id: branchId,
      financial_year_id: financialYearId,
    })
    .eq("id", id);
  if (branchId) updateQuery = updateQuery.eq("branch_id", branchId);
  if (financialYearId) updateQuery = updateQuery.eq("financial_year_id", financialYearId);

  const { data: invoice, error } = await updateQuery.select().single();
  if (error) throw error;

  if (items !== undefined) {
    let deleteItemsQuery = supabase.from("invoice_items").delete().eq("invoice_id", id);
    if (branchId) deleteItemsQuery = deleteItemsQuery.eq("branch_id", branchId);
    if (financialYearId) deleteItemsQuery = deleteItemsQuery.eq("financial_year_id", financialYearId);
    await deleteItemsQuery;

    const itemInserts = items.map(item => ({
      invoice_id: id,
      item_type: item.item_type,
      item_id: item.item_id || null,
      description: item.description || "",
      hsn_sac_code: item.hsn_sac_code || null,
      quantity: item.quantity,
      unit_price: item.unit_price,
      taxable_amount: item.taxable_amount,
      tax_rate_id: item.tax_rate_id || null,
      cgst_amount: item.cgst_amount || 0,
      sgst_amount: item.sgst_amount || 0,
      igst_amount: item.igst_amount || 0,
      cess_amount: 0,
      total_amount: item.total_amount,
      branch_id: branchId,
      financial_year_id: financialYearId,
    }));
    await supabase.from("invoice_items").insert(itemInserts);
  }
  return invoice;
}

export async function deleteInvoice(id, branchId, financialYearId) {
  let statusQuery = supabase.from("invoices").select("status").eq("id", id);
  if (branchId) statusQuery = statusQuery.eq("branch_id", branchId);
  if (financialYearId) statusQuery = statusQuery.eq("financial_year_id", financialYearId);
  const { data: invoice } = await statusQuery.single();
  if (invoice?.status !== "Draft") throw new Error("Cannot delete finalized invoice");

  let deleteQuery = supabase.from("invoices").delete().eq("id", id);
  if (branchId) deleteQuery = deleteQuery.eq("branch_id", branchId);
  if (financialYearId) deleteQuery = deleteQuery.eq("financial_year_id", financialYearId);
  const { error } = await deleteQuery;
  if (error) throw error;
}

// ─── Finalize Invoice ──────────────────────────────────────────────

export async function finalizeInvoice(id, context) {
  const { branchId, financialYearId } = context;
  let query = supabase
    .from("invoices")
    .update({
      status: "Final",
      updated_at: new Date(),
      branch_id: branchId,
      financial_year_id: financialYearId,
    })
    .eq("id", id);
  if (branchId) query = query.eq("branch_id", branchId);
  if (financialYearId) query = query.eq("financial_year_id", financialYearId);
  const { data, error } = await query.select().single();
  if (error) throw error;

  // ─── Send invoice notification ──────────────────────────────
  await sendInvoiceNotification(data, branchId, financialYearId);

  return data;
}

export async function getInvoicesByStudent(studentId, branchId, financialYearId) {
  let query = supabase
    .from("invoices")
    .select("id, invoice_number, grand_total, status, paid_amount, balance_due")
    .eq("student_id", studentId)
    .order("invoice_date", { ascending: false });
  if (branchId) query = query.eq("branch_id", branchId);
  if (financialYearId) query = query.eq("financial_year_id", financialYearId);
  const { data, error } = await query;
  if (error) throw error;
  return data || [];
}

export async function getInvoiceByStudentFee(studentFeeId, branchId, financialYearId) {
  let query = supabase
    .from("invoices")
    .select("id, invoice_number, grand_total, status")
    .eq("student_fee_id", studentFeeId)
    .order("invoice_date", { ascending: false })
    .limit(1);
  if (branchId) query = query.eq("branch_id", branchId);
  if (financialYearId) query = query.eq("financial_year_id", financialYearId);
  const { data, error } = await query;
  if (error) throw error;
  return data?.[0] || null;
}

// ─── CREDIT NOTES ────────────────────────────────────────────────────

export async function getCreditNotes(filters = {}, branchId, financialYearId) {
  let query = supabase.from("credit_notes").select("*").order("date", { ascending: false });
  if (branchId) query = query.eq("branch_id", branchId);
  if (financialYearId) query = query.eq("financial_year_id", financialYearId);
  if (filters.invoice_id) query = query.eq("invoice_id", filters.invoice_id);
  if (filters.status) query = query.eq("status", filters.status);
  const { data, error } = await query;
  if (error) throw error;
  return data || [];
}

export async function createCreditNote(payload, context) {
  const { branchId, financialYearId } = context;
  const { data: number } = await supabase.rpc("generate_credit_note_number");
  const { data, error } = await supabase
    .from("credit_notes")
    .insert({
      credit_note_number: number,
      invoice_id: payload.invoice_id,
      date: payload.date || new Date().toISOString().split("T")[0],
      reason: payload.reason,
      amount: payload.amount,
      gst_breakdown: payload.gst_breakdown || {},
      status: "Draft",
      branch_id: branchId,
      financial_year_id: financialYearId,
    })
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function finalizeCreditNote(id, context) {
  const { branchId, financialYearId } = context;
  let query = supabase
    .from("credit_notes")
    .update({ status: "Final", branch_id: branchId, financial_year_id: financialYearId })
    .eq("id", id);
  if (branchId) query = query.eq("branch_id", branchId);
  if (financialYearId) query = query.eq("financial_year_id", financialYearId);
  const { data, error } = await query.select().single();
  if (error) throw error;

  // ─── Notify admins ──────────────────────────────────────────
  try {
    const org = await getOrganizationFromBranch(branchId);
    const message = `A credit note has been finalized:\n` +
      `Credit Note #: ${data.credit_note_number}\n` +
      `Amount: ₹${Number(data.amount).toLocaleString('en-IN')}\n` +
      `Date: ${data.date}\n` +
      `Reason: ${data.reason}`;
    await notifyAdmins(org.id, "Credit Note Finalized", message, branchId);
  } catch (emailError) {
    console.error("❌ Failed to send credit note notification:", emailError);
  }

  return data;
}

// ─── DEBIT NOTES ──────────────────────────────────────────────────────

export async function getDebitNotes(filters = {}, branchId, financialYearId) {
  let query = supabase.from("debit_notes").select("*").order("date", { ascending: false });
  if (branchId) query = query.eq("branch_id", branchId);
  if (financialYearId) query = query.eq("financial_year_id", financialYearId);
  if (filters.invoice_id) query = query.eq("invoice_id", filters.invoice_id);
  if (filters.status) query = query.eq("status", filters.status);
  const { data, error } = await query;
  if (error) throw error;
  return data || [];
}

export async function createDebitNote(payload, context) {
  const { branchId, financialYearId } = context;
  const { data: number } = await supabase.rpc("generate_debit_note_number");
  const { data, error } = await supabase
    .from("debit_notes")
    .insert({
      debit_note_number: number,
      invoice_id: payload.invoice_id,
      date: payload.date || new Date().toISOString().split("T")[0],
      reason: payload.reason,
      amount: payload.amount,
      gst_breakdown: payload.gst_breakdown || {},
      status: "Draft",
      branch_id: branchId,
      financial_year_id: financialYearId,
    })
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function finalizeDebitNote(id, context) {
  const { branchId, financialYearId } = context;
  let query = supabase
    .from("debit_notes")
    .update({ status: "Final", branch_id: branchId, financial_year_id: financialYearId })
    .eq("id", id);
  if (branchId) query = query.eq("branch_id", branchId);
  if (financialYearId) query = query.eq("financial_year_id", financialYearId);
  const { data, error } = await query.select().single();
  if (error) throw error;

  // ─── Notify admins ──────────────────────────────────────────
  try {
    const org = await getOrganizationFromBranch(branchId);
    const message = `A debit note has been finalized:\n` +
      `Debit Note #: ${data.debit_note_number}\n` +
      `Amount: ₹${Number(data.amount).toLocaleString('en-IN')}\n` +
      `Date: ${data.date}\n` +
      `Reason: ${data.reason}`;
    await notifyAdmins(org.id, "Debit Note Finalized", message, branchId);
  } catch (emailError) {
    console.error("❌ Failed to send debit note notification:", emailError);
  }

  return data;
}