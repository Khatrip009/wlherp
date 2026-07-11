import { supabase } from '../api/supabase';
import { useOrg } from '../context/OrganizationContext';

export function useSupabaseWithFY() {
  const { selectedFinancialYear } = useOrg();
  const financialYearId = selectedFinancialYear?.id;

  // Create a wrapper around the original supabase client
  const enhancedSupabase = {
    ...supabase,
    from: (table) => {
      const query = supabase.from(table);

      // Override insert, update, upsert to inject financial_year_id
      const originalInsert = query.insert.bind(query);
      const originalUpdate = query.update.bind(query);
      const originalUpsert = query.upsert.bind(query);

      query.insert = (values, options) => {
        const payload = Array.isArray(values)
          ? values.map((v) => ({ ...v, financial_year_id: financialYearId }))
          : { ...values, financial_year_id: financialYearId };
        return originalInsert(payload, options);
      };

      query.update = (values) => {
        const payload = { ...values, financial_year_id: financialYearId };
        return originalUpdate(payload);
      };

      query.upsert = (values, options) => {
        const payload = Array.isArray(values)
          ? values.map((v) => ({ ...v, financial_year_id: financialYearId }))
          : { ...values, financial_year_id: financialYearId };
        return originalUpsert(payload, options);
      };

      return query;
    },
  };

  return enhancedSupabase;
}