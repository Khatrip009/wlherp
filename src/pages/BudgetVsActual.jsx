// src/pages/BudgetVsActual.jsx
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import toast from "react-hot-toast";
import { Printer, ArrowLeft, Mail } from "lucide-react";
import { Link } from "react-router-dom";
import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";
import { supabase } from "../api/supabase";
import { useOrg } from "../context/OrganizationContext";
import { useTheme } from "../context/ThemeContext"; // ✅ dynamic theme
import { sendEmail } from "../services/emailService";

/* ─── PDF helpers (unchanged) ─────────────────────────────── */
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

export default function BudgetVsActual() {
  const today = new Date().toISOString().split("T")[0];
  const firstOfMonth = new Date(new Date().getFullYear(), new Date().getMonth(), 1)
    .toISOString().split("T")[0];
  const [startDate, setStartDate] = useState(firstOfMonth);
  const [endDate, setEndDate] = useState(today);

  const { org, branch, selectedFinancialYear } = useOrg();
  const theme = useTheme();
  const branchId = branch?.id;
  const financialYearId = selectedFinancialYear?.id;

  const headingFont = theme?.font_heading || "Righteous";
  const bodyFont = theme?.font_body || "Montserrat";

  // ── Data fetching (unchanged) ────────────────────────────
  const { data: report = [], isLoading } = useQuery({
    queryKey: ["budget-vs-actual", startDate, endDate, branchId, financialYearId, org?.id],
    queryFn: async () => {
      let budgetQuery = supabase
        .from("budgets")
        .select("*, chart_of_accounts!inner(account_code, account_name)")
        .order("period_start");

      if (branchId) budgetQuery = budgetQuery.eq("branch_id", branchId);
      if (financialYearId) budgetQuery = budgetQuery.eq("financial_year_id", financialYearId);

      const { data: allBudgets, error: budgetErr } = await budgetQuery;
      if (budgetErr) throw budgetErr;
      if (!allBudgets?.length) return [];

      const normalize = (budget) => {
        let start = budget.period_start;
        let end = budget.period_end;
        if (start > end) [start, end] = [end, start];
        return { ...budget, period_start: start, period_end: end };
      };

      const budgets = allBudgets
        .map(normalize)
        .filter((b) => b.period_start <= endDate && b.period_end >= startDate);

      if (!budgets.length) return [];

      const accountIds = budgets.map((b) => b.account_id);

      let lineQuery = supabase
        .from("journal_entry_lines")
        .select("account_id, debit, credit, journal_entries!inner(entry_date)")
        .in("account_id", accountIds)
        .gte("journal_entries.entry_date", startDate)
        .lte("journal_entries.entry_date", endDate);

      if (branchId) {
        lineQuery = lineQuery.or(`branch_id.eq.${branchId},branch_id.is.null`);
      }

      const { data: lines, error: lineErr } = await lineQuery;
      if (lineErr) throw lineErr;

      const actualMap = {};
      (lines || []).forEach((l) => {
        const aid = l.account_id;
        if (!actualMap[aid]) actualMap[aid] = 0;
        actualMap[aid] += Number(l.debit || 0) - Number(l.credit || 0);
      });

      return budgets.map((b) => {
        const actual = actualMap[b.account_id] || 0;
        const variance = actual - b.amount;
        const variancePercent = b.amount ? ((variance / b.amount) * 100).toFixed(1) : 0;
        return {
          id: b.id,
          account_code: b.chart_of_accounts?.account_code || "",
          account_name: b.chart_of_accounts?.account_name || "",
          period_start: b.period_start,
          period_end: b.period_end,
          budgeted: b.amount,
          actual,
          variance,
          variancePercent,
        };
      });
    },
    enabled: !!(startDate && endDate && branchId && financialYearId && org?.id),
  });

  const totalBudget = report.reduce((s, r) => s + r.budgeted, 0);
  const totalActual = report.reduce((s, r) => s + r.actual, 0);
  const totalVariance = totalActual - totalBudget;

  // ── Email helpers (unchanged) ─────────────────────────
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
    return data?.map((p) => p.email).filter(Boolean) || [];
  };

  const sendReportEmail = async () => {
    if (report.length === 0) {
      alert("No data to send. Please adjust the date range.");
      return;
    }
    try {
      const adminEmails = await getAdminEmails();
      if (adminEmails.length === 0) {
        alert("No admin emails found.");
        return;
      }

      const tableRows = report
        .map((r) => {
          const varianceColor = r.variance > 0 ? "#dc2626" : "#16a34a";
          return `
            <tr>
              <td style="padding:4px 8px;border:1px solid #ddd;">${r.account_code} - ${r.account_name}</td>
              <td style="padding:4px 8px;border:1px solid #ddd;">${r.period_start} → ${r.period_end}</td>
              <td style="padding:4px 8px;border:1px solid #ddd;text-align:right;">₹ ${r.budgeted.toLocaleString('en-IN')}</td>
              <td style="padding:4px 8px;border:1px solid #ddd;text-align:right;">₹ ${r.actual.toLocaleString('en-IN')}</td>
              <td style="padding:4px 8px;border:1px solid #ddd;text-align:right;font-weight:bold;color:${varianceColor};">${r.variance > 0 ? '+' : ''}₹ ${r.variance.toLocaleString('en-IN')}</td>
              <td style="padding:4px 8px;border:1px solid #ddd;text-align:right;color:${varianceColor};">${r.variancePercent}%</td>
            </tr>`;
        })
        .join("");

      const varianceTotalColor = totalVariance > 0 ? "#dc2626" : "#16a34a";

      const htmlBody = `
        <div style="font-family:Arial,sans-serif;max-width:800px;margin:0 auto;">
          <h2 style="color:#000;">Budget vs Actual Report</h2>
          <p><strong>Branch:</strong> ${branch?.branch_name || 'N/A'}</p>
          <p><strong>Period:</strong> ${startDate} – ${endDate}</p>
          <hr />
          <div style="display:flex;justify-content:space-around;margin-bottom:20px;">
            <div><strong>Total Budgeted:</strong> ₹ ${totalBudget.toLocaleString('en-IN')}</div>
            <div><strong>Total Actual:</strong> ₹ ${totalActual.toLocaleString('en-IN')}</div>
            <div><strong style="color:${varianceTotalColor};">Variance:</strong> ${totalVariance > 0 ? '+' : ''}₹ ${totalVariance.toLocaleString('en-IN')}</div>
          </div>
          <h3>Account-wise Breakdown</h3>
          <table style="width:100%;border-collapse:collapse;font-size:12px;">
            <thead>
              <tr style="background:#f5f5f5;">
                <th style="padding:4px 8px;border:1px solid #ddd;text-align:left;">Account</th>
                <th style="padding:4px 8px;border:1px solid #ddd;text-align:left;">Period</th>
                <th style="padding:4px 8px;border:1px solid #ddd;text-align:right;">Budgeted</th>
                <th style="padding:4px 8px;border:1px solid #ddd;text-align:right;">Actual</th>
                <th style="padding:4px 8px;border:1px solid #ddd;text-align:right;">Variance</th>
                <th style="padding:4px 8px;border:1px solid #ddd;text-align:right;">Variance %</th>
              </tr>
            </thead>
            <tbody>
              ${tableRows}
            </tbody>
            <tfoot>
              <tr style="font-weight:bold;background:#f5f5f5;">
                <td colspan="2" style="padding:4px 8px;border:1px solid #ddd;text-align:right;">Totals</td>
                <td style="padding:4px 8px;border:1px solid #ddd;text-align:right;">₹ ${totalBudget.toLocaleString('en-IN')}</td>
                <td style="padding:4px 8px;border:1px solid #ddd;text-align:right;">₹ ${totalActual.toLocaleString('en-IN')}</td>
                <td style="padding:4px 8px;border:1px solid #ddd;text-align:right;color:${varianceTotalColor};">${totalVariance > 0 ? '+' : ''}₹ ${totalVariance.toLocaleString('en-IN')}</td>
                <td style="padding:4px 8px;border:1px solid #ddd;text-align:right;">${totalBudget ? ((totalVariance / totalBudget) * 100).toFixed(1) : '0'}%</td>
              </tr>
            </tfoot>
          </table>
          <p style="color:#888;font-size:10px;margin-top:20px;">Computer‑generated report from ${org?.company_name || 'Academy'}</p>
        </div>`;

      await sendEmail({
        to: adminEmails,
        subject: `Budget vs Actual Report - ${new Date().toLocaleDateString()}`,
        html: htmlBody,
      });
      toast.success("Report sent to admins.");
    } catch (err) {
      console.error("Failed to send report:", err);
      toast.error("Failed to send report.");
    }
  };

  // ── PDF Export (unchanged, black & white) ──────────────
  const handlePrintPDF = async () => {
    if (report.length === 0) return;

    const doc = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4" });
    const pageWidth = doc.internal.pageSize.getWidth();
    const pageHeight = doc.internal.pageSize.getHeight();
    const margin = 10;
    let y = margin;

    let logoBase64 = null;
    if (org?.logo_dark_url) {
      logoBase64 = await loadImageAsBase64(org.logo_dark_url);
    }

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

    doc.setFontSize(16);
    doc.setFont("helvetica", "bold");
    doc.setTextColor("#000000");
    doc.text("Budget vs Actual", pageWidth / 2, y, { align: "center" });
    y += 8;
    doc.setFontSize(10);
    doc.setFont("helvetica", "normal");
    doc.text(`Period: ${startDate} – ${endDate}`, pageWidth / 2, y, { align: "center" });
    y += 10;

    const boxWidth = (pageWidth - 2 * margin - 30) / 3;
    const boxHeight = 16;
    const boxY = y;
    const summaryItems = [
      { label: "Total Budgeted", value: totalBudget },
      { label: "Total Actual", value: totalActual },
      { label: "Variance", value: totalVariance },
    ];

    summaryItems.forEach((item, i) => {
      const x = margin + i * (boxWidth + 15);
      doc.setDrawColor("#000000");
      doc.setFillColor(255, 255, 255);
      doc.rect(x, boxY, boxWidth, boxHeight, "FD");
      doc.setFontSize(8);
      doc.setFont("helvetica", "normal");
      doc.text(item.label, x + 2, boxY + 5);
      drawCurrency(doc, item.value, x + 2, boxY + 13, 8, "left", "#000");
    });
    y += boxHeight + 12;

    const rows = report.map((r) => [
      `${r.account_code} - ${r.account_name}`,
      `${r.period_start} → ${r.period_end}`,
      r.budgeted,
      r.actual,
      r.variance,
      r.variancePercent + "%",
    ]);

    rows.push([
      "TOTAL", "", totalBudget, totalActual, totalVariance,
      totalBudget ? ((totalVariance / totalBudget) * 100).toFixed(1) + "%" : "0%",
    ]);

    autoTable(doc, {
      startY: y,
      head: [["Account", "Period", "Budgeted", "Actual", "Variance", "Variance %"]],
      body: rows,
      theme: "plain",
      styles: { fontSize: 8, textColor: [0,0,0], fillColor: [255,255,255], lineColor: [0,0,0], lineWidth: 0.2 },
      headStyles: { fillColor: [255,255,255], textColor: [0,0,0], fontStyle: "bold", lineWidth: 0.2, lineColor: [0,0,0] },
      columnStyles: {
        0: { cellWidth: 50, halign: "left" },
        1: { cellWidth: 40 },
        2: { cellWidth: 35, halign: "right" },
        3: { cellWidth: 35, halign: "right" },
        4: { cellWidth: 35, halign: "right" },
        5: { cellWidth: 25, halign: "right" },
      },
      margin: { left: margin, right: margin },
      willDrawCell: (data) => {
        if ([2,3,4].includes(data.column.index) && typeof data.cell.raw === "number") {
          data.cell.text = [];
        }
      },
      didDrawCell: (data) => {
        if ([2,3,4].includes(data.column.index) && typeof data.cell.raw === "number") {
          drawCurrency(doc, data.cell.raw, data.cell.x + data.cell.width - 2, data.cell.y + data.cell.height / 2 + 1.5, 8, "right", "#000");
        }
        if (data.row.index === rows.length - 1) {
          data.cell.styles.fontStyle = "bold";
        }
      },
    });

    y = doc.lastAutoTable.finalY + 10;

    const footerY = pageHeight - margin - 5;
    doc.setFontSize(7);
    doc.setTextColor("#000000");
    doc.setFont("helvetica", "italic");
    doc.text(`Generated on ${new Date().toLocaleString()}`, margin, footerY);
    doc.text(`© ${org?.company_name || "Academy"}`, pageWidth / 2, footerY, { align: "center" });

    doc.save(`Budget_vs_Actual_${startDate}_${endDate}.pdf`);
  };

  return (
    <div className="space-y-6 px-4 sm:px-6 lg:px-0">
      <Link
        to="/budgets"
        className="inline-flex items-center gap-2 text-primary-dark hover:text-primary text-sm"
        style={{ fontFamily: bodyFont }}
      >
        <ArrowLeft size={18} /> Back to Budgets
      </Link>

      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1
            className="text-2xl sm:text-3xl font-bold text-primary"
            style={{ fontFamily: headingFont }}
          >
            Budget vs Actual
          </h1>
          <p
            className="text-sm text-primary-dark mt-1"
            style={{ fontFamily: bodyFont }}
          >
            Compare budgeted amounts against actual spending
          </p>
        </div>
        <div className="flex gap-3">
          <button
            onClick={sendReportEmail}
            className="inline-flex items-center gap-2 px-4 py-2.5 bg-accent hover:bg-accent-dark text-white rounded-lg transition-colors text-sm font-medium"
            style={{ fontFamily: bodyFont }}
          >
            <Mail size={16} /> Send Report
          </button>
          <button
            onClick={handlePrintPDF}
            className="inline-flex items-center gap-2 px-4 py-2.5 bg-primary hover:bg-accent text-white rounded-lg transition-colors text-sm font-medium"
            style={{ fontFamily: bodyFont }}
          >
            <Printer size={16} /> Print PDF
          </button>
        </div>
      </div>

      <div className="flex flex-wrap gap-4">
        <div>
          <label
            className="text-sm font-medium text-primary-dark mr-2"
            style={{ fontFamily: bodyFont }}
          >
            From:
          </label>
          <input
            type="date"
            value={startDate}
            onChange={(e) => setStartDate(e.target.value)}
            className="border border-primary-bg bg-white text-primary rounded-lg p-2.5 text-sm"
          />
        </div>
        <div>
          <label
            className="text-sm font-medium text-primary-dark mr-2"
            style={{ fontFamily: bodyFont }}
          >
            To:
          </label>
          <input
            type="date"
            value={endDate}
            onChange={(e) => setEndDate(e.target.value)}
            className="border border-primary-bg bg-white text-primary rounded-lg p-2.5 text-sm"
          />
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-white rounded-xl p-4 shadow-sm border border-primary-bg text-center">
          <p className="text-xs text-primary-dark" style={{ fontFamily: bodyFont }}>
            Total Budgeted
          </p>
          <p className="text-xl font-bold text-primary" style={{ fontFamily: headingFont }}>
            ₹ {totalBudget.toLocaleString("en-IN")}
          </p>
        </div>
        <div className="bg-white rounded-xl p-4 shadow-sm border border-primary-bg text-center">
          <p className="text-xs text-primary-dark" style={{ fontFamily: bodyFont }}>
            Total Actual
          </p>
          <p className="text-xl font-bold text-primary" style={{ fontFamily: headingFont }}>
            ₹ {totalActual.toLocaleString("en-IN")}
          </p>
        </div>
        <div className="bg-white rounded-xl p-4 shadow-sm border border-primary-bg text-center">
          <p className="text-xs text-primary-dark" style={{ fontFamily: bodyFont }}>
            Variance
          </p>
          <p
            className={`text-xl font-bold ${
              totalVariance > 0 ? "text-accent-dark" : "text-accent"
            }`}
            style={{ fontFamily: headingFont }}
          >
            {totalVariance > 0 ? "+" : ""}₹ {totalVariance.toLocaleString("en-IN")}
          </p>
        </div>
      </div>

      {isLoading ? (
        <p className="text-center py-8 text-primary-dark/60" style={{ fontFamily: bodyFont }}>
          Loading…
        </p>
      ) : report.length === 0 ? (
        <div
          className="bg-white rounded-xl p-10 text-center text-primary-dark border border-primary-bg"
          style={{ fontFamily: bodyFont }}
        >
          <p>No budget data for the selected period.</p>
        </div>
      ) : (
        <div className="bg-white rounded-xl shadow-sm border border-primary-bg overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[700px] text-sm">
              <thead className="bg-primary-bg">
                <tr>
                  <th className="p-3 text-left text-xs font-medium text-primary-dark uppercase" style={{ fontFamily: bodyFont }}>
                    Account
                  </th>
                  <th className="p-3 text-left text-xs font-medium text-primary-dark uppercase" style={{ fontFamily: bodyFont }}>
                    Period
                  </th>
                  <th className="p-3 text-right text-xs font-medium text-primary-dark uppercase" style={{ fontFamily: bodyFont }}>
                    Budgeted
                  </th>
                  <th className="p-3 text-right text-xs font-medium text-primary-dark uppercase" style={{ fontFamily: bodyFont }}>
                    Actual
                  </th>
                  <th className="p-3 text-right text-xs font-medium text-primary-dark uppercase" style={{ fontFamily: bodyFont }}>
                    Variance
                  </th>
                  <th className="p-3 text-right text-xs font-medium text-primary-dark uppercase" style={{ fontFamily: bodyFont }}>
                    Variance %
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-primary-bg">
                {report.map((r) => (
                  <tr key={r.id} className="hover:bg-primary-bg transition">
                    <td className="p-3 text-primary" style={{ fontFamily: bodyFont }}>
                      {r.account_code} - {r.account_name}
                    </td>
                    <td className="p-3 text-primary-dark" style={{ fontFamily: bodyFont }}>
                      {r.period_start} → {r.period_end}
                    </td>
                    <td className="p-3 text-right text-primary" style={{ fontFamily: bodyFont }}>
                      ₹ {r.budgeted.toLocaleString("en-IN")}
                    </td>
                    <td className="p-3 text-right text-primary" style={{ fontFamily: bodyFont }}>
                      ₹ {r.actual.toLocaleString("en-IN")}
                    </td>
                    <td
                      className={`p-3 text-right font-medium ${
                        r.variance > 0 ? "text-accent-dark" : "text-accent"
                      }`}
                      style={{ fontFamily: bodyFont }}
                    >
                      {r.variance > 0 ? "+" : ""}₹ {r.variance.toLocaleString("en-IN")}
                    </td>
                    <td
                      className={`p-3 text-right ${
                        r.variance > 0 ? "text-accent-dark" : "text-accent"
                      }`}
                      style={{ fontFamily: bodyFont }}
                    >
                      {r.variancePercent}%
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