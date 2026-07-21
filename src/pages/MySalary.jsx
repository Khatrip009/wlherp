// src/pages/MySalary.jsx
import { useQuery } from "@tanstack/react-query";
import { IndianRupee, Download, Mail } from "lucide-react";

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
  const { theme } = useTheme();

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
      // 1. Determine recipient email (teacher's email)
      let recipientEmail = teacherDetails?.email;
      if (!recipientEmail && teacherId) {
        recipientEmail = await getTeacherEmail(teacherId);
      }
      if (!recipientEmail) {
        alert("No email address found for your account.");
        return;
      }

      // 2. Build HTML table rows
      let tableRows = payments.map((p) => `
        <tr>
          <td style="padding:4px 8px;border:1px solid #ddd;">${p.payment_date}</td>
          <td style="padding:4px 8px;border:1px solid #ddd;text-align:right;">₹ ${Number(p.amount || 0).toLocaleString('en-IN')}</td>
          <td style="padding:4px 8px;border:1px solid #ddd;text-align:right;">${p.tds_percentage || 0}%</td>
          <td style="padding:4px 8px;border:1px solid #ddd;text-align:right;">₹ ${Number(p.tds_amount || 0).toLocaleString('en-IN')}</td>
          <td style="padding:4px 8px;border:1px solid #ddd;text-align:right;font-weight:bold;color:#2e7d32;">₹ ${Number(p.net_amount || p.amount || 0).toLocaleString('en-IN')}</td>
          <td style="padding:4px 8px;border:1px solid #ddd;">${p.payment_mode || '—'}</td>
          <td style="padding:4px 8px;border:1px solid #ddd;">${p.remarks || '—'}</td>
        </tr>
      `).join('');

      const teacherName = teacherDetails ? `${teacherDetails.first_name} ${teacherDetails.last_name}`.trim() : 'Teacher';

      const htmlBody = `
        <div style="font-family:Arial,sans-serif;max-width:800px;margin:0 auto;">
          <h2 style="color:#0D47A1;">Salary Summary</h2>
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
            <thead style="background:#e3f2fd;">
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
       // from: org?.email || undefined,
      });

      toast.success("Report sent to your email.");
    } catch (err) {
      console.error("Email error:", err);
      toast.error("Failed to send report.");
    }
  };

  // ─── PDF download handler (unchanged) ─────────────────────────────
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

  if (isLoading) return <div className="p-8 text-center">Loading...</div>;

  return (
    <>
      <BackButton to="/teacher" label="Dashboard" />
      <div className="flex justify-between items-center mb-6">
        <div>
          <h1 className="text-3xl font-righteous text-primary-dark">My Salary</h1>
          <p className="text-sm text-secondary-dark font-montserrat mt-1">Your salary payment history</p>
        </div>
        {/* 👇 Send Report button */}
        <button
          onClick={sendSalaryReport}
          disabled={payments.length === 0}
          className="bg-green-600 hover:bg-green-700 text-white px-4 py-2 rounded-lg text-sm font-montserrat flex items-center gap-2 disabled:opacity-50"
        >
          <Mail size={16} /> Send Report
        </button>
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