// src/services/dashboardService.js
import { supabase } from '../api/supabase';

/**
 * Fetch dashboard statistics for the current organization,
 * optionally scoped to a specific branch and financial year.
 *
 * NOTE: The PostgreSQL function `get_dashboard_stats_by_org` must be updated
 * to accept `p_branch_id` and `p_financial_year_id` parameters and
 * filter the data accordingly.
 */
export async function getDashboardStats(orgId, branchId, financialYearId) {
  const { data, error } = await supabase
    .rpc('get_dashboard_stats_by_org', {
      p_org_id: orgId,
      p_branch_id: branchId || null,           // ← new parameters
      p_financial_year_id: financialYearId || null,
    });

  if (error) throw error;
  return data;
}