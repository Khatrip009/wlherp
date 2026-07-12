import { useQuery } from "@tanstack/react-query";
import { useOrg } from "../context/OrganizationContext";

/**
 * A wrapper around useQuery that automatically includes the current
 * branchId and financialYearId in both the query key and the query function.
 *
 * Usage:
 *   const { data } = useOrgQuery({
 *     queryKey: ['teachers'],
 *     queryFn: (branchId, financialYearId) => fetchTeachers(branchId, financialYearId),
 *   });
 *
 * The queryKey will become ['teachers', branchId, financialYearId].
 * The queryFn will receive branchId and financialYearId as arguments.
 */
export function useOrgQuery({ queryKey, queryFn, options = {} }) {
  const { branch, selectedFinancialYear } = useOrg();
  const branchId = branch?.id;
  const financialYearId = selectedFinancialYear?.id;

  const fullKey = [...queryKey, branchId, financialYearId];

  return useQuery({
    queryKey: fullKey,
    queryFn: () => queryFn(branchId, financialYearId),
    enabled: options.enabled !== false && !!branchId && !!financialYearId,
    ...options,
  });
}