// src/services/accountingService.js
import { supabase } from "../api/supabase";

// ---------- Helper to clean payload ----------
function cleanPayload(payload) {
  const cleaned = { ...payload };

  // Remove empty date fields so DB defaults can apply
  if (cleaned.entry_date === '') delete cleaned.entry_date;
  if (cleaned.date === '') delete cleaned.date;

  // Convert empty strings to null for integer fields
  ['branch_id', 'financial_year_id', 'account_id'].forEach(field => {
    if (cleaned[field] === '') cleaned[field] = null;
  });

  return cleaned;
}

// ---------- Chart of Accounts (reads) ----------
export async function getChartOfAccounts(branchId, financialYearId) {
  let query = supabase
    .from("chart_of_accounts")
    .select("*")
    .order("account_code");

  if (branchId) query = query.eq("branch_id", branchId);
  if (financialYearId) query = query.eq("financial_year_id", financialYearId);

  const { data, error } = await query;
  if (error) throw error;
  return data || [];
}

// ---------- Journal Entry creation ----------
// context: { branchId, financialYearId }
export async function createJournalEntry(entry, context) {
  const { date, reference, description, lines } = entry;
  const { branchId, financialYearId } = context;

  const header = cleanPayload({
    entry_date: date,
    reference,
    description,
    is_posted: true,
    branch_id: branchId,
    financial_year_id: financialYearId,
  });

  const { data: journal, error } = await supabase
    .from("journal_entries")
    .insert(header)
    .select()
    .single();
  if (error) throw error;

  const lineInserts = lines.map(line => cleanPayload({
    journal_entry_id: journal.id,
    account_id: line.account_id,
    debit: line.debit || 0,
    credit: line.credit || 0,
    description: line.description,
    branch_id: branchId,
    financial_year_id: financialYearId,
  }));

  const { error: lineError } = await supabase
    .from("journal_entry_lines")
    .insert(lineInserts);
  if (lineError) throw lineError;

  return journal;
}

// ---------- Ledger ----------
export async function getAccountLedger(accountId, startDate, endDate, branchId, financialYearId) {
  let query = supabase
    .from("journal_entry_lines")
    .select("debit, credit, description, journal_entries(entry_date, reference)")
    .eq("account_id", accountId)
    .order("id", { ascending: true });

  if (startDate) query = query.gte("journal_entries.entry_date", startDate);
  if (endDate) query = query.lte("journal_entries.entry_date", endDate);
  if (branchId) query = query.eq("branch_id", branchId);
  if (financialYearId) query = query.eq("financial_year_id", financialYearId);

  const { data, error } = await query;
  if (error) throw error;
  return data || [];
}

// ---------- Trial Balance ----------
export async function getTrialBalance(asOfDate, branchId, financialYearId) {
  // NOTE: Ensure your PostgreSQL function `get_trial_balance` accepts these parameters:
  // p_as_of_date, p_branch_id, p_financial_year_id
  const { data, error } = await supabase
    .rpc("get_trial_balance", {
      as_of_date: asOfDate,
      p_branch_id: branchId,
      p_financial_year_id: financialYearId,
    });
  if (error) throw error;
  return data || [];
}

// ---------- Create Account ----------
// context: { branchId, financialYearId }
export async function createAccount(payload, context) {
  const { branchId, financialYearId } = context;
  const cleaned = cleanPayload({
    ...payload,
    branch_id: branchId,
    financial_year_id: financialYearId,
  });
  const { data, error } = await supabase
    .from("chart_of_accounts")
    .insert(cleaned)
    .select()
    .single();
  if (error) throw error;
  return data;
}

// ---------- Update Account ----------
// context: { branchId, financialYearId }
export async function updateAccount(id, payload, context) {
  const { branchId, financialYearId } = context;
  const cleaned = cleanPayload({
    ...payload,
    branch_id: branchId,
    financial_year_id: financialYearId,
  });
  const { data, error } = await supabase
    .from("chart_of_accounts")
    .update(cleaned)
    .eq("id", id)
    .select()
    .single();
  if (error) throw error;
  return data;
}

// ---------- Delete Account (now scoped) ----------
export async function deleteAccount(id, branchId, financialYearId) {
  let query = supabase
    .from("chart_of_accounts")
    .delete()
    .eq("id", id);

  if (branchId) query = query.eq("branch_id", branchId);
  if (financialYearId) query = query.eq("financial_year_id", financialYearId);

  const { error } = await query;
  if (error) throw error;
}