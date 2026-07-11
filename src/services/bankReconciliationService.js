// src/services/bankReconciliationService.js
import { supabase } from "../api/supabase";

// Get bank accounts (cash and bank)
export async function getBankAccounts() {
  const { data } = await supabase
    .from("chart_of_accounts")
    .select("id, account_code, account_name")
    .in("account_code", ["1001", "1002"])
    .order("account_code");
  return data || [];
}

// Get statement lines for an account
export async function getStatementLines(accountId) {
  const { data } = await supabase
    .from("bank_statements")
    .select("*")
    .eq("account_id", accountId)
    .order("statement_date");
  return data || [];
}

// Insert statement lines (after CSV upload or manual entry)
// `context` should contain { branchId, financialYearId }
export async function importStatementLines(rows, context) {
  const { branchId, financialYearId } = context;
  const enrichedRows = rows.map(row => ({
    ...row,
    branch_id: branchId,
    financial_year_id: financialYearId,
  }));
  const { error } = await supabase.from("bank_statements").insert(enrichedRows);
  if (error) throw error;
}

// Delete all statement lines for an account (to replace after new upload)
export async function clearStatementLines(accountId) {
  const { error } = await supabase
    .from("bank_statements")
    .delete()
    .eq("account_id", accountId);
  if (error) throw error;
}

// Get unreconciled journal lines for a bank account (debit=receipt, credit=payment)
export async function getUnreconciledEntries(accountId, startDate, endDate) {
  let query = supabase
    .from("journal_entry_lines")
    .select(`
      id,
      debit,
      credit,
      description,
      journal_entries!inner(entry_date, reference, id)
    `)
    .eq("account_id", accountId)
    .gte("journal_entries.entry_date", startDate)
    .lte("journal_entries.entry_date", endDate)
    .order("journal_entries(entry_date)", { ascending: true })
    .order("id", { ascending: true });

  const { data } = await query;
  return data || [];
}

// Get already reconciled line IDs for a bank account
export async function getReconciledLineIds(accountId) {
  const { data } = await supabase
    .from("bank_reconciliation")
    .select("journal_entry_line_id")
    .in("journal_entry_line_id", 
      (await supabase
        .from("journal_entry_lines")
        .select("id")
        .eq("account_id", accountId)
      ).data?.map(r => r.id) || []
    );
  return (data || []).map(r => r.journal_entry_line_id);
}

// Mark a line as reconciled
// `context` should contain { branchId, financialYearId }
export async function reconcileLine(journalLineId, statementId, context) {
  const { branchId, financialYearId } = context;
  const { error } = await supabase
    .from("bank_reconciliation")
    .insert({
      journal_entry_line_id: journalLineId,
      statement_id: statementId,
      branch_id: branchId,
      financial_year_id: financialYearId,
    });
  if (error) throw error;
}

// Un‑reconcile a line
export async function unreconcileLine(journalLineId, statementId) {
  const { error } = await supabase
    .from("bank_reconciliation")
    .delete()
    .eq("journal_entry_line_id", journalLineId)
    .eq("statement_id", statementId);
  if (error) throw error;
}