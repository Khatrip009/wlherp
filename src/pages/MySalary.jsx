import { useQuery } from "@tanstack/react-query";
import { IndianRupee, Download } from "lucide-react";

import { useAuth } from "../context/AuthContext";
import { supabase } from "../api/supabase";
import BackButton from "../components/BackButton";
import { useOrg } from "../context/OrganizationContext";
import { useTheme } from "../context/ThemeContext";                     // NEW
import { generateSalarySlipPDF } from "../utils/salarySlipPdf";

export default function MySalary() {
  const { user } = useAuth();

  // ── Context: org, branch, financial year, theme ──
  const { branch, selectedFinancialYear, org } = useOrg();
  const { theme } = useTheme();                                       // NEW

  const branchId = branch?.id;
  const financialYearId = selectedFinancialYear?.id;

  // Teacher ID – scoped to branch & FY
  const { data: teacherId } = useQuery({
    queryKey: ["teacher-id", user?.id, branchId, financialYearId],
    queryFn: async () => {
      if (!user?.id) return null;
      let query = supabase
        .from("teachers")
        .select("id")
        .eq("user_id", user.id);
      if (branchId) query = query.eq("branch_id", branchId);
      if (financialYearId) query = query.eq("financial_year_id", financialYearId);
      const { data, error } = await query.maybeSingle();
      if (error) throw error;
      return data?.id || null;
    },
    enabled: !!user?.id && !!branchId && !!financialYearId,
    staleTime: 10 * 60 * 1000,
  });

  // Teacher details (for the PDF)
  const { data: teacherDetails } = useQuery({
    queryKey: ["teacher-details", teacherId],
    queryFn: async () => {
      if (!teacherId) return null;
      const { data } = await supabase
        .from("teachers")
        .select("first_name, last_name, employee_code")
        .eq("id", teacherId)
        .single();
      return data;
    },
    enabled: !!teacherId,
    staleTime: 10 * 60 * 1000,
  });

  // Salary payments – scoped to branch & FY
  const { data: payments = [], isLoading } = useQuery({
    queryKey: ["my-salary", teacherId, branchId, financialYearId],
    queryFn: async () => {
      if (!teacherId) return [];
      let query = supabase
        .from("salary_payments")
        .select(
          "payment_date, amount, net_amount, tds_amount, tds_percentage, payment_mode, payment_type, remarks"
        )
        .eq("teacher_id", teacherId)
        .order("payment_date", { ascending: false });

      if (branchId) query = query.eq("branch_id", branchId);
      if (financialYearId) query = query.eq("financial_year_id", financialYearId);

      const { data } = await query;
      return data || [];
    },
    enabled: !!teacherId && !!branchId && !!financialYearId,
    staleTime: 2 * 60 * 1000,
  });

  const totalGross = payments.reduce((s, p) => s + (Number(p.amount) || 0), 0);
  const totalNet = payments.reduce((s, p) => s + (Number(p.net_amount) || 0), 0);
  const totalTDS = payments.reduce((s, p) => s + (Number(p.tds_amount) || 0), 0);

  // ── Handler – now passes org, branch & theme ──
  const handleDownloadSlip = (payment) => {
    if (!teacherDetails) return;
    generateSalarySlipPDF(
      {
        ...payment,
        teacher_name: `${teacherDetails.first_name} ${teacherDetails.last_name}`,
        employee_code: teacherDetails.employee_code,
      },
      { org, branch, theme }      // <-- pass all three contexts
    );
  };

  if (isLoading) return <><div className="p-8 text-center">Loading...</div></>;

  return (
    <>
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
                  <th className="p-3 text-center text-sm font-montserrat text-secondary-dark">Slip</th>
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
                    <td className="p-3 text-center">
                      <button
                        onClick={() => handleDownloadSlip(p)}
                        className="inline-flex items-center gap-1 text-primary hover:text-primary-light text-sm font-medium"
                        title="Download Salary Slip"
                      >
                        <Download size={16} /> Slip
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </>
  );
}