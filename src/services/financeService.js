// src/services/financeService.js
import { supabase } from "../api/supabase";

// ========================
// INCOME (paginated)
// ========================

export async function getIncomes({ pageParam = 0, filters = {}, branchId, financialYearId } = {}) {
  const limit = 10;
  const from = pageParam * limit;
  const to = from + limit - 1;

  let query = supabase
    .from("income")
    .select("*", { count: "exact" })
    .order("income_date", { ascending: false })
    .range(from, to);

  // Scope by branch & FY
  if (branchId) query = query.eq("branch_id", branchId);
  if (financialYearId) query = query.eq("financial_year_id", financialYearId);

  // Filters
  if (filters.search) {
    query = query.or(
      `category.ilike.%${filters.search}%,description.ilike.%${filters.search}%`
    );
  }
  if (filters.startDate) query = query.gte("income_date", filters.startDate);
  if (filters.endDate) query = query.lte("income_date", filters.endDate);

  const { data, error, count } = await query;
  if (error) throw error;
  return { data, count };
}

export async function getAllIncomesForExport(filters = {}, branchId, financialYearId) {
  let query = supabase
    .from("income")
    .select("*")
    .order("income_date", { ascending: false });

  if (branchId) query = query.eq("branch_id", branchId);
  if (financialYearId) query = query.eq("financial_year_id", financialYearId);

  if (filters.search) {
    query = query.or(
      `category.ilike.%${filters.search}%,description.ilike.%${filters.search}%`
    );
  }
  if (filters.startDate) query = query.gte("income_date", filters.startDate);
  if (filters.endDate) query = query.lte("income_date", filters.endDate);

  const { data, error } = await query;
  if (error) throw error;
  return data || [];
}

// context: { branchId, financialYearId }
export async function createIncome(payload, context) {
  const { branchId, financialYearId } = context;
  const { data, error } = await supabase
    .from("income")
    .insert([{ ...payload, branch_id: branchId, financial_year_id: financialYearId }])
    .select()
    .single();
  if (error) throw error;
  return data;
}

// context: { branchId, financialYearId }
export async function updateIncome(id, payload, context) {
  const { branchId, financialYearId } = context;

  let query = supabase
    .from("income")
    .update({ ...payload, branch_id: branchId, financial_year_id: financialYearId })
    .eq("id", id);

  // Scope to prevent cross‑branch updates
  if (branchId) query = query.eq("branch_id", branchId);
  if (financialYearId) query = query.eq("financial_year_id", financialYearId);

  const { data, error } = await query.select().single();
  if (error) throw error;
  return data;
}

// Soft delete – now scoped
// context: { branchId, financialYearId }
export async function deleteIncome(id, context) {
  const { branchId, financialYearId } = context;

  let query = supabase
    .from("income")
    .update({
      deleted_at: new Date().toISOString(),
      branch_id: branchId,
      financial_year_id: financialYearId,
    })
    .eq("id", id);

  if (branchId) query = query.eq("branch_id", branchId);
  if (financialYearId) query = query.eq("financial_year_id", financialYearId);

  const { error } = await query;
  if (error) throw error;
}

// ========================
// EXPENSES (paginated)
// ========================

export async function getExpenses({ pageParam = 0, filters = {}, branchId, financialYearId } = {}) {
  const limit = 10;
  const from = pageParam * limit;
  const to = from + limit - 1;

  let query = supabase
    .from("expenses")
    .select("*", { count: "exact" })
    .order("expense_date", { ascending: false })
    .range(from, to);

  if (branchId) query = query.eq("branch_id", branchId);
  if (financialYearId) query = query.eq("financial_year_id", financialYearId);

  if (filters.search) {
    query = query.or(
      `category.ilike.%${filters.search}%,description.ilike.%${filters.search}%,bill_number.ilike.%${filters.search}%`
    );
  }
  if (filters.startDate) query = query.gte("expense_date", filters.startDate);
  if (filters.endDate) query = query.lte("expense_date", filters.endDate);

  const { data, error, count } = await query;
  if (error) throw error;
  return { data, count };
}

export async function getAllExpensesForExport(filters = {}, branchId, financialYearId) {
  let query = supabase
    .from("expenses")
    .select("*")
    .order("expense_date", { ascending: false });

  if (branchId) query = query.eq("branch_id", branchId);
  if (financialYearId) query = query.eq("financial_year_id", financialYearId);

  if (filters.search) {
    query = query.or(
      `category.ilike.%${filters.search}%,description.ilike.%${filters.search}%,bill_number.ilike.%${filters.search}%`
    );
  }
  if (filters.startDate) query = query.gte("expense_date", filters.startDate);
  if (filters.endDate) query = query.lte("expense_date", filters.endDate);

  const { data, error } = await query;
  if (error) throw error;
  return data || [];
}

// context: { branchId, financialYearId }
export async function createExpense(payload, context) {
  const { branchId, financialYearId } = context;
  const { data, error } = await supabase
    .from("expenses")
    .insert([{ ...payload, branch_id: branchId, financial_year_id: financialYearId }])
    .select()
    .single();
  if (error) throw error;
  return data;
}

// context: { branchId, financialYearId }
export async function updateExpense(id, payload, context) {
  const { branchId, financialYearId } = context;

  let query = supabase
    .from("expenses")
    .update({ ...payload, branch_id: branchId, financial_year_id: financialYearId })
    .eq("id", id);

  if (branchId) query = query.eq("branch_id", branchId);
  if (financialYearId) query = query.eq("financial_year_id", financialYearId);

  const { data, error } = await query.select().single();
  if (error) throw error;
  return data;
}

// Soft delete – scoped
// context: { branchId, financialYearId }
export async function deleteExpense(id, context) {
  const { branchId, financialYearId } = context;

  let query = supabase
    .from("expenses")
    .update({
      deleted_at: new Date().toISOString(),
      branch_id: branchId,
      financial_year_id: financialYearId,
    })
    .eq("id", id);

  if (branchId) query = query.eq("branch_id", branchId);
  if (financialYearId) query = query.eq("financial_year_id", financialYearId);

  const { error } = await query;
  if (error) throw error;
}

// Profit & Loss summary – now scoped
export async function getProfitLossSummary(startDate, endDate, branchId, financialYearId) {
  let incomeQuery = supabase
    .from("income")
    .select("amount")
    .gte("income_date", startDate)
    .lte("income_date", endDate);

  if (branchId) incomeQuery = incomeQuery.eq("branch_id", branchId);
  if (financialYearId) incomeQuery = incomeQuery.eq("financial_year_id", financialYearId);

  const { data: incomes, error: incomeError } = await incomeQuery;
  if (incomeError) throw incomeError;

  let expenseQuery = supabase
    .from("expenses")
    .select("amount")
    .gte("expense_date", startDate)
    .lte("expense_date", endDate);

  if (branchId) expenseQuery = expenseQuery.eq("branch_id", branchId);
  if (financialYearId) expenseQuery = expenseQuery.eq("financial_year_id", financialYearId);

  const { data: expenses, error: expenseError } = await expenseQuery;
  if (expenseError) throw expenseError;

  const totalIncome = (incomes || []).reduce((sum, r) => sum + Number(r.amount), 0);
  const totalExpense = (expenses || []).reduce((sum, r) => sum + Number(r.amount), 0);
  const profit = totalIncome - totalExpense;

  return { totalIncome, totalExpense, profit };
}