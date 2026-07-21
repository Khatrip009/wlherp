// src/pages/AgedReceivables.jsx
import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { Printer, Filter, Mail } from "lucide-react";
import { supabase } from "../api/supabase";
import { getOrganization } from "../services/organizationService";
import { getCourseOptions } from "../services/batchService";
import { getActiveBatches } from "../services/batchService";
import { useOrg } from "../context/OrganizationContext";
import { sendEmail } from "../services/emailService";

const AGE_BUCKETS = [
  { label: "0‑30 days", min: 0, max: 30 },
  { label: "31‑60 days", min: 31, max: 60 },
  { label: "61‑90 days", min: 61, max: 90 },
  { label: "90+ days", min: 91, max: Infinity },
];

export default function AgedReceivables() {
  const { org: currentOrg, branch, selectedFinancialYear } = useOrg();
  const branchId = branch?.id;
  const financialYearId = selectedFinancialYear?.id;

  const { data: org } = useQuery({
    queryKey: ["organization", currentOrg?.id],
    queryFn: () => getOrganization(currentOrg?.id),
    enabled: !!currentOrg?.id,
  });

  const [courseFilter, setCourseFilter] = useState("");
  const [batchFilter, setBatchFilter] = useState("");
  const [mediumFilter, setMediumFilter] = useState("");
  const [showFilters, setShowFilters] = useState(false);

  // Dropdowns
  const { data: courses = [] } = useQuery({
    queryKey: ["courses-dropdown"],
    queryFn: getCourseOptions,
    staleTime: 10 * 60 * 1000,
  });

  const { data: batches = [] } = useQuery({
    queryKey: ["batches-dropdown", branchId, financialYearId],
    queryFn: () => getActiveBatches(branchId, financialYearId),
    enabled: !!branchId && !!financialYearId,
    staleTime: 10 * 60 * 1000,
  });

  const { data: mediums = [] } = useQuery({
    queryKey: ["mediums-dropdown"],
    queryFn: async () => {
      const { data } = await supabase.from("mediums").select("id, name").order("name");
      return data || [];
    },
    staleTime: 10 * 60 * 1000,
  });

  // ─── Main receivables query ────────────────────────────────────────────
  const { data: receivables = [], isLoading } = useQuery({
    queryKey: ["aged-receivables", courseFilter, batchFilter, mediumFilter, branchId, financialYearId],
    queryFn: async () => {
      if (!branchId || !financialYearId) return [];

      let studentIdSet = null;
      if (batchFilter || mediumFilter) {
        let batchQuery = supabase
          .from("student_batches")
          .select("student_id")
          .eq("status", "active")
          .eq("branch_id", branchId)
          .eq("financial_year_id", financialYearId);

        if (batchFilter) batchQuery = batchQuery.eq("batch_id", batchFilter);
        if (mediumFilter) {
          const { data: mBatches } = await supabase
            .from("batches")
            .select("id")
            .eq("medium_id", mediumFilter)
            .eq("branch_id", branchId)
            .eq("financial_year_id", financialYearId);
          const ids = (mBatches || []).map((b) => b.id);
          if (ids.length > 0) batchQuery = batchQuery.in("batch_id", ids);
          else return [];
        }
        const { data: sb } = await batchQuery;
        studentIdSet = new Set((sb || []).map((r) => r.student_id));
        if (studentIdSet.size === 0) return [];
      }

      let feeQuery = supabase
        .from("student_fees")
        .select("*")
        .eq("branch_id", branchId)
        .eq("financial_year_id", financialYearId);

      const { data: allFees, error } = await feeQuery;
      if (error) throw error;
      if (!allFees || allFees.length === 0) return [];

      let filtered = allFees.filter(
        (f) => f.status !== "Paid" && !f.deleted_at
      );
      if (studentIdSet) {
        filtered = filtered.filter((f) => studentIdSet.has(f.student_id));
      }

      const feeIds = filtered.map((f) => f.id);
      const feeStructureIds = [...new Set(filtered.map((f) => f.fee_structure_id))];

      let courseIdMap = {};
      if (feeStructureIds.length > 0) {
        const { data: fsData } = await supabase
          .from("fee_structures")
          .select("id, course_id")
          .in("id", feeStructureIds)
          .eq("branch_id", branchId)
          .eq("financial_year_id", financialYearId);
        (fsData || []).forEach((fs) => {
          courseIdMap[fs.id] = fs.course_id;
        });
      }

      const courseIds = [...new Set(Object.values(courseIdMap))];
      let courseNameMap = {};
      if (courseIds.length > 0) {
        const { data: courseList } = await supabase
          .from("courses")
          .select("id, course_name")
          .in("id", courseIds);
        (courseList || []).forEach((c) => {
          courseNameMap[c.id] = c.course_name;
        });
      }

      if (courseFilter) {
        filtered = filtered.filter((f) => {
          const cId = courseIdMap[f.fee_structure_id];
          return cId == courseFilter;
        });
      }

      const studentIds = [...new Set(filtered.map((f) => f.student_id))];
      const { data: studentsData } = await supabase
        .from("students")
        .select("id, admission_no, first_name, last_name, mobile")
        .in("id", studentIds)
        .eq("branch_id", branchId)
        .eq("financial_year_id", financialYearId);
      const studentMap = {};
      (studentsData || []).forEach((s) => (studentMap[s.id] = s));

      const { data: payments } = await supabase
        .from("fee_payments")
        .select("student_fee_id, amount")
        .in("student_fee_id", feeIds)
        .eq("branch_id", branchId)
        .eq("financial_year_id", financialYearId);
      const paymentMap = {};
      (payments || []).forEach((p) => {
        paymentMap[p.student_fee_id] = (paymentMap[p.student_fee_id] || 0) + Number(p.amount);
      });

      const { data: sbData } = await supabase
        .from("student_batches")
        .select("student_id, batches(batch_name, mediums(name))")
        .in("student_id", studentIds)
        .eq("status", "active")
        .eq("branch_id", branchId)
        .eq("financial_year_id", financialYearId);
      const bmMap = {};
      (sbData || []).forEach((s) => {
        if (!bmMap[s.student_id]) {
          bmMap[s.student_id] = {
            batch: s.batches?.batch_name || "",
            medium: s.batches?.mediums?.name || "",
          };
        }
      });

      const now = new Date();
      return filtered
        .map((fee) => {
          const s = studentMap[fee.student_id] || {};
          const paid = paymentMap[fee.id] || 0;
          const balance = Number(fee.final_fee) - paid;
          const safeBalance = isNaN(balance) ? 0 : balance;
          if (safeBalance <= 0) return null;

          let ageDays = 0;
          if (fee.created_at) {
            const created = new Date(fee.created_at);
            if (!isNaN(created.getTime())) {
              ageDays = Math.floor((now - created) / 86400000);
            }
          }
          const safeAge = isNaN(ageDays) ? 0 : ageDays;

          const bucket =
            AGE_BUCKETS.find((b) => safeAge >= b.min && safeAge <= b.max) ||
            AGE_BUCKETS[AGE_BUCKETS.length - 1];

          const bm = bmMap[fee.student_id] || {};
          const cId = courseIdMap[fee.fee_structure_id];
          return {
            student_id: fee.student_id,
            admission_no: s.admission_no || "",
            student_name: `${s.first_name || ""} ${s.last_name || ""}`.trim() || "Unknown",
            mobile: s.mobile || "",
            course: courseNameMap[cId] || "",
            batch: bm.batch,
            medium: bm.medium,
            balance: safeBalance,
            ageDays: safeAge,
            bucket: bucket.label,
          };
        })
        .filter(Boolean);
    },
    enabled: !!branchId && !!financialYearId,
    staleTime: 2 * 60 * 1000,
  });

  const bucketTotals = useMemo(() => {
    const t = {};
    AGE_BUCKETS.forEach((b) => (t[b.label] = { count: 0, amount: 0 }));
    receivables.forEach((r) => {
      if (t[r.bucket]) {
        t[r.bucket].count += 1;
        const amt = Number(r.balance);
        t[r.bucket].amount += isNaN(amt) ? 0 : amt;
      }
    });
    return t;
  }, [receivables]);

  const grandTotal = receivables.reduce((s, r) => {
    const amt = Number(r.balance);
    return s + (isNaN(amt) ? 0 : amt);
  }, 0);

  // ─── Helper: get admin emails ─────────────────────────────────────
  const getAdminEmails = async () => {
    if (!currentOrg?.id) return [];
    const { data, error } = await supabase
      .from("profiles")
      .select("email")
      .eq("organization_id", currentOrg.id)
      .in("role", ["admin", "super_admin", "organization_admin"])
      .eq("is_active", true);
    if (error) {
      console.error("Failed to fetch admin emails:", error);
      return [];
    }
    return data?.map(p => p.email).filter(Boolean) || [];
  };

  // ─── Send report email ─────────────────────────────────────────────
  const sendReportEmail = async () => {
    if (receivables.length === 0) {
      alert("No data to send.");
      return;
    }

    try {
      const adminEmails = await getAdminEmails();
      if (adminEmails.length === 0) {
        alert("No admin emails found to send the report.");
        return;
      }

      // Build HTML table rows
      let tableRows = receivables.map(r => `
        <tr>
          <td style="padding:4px 8px;border:1px solid #ddd;">${r.admission_no}</td>
          <td style="padding:4px 8px;border:1px solid #ddd;">${r.student_name}</td>
          <td style="padding:4px 8px;border:1px solid #ddd;">${r.course}</td>
          <td style="padding:4px 8px;border:1px solid #ddd;">${r.batch}</td>
          <td style="padding:4px 8px;border:1px solid #ddd;text-align:right;">₹ ${r.balance.toLocaleString('en-IN')}</td>
          <td style="padding:4px 8px;border:1px solid #ddd;text-align:right;">${r.ageDays}</td>
          <td style="padding:4px 8px;border:1px solid #ddd;">${r.bucket}</td>
        </tr>
      `).join('');

      // Build full HTML email body
      const htmlBody = `
        <div style="font-family:Arial,sans-serif;max-width:800px;margin:0 auto;">
          <h2 style="color:#0D47A1;">Aged Receivables Report</h2>
          <p><strong>Branch:</strong> ${branch?.branch_name || 'N/A'}</p>
          <p><strong>Date:</strong> ${new Date().toLocaleString()}</p>
          <h3>Bucket Summaries</h3>
          <ul>
            ${AGE_BUCKETS.map(b =>
              `<li><strong>${b.label}:</strong> ₹ ${(bucketTotals[b.label]?.amount || 0).toLocaleString('en-IN')} (${bucketTotals[b.label]?.count || 0} students)</li>`
            ).join('')}
          </ul>
          <p><strong>Grand Total Outstanding:</strong> ₹ ${grandTotal.toLocaleString('en-IN')}</p>
          <hr />
          <h3>Detailed Outstanding Fees</h3>
          <table style="width:100%;border-collapse:collapse;font-size:12px;">
            <thead>
              <tr style="background:#e3f2fd;">
                <th style="padding:4px 8px;border:1px solid #ddd;text-align:left;">Admission No</th>
                <th style="padding:4px 8px;border:1px solid #ddd;text-align:left;">Student</th>
                <th style="padding:4px 8px;border:1px solid #ddd;text-align:left;">Course</th>
                <th style="padding:4px 8px;border:1px solid #ddd;text-align:left;">Batch</th>
                <th style="padding:4px 8px;border:1px solid #ddd;text-align:right;">Balance</th>
                <th style="padding:4px 8px;border:1px solid #ddd;text-align:right;">Age (Days)</th>
                <th style="padding:4px 8px;border:1px solid #ddd;text-align:left;">Bucket</th>
              </tr>
            </thead>
            <tbody>
              ${tableRows}
            </tbody>
            <tfoot>
              <tr style="font-weight:bold;background:#f5f5f5;">
                <td colspan="4" style="padding:4px 8px;border:1px solid #ddd;text-align:right;">Grand Total</td>
                <td style="padding:4px 8px;border:1px solid #ddd;text-align:right;">₹ ${grandTotal.toLocaleString('en-IN')}</td>
                <td colspan="2"></td>
              </tr>
            </tfoot>
          </table>
          <p style="color:#888;font-size:10px;margin-top:20px;">Computer‑generated report from ${org?.company_name || 'Academy'}</p>
        </div>
      `;

      await sendEmail({
        to: adminEmails,
        subject: `Aged Receivables Report - ${new Date().toLocaleDateString()}`,
        html: htmlBody,
        from: org?.email || undefined,
      });

      alert("Report sent to admins.");
    } catch (err) {
      console.error("Failed to send report:", err);
      alert("Failed to send report. Check console for details.");
    }
  };

  // ─── Print handler ─────────────────────────────────────────────────
  const handlePrint = () => {
    const printContent = document.getElementById("aged-table")?.outerHTML;
    if (!printContent) return;
    const logoUrl = org?.logo_dark_url || "/ShreeVidhyaDark.png";
    const orgName = org?.company_name || "ShreeVidhya Academy";
    const orgAddr = org?.address || "";
    const orgPhone = org?.phone || "";
    const orgEmail = org?.email || "";
    const printWindow = window.open("", "_blank", "width=1100,height=750");
    printWindow.document.write(`
      <html><head><title>Aged Receivables</title>
      <style>
        @page { size: A4 landscape; margin: 12mm; }
        body { font-family: Montserrat, sans-serif; color: #222; font-size: 10px; }
        .header { display: flex; align-items: center; border-bottom: 2px solid #0D47A1; padding-bottom: 8px; margin-bottom: 15px; }
        .header img { height: 40px; margin-right: 15px; }
        .org-name { font-size: 16px; font-weight: 700; color: #0D47A1; }
        .org-details { font-size: 8px; color: #555; }
        h1 { text-align: center; color: #0D47A1; margin: 10px 0; font-size: 14px; }
        .summary { display: flex; justify-content: space-around; margin-bottom: 15px; font-weight: 700; font-size: 10px; }
        table { width: 100%; border-collapse: collapse; border: 1px solid #bbb; font-size: 9px; }
        th, td { padding: 4px 6px; border: 1px solid #bbb; }
        th { background-color: #E3F2FD; }
        .text-right { text-align: right; }
        .footer { margin-top: 20px; font-size: 8px; color: #888; text-align: center; border-top: 1px solid #ddd; padding-top: 8px; }
      </style></head>
      <body>
        <div class="header"><img src="${logoUrl}" alt="Logo" onerror="this.style.display='none'"/><div><div class="org-name">${orgName}</div><div class="org-details">${orgAddr}</div><div class="org-details">Ph: ${orgPhone} | Email: ${orgEmail}</div></div></div>
        <h1>Aged Receivables (Student Fee Outstanding)</h1>
        <div class="summary">${AGE_BUCKETS.map(b => `<span>${b.label}: ₹ ${(bucketTotals[b.label]?.amount || 0).toLocaleString('en-IN')} (${bucketTotals[b.label]?.count || 0} students)</span>`).join(" | ")}</div>
        ${printContent}
        <div class="footer">Computer‑generated report – ${orgName}</div>
        <script>window.print();</script>
      </body></html>
    `);
    printWindow.document.close();
  };

  return (
    <div className="space-y-6 px-4 sm:px-6 lg:px-0">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold" style={{ fontFamily: "var(--font-heading)", color: "var(--color-primary)" }}>
            Aged Receivables
          </h1>
          <p className="text-sm text-gray-600 dark:text-gray-400 mt-1" style={{ fontFamily: "var(--font-body)" }}>
            Outstanding student fee balances by ageing bucket
          </p>
        </div>
        <div className="flex gap-3">
          <button
            onClick={sendReportEmail}
            className="inline-flex items-center gap-2 px-4 py-2.5 bg-green-600 hover:bg-green-700 text-white rounded-lg transition-colors text-sm font-medium"
            style={{ fontFamily: "var(--font-body)" }}
          >
            <Mail size={16} /> Send Report
          </button>
          <button
            onClick={handlePrint}
            className="inline-flex items-center gap-2 px-4 py-2.5 bg-primary hover:bg-primary-light text-white rounded-lg transition-colors text-sm font-medium"
            style={{ fontFamily: "var(--font-body)" }}
          >
            <Printer size={16} /> Print
          </button>
        </div>
      </div>

      {/* Filter toggle */}
      <div>
        <button
          onClick={() => setShowFilters(!showFilters)}
          className="inline-flex items-center gap-2 px-4 py-2.5 border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-200 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors text-sm"
          style={{ fontFamily: "var(--font-body)" }}
        >
          <Filter size={16} /> Filters
        </button>
      </div>

      {/* Filter fields */}
      {showFilters && (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <select
            value={courseFilter}
            onChange={(e) => setCourseFilter(e.target.value)}
            className="border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 rounded-lg p-2.5 text-sm"
          >
            <option value="">All Courses</option>
            {courses.map((c) => (
              <option key={c.id} value={c.id}>{c.course_name}</option>
            ))}
          </select>
          <select
            value={batchFilter}
            onChange={(e) => setBatchFilter(e.target.value)}
            className="border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 rounded-lg p-2.5 text-sm"
          >
            <option value="">All Batches</option>
            {batches.map((b) => (
              <option key={b.id} value={b.id}>{b.batch_name}</option>
            ))}
          </select>
          <select
            value={mediumFilter}
            onChange={(e) => setMediumFilter(e.target.value)}
            className="border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 rounded-lg p-2.5 text-sm"
          >
            <option value="">All Mediums</option>
            {mediums.map((m) => (
              <option key={m.id} value={m.id}>{m.name}</option>
            ))}
          </select>
        </div>
      )}

      {/* Bucket summary cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        {AGE_BUCKETS.map((b) => (
          <div
            key={b.label}
            className="bg-white dark:bg-gray-800 rounded-xl p-4 shadow-sm border border-gray-200 dark:border-gray-700 text-center"
          >
            <p className="text-xs text-gray-500 dark:text-gray-400" style={{ fontFamily: "var(--font-body)" }}>
              {b.label}
            </p>
            <p className="text-lg font-bold" style={{ color: "var(--color-primary)" }}>
              ₹ {(bucketTotals[b.label]?.amount || 0).toLocaleString('en-IN')}
            </p>
            <p className="text-xs text-gray-500 dark:text-gray-400" style={{ fontFamily: "var(--font-body)" }}>
              {bucketTotals[b.label]?.count || 0} students
            </p>
          </div>
        ))}
      </div>

      {/* Main table */}
      {isLoading ? (
        <div className="text-center py-8 text-gray-500 dark:text-gray-400">Loading…</div>
      ) : receivables.length === 0 ? (
        <div className="bg-white dark:bg-gray-800 rounded-xl p-10 text-center text-gray-500 dark:text-gray-400 border border-gray-200 dark:border-gray-700">
          <p>No outstanding fees found.</p>
        </div>
      ) : (
        <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 overflow-hidden">
          <div id="aged-table" className="overflow-x-auto">
            <table className="w-full min-w-[800px] text-sm">
              <thead className="bg-gray-50 dark:bg-gray-700">
                <tr>
                  <th className="p-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Admission No</th>
                  <th className="p-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Student</th>
                  <th className="p-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Course</th>
                  <th className="p-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Batch</th>
                  <th className="p-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Medium</th>
                  <th className="p-3 text-right text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Balance</th>
                  <th className="p-3 text-right text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Age (Days)</th>
                  <th className="p-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Bucket</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
                {receivables.map((r, idx) => (
                  <tr key={idx} className="hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors">
                    <td className="p-3 text-gray-700 dark:text-gray-300" style={{ fontFamily: "var(--font-body)" }}>{r.admission_no}</td>
                    <td className="p-3">
                      <div className="font-medium text-gray-800 dark:text-gray-100" style={{ fontFamily: "var(--font-heading)" }}>
                        {r.student_name}
                      </div>
                      <div className="text-xs text-gray-500 dark:text-gray-400" style={{ fontFamily: "var(--font-body)" }}>
                        {r.mobile}
                      </div>
                    </td>
                    <td className="p-3 text-gray-700 dark:text-gray-300" style={{ fontFamily: "var(--font-body)" }}>{r.course}</td>
                    <td className="p-3 text-gray-700 dark:text-gray-300" style={{ fontFamily: "var(--font-body)" }}>{r.batch}</td>
                    <td className="p-3 text-gray-700 dark:text-gray-300" style={{ fontFamily: "var(--font-body)" }}>{r.medium}</td>
                    <td className="p-3 text-right font-medium text-gray-800 dark:text-gray-100">
                      ₹ {r.balance.toLocaleString('en-IN')}
                    </td>
                    <td className="p-3 text-right text-gray-700 dark:text-gray-300">{r.ageDays}</td>
                    <td className="p-3 text-gray-700 dark:text-gray-300" style={{ fontFamily: "var(--font-body)" }}>{r.bucket}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="bg-gray-100 dark:bg-gray-700 font-bold">
                  <td colSpan={5} className="p-3 text-right text-gray-800 dark:text-gray-100" style={{ fontFamily: "var(--font-heading)" }}>
                    Grand Total
                  </td>
                  <td className="p-3 text-right" style={{ color: "var(--color-primary)" }}>
                    ₹ {grandTotal.toLocaleString('en-IN')}
                  </td>
                  <td colSpan={2}></td>
                </tr>
              </tfoot>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}