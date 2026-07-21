// src/services/financeService.js
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

async function getAdminEmails(organizationId) {
  const { data, error } = await supabase
    .from("profiles")
    .select("email")
    .eq("organization_id", organizationId)
    .in("role", ["admin", "super_admin", "organization_admin"])
    .eq("is_active", true);
  if (error) throw error;
  return data?.map(p => p.email).filter(Boolean) || [];
}

// ─── INCOME ──────────────────────────────────────────────────────────

export async function getIncomes({ pageParam = 0, filters = {}, branchId, financialYearId } = {}) {
  const limit = 10;
  const from = pageParam * limit;
  const to = from + limit - 1;

  let query = supabase
    .from("income")
    .select("*", { count: "exact" })
    .order("income_date", { ascending: false })
    .range(from, to);

  if (branchId) query = query.eq("branch_id", branchId);
  if (financialYearId) query = query.eq("financial_year_id", financialYearId);

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

  // ─── Send notification to admins ──────────────────────────
  try {
    const org = await getOrganizationFromBranch(branchId);
    const adminEmails = await getAdminEmails(org.id);
    if (adminEmails.length > 0) {
      await sendTemplateEmail({
        to: adminEmails,
        organizationId: org.id,
        slug: "system_announcement",
        context: {
          academyName: org.company_name,
          title: "New Income Recorded",
          message: `A new income entry has been recorded:\n` +
            `Category: ${payload.category || 'N/A'}\n` +
            `Amount: ₹${Number(payload.amount).toLocaleString('en-IN')}\n` +
            `Date: ${payload.income_date}\n` +
            `Description: ${payload.description || 'N/A'}`,
          target_type: "Admin",
        },
        branchId,
      });
    }
  } catch (emailError) {
    console.error("❌ Failed to send income notification:", emailError);
  }

  return data;
}

// context: { branchId, financialYearId }
export async function updateIncome(id, payload, context) {
  const { branchId, financialYearId } = context;

  let query = supabase
    .from("income")
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

// ─── EXPENSES ──────────────────────────────────────────────────────────

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

  // ─── Send notification to admins ──────────────────────────
  try {
    const org = await getOrganizationFromBranch(branchId);
    const adminEmails = await getAdminEmails(org.id);
    if (adminEmails.length > 0) {
      await sendTemplateEmail({
        to: adminEmails,
        organizationId: org.id,
        slug: "system_announcement",
        context: {
          academyName: org.company_name,
          title: "New Expense Recorded",
          message: `A new expense entry has been recorded:\n` +
            `Category: ${payload.category || 'N/A'}\n` +
            `Amount: ₹${Number(payload.amount).toLocaleString('en-IN')}\n` +
            `Date: ${payload.expense_date}\n` +
            `Description: ${payload.description || 'N/A'}\n` +
            `Bill No.: ${payload.bill_number || 'N/A'}`,
          target_type: "Admin",
        },
        branchId,
      });
    }
  } catch (emailError) {
    console.error("❌ Failed to send expense notification:", emailError);
  }

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

// ─── Profit & Loss Summary ──────────────────────────────────────────

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