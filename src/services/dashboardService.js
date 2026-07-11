// src/services/dashboardService.js
import { supabase } from '../api/supabase';

export async function getDashboardStats(orgId) {
  const { data, error } = await supabase
    .rpc('get_dashboard_stats_by_org', { p_org_id: orgId });

  if (error) throw error;
  return data;
}