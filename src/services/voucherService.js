// src/services/voucherService.js
import { supabase } from "../api/supabase";

// ---------- Helpers ----------
function cleanPayload(payload) {
  const cleaned = { ...payload };

  // Remove empty date fields so DB defaults can apply
  if (cleaned.entry_date === '') delete cleaned.entry_date;

  // Convert empty strings to null for integer fields
  ['branch_id', 'financial_year_id', 'account_id'].forEach(field => {
    if (cleaned[field] === '') cleaned[field] = null;
  });

  return cleaned;
}

// ---------- Voucher Types ----------
export async function getVoucherTypes() {
  const { data, error } = await supabase.from("voucher_types").select("*").order("id");
  if (error) throw error;
  return data || [];
}

// ---------- Get Vouchers ----------
export async function getVouchers(filters = {}) {
  let query = supabase
    .from("vouchers")
    .select("*, voucher_types(name, abbreviation), journal_entries(id)")
    .order("entry_date", { ascending: false })
    .order("voucher_no", { ascending: false });

  if (filters.start_date) query = query.gte("entry_date", filters.start_date);
  if (filters.end_date) query = query.lte("entry_date", filters.end_date);
  if (filters.voucher_type_id) query = query.eq("voucher_type_id", filters.voucher_type_id);
  if (filters.search) query = query.or(`voucher_no.ilike.%${filters.search}%,reference.ilike.%${filters.search}%`);

  const { data, error } = await query.limit(100);
  if (error) throw error;
  return data || [];
}

// ---------- Create Voucher ----------
// context: { branchId, financialYearId }
export async function createVoucher(payload, context) {
  const { voucher_type_code, entry_date, reference, description, lines } = payload;
  const { branchId, financialYearId } = context;

  // 1. Get voucher type
  const { data: vtype } = await supabase
    .from("voucher_types")
    .select("id, abbreviation")
    .eq("code", voucher_type_code)
    .single();
  if (!vtype) throw new Error("Invalid voucher type");

  // 2. Generate voucher number
  const { data: voucherNo, error: rpcError } = await supabase
    .rpc("generate_voucher_no", {
      p_voucher_type_id: vtype.id,
      p_branch_id: branchId,
      p_financial_year_id: financialYearId,
    });
  if (rpcError) throw rpcError;

  // 3. Create journal entry
  const journalHeader = cleanPayload({
    entry_date,
    reference,
    description,
    is_posted: true,
    branch_id: branchId,
    financial_year_id: financialYearId,
  });

  const { data: journal } = await supabase
    .from("journal_entries")
    .insert(journalHeader)
    .select()
    .single();

  // 4. Insert journal lines
  const lineInserts = lines.map(line => cleanPayload({
    journal_entry_id: journal.id,
    account_id: line.account_id,
    debit: line.debit || 0,
    credit: line.credit || 0,
    description: line.description,
    branch_id: branchId,
    financial_year_id: financialYearId,
  }));
  await supabase.from("journal_entry_lines").insert(lineInserts);

  // 5. Create voucher record
  const voucherPayload = cleanPayload({
    voucher_no: voucherNo,
    voucher_type_id: vtype.id,
    entry_date,
    reference,
    description,
    journal_entry_id: journal.id,
    branch_id: branchId,
    financial_year_id: financialYearId,
  });

  const { data: voucher } = await supabase
    .from("vouchers")
    .insert(voucherPayload)
    .select()
    .single();

  return voucher;
}

// ---------- Get Voucher by ID ----------
export async function getVoucherById(voucherId) {
  const { data: voucher, error } = await supabase
    .from("vouchers")
    .select("*, voucher_types(*), journal_entries(entry_date, reference, description, journal_entry_lines(*))")
    .eq("id", voucherId)
    .single();
  if (error) throw error;

  if (voucher?.journal_entries?.journal_entry_lines) {
    const accountIds = voucher.journal_entries.journal_entry_lines.map(line => line.account_id);
    const { data: accounts } = await supabase
      .from("chart_of_accounts")
      .select("id, account_code, account_name")
      .in("id", accountIds);
    const accountMap = {};
    accounts?.forEach(a => (accountMap[a.id] = a));
    voucher.journal_entries.journal_entry_lines = voucher.journal_entries.journal_entry_lines.map(line => ({
      ...line,
      account: accountMap[line.account_id] || null,
    }));
  }
  return voucher;
}

// ---------- Update Voucher ----------
// context: { branchId, financialYearId }
export async function updateVoucher(voucherId, payload, context) {
  const { entry_date, reference, description, lines } = payload;
  const { branchId, financialYearId } = context;

  // Get journal_entry_id
  const { data: voucher } = await supabase
    .from("vouchers")
    .select("journal_entry_id")
    .eq("id", voucherId)
    .single();

  // Update journal header
  await supabase
    .from("journal_entries")
    .update(cleanPayload({
      entry_date,
      reference,
      description,
      branch_id: branchId,
      financial_year_id: financialYearId,
    }))
    .eq("id", voucher.journal_entry_id);

  // Delete old lines
  await supabase
    .from("journal_entry_lines")
    .delete()
    .eq("journal_entry_id", voucher.journal_entry_id);

  // Insert new lines
  const lineInserts = lines.map(line => cleanPayload({
    journal_entry_id: voucher.journal_entry_id,
    account_id: line.account_id,
    debit: line.debit || 0,
    credit: line.credit || 0,
    description: line.description,
    branch_id: branchId,
    financial_year_id: financialYearId,
  }));
  await supabase.from("journal_entry_lines").insert(lineInserts);

  // Update voucher header
  await supabase
    .from("vouchers")
    .update(cleanPayload({
      entry_date,
      reference,
      description,
      branch_id: branchId,
      financial_year_id: financialYearId,
    }))
    .eq("id", voucherId);

  return { success: true };
}