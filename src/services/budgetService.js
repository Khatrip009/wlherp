// src/services/budgetService.js
import { supabase } from "../api/supabase";

// Get all budgets with account info
export async function getBudgets() {
  const { data, error } = await supabase
    .from("budgets")
    .select("*, chart_of_accounts(account_code, account_name)")
    .order("period_start", { ascending: false });
  if (error) throw error;
  return data || [];
}

// Create a budget
// context: { branchId, financialYearId }
export async function createBudget(payload, context) {
  const { branchId, financialYearId } = context;
  const { data, error } = await supabase
    .from("budgets")
    .insert({
      ...payload,
      branch_id: branchId,
      financial_year_id: financialYearId,
    })
    .select()
    .single();
  if (error) throw error;
  return data;
}

// Update a budget
// context: { branchId, financialYearId }
export async function updateBudget(id, payload, context) {
  const { branchId, financialYearId } = context;
  const { data, error } = await supabase
    .from("budgets")
    .update({
      ...payload,
      updated_at: new Date(),
      branch_id: branchId,
      financial_year_id: financialYearId,
    })
    .eq("id", id)
    .select()
    .single();
  if (error) throw error;
  return data;
}

// Delete a budget (RLS protects)
export async function deleteBudget(id) {
  const { error } = await supabase
    .from("budgets")
    .delete()
    .eq("id", id);
  if (error) throw error;
}

// Budget vs Actual report
export async function getBudgetVsActual(startDate, endDate) {
  // 1. Fetch budgets overlapping with the period
  const { data: budgets } = await supabase
    .from("budgets")
    .select("*, chart_of_accounts(account_code, account_name)")
    .lte("period_start", endDate)
    .gte("period_end", startDate)
    .order("period_start");

  if (!budgets || budgets.length === 0) return [];

  // 2. For each budget, compute actual spending
  const results = [];
  for (const budget of budgets) {
    // Sum debits (expense accounts) or credits (income accounts) for this account in the period
    const { data: lines } = await supabase
      .from("journal_entry_lines")
      .select("debit, credit, journal_entries!inner(entry_date)")
      .eq("account_id", budget.account_id)
      .gte("journal_entries.entry_date", startDate)
      .lte("journal_entries.entry_date", endDate);

    const accountType = budget.chart_of_accounts?.account_code?.startsWith("4") ? "income" : "expense";
    let actual = 0;
    (lines || []).forEach((l) => {
      actual += accountType === "expense" ? (parseFloat(l.debit) || 0) : (parseFloat(l.credit) || 0);
    });

    const variance = actual - parseFloat(budget.amount);
    const variancePercent = parseFloat(budget.amount) !== 0
      ? ((variance / parseFloat(budget.amount)) * 100).toFixed(1)
      : "0.0";

    results.push({
      id: budget.id,
      account_code: budget.chart_of_accounts?.account_code,
      account_name: budget.chart_of_accounts?.account_name,
      period_start: budget.period_start,
      period_end: budget.period_end,
      budgeted: parseFloat(budget.amount),
      actual,
      variance,
      variancePercent,
    });
  }

  return results;
}