// src/pages/ProfitLossStatement.jsx
import { useQuery } from "@tanstack/react-query";
import AdminLayout from "../layouts/AdminLayout";
import { supabase } from "../api/supabase";

export default function ProfitLossStatement() {
  const { data, isLoading } = useQuery({
    queryKey: ["profit-loss"],
    queryFn: async () => {
      const { data } = await supabase.rpc("get_profit_loss");   // we'll create this function
      return data || [];
    },
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