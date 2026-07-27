// src/pages/SalaryPayments.jsx
import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { getSalaryPayments } from "../services/salaryService";
import BackButton from "../components/BackButton";
import { Search, Download, Filter, X, Mail } from "lucide-react";
import Papa from "papaparse";
import toast from "react-hot-toast";
import { useOrg } from "../context/OrganizationContext";
import { useTheme } from "../context/ThemeContext"; // 👈 import theme
import { supabase } from "../api/supabase";
import { sendEmail, sendTemplateEmail } from "../services/emailService";

export default function SalaryPayments() {
  const { branch, selectedFinancialYear, org } = useOrg();
  const theme = useTheme(); // 👈 get theme colours
  const branchId = branch?.id;
  const financialYearId = selectedFinancialYear?.id;

  const [search, setSearch] = useState("");
  const [teacherFilter, setTeacherFilter] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [showFilters, setShowFilters] = useState(false);
  const [sendingSlipId, setSendingSlipId] = useState(null);

  // ─── Helper: get admin emails ──────────────────────────────────────
  const getAdminEmails = async () => {
    if (!org?.id) return [];
    const { data, error } = await supabase
      .from("profiles")
      .select("email")
      .eq("organization_id", org.id)
      .in("role", ["admin", "super_admin", "organization_admin"])
      .eq("is_active", true);
    if (error) {
      console.error("Failed to fetch admin emails:", error);
      return [];
    }
    return data?.map(p => p.email).filter(Boolean) || [];
  };

  // ─── Send Report Email ─────────────────────────────────────────────
  const sendReportEmail = async () => {
    if (filteredPayments.length === 0) {
      alert("No payments to send.");
      return;
    }

    try {
      const adminEmails = await getAdminEmails();
      if (adminEmails.length === 0) {
        alert("No admin emails found.");
        return;
      }

      // Build HTML table rows with theme colours
      let tableRows = filteredPayments.map((p) => `
        <tr>
          <td style="padding:4px 8px;border:1px solid #ddd;">${p.teachers?.first_name || ''} ${p.teachers?.last_name || ''}</td>
          <td style="padding:4px 8px;border:1px solid #ddd;">${p.payment_date}</td>
          <td style="padding:4px 8px;border:1px solid #ddd;text-align:right;">₹ ${Number(p.amount).toLocaleString('en-IN')}</td>
          <td style="padding:4px 8px;border:1px solid #ddd;text-align:right;">${p.tds_percentage || 0}%</td>
          <td style="padding:4px 8px;border:1px solid #ddd;text-align:right;">₹ ${Number(p.tds_amount).toLocaleString('en-IN')}</td>
          <td style="padding:4px 8px;border:1px solid #ddd;text-align:right;">₹ ${Number(p.net_amount).toLocaleString('en-IN')}</td>
          <td style="padding:4px 8px;border:1px solid #ddd;">${p.payment_type || 'fixed'}</td>
          <td style="padding:4px 8px;border:1px solid #ddd;">${p.payment_mode || '—'}</td>
        </tr>
      `).join('');

      const totalGross = filteredPayments.reduce((s, p) => s + (p.amount || 0), 0);
      const totalTDS = filteredPayments.reduce((s, p) => s + (p.tds_amount || 0), 0);
      const totalNet = filteredPayments.reduce((s, p) => s + (p.net_amount || 0), 0);

      const htmlBody = `
        <div style="font-family:Arial,sans-serif;max-width:800px;margin:0 auto;">
          <h2 style="color:${theme.primary_color};">Salary Payments Report</h2>
          <p><strong>Branch:</strong> ${branch?.branch_name || 'N/A'}</p>
          <p><strong>Total Records:</strong> ${filteredPayments.length}</p>
          <p><strong>Gross Total:</strong> ₹ ${totalGross.toLocaleString('en-IN')}</p>
          <p><strong>Total TDS:</strong> ₹ ${totalTDS.toLocaleString('en-IN')}</p>
          <p><strong>Net Total:</strong> ₹ ${totalNet.toLocaleString('en-IN')}</p>
          <hr />
          <table style="width:100%;border-collapse:collapse;font-size:11px;border:1px solid #ddd;">
            <thead style="background:${theme.primary_light_color || '#e3f2fd'};">
              <tr>
                <th style="padding:4px 8px;border:1px solid #ddd;text-align:left;">Teacher</th>
                <th style="padding:4px 8px;border:1px solid #ddd;text-align:left;">Date</th>
                <th style="padding:4px 8px;border:1px solid #ddd;text-align:right;">Gross</th>
                <th style="padding:4px 8px;border:1px solid #ddd;text-align:right;">TDS %</th>
                <th style="padding:4px 8px;border:1px solid #ddd;text-align:right;">TDS</th>
                <th style="padding:4px 8px;border:1px solid #ddd;text-align:right;">Net</th>
                <th style="padding:4px 8px;border:1px solid #ddd;text-align:left;">Type</th>
                <th style="padding:4px 8px;border:1px solid #ddd;text-align:left;">Mode</th>
              </tr>
            </thead>
            <tbody>
              ${tableRows}
            </tbody>
            <tfoot style="font-weight:bold;background:#f5f5f5;">
              <tr>
                <td colspan="2" style="padding:4px 8px;border:1px solid #ddd;text-align:right;">Totals</td>
                <td style="padding:4px 8px;border:1px solid #ddd;text-align:right;">₹ ${totalGross.toLocaleString('en-IN')}</td>
                <td></td>
                <td style="padding:4px 8px;border:1px solid #ddd;text-align:right;">₹ ${totalTDS.toLocaleString('en-IN')}</td>
                <td style="padding:4px 8px;border:1px solid #ddd;text-align:right;">₹ ${totalNet.toLocaleString('en-IN')}</td>
                <td colspan="2"></td>
              </tr>
            </tfoot>
          </table>
          <p style="color:#888;font-size:10px;margin-top:20px;">Computer‑generated report from ${org?.company_name || 'Academy'}</p>
        </div>
      `;

      await sendEmail({
        to: adminEmails,
        subject: `Salary Payments Report - ${new Date().toLocaleDateString()}`,
        html: htmlBody,
      });

      alert("Report sent to admins.");
    } catch (err) {
      console.error("Failed to send report:", err);
      alert("Failed to send report. Check console for details.");
    }
  };

  // ─── Send Salary Slip Email to Teacher ────────────────────────────
  const sendSalarySlipEmail = async (payment) => {
    setSendingSlipId(payment.id);
    try {
      let teacherEmail = payment.teachers?.email;
      if (!teacherEmail) {
        const { data: teacher, error } = await supabase
          .from("teachers")
          .select("email, first_name, last_name, employee_code")
          .eq("id", payment.teacher_id)
          .single();
        if (error) throw error;
        if (!teacher?.email) {
          toast.error("No email found for this teacher.");
          setSendingSlipId(null);
          return;
        }
        teacherEmail = teacher.email;
        if (!payment.teachers) {
          payment.teachers = teacher;
        }
      }

      const teacherName = payment.teachers
        ? `${payment.teachers.first_name} ${payment.teachers.last_name}`.trim()
        : "Teacher";
      const employeeCode = payment.teachers?.employee_code || "N/A";

      const context = {
        academyName: org?.company_name || "Academy",
        teacher_name: teacherName,
        employee_code: employeeCode,
        payment_date: payment.payment_date,
        gross_amount: payment.amount || 0,
        tds: payment.tds_amount || 0,
        net_amount: payment.net_amount || 0,
      };

      await sendTemplateEmail({
        to: teacherEmail,
        organizationId: org?.id,
        slug: "salary_slip",
        context,
        branchId,
      });

      toast.success(`Salary slip sent to ${teacherEmail}`);
    } catch (err) {
      console.error("Send slip error:", err);
      toast.error("Failed to send salary slip.");
    } finally {
      setSendingSlipId(null);
    }
  };

  // ─── Data fetching ──────────────────────────────────────────────────
  const { data: payments = [], isLoading } = useQuery({
    queryKey: ["salary-payments", branchId, financialYearId],
    queryFn: () => getSalaryPayments({}, branchId, financialYearId),
    enabled: !!branchId && !!financialYearId,
    staleTime: 5 * 60 * 1000,
  });

  const filteredPayments = useMemo(() => {
    let list = payments;
    if (search.trim()) {
      const term = search.toLowerCase();
      list = list.filter(
        (p) =>
          `${p.teachers?.first_name} ${p.teachers?.last_name}`.toLowerCase().includes(term) ||
          (p.teachers?.employee_code || "").toLowerCase().includes(term)
      );
    }
    if (teacherFilter) {
      list = list.filter((p) => p.teacher_id === Number(teacherFilter));
    }
    if (startDate) {
      list = list.filter((p) => p.payment_date >= startDate);
    }
    if (endDate) {
      list = list.filter((p) => p.payment_date <= endDate);
    }
    return list;
  }, [payments, search, teacherFilter, startDate, endDate]);

  const totalGross = filteredPayments.reduce((s, p) => s + (p.amount || 0), 0);
  const totalTDS = filteredPayments.reduce((s, p) => s + (p.tds_amount || 0), 0);
  const totalNet = filteredPayments.reduce((s, p) => s + (p.net_amount || 0), 0);

  const handleExport = () => {
    if (!filteredPayments.length) {
      toast.error("No data to export");
      return;
    }
    const csv = Papa.unparse(
      filteredPayments.map((p) => ({
        Teacher: `${p.teachers?.first_name} ${p.teachers?.last_name}`,
        Date: p.payment_date,
        Gross: p.amount,
        TDS: p.tds_amount,
        Net: p.net_amount,
        Type: p.payment_type,
        Mode: p.payment_mode,
      }))
    );
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "salary_payments.csv";
    a.click();
    URL.revokeObjectURL(url);
  };

  const teacherOptions = useMemo(() => {
    const map = {};
    payments.forEach((p) => {
      if (p.teacher_id && p.teachers) {
        map[p.teacher_id] = `${p.teachers.first_name} ${p.teachers.last_name}`;
      }
    });
    return Object.entries(map).map(([id, name]) => ({ id: Number(id), name }));
  }, [payments]);

  return (
    <div className="space-y-6 px-4 sm:px-6 lg:px-0">
      <BackButton to="/hr-hub" label="HR & Staff" />
      <div className="flex flex-col sm:flex-row sm:items-center justify-between mb-6">
        <h1 className="text-3xl font-heading text-primary-dark">
          Salary Payments
        </h1>
        <div className="flex gap-2 mt-2 sm:mt-0">
          <button
            onClick={sendReportEmail}
            className="bg-primary hover:bg-primary-dark text-white px-4 py-2 rounded-lg text-sm flex items-center gap-2 font-body"
          >
            <Mail className="w-4 h-4" />
            Send Report
          </button>
          <button
            onClick={handleExport}
            className="border border-gray-300 dark:border-gray-600 bg-white dark:bg-accent text-gray-700 dark:text-gray-200 px-4 py-2 rounded-lg text-sm flex items-center gap-2 hover:bg-gray-50 dark:hover:bg-gray-700 font-body"
          >
            <Download className="w-4 h-4" />
            Export CSV
          </button>
          <button
            onClick={() => setShowFilters(!showFilters)}
            className="border border-gray-300 dark:border-gray-600 bg-white dark:bg-accent text-gray-700 dark:text-gray-200 px-4 py-2 rounded-lg text-sm flex items-center gap-2 hover:bg-gray-50 dark:hover:bg-gray-700 font-body"
          >
            <Filter className="w-4 h-4" />
            Filters {showFilters && <X className="w-3 h-3" />}
          </button>
        </div>
      </div>

      {/* Search & Filters */}
      <div className="flex flex-col sm:flex-row gap-3 mb-4">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 dark:text-gray-500 w-4 h-4" />
          <input
            type="text"
            placeholder="Search by teacher name..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-9 pr-4 py-2 border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 rounded-lg text-sm focus:ring-2 focus:ring-primary focus:border-primary outline-none placeholder-gray-400 dark:placeholder-gray-500"
          />
        </div>
        {showFilters && (
          <div className="flex flex-wrap gap-3">
            <select
              value={teacherFilter}
              onChange={(e) => setTeacherFilter(e.target.value)}
              className="border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-primary outline-none"
            >
              <option value="">All Teachers</option>
              {teacherOptions.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </select>
            <input
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              className="border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-primary outline-none"
              placeholder="From"
            />
            <input
              type="date"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              className="border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-primary outline-none"
              placeholder="To"
            />
            <button
              onClick={() => {
                setTeacherFilter("");
                setStartDate("");
                setEndDate("");
              }}
              className="text-primary text-sm hover:underline font-body"
            >
              Clear
            </button>
          </div>
        )}
      </div>

      {/* Summary Cards */}
      {filteredPayments.length > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
          <div className="bg-white dark:bg-accent rounded-xl shadow-sm p-4 border border-gray-200 dark:border-gray-700">
            <p className="text-xs text-gray-500 dark:text-gray-400">Gross Total</p>
            <p className="text-xl font-bold text-primary">₹ {totalGross.toLocaleString("en-IN")}</p>
          </div>
          <div className="bg-white dark:bg-accent rounded-xl shadow-sm p-4 border border-gray-200 dark:border-gray-700">
            <p className="text-xs text-gray-500 dark:text-gray-400">Total TDS</p>
            <p className="text-xl font-bold text-accent-dark">₹ {totalTDS.toLocaleString("en-IN")}</p>
          </div>
          <div className="bg-white dark:bg-accent rounded-xl shadow-sm p-4 border border-gray-200 dark:border-gray-700">
            <p className="text-xs text-gray-500 dark:text-gray-400">Net Total</p>
            <p className="text-xl font-bold text-accent">₹ {totalNet.toLocaleString("en-IN")}</p>
          </div>
        </div>
      )}

      {/* Table */}
      <div className="bg-white dark:bg-accent rounded-xl shadow-sm overflow-hidden border border-gray-200 dark:border-gray-700">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-gray-50 dark:bg-gray-700 border-b border-gray-200 dark:border-gray-600">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                  Teacher
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                  Date
                </th>
                <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                  Gross
                </th>
                <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                  TDS %
                </th>
                <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                  TDS Amount
                </th>
                <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                  Net
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                  Type
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                  Mode
                </th>
                <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                  Slip
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
              {isLoading ? (
                <tr>
                  <td colSpan={9} className="text-center py-8 text-gray-500 dark:text-gray-400">
                    Loading payments...
                  </td>
                </tr>
              ) : filteredPayments.length === 0 ? (
                <tr>
                  <td colSpan={9} className="text-center py-8 text-gray-500 dark:text-gray-400">
                    No salary payments found.
                  </td>
                </tr>
              ) : (
                filteredPayments.map((p) => (
                  <tr key={p.id} className="hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors">
                    <td className="px-4 py-3 text-sm text-gray-700 dark:text-gray-200">
                      <div className="font-medium">
                        {p.teachers?.first_name} {p.teachers?.last_name}
                      </div>
                      <div className="text-xs text-gray-400 dark:text-gray-500">
                        {p.teachers?.employee_code}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-700 dark:text-gray-200">
                      {p.payment_date}
                    </td>
                    <td className="px-4 py-3 text-right text-sm font-medium text-gray-800 dark:text-gray-100">
                      ₹ {p.amount?.toLocaleString("en-IN")}
                    </td>
                    <td className="px-4 py-3 text-right text-sm text-gray-700 dark:text-gray-200">
                      {p.tds_percentage || 0}%
                    </td>
                    <td className="px-4 py-3 text-right text-sm text-accent-dark font-medium">
                      ₹ {p.tds_amount?.toLocaleString("en-IN")}
                    </td>
                    <td className="px-4 py-3 text-right text-sm font-semibold text-primary">
                      ₹ {p.net_amount?.toLocaleString("en-IN")}
                    </td>
                    <td className="px-4 py-3 text-sm">
                      <span
                        className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                          p.payment_type === "fixed"
                            ? "bg-primary-bg text-primary"
                            : "bg-accent-bg text-accent"
                        }`}
                      >
                        {p.payment_type || "fixed"}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-700 dark:text-gray-200">
                      {p.payment_mode || "—"}
                    </td>
                    <td className="px-4 py-3 text-center text-sm">
                      <button
                        onClick={() => sendSalarySlipEmail(p)}
                        disabled={sendingSlipId === p.id}
                        className="text-primary hover:text-primary-light disabled:opacity-50"
                        title="Send salary slip to teacher"
                      >
                        <Mail className="w-4 h-4" />
                        {sendingSlipId === p.id ? "..." : ""}
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
        {filteredPayments.length > 0 && (
          <div className="px-4 py-2 text-xs text-gray-500 dark:text-gray-400 border-t border-gray-200 dark:border-gray-700">
            Showing {filteredPayments.length} of {payments.length} payments
          </div>
        )}
      </div>
    </div>
  );
}