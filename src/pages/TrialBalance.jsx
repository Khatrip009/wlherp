import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import AdminLayout from "../layouts/AdminLayout";
import { supabase } from "../api/supabase";
import { useOrg } from "../context/OrganizationContext";

export default function TrialBalance() {
  const [asOfDate, setAsOfDate] = useState(new Date().toISOString().split("T")[0]);

  const { branch, selectedFinancialYear } = useOrg();
  const branchId = branch?.id;
  const financialYearId = selectedFinancialYear?.id;

  const { data, isLoading, isError, error } = useQuery({
    queryKey: ["trial-balance", asOfDate, branchId, financialYearId],
    queryFn: async () => {
      const { data } = await supabase.rpc("get_trial_balance", {
        as_of_date: asOfDate,
        p_branch_id: branchId,
        p_financial_year_id: financialYearId,
      });
      return data;
    },
    enabled: !!asOfDate && !!branchId && !!financialYearId,
  });

  // Safe guard: always use an array
  const rows = Array.isArray(data) ? data : [];

  return (
    <AdminLayout>
      <h1 className="text-3xl font-righteous text-primary-dark mb-6">Trial Balance</h1>
      <div className="mb-4">
        <label className="text-sm mr-2">As of Date:</label>
        <input type="date" value={asOfDate} onChange={e => setAsOfDate(e.target.value)} className="border rounded p-2 text-sm" />
      </div>

      {isError && (
        <div className="bg-red-50 text-red-700 rounded-lg p-4 mb-4">
          Failed to load trial balance: {error?.message || 'Unknown error'}
        </div>
      )}

      <div className="bg-white rounded-xl shadow-sm overflow-hidden">
        <table className="w-full">
          <thead className="bg-slate-100">
            <tr>
              <th className="p-3 text-left text-sm">Account</th>
              <th className="p-3 text-right text-sm">Debit</th>
              <th className="p-3 text-right text-sm">Credit</th>
            </tr>
          </thead>
          <tbody>
            {isLoading ? (
              <tr>
                <td colSpan={3} className="p-6 text-center">Loading…</td>
              </tr>
            ) : rows.length === 0 ? (
              <tr>
                <td colSpan={3} className="p-6 text-center text-secondary">
                  No data found for the selected date.
                </td>
              </tr>
            ) : (
              rows.map(row => (
                <tr key={row.account_code} className="border-t">
                  <td className="p-3 text-sm">{row.account_code} - {row.account_name}</td>
                  <td className="p-3 text-sm text-right">
                    ₹{Number(row.total_debit || 0).toLocaleString()}
                  </td>
                  <td className="p-3 text-sm text-right">
                    ₹{Number(row.total_credit || 0).toLocaleString()}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </AdminLayout>
  );
}