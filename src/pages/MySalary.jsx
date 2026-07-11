import { useQuery } from "@tanstack/react-query";
import { IndianRupee, Calendar, CreditCard, FileText } from "lucide-react";
import AdminLayout from "../layouts/AdminLayout";
import { useAuth } from "../context/AuthContext";
import { supabase } from "../api/supabase";
import BackButton from "../components/BackButton";

export default function MySalary() {
  const { user } = useAuth();

  const { data: teacherId } = useQuery({
    queryKey: ["teacher-id", user?.id],
    queryFn: async () => {
      if (!user?.id) return null;
      const { data, error } = await supabase
        .from("teachers")
        .select("id")
        .eq("user_id", user.id)
        .maybeSingle();
      if (error) throw error;
      return data?.id || null;
    },
    enabled: !!user?.id,
  });

  const { data: payments = [], isLoading } = useQuery({
    queryKey: ["my-salary", teacherId],
    queryFn: async () => {
      if (!teacherId) return [];
      const { data } = await supabase
        .from("salary_payments")
        .select("payment_date, amount, net_amount, tds_amount, tds_percentage, payment_mode, payment_type, remarks")
        .eq("teacher_id", teacherId)
        .order("payment_date", { ascending: false });
      return data || [];
    },
    enabled: !!teacherId,
  });

  const totalGross = payments.reduce((s, p) => s + (Number(p.amount) || 0), 0);
  const totalNet = payments.reduce((s, p) => s + (Number(p.net_amount) || 0), 0);
  const totalTDS = payments.reduce((s, p) => s + (Number(p.tds_amount) || 0), 0);

  if (isLoading) return <AdminLayout><div className="p-8 text-center">Loading...</div></AdminLayout>;

  return (
    <AdminLayout>
      <BackButton to="/teacher" label="Dashboard" />
      <div className="mb-6">
        <h1 className="text-3xl font-righteous text-primary-dark">My Salary</h1>
        <p className="text-sm text-secondary-dark font-montserrat mt-1">Your salary payment history</p>
      </div>

      {payments.length > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
          <div className="bg-white rounded-xl p-4 shadow-sm border border-secondary-light">
            <p className="text-xs text-secondary">Total Gross</p>
            <p className="text-xl font-bold text-primary mt-1">₹{totalGross.toLocaleString("en-IN")}</p>
          </div>
          <div className="bg-white rounded-xl p-4 shadow-sm border border-secondary-light">
            <p className="text-xs text-secondary">Total TDS Deducted</p>
            <p className="text-xl font-bold text-red-600 mt-1">₹{totalTDS.toLocaleString("en-IN")}</p>
          </div>
          <div className="bg-white rounded-xl p-4 shadow-sm border border-secondary-light">
            <p className="text-xs text-secondary">Total Net Received</p>
            <p className="text-xl font-bold text-green-600 mt-1">₹{totalNet.toLocaleString("en-IN")}</p>
          </div>
        </div>
      )}

      {payments.length === 0 ? (
        <div className="bg-white rounded-xl p-8 shadow-sm border border-secondary-light text-center">
          <IndianRupee size={32} className="text-secondary-light mx-auto mb-2" />
          <p className="text-secondary">No salary payments recorded yet.</p>
        </div>
      ) : (
        <div className="bg-white rounded-xl shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[700px]">
              <thead className="bg-slate-100 border-b border-secondary-light">
                <tr>
                  <th className="p-3 text-left text-sm font-montserrat text-secondary-dark">Date</th>
                  <th className="p-3 text-right text-sm font-montserrat text-secondary-dark">Gross</th>
                  <th className="p-3 text-right text-sm font-montserrat text-secondary-dark">TDS %</th>
                  <th className="p-3 text-right text-sm font-montserrat text-secondary-dark">TDS Amount</th>
                  <th className="p-3 text-right text-sm font-montserrat text-secondary-dark">Net Paid</th>
                  <th className="p-3 text-left text-sm font-montserrat text-secondary-dark">Mode</th>
                  <th className="p-3 text-left text-sm font-montserrat text-secondary-dark">Remarks</th>
                </tr>
              </thead>
              <tbody>
                {payments.map((p, idx) => (
                  <tr key={idx} className="border-b border-secondary-light hover:bg-primary-bg transition">
                    <td className="p-3 text-sm">{p.payment_date}</td>
                    <td className="p-3 text-right text-sm font-medium">₹{Number(p.amount || 0).toLocaleString("en-IN")}</td>
                    <td className="p-3 text-right text-sm">{p.tds_percentage || 0}%</td>
                    <td className="p-3 text-right text-sm text-red-600">₹{Number(p.tds_amount || 0).toLocaleString("en-IN")}</td>
                    <td className="p-3 text-right text-sm font-bold text-green-600">₹{Number(p.net_amount || p.amount || 0).toLocaleString("en-IN")}</td>
                    <td className="p-3 text-sm">{p.payment_mode || "—"}</td>
                    <td className="p-3 text-sm text-secondary">{p.remarks || "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </AdminLayout>
  );
}
