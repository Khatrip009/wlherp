// src/pages/ProfitLossStatement.jsx
import { useQuery } from "@tanstack/react-query";
import AdminLayout from "../layouts/AdminLayout";
import { supabase } from "../api/supabase";
import { useOrg } from "../context/OrganizationContext";   // NEW

export default function ProfitLossStatement() {
  // ── Branch & Financial Year context ──
  const { branch, selectedFinancialYear } = useOrg();
  const branchId = branch?.id;
  const financialYearId = selectedFinancialYear?.id;

  const { data, isLoading } = useQuery({
    queryKey: ["profit-loss", branchId, financialYearId],
    queryFn: async () => {
      const { data } = await supabase.rpc("get_profit_loss", {
        p_branch_id: branchId,
        p_financial_year_id: financialYearId,
      });
      return data || [];
    },
    enabled: !!branchId && !!financialYearId,
  });

  return (
    <AdminLayout>
      <h1 className="text-3xl font-righteous text-primary-dark mb-6">Profit & Loss Statement</h1>
      {isLoading ? <p>Loading…</p> :
        <div className="bg-white rounded-xl shadow-sm p-6 max-w-xl">
          {data.map(row => (
            <div key={row.account_name} className="flex justify-between border-b py-2">
              <span>{row.account_name}</span>
              <span className="font-medium">₹{Number(row.balance).toLocaleString()}</span>
            </div>
          ))}
        </div>
      }
    </AdminLayout>
  );
}