// src/pages/AgedReceivables.jsx
import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { Printer, Filter, Mail } from "lucide-react";
import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";
import { supabase } from "../api/supabase";
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

/* ─── PDF helpers ──────────────────────────────────────────── */
async function loadImageAsBase64(url) {
  if (!url) return null;
  try {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const blob = await res.blob();
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve(reader.result);
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
  } catch { return null; }
}

function createRupeeSymbolImage() {
  const canvas = document.createElement("canvas");
  canvas.width = 30; canvas.height = 30;
  const ctx = canvas.getContext("2d");
  ctx.font = "bold 24px sans-serif"; ctx.fillStyle = "#000";
  ctx.textAlign = "center"; ctx.textBaseline = "middle";
  ctx.fillText("₹", 15, 15);
  return canvas.toDataURL("image/png");
}
let rupeeImage = null;
function getRupeeImage() { if (!rupeeImage) rupeeImage = createRupeeSymbolImage(); return rupeeImage; }

function drawCurrency(doc, amount, x, y, fontSize = 10, align = "left", color = "#000") {
  const img = getRupeeImage();
  doc.setFont("helvetica", "normal");
  doc.setFontSize(fontSize);
  doc.setTextColor(color);
  const amountText = amount.toLocaleString("en-IN");
  if (align === "left") {
    doc.addImage(img, "PNG", x, y - fontSize * 0.35, 4, 4);
    doc.text(amountText, x + 5, y);
  } else {
    const textWidth = doc.getTextWidth(amountText);
    doc.addImage(img, "PNG", x - textWidth - 5, y - fontSize * 0.35, 4, 4);
    doc.text(amountText, x - textWidth, y);
  }
}

export default function AgedReceivables() {
  const { org, branch, selectedFinancialYear } = useOrg();
  const branchId = branch?.id;
  const financialYearId = selectedFinancialYear?.id;

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

  // Main receivables query (unchanged)
  const { data: receivables = [], isLoading } = useQuery({
    queryKey: ["aged-receivables", courseFilter, batchFilter, mediumFilter, branchId, financialYearId],
    queryFn: async () => {
      // ... (same as your original code – no changes)
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

  // ─── Email helpers (use org from context) ────────────────────
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

      const htmlBody = `
        <div style="font-family:Arial,sans-serif;max-width:800px;margin:0 auto;">
          <h2 style="color:#000;">Aged Receivables Report</h2>
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
              <tr style="background:#f5f5f5;">
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
      });
      toast.success("Report sent to admins.");
    } catch (err) {
      console.error("Failed to send report:", err);
      toast.error("Failed to send report.");
    }
  };

  // ─── PDF Export (all black, landscape) ────────────────────────
  const handlePrintPDF = async () => {
    if (receivables.length === 0) return;

    const doc = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4" });
    const pageWidth = doc.internal.pageSize.getWidth();
    const pageHeight = doc.internal.pageSize.getHeight();
    const margin = 10;
    let y = margin;

    // Logo
    let logoBase64 = null;
    if (org?.logo_dark_url) {
      logoBase64 = await loadImageAsBase64(org.logo_dark_url);
    }

    // Header
    const logoWidth = 35, logoHeight = 14;
    if (logoBase64) {
      doc.addImage(logoBase64, "PNG", margin, y, logoWidth, logoHeight);
    }
    const textX = margin + (logoBase64 ? logoWidth + 4 : 0);
    const textY = y + 1;

    doc.setFont("helvetica", "bold");
    doc.setFontSize(14);
    doc.setTextColor("#000000");
    doc.text(org?.company_name || "Academy", textX, textY);

    doc.setFont("helvetica", "normal");
    doc.setFontSize(7);
    doc.setTextColor("#000000");
    let detailY = textY + 4.5;
    if (org?.address) {
      const addrLines = doc.splitTextToSize(org.address, pageWidth - textX - margin - 10);
      doc.text(addrLines, textX, detailY);
      detailY += addrLines.length * 3.5 + 1;
    }
    if (org?.gstin) { doc.text(`GSTIN: ${org.gstin}`, textX, detailY); detailY += 4; }
    if (org?.phone) { doc.text(`Phone: ${org.phone}`, textX, detailY); detailY += 4; }
    if (org?.email) { doc.text(`Email: ${org.email}`, textX, detailY); detailY += 4; }

    const headerHeight = Math.max(logoHeight + 4, detailY - textY + 4);
    y += headerHeight + 2;
    doc.setDrawColor("#000000");
    doc.line(margin, y, pageWidth - margin, y);
    y += 6;

    // Title
    doc.setFontSize(16);
    doc.setFont("helvetica", "bold");
    doc.setTextColor("#000000");
    doc.text("Aged Receivables (Outstanding Fees)", pageWidth / 2, y, { align: "center" });
    y += 10;

    // Bucket summary boxes
    const boxWidth = (pageWidth - 2 * margin - 30) / 4;
    const boxHeight = 16;
    const boxY = y;
    AGE_BUCKETS.forEach((b, i) => {
      const x = margin + i * (boxWidth + 10);
      doc.setDrawColor("#000000");
      doc.setFillColor(255, 255, 255);
      doc.rect(x, boxY, boxWidth, boxHeight, "FD");
      doc.setFontSize(8);
      doc.setFont("helvetica", "normal");
      doc.text(b.label, x + 2, boxY + 5);
      const val = bucketTotals[b.label]?.amount || 0;
      drawCurrency(doc, val, x + 2, boxY + 13, 8, "left", "#000");
    });
    y += boxHeight + 12;

    // Build table rows
    const rows = receivables.map((r) => [
      r.admission_no,
      r.student_name,
      r.course,
      r.batch || "—",
      r.medium || "—",
      r.balance,
      r.ageDays,
      r.bucket,
    ]);

    // Totals row
    rows.push(["", "", "", "", "Grand Total", grandTotal, "", ""]);

    autoTable(doc, {
      startY: y,
      head: [["Adm No", "Student", "Course", "Batch", "Medium", "Balance", "Age Days", "Bucket"]],
      body: rows,
      theme: "plain",
      styles: { fontSize: 8, textColor: [0,0,0], fillColor: [255,255,255], lineColor: [0,0,0], lineWidth: 0.2 },
      headStyles: { fillColor: [255,255,255], textColor: [0,0,0], fontStyle: "bold", lineWidth: 0.2, lineColor: [0,0,0] },
      columnStyles: {
        0: { cellWidth: 22 },
        1: { cellWidth: 38, halign: "left" },
        2: { cellWidth: 28 },
        3: { cellWidth: 28 },
        4: { cellWidth: 22 },
        5: { cellWidth: 30, halign: "right" },
        6: { cellWidth: 18, halign: "right" },
        7: { cellWidth: 22 },
      },
      margin: { left: margin, right: margin },
      willDrawCell: (data) => {
        if (data.column.index === 5 && typeof data.cell.raw === "number") {
          data.cell.text = [];
        }
      },
      didDrawCell: (data) => {
        if (data.column.index === 5 && typeof data.cell.raw === "number") {
          drawCurrency(doc, data.cell.raw, data.cell.x + data.cell.width - 2, data.cell.y + data.cell.height / 2 + 1.5, 8, "right", "#000");
        }
        if (data.row.index === rows.length - 1) {
          data.cell.styles.fontStyle = "bold";
        }
      },
    });

    y = doc.lastAutoTable.finalY + 10;

    // Footer
    const footerY = pageHeight - margin - 5;
    doc.setFontSize(7);
    doc.setTextColor("#000000");
    doc.setFont("helvetica", "italic");
    doc.text(`Generated on ${new Date().toLocaleString()}`, margin, footerY);
    doc.text(`© ${org?.company_name || "Academy"}`, pageWidth / 2, footerY, { align: "center" });

    doc.save(`Aged_Receivables_${new Date().toISOString().slice(0, 10)}.pdf`);
  };

  return (
    <div className="space-y-6 px-4 sm:px-6 lg:px-0">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold text-gray-900">Aged Receivables</h1>
          <p className="text-sm text-gray-600 mt-1">Outstanding student fee balances by ageing bucket</p>
        </div>
        <div className="flex gap-3">
          <button
            onClick={sendReportEmail}
            className="inline-flex items-center gap-2 px-4 py-2.5 bg-green-600 hover:bg-green-700 text-white rounded-lg transition-colors text-sm font-medium"
          >
            <Mail size={16} /> Send Report
          </button>
          <button
            onClick={handlePrintPDF}
            className="inline-flex items-center gap-2 px-4 py-2.5 bg-gray-900 hover:bg-gray-800 text-white rounded-lg transition-colors text-sm font-medium"
          >
            <Printer size={16} /> Print PDF
          </button>
        </div>
      </div>

      {/* Filter toggle */}
      <div>
        <button
          onClick={() => setShowFilters(!showFilters)}
          className="inline-flex items-center gap-2 px-4 py-2.5 border border-gray-300 bg-white text-gray-700 rounded-lg hover:bg-gray-50 transition-colors text-sm"
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
            className="border border-gray-300 bg-white text-gray-900 rounded-lg p-2.5 text-sm"
          >
            <option value="">All Courses</option>
            {courses.map((c) => (
              <option key={c.id} value={c.id}>{c.course_name}</option>
            ))}
          </select>
          <select
            value={batchFilter}
            onChange={(e) => setBatchFilter(e.target.value)}
            className="border border-gray-300 bg-white text-gray-900 rounded-lg p-2.5 text-sm"
          >
            <option value="">All Batches</option>
            {batches.map((b) => (
              <option key={b.id} value={b.id}>{b.batch_name}</option>
            ))}
          </select>
          <select
            value={mediumFilter}
            onChange={(e) => setMediumFilter(e.target.value)}
            className="border border-gray-300 bg-white text-gray-900 rounded-lg p-2.5 text-sm"
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
            className="bg-white rounded-xl p-4 shadow-sm border border-gray-200 text-center"
          >
            <p className="text-xs text-gray-500">{b.label}</p>
            <p className="text-lg font-bold text-gray-900">
              ₹ {(bucketTotals[b.label]?.amount || 0).toLocaleString('en-IN')}
            </p>
            <p className="text-xs text-gray-500">{bucketTotals[b.label]?.count || 0} students</p>
          </div>
        ))}
      </div>

      {/* Main table */}
      {isLoading ? (
        <div className="text-center py-8 text-gray-500">Loading…</div>
      ) : receivables.length === 0 ? (
        <div className="bg-white rounded-xl p-10 text-center text-gray-500 border border-gray-200">
          <p>No outstanding fees found.</p>
        </div>
      ) : (
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[800px] text-sm">
              <thead className="bg-gray-50">
                <tr>
                  <th className="p-3 text-left text-xs font-medium text-gray-500 uppercase">Admission No</th>
                  <th className="p-3 text-left text-xs font-medium text-gray-500 uppercase">Student</th>
                  <th className="p-3 text-left text-xs font-medium text-gray-500 uppercase">Course</th>
                  <th className="p-3 text-left text-xs font-medium text-gray-500 uppercase">Batch</th>
                  <th className="p-3 text-left text-xs font-medium text-gray-500 uppercase">Medium</th>
                  <th className="p-3 text-right text-xs font-medium text-gray-500 uppercase">Balance</th>
                  <th className="p-3 text-right text-xs font-medium text-gray-500 uppercase">Age (Days)</th>
                  <th className="p-3 text-left text-xs font-medium text-gray-500 uppercase">Bucket</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {receivables.map((r, idx) => (
                  <tr key={idx} className="hover:bg-gray-50 transition-colors">
                    <td className="p-3 text-gray-700">{r.admission_no}</td>
                    <td className="p-3">
                      <div className="font-medium text-gray-900">{r.student_name}</div>
                      <div className="text-xs text-gray-500">{r.mobile}</div>
                    </td>
                    <td className="p-3 text-gray-700">{r.course}</td>
                    <td className="p-3 text-gray-700">{r.batch || "—"}</td>
                    <td className="p-3 text-gray-700">{r.medium || "—"}</td>
                    <td className="p-3 text-right font-medium text-gray-900">₹ {r.balance.toLocaleString('en-IN')}</td>
                    <td className="p-3 text-right text-gray-700">{r.ageDays}</td>
                    <td className="p-3 text-gray-700">{r.bucket}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="bg-gray-100 font-bold">
                  <td colSpan={5} className="p-3 text-right text-gray-900">Grand Total</td>
                  <td className="p-3 text-right text-gray-900">₹ {grandTotal.toLocaleString('en-IN')}</td>
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