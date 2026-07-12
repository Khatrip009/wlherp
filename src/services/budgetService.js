// src/services/budgetService.js
import { supabase } from "../api/supabase";

// Get all budgets with account info – scoped to branch & FY
export async function getBudgets(branchId, financialYearId) {
  let query = supabase
    .from("budgets")
    .select("*, chart_of_accounts(account_code, account_name)")
    .order("period_start", { ascending: false });

  if (branchId) query = query.eq("branch_id", branchId);
  if (financialYearId) query = query.eq("financial_year_id", financialYearId);

  const { data, error } = await query;
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

// Delete a budget – scoped to prevent cross‑branch deletion
export async function deleteBudget(id, branchId, financialYearId) {
  let query = supabase
    .from("budgets")
    .delete()
    .eq("id", id);

  if (branchId) query = query.eq("branch_id", branchId);
  if (financialYearId) query = query.eq("financial_year_id", financialYearId);

  const { error } = await query;
  if (error) throw error;
}

// Budget vs Actual report – scoped to branch & FY
export async function getBudgetVsActual(
  startDate,
  endDate,
  branchId,
  financialYearId
) {
  // 1. Fetch budgets overlapping with the period
  let budgetQuery = supabase
    .from("budgets")
    .select("*, chart_of_accounts(account_code, account_name)")
    .lte("period_start", endDate)
    .gte("period_end", startDate)
    .order("period_start");

  if (branchId) budgetQuery = budgetQuery.eq("branch_id", branchId);
  if (financialYearId) budgetQuery = budgetQuery.eq("financial_year_id", financialYearId);

  const { data: budgets } = await budgetQuery;

  if (!budgets || budgets.length === 0) return [];

  // 2. For each budget, compute actual spending (scoped)
  const results = [];
  for (const budget of budgets) {
    let lineQuery = supabase
      .from("journal_entry_lines")
      .select("debit, credit, journal_entries!inner(entry_date)")
      .eq("account_id", budget.account_id)
      .gte("journal_entries.entry_date", startDate)
      .lte("journal_entries.entry_date", endDate);

    // Scope lines and the joined journal entry
    if (branchId) {
      lineQuery = lineQuery.eq("branch_id", branchId);
      lineQuery = lineQuery.eq("journal_entries.branch_id", branchId);
    }
    if (financialYearId) {
      lineQuery = lineQuery.eq("financial_year_id", financialYearId);
      lineQuery = lineQuery.eq("journal_entries.financial_year_id", financialYearId);
    }

    const { data: lines } = await lineQuery;

    const accountType = budget.chart_of_accounts?.account_code?.startsWith("4")
      ? "income"
      : "expense";
    let actual = 0;
    (lines || []).forEach((l) => {
      actual +=
        accountType === "expense"
          ? parseFloat(l.debit) || 0
          : parseFloat(l.credit) || 0;
    });

    const variance = actual - parseFloat(budget.amount);
    const variancePercent =
      parseFloat(budget.amount) !== 0
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