// src/pages/AgedReceivables.jsx
import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { Printer, Filter } from "lucide-react";
import AdminLayout from "../layouts/AdminLayout";
import { supabase } from "../api/supabase";
import { getOrganization } from "../services/organizationService";
import { useOrg } from "../context/OrganizationContext";   // NEW

const AGE_BUCKETS = [
  { label: "0‑30 days", min: 0, max: 30 },
  { label: "31‑60 days", min: 31, max: 60 },
  { label: "61‑90 days", min: 61, max: 90 },
  { label: "90+ days", min: 91, max: Infinity },
];

export default function AgedReceivables() {
  const { org: currentOrg } = useOrg();                  // NEW

  // Pass current org id to getOrganization
  const { data: org } = useQuery({
    queryKey: ["organization", currentOrg?.id],
    queryFn: () => getOrganization(currentOrg?.id),
    enabled: !!currentOrg?.id,
  });

  const [courseFilter, setCourseFilter] = useState("");
  const [batchFilter, setBatchFilter] = useState("");
  const [mediumFilter, setMediumFilter] = useState("");
  const [showFilters, setShowFilters] = useState(false);

  const { data: courses = [] } = useQuery({
    queryKey: ["courses-dropdown"],
    queryFn: async () => {
      const { data } = await supabase.from("courses").select("id, course_name").eq("status", true).order("course_name");
      return data || [];
    },
    staleTime: 10 * 60 * 1000,
  });

  const { data: batches = [] } = useQuery({
    queryKey: ["batches-dropdown"],
    queryFn: async () => {
      const { data } = await supabase.from("batches").select("id, batch_name").eq("status", "active").order("batch_name");
      return data || [];
    },
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

  const { data: receivables = [], isLoading } = useQuery({
    queryKey: ["aged-receivables", courseFilter, batchFilter, mediumFilter],
    queryFn: async () => {
      // 1. Build student_id set from batch/medium filters (if any)
      let studentIdSet = null;
      if (batchFilter || mediumFilter) {
        let batchQuery = supabase
          .from("student_batches")
          .select("student_id")
          .eq("status", "active");
        if (batchFilter) batchQuery = batchQuery.eq("batch_id", batchFilter);
        if (mediumFilter) {
          const { data: mBatches } = await supabase
            .from("batches")
            .select("id")
            .eq("medium_id", mediumFilter);
          const ids = (mBatches || []).map((b) => b.id);
          if (ids.length > 0) batchQuery = batchQuery.in("batch_id", ids);
          else return [];
        }
        const { data: sb } = await batchQuery;
        studentIdSet = new Set((sb || []).map((r) => r.student_id));
        if (studentIdSet.size === 0) return [];
      }

      // 2. Fetch all student_fees (RLS will filter by current org/branch/FY)
      let feeQuery = supabase.from("student_fees").select("*");
      const { data: allFees, error } = await feeQuery;
      if (error) throw error;
      if (!allFees || allFees.length === 0) return [];

      // 3. Filter client-side
      let filtered = allFees.filter(
        (f) => f.status !== "Paid" && !f.deleted_at
      );
      if (studentIdSet) {
        filtered = filtered.filter((f) => studentIdSet.has(f.student_id));
      }

      const feeIds = filtered.map((f) => f.id);
      const feeStructureIds = [...new Set(filtered.map((f) => f.fee_structure_id))];

      // 4. Get course names (through fee_structures)
      let courseIdMap = {};
      if (feeStructureIds.length > 0) {
        const { data: fsData } = await supabase
          .from("fee_structures")
          .select("id, course_id")
          .in("id", feeStructureIds);
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

      // 5. Get student names
      const studentIds = [...new Set(filtered.map((f) => f.student_id))];
      const { data: studentsData } = await supabase
        .from("students")
        .select("id, admission_no, first_name, last_name, mobile")
        .in("id", studentIds);
      const studentMap = {};
      (studentsData || []).forEach((s) => (studentMap[s.id] = s));

      // 6. Get payments
      const { data: payments } = await supabase
        .from("fee_payments")
        .select("student_fee_id, amount")
        .in("student_fee_id", feeIds);
      const paymentMap = {};
      (payments || []).forEach((p) => {
        paymentMap[p.student_fee_id] = (paymentMap[p.student_fee_id] || 0) + Number(p.amount);
      });

      // 7. Get batch/medium info
      const { data: sbData } = await supabase
        .from("student_batches")
        .select("student_id, batches(batch_name, mediums(name))")
        .in("student_id", studentIds)
        .eq("status", "active");
      const bmMap = {};
      (sbData || []).forEach((s) => {
        if (!bmMap[s.student_id]) {
          bmMap[s.student_id] = {
            batch: s.batches?.batch_name || "",
            medium: s.batches?.mediums?.name || "",
          };
        }
      });

      // 8. Build final list with NaN safeguards
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
    <AdminLayout>
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-3xl font-righteous text-primary-dark">Aged Receivables</h1>
        <button onClick={handlePrint} className="bg-primary text-white px-4 py-2 rounded-lg text-sm flex items-center gap-2">
          <Printer size={16} /> Print
        </button>
      </div>

      <div className="mb-4">
        <button onClick={() => setShowFilters(!showFilters)} className="border px-4 py-2 rounded-lg text-sm flex items-center gap-2">
          <Filter size={16} /> Filters
        </button>
      </div>

      {showFilters && (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
          <select value={courseFilter} onChange={e => setCourseFilter(e.target.value)} className="border rounded p-2 text-sm">
            <option value="">All Courses</option>
            {courses.map(c => <option key={c.id} value={c.id}>{c.course_name}</option>)}
          </select>
          <select value={batchFilter} onChange={e => setBatchFilter(e.target.value)} className="border rounded p-2 text-sm">
            <option value="">All Batches</option>
            {batches.map(b => <option key={b.id} value={b.id}>{b.batch_name}</option>)}
          </select>
          <select value={mediumFilter} onChange={e => setMediumFilter(e.target.value)} className="border rounded p-2 text-sm">
            <option value="">All Mediums</option>
            {mediums.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
          </select>
        </div>
      )}

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-6">
        {AGE_BUCKETS.map(b => (
          <div key={b.label} className="bg-white rounded-xl p-4 shadow-sm border text-center">
            <p className="text-xs text-secondary-dark">{b.label}</p>
            <p className="text-lg font-bold text-primary-dark">₹ {(bucketTotals[b.label]?.amount || 0).toLocaleString('en-IN')}</p>
            <p className="text-xs text-secondary">{bucketTotals[b.label]?.count || 0} students</p>
          </div>
        ))}
      </div>

      {isLoading ? (
        <p className="text-center py-8">Loading…</p>
      ) : receivables.length === 0 ? (
        <div className="bg-white rounded-xl p-10 text-center text-secondary"><p>No outstanding fees found.</p></div>
      ) : (
        <div className="bg-white rounded-xl shadow-sm overflow-hidden">
          <div id="aged-table">
            <table className="w-full text-sm">
              <thead className="bg-slate-100">
                <tr>
                  <th className="p-3 text-left">Admission No</th>
                  <th className="p-3 text-left">Student</th>
                  <th className="p-3 text-left">Course</th>
                  <th className="p-3 text-left">Batch</th>
                  <th className="p-3 text-left">Medium</th>
                  <th className="p-3 text-right">Balance</th>
                  <th className="p-3 text-right">Age (Days)</th>
                  <th className="p-3 text-left">Bucket</th>
                </tr>
              </thead>
              <tbody>
                {receivables.map((r, idx) => (
                  <tr key={idx} className="border-t hover:bg-gray-50">
                    <td className="p-3">{r.admission_no}</td>
                    <td className="p-3">
                      <div className="font-medium">{r.student_name}</div>
                      <div className="text-xs text-secondary">{r.mobile}</div>
                    </td>
                    <td className="p-3">{r.course}</td>
                    <td className="p-3">{r.batch}</td>
                    <td className="p-3">{r.medium}</td>
                    <td className="p-3 text-right font-medium">₹ {r.balance.toLocaleString('en-IN')}</td>
                    <td className="p-3 text-right">{r.ageDays}</td>
                    <td className="p-3">{r.bucket}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="bg-gray-100 font-bold">
                  <td colSpan={5} className="p-3 text-right">Grand Total</td>
                  <td className="p-3 text-right">₹ {grandTotal.toLocaleString('en-IN')}</td>
                  <td colSpan={2}></td>
                </tr>
              </tfoot>
            </table>
          </div>
        </div>
      )}
    </AdminLayout>
  );
}