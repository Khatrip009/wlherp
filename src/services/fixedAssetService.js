// src/services/fixedAssetService.js
import { supabase } from "../api/supabase";

// Get all assets – scoped to branch & FY
export async function getFixedAssets(branchId, financialYearId) {
  let query = supabase
    .from("fixed_assets")
    .select("*")
    .order("asset_name");

  if (branchId) query = query.eq("branch_id", branchId);
  if (financialYearId) query = query.eq("financial_year_id", financialYearId);

  const { data, error } = await query;
  if (error) throw error;
  return data || [];
}

// Create asset
// context: { branchId, financialYearId }
export async function createFixedAsset(payload, context) {
  const { branchId, financialYearId } = context;
  // Calculate initial book value (cost)
  const enrichedPayload = {
    ...payload,
    current_book_value: payload.purchase_cost,
    branch_id: branchId,
    financial_year_id: financialYearId,
  };
  const { data, error } = await supabase
    .from("fixed_assets")
    .insert(enrichedPayload)
    .select()
    .single();
  if (error) throw error;
  return data;
}

// Update asset – scoped to prevent cross‑branch edits
// context: { branchId, financialYearId }
export async function updateFixedAsset(id, payload, context) {
  const { branchId, financialYearId } = context;

  let query = supabase
    .from("fixed_assets")
    .update({
      ...payload,
      updated_at: new Date(),
      branch_id: branchId,
      financial_year_id: financialYearId,
    })
    .eq("id", id);

  if (branchId) query = query.eq("branch_id", branchId);
  if (financialYearId) query = query.eq("financial_year_id", financialYearId);

  const { data, error } = await query.select().single();
  if (error) throw error;
  return data;
}

// Delete asset – scoped
export async function deleteFixedAsset(id, branchId, financialYearId) {
  let query = supabase
    .from("fixed_assets")
    .delete()
    .eq("id", id);

  if (branchId) query = query.eq("branch_id", branchId);
  if (financialYearId) query = query.eq("financial_year_id", financialYearId);

  const { error } = await query;
  if (error) throw error;
}

// Calculate monthly depreciation – scoped to branch & FY
export async function calculateMonthlyDepreciation(branchId, financialYearId) {
  let assetQuery = supabase
    .from("fixed_assets")
    .select("*")
    .eq("status", "Active");

  if (branchId) assetQuery = assetQuery.eq("branch_id", branchId);
  if (financialYearId) assetQuery = assetQuery.eq("financial_year_id", financialYearId);

  const { data: assets } = await assetQuery;
  if (!assets) return [];

  const results = [];
  const now = new Date();
  for (const asset of assets) {
    const purchaseDate = new Date(asset.purchase_date);
    const monthsElapsed = (now.getFullYear() - purchaseDate.getFullYear()) * 12 +
                          (now.getMonth() - purchaseDate.getMonth());
    if (monthsElapsed <= 0) continue;

    let monthlyDep = 0;
    if (asset.depreciation_method === "straight_line") {
      const depreciableAmount = asset.purchase_cost - asset.salvage_value;
      monthlyDep = depreciableAmount / asset.useful_life_months;
    } else {
      monthlyDep = (asset.current_book_value * 0.1);
    }

    const newBookValue = asset.current_book_value - monthlyDep;
    if (newBookValue < asset.salvage_value) {
      monthlyDep = asset.current_book_value - asset.salvage_value;
    }

    if (monthlyDep > 0) {
      results.push({
        id: asset.id,
        asset_name: asset.asset_name,
        monthly_depreciation: monthlyDep,
        new_book_value: asset.current_book_value - monthlyDep,
      });
    }
  }
  return results;
}

// Post depreciation as journal entry + update asset book values
// context: { branchId, financialYearId }
export async function postDepreciation(monthlyDepList, context) {
  const { branchId, financialYearId } = context;
  const totalDep = monthlyDepList.reduce((s, a) => s + a.monthly_depreciation, 0);
  if (totalDep === 0) return;

  // 1. Create journal entry
  const { data: journal } = await supabase
    .from("journal_entries")
    .insert({
      entry_date: new Date().toISOString().split("T")[0],
      reference: "Monthly Depreciation",
      description: "Auto‑calculated depreciation",
      is_posted: true,
      branch_id: branchId,
      financial_year_id: financialYearId,
    })
    .select()
    .single();

  // 2. Get Depreciation Expense account (5004) – scoped
  let depExpQuery = supabase
    .from("chart_of_accounts")
    .select("id")
    .eq("account_code", "5004");

  if (branchId) depExpQuery = depExpQuery.eq("branch_id", branchId);
  if (financialYearId) depExpQuery = depExpQuery.eq("financial_year_id", financialYearId);

  const { data: depExpAccount } = await depExpQuery.maybeSingle();

  // 3. Get/Create Accumulated Depreciation account (1009) – scoped
  let accQuery = supabase
    .from("chart_of_accounts")
    .select("id")
    .eq("account_code", "1009");

  if (branchId) accQuery = accQuery.eq("branch_id", branchId);
  if (financialYearId) accQuery = accQuery.eq("financial_year_id", financialYearId);

  let accDepAccount = await accQuery.maybeSingle();

  if (!accDepAccount.data) {
    // Create Accumulated Depreciation account under the current branch & FY
    const { data: newAcc } = await supabase
      .from("chart_of_accounts")
      .insert({
        account_code: "1009",
        account_name: "Accumulated Depreciation",
        account_type: "asset",
        branch_id: branchId,
        financial_year_id: financialYearId,
      })
      .select()
      .single();
    accDepAccount = { data: newAcc };
  }

  // 4. Insert journal lines
  const lines = [
    {
      journal_entry_id: journal.id,
      account_id: depExpAccount.id,
      debit: totalDep,
      credit: 0,
      description: "Depreciation expense",
      branch_id: branchId,
      financial_year_id: financialYearId,
    },
    {
      journal_entry_id: journal.id,
      account_id: accDepAccount.data.id,
      debit: 0,
      credit: totalDep,
      description: "Accumulated depreciation",
      branch_id: branchId,
      financial_year_id: financialYearId,
    },
  ];
  await supabase.from("journal_entry_lines").insert(lines);

  // 5. Update asset book values – scoped
  for (const item of monthlyDepList) {
    let updateQuery = supabase
      .from("fixed_assets")
      .update({
        current_book_value: item.new_book_value,
        updated_at: new Date(),
        branch_id: branchId,
        financial_year_id: financialYearId,
      })
      .eq("id", item.id);

    if (branchId) updateQuery = updateQuery.eq("branch_id", branchId);
    if (financialYearId) updateQuery = updateQuery.eq("financial_year_id", financialYearId);

    await updateQuery;
  }

  return totalDep;
}