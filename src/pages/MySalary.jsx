// src/pages/MySalary.jsx
import { useQuery } from "@tanstack/react-query";
import { IndianRupee, Download, Mail } from "lucide-react";
import toast from "react-hot-toast";

import { useAuth } from "../context/AuthContext";
import { supabase } from "../api/supabase";
import BackButton from "../components/BackButton";
import { useOrg } from "../context/OrganizationContext";
import { useTheme } from "../context/ThemeContext";
import { generateSalarySlipPDF } from "../utils/salarySlipPdf";
import { sendEmail } from "../services/emailService";

export default function MySalary() {
  const { user } = useAuth();

  const { branch, selectedFinancialYear, org } = useOrg();
  const theme = useTheme(); // full theme object

  const branchId = branch?.id;
  const financialYearId = selectedFinancialYear?.id;

  // ─── Helper: fetch teacher's email ────────────────────────────────
  const getTeacherEmail = async (id) => {
    if (!id) return null;
    const { data, error } = await supabase
      .from("teachers")
      .select("email")
      .eq("id", id)
      .maybeSingle();
    if (error) return null;
    return data?.email || null;
  };

  // ─── Teacher ID – scoped ──────────────────────────────────────────
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

  // ─── Teacher details (including email for report) ────────────────
  const { data: teacherDetails } = useQuery({
    queryKey: ["teacher-details", teacherId],
    queryFn: async () => {
      if (!teacherId) return null;
      const { data } = await supabase
        .from("teachers")
        .select("first_name, last_name, employee_code, email")
        .eq("id", teacherId)
        .single();
      return data;
    },
    enabled: !!teacherId,
    staleTime: 10 * 60 * 1000,
  });

  // ─── Salary payments – scoped ─────────────────────────────────────
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

  // ─── Send salary report email ──────────────────────────────────────
  const sendSalaryReport = async () => {
    if (payments.length === 0) {
      alert("No salary records to send.");
      return;
    }

    try {
      let recipientEmail = teacherDetails?.email;
      if (!recipientEmail && teacherId) {
        recipientEmail = await getTeacherEmail(teacherId);
      }
      if (!recipientEmail) {
        alert("No email address found for your account.");
        return;
      }

      let tableRows = payments.map((p) => `
        <tr>
          <td style="padding:4px 8px;border:1px solid #ddd;">${p.payment_date}</td>
          <td style="padding:4px 8px;border:1px solid #ddd;text-align:right;">₹ ${Number(p.amount || 0).toLocaleString('en-IN')}</td>
          <td style="padding:4px 8px;border:1px solid #ddd;text-align:right;">${p.tds_percentage || 0}%</td>
          <td style="padding:4px 8px;border:1px solid #ddd;text-align:right;">₹ ${Number(p.tds_amount || 0).toLocaleString('en-IN')}</td>
          <td style="padding:4px 8px;border:1px solid #ddd;text-align:right;font-weight:bold;color:${theme.primary_color};">₹ ${Number(p.net_amount || p.amount || 0).toLocaleString('en-IN')}</td>
          <td style="padding:4px 8px;border:1px solid #ddd;">${p.payment_mode || '—'}</td>
          <td style="padding:4px 8px;border:1px solid #ddd;">${p.remarks || '—'}</td>
        </tr>
      `).join('');

      const teacherName = teacherDetails ? `${teacherDetails.first_name} ${teacherDetails.last_name}`.trim() : 'Teacher';

      const htmlBody = `
        <div style="font-family:Arial,sans-serif;max-width:800px;margin:0 auto;">
          <h2 style="color:${theme.primary_color};">Salary Summary</h2>
          <p><strong>Teacher:</strong> ${teacherName}</p>
          <p><strong>Employee Code:</strong> ${teacherDetails?.employee_code || 'N/A'}</p>
          <p><strong>Total Payments:</strong> ${payments.length}</p>
          <hr />
          <div style="display:flex;gap:20px;margin-bottom:15px;">
            <div><strong>Total Gross:</strong> ₹ ${totalGross.toLocaleString('en-IN')}</div>
            <div><strong>Total TDS:</strong> ₹ ${totalTDS.toLocaleString('en-IN')}</div>
            <div><strong>Total Net:</strong> ₹ ${totalNet.toLocaleString('en-IN')}</div>
          </div>
          <h3>Payment History</h3>
          <table style="width:100%;border-collapse:collapse;font-size:11px;border:1px solid #ddd;">
            <thead style="background:${theme.primary_light_color || '#e3f2fd'};">
              <tr>
                <th style="padding:4px 8px;border:1px solid #ddd;text-align:left;">Date</th>
                <th style="padding:4px 8px;border:1px solid #ddd;text-align:right;">Gross</th>
                <th style="padding:4px 8px;border:1px solid #ddd;text-align:right;">TDS %</th>
                <th style="padding:4px 8px;border:1px solid #ddd;text-align:right;">TDS</th>
                <th style="padding:4px 8px;border:1px solid #ddd;text-align:right;">Net</th>
                <th style="padding:4px 8px;border:1px solid #ddd;text-align:left;">Mode</th>
                <th style="padding:4px 8px;border:1px solid #ddd;text-align:left;">Remarks</th>
              </tr>
            </thead>
            <tbody>
              ${tableRows}
            </tbody>
          </table>
          <p style="color:#888;font-size:10px;margin-top:20px;">Computer‑generated report from ${org?.company_name || 'Academy'}</p>
        </div>
      `;

      await sendEmail({
        to: recipientEmail,
        subject: `My Salary Report - ${new Date().toLocaleDateString()}`,
        html: htmlBody,
      });

      toast.success("Report sent to your email.");
    } catch (err) {
      console.error("Email error:", err);
      toast.error("Failed to send report.");
    }
  };

  // ─── PDF download handler ───────────────────────────────────────────
  const handleDownloadSlip = (payment) => {
    if (!teacherDetails) return;
    generateSalarySlipPDF(
      {
        ...payment,
        teacher_name: `${teacherDetails.first_name} ${teacherDetails.last_name}`,
        employee_code: teacherDetails.employee_code,
      },
      { org, branch, theme }
    );
  };

  if (isLoading) return <div className="p-8 text-center text-gray-500 dark:text-gray-400">Loading...</div>;

  return (
    <div className="space-y-6 px-4 sm:px-6 lg:px-0">
      <BackButton to="/teacher" label="Dashboard" />
      <div className="flex justify-between items-center mb-6">
        <div>
          <h1 className="text-3xl font-heading text-primary-dark">
            My Salary
          </h1>
          <p className="text-sm text-gray-600 dark:text-gray-400 font-body mt-1">
            Your salary payment history
          </p>
        </div>
        <button
          onClick={sendSalaryReport}
          disabled={payments.length === 0}
          className="bg-primary hover:bg-primary-dark text-white px-4 py-2 rounded-lg text-sm font-body flex items-center gap-2 disabled:opacity-50"
        >
          <Mail size={16} /> Send Report
        </button>
      </div>

      {payments.length > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
          <div className="bg-white dark:bg-accent rounded-xl p-4 shadow-sm border border-gray-200 dark:border-gray-700">
            <p className="text-xs text-gray-500 dark:text-gray-400">Total Gross</p>
            <p className="text-xl font-bold text-primary mt-1">₹{totalGross.toLocaleString("en-IN")}</p>
          </div>
          <div className="bg-white dark:bg-accent rounded-xl p-4 shadow-sm border border-gray-200 dark:border-gray-700">
            <p className="text-xs text-gray-500 dark:text-gray-400">Total TDS Deducted</p>
            <p className="text-xl font-bold text-accent-dark mt-1">₹{totalTDS.toLocaleString("en-IN")}</p>
          </div>
          <div className="bg-white dark:bg-accent rounded-xl p-4 shadow-sm border border-gray-200 dark:border-gray-700">
            <p className="text-xs text-gray-500 dark:text-gray-400">Total Net Received</p>
            <p className="text-xl font-bold text-accent mt-1">₹{totalNet.toLocaleString("en-IN")}</p>
          </div>
        </div>
      )}

      {payments.length === 0 ? (
        <div className="bg-white dark:bg-accent rounded-xl p-8 shadow-sm border border-gray-200 dark:border-gray-700 text-center">
          <IndianRupee size={32} className="text-gray-400 dark:text-gray-500 mx-auto mb-2" />
          <p className="text-gray-600 dark:text-gray-400">No salary payments recorded yet.</p>
        </div>
      ) : (
        <div className="bg-white dark:bg-accent rounded-xl shadow-sm overflow-hidden border border-gray-200 dark:border-gray-700">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[700px]">
              <thead className="bg-gray-50 dark:bg-gray-700 border-b border-gray-200 dark:border-gray-600">
                <tr>
                  <th className="p-3 text-left text-sm font-body text-gray-500 dark:text-gray-400 uppercase tracking-wider">Date</th>
                  <th className="p-3 text-right text-sm font-body text-gray-500 dark:text-gray-400 uppercase tracking-wider">Gross</th>
                  <th className="p-3 text-right text-sm font-body text-gray-500 dark:text-gray-400 uppercase tracking-wider">TDS %</th>
                  <th className="p-3 text-right text-sm font-body text-gray-500 dark:text-gray-400 uppercase tracking-wider">TDS Amount</th>
                  <th className="p-3 text-right text-sm font-body text-gray-500 dark:text-gray-400 uppercase tracking-wider">Net Paid</th>
                  <th className="p-3 text-left text-sm font-body text-gray-500 dark:text-gray-400 uppercase tracking-wider">Mode</th>
                  <th className="p-3 text-left text-sm font-body text-gray-500 dark:text-gray-400 uppercase tracking-wider">Remarks</th>
                  <th className="p-3 text-center text-sm font-body text-gray-500 dark:text-gray-400 uppercase tracking-wider">Slip</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
                {payments.map((p, idx) => (
                  <tr key={idx} className="hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors">
                    <td className="p-3 text-sm text-gray-700 dark:text-gray-200">{p.payment_date}</td>
                    <td className="p-3 text-right text-sm font-medium text-gray-800 dark:text-gray-100">₹{Number(p.amount || 0).toLocaleString("en-IN")}</td>
                    <td className="p-3 text-right text-sm text-gray-700 dark:text-gray-200">{p.tds_percentage || 0}%</td>
                    <td className="p-3 text-right text-sm text-accent-dark font-medium">₹{Number(p.tds_amount || 0).toLocaleString("en-IN")}</td>
                    <td className="p-3 text-right text-sm font-bold text-primary">₹{Number(p.net_amount || p.amount || 0).toLocaleString("en-IN")}</td>
                    <td className="p-3 text-sm text-gray-700 dark:text-gray-200">{p.payment_mode || "—"}</td>
                    <td className="p-3 text-sm text-gray-500 dark:text-gray-400">{p.remarks || "—"}</td>
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
    </div>
  );
}