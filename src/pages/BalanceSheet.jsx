// src/pages/BalanceSheet.jsx
import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { Printer } from "lucide-react";
import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";
import { supabase } from "../api/supabase";
import { useOrg } from "../context/OrganizationContext";
import { useTheme } from "../context/ThemeContext";

/* ─── Correct parent IDs from your actual chart of accounts ─── */
const GROUP_CONFIG = {
  "Current Assets":      { parent_id: 34, type: "asset" },
  "Fixed Assets":        { parent_id: 35, type: "asset" },
  "Current Liabilities": { parent_id: 36, type: "liability" },
  "Long‑Term Liabilities":{ parent_id: 37, type: "liability" },
  "Equity Capital":      { parent_id: 38, type: "equity" },
};

/* ─── PDF helpers (unchanged) ──────────────────────────────── */
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

export default function BalanceSheet() {
  const [asOfDate, setAsOfDate] = useState(new Date().toISOString().split("T")[0]);

  const { org, branch, selectedFinancialYear } = useOrg();
  const theme = useTheme();
  const branchId = branch?.id;
  const financialYearId = selectedFinancialYear?.id;

  const headingFont = theme?.font_heading || "Righteous";
  const bodyFont = theme?.font_body || "Montserrat";

  /* ─── Data fetching (same reliable approach as P&L) ───────── */
  const { data: accounts = [], isLoading } = useQuery({
    queryKey: ["balance-sheet", asOfDate, branchId, financialYearId, org?.id],
    queryFn: async () => {
      // 1. All accounts for org / branch / FY
      let acctQuery = supabase
        .from("chart_of_accounts")
        .select("id, account_code, account_name, account_type, parent_id")
        .eq("organization_id", org?.id)
        .order("account_code");

      if (branchId) acctQuery = acctQuery.eq("branch_id", branchId);
      if (financialYearId) acctQuery = acctQuery.eq("financial_year_id", financialYearId);

      const { data: accts, error: acctErr } = await acctQuery;
      if (acctErr) throw acctErr;
      if (!accts?.length) return [];

      // 2. Fetch ALL journal lines up to the as‑of date
      let lineQuery = supabase
        .from("journal_entry_lines")
        .select("account_id, debit, credit, journal_entries!inner(entry_date)")
        .lte("journal_entries.entry_date", asOfDate);

      if (branchId) {
        lineQuery = lineQuery.or(`branch_id.eq.${branchId},branch_id.is.null`);
      }

      const { data: lines, error: lineErr } = await lineQuery;
      if (lineErr) throw lineErr;

      // 3. Aggregate per account
      const totals = {};
      for (const l of lines || []) {
        const aid = l.account_id;
        if (!totals[aid]) totals[aid] = { debit: 0, credit: 0 };
        totals[aid].debit += Number(l.debit) || 0;
        totals[aid].credit += Number(l.credit) || 0;
      }

      // 4. Compute balance for each account
      const results = [];
      for (const a of accts) {
        const t = totals[a.id];
        if (!t) continue;
        let balance = 0;
        if (a.account_type === "asset") {
          balance = t.debit - t.credit;
        } else if (a.account_type === "liability" || a.account_type === "equity") {
          balance = t.credit - t.debit;
        }
        if (balance !== 0) {
          results.push({ ...a, balance });
        }
      }
      return results;
    },
    enabled: !!(asOfDate && org?.id),
  });

  /* ─── Grouping (now uses actual parent IDs) ─────────────── */
  const groups = useMemo(() => {
    const result = {};
    for (const [name] of Object.entries(GROUP_CONFIG)) {
      result[name] = { items: [], total: 0 };
    }
    const otherAssets = { items: [], total: 0 };
    const otherLiabilities = { items: [], total: 0 };
    const otherEquity = { items: [], total: 0 };

    accounts.forEach((a) => {
      const bal = parseFloat(a.balance) || 0;
      if (bal === 0) return;

      let placed = false;
      for (const [name, cfg] of Object.entries(GROUP_CONFIG)) {
        if (a.parent_id === cfg.parent_id && a.account_type === cfg.type) {
          result[name].items.push({ ...a, balance: bal });
          result[name].total += bal;
          placed = true;
          break;
        }
      }
      if (!placed) {
        if (a.account_type === "asset") {
          otherAssets.items.push({ ...a, balance: bal });
          otherAssets.total += bal;
        } else if (a.account_type === "liability") {
          otherLiabilities.items.push({ ...a, balance: bal });
          otherLiabilities.total += bal;
        } else if (a.account_type === "equity") {
          otherEquity.items.push({ ...a, balance: bal });
          otherEquity.total += bal;
        }
      }
    });

    if (otherAssets.items.length > 0) result["Other Assets"] = otherAssets;
    if (otherLiabilities.items.length > 0) result["Other Liabilities"] = otherLiabilities;
    if (otherEquity.items.length > 0) result["Other Equity"] = otherEquity;

    return result;
  }, [accounts]);

  const totalAssets = Object.entries(groups)
    .filter(([name]) => name.toLowerCase().includes("asset"))
    .reduce((s, [_, g]) => s + g.total, 0);

  const totalLiabilities = Object.entries(groups)
    .filter(([name]) => name.toLowerCase().includes("liabilit"))
    .reduce((s, [_, g]) => s + g.total, 0);

  const totalEquity = Object.entries(groups)
    .filter(([name]) => name.toLowerCase().includes("equity"))
    .reduce((s, [_, g]) => s + g.total, 0);

  /* ─── PDF Export (unchanged, uses black theme) ───────────── */
  const handlePrintPDF = async () => {
    if (Object.keys(groups).length === 0) return;

    const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
    const pageWidth = doc.internal.pageSize.getWidth();
    const pageHeight = doc.internal.pageSize.getHeight();
    const margin = 12;
    let y = margin;

    // Logo
    let logoBase64 = null;
    if (org?.logo_dark_url) {
      logoBase64 = await loadImageAsBase64(org.logo_dark_url);
    }

    // Header
    const logoWidth = 30, logoHeight = 12;
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
    doc.text("Balance Sheet", pageWidth / 2, y, { align: "center" });
    y += 8;
    doc.setFontSize(10);
    doc.setFont("helvetica", "normal");
    doc.text(`As of: ${asOfDate}`, pageWidth / 2, y, { align: "center" });
    y += 10;

    // Helper to print a section
    const printSection = (title, groupsArray, total, totalLabel) => {
      doc.setFontSize(12);
      doc.setFont("helvetica", "bold");
      doc.text(title, margin, y);
      y += 8;

      for (const [name, group] of groupsArray) {
        if (group.items.length === 0) continue;
        doc.setFontSize(10);
        doc.setFont("helvetica", "bold");
        doc.text(name, margin, y);
        y += 5;

        const rows = group.items.map((item) => [item.account_name, Math.round(item.balance * 100) / 100]);
        autoTable(doc, {
          startY: y,
          head: [["Account", "Amount"]],
          body: rows,
          theme: "plain",
          styles: { fontSize: 9, textColor: [0,0,0], fillColor: [255,255,255], lineColor: [0,0,0], lineWidth: 0.2 },
          headStyles: { fillColor: [255,255,255], textColor: [0,0,0], fontStyle: "bold", lineWidth: 0.2, lineColor: [0,0,0] },
          columnStyles: { 0: { cellWidth: 120 }, 1: { cellWidth: 50, halign: "right" } },
          margin: { left: margin, right: margin },
          willDrawCell: (data) => {
            if (data.column.index === 1 && typeof data.cell.raw === "number") data.cell.text = [];
          },
          didDrawCell: (data) => {
            if (data.column.index === 1 && typeof data.cell.raw === "number") {
              drawCurrency(doc, data.cell.raw, data.cell.x + data.cell.width - 2, data.cell.y + data.cell.height / 2 + 1.5, 9, "right", "#000");
            }
          },
        });
        y = doc.lastAutoTable.finalY + 4;

        doc.setFont("helvetica", "bold");
        doc.setFontSize(9);
        drawCurrency(doc, Math.round(group.total * 100) / 100, margin + 170, y, 9, "right", "#000");
        doc.text(`Total ${name}`, margin, y);
        y += 8;
      }

      doc.setFontSize(11);
      doc.setFont("helvetica", "bold");
      doc.text(totalLabel, margin, y);
      drawCurrency(doc, Math.round(total * 100) / 100, margin + 170, y, 11, "right", "#000");
      y += 12;
    };

    // Assets
    const assetGroups = Object.entries(groups).filter(([name]) => name.toLowerCase().includes("asset"));
    printSection("Assets", assetGroups, totalAssets, "Total Assets");

    // Liabilities
    const liabilityGroups = Object.entries(groups).filter(([name]) => name.toLowerCase().includes("liabilit"));
    printSection("Liabilities", liabilityGroups, totalLiabilities, "Total Liabilities");

    // Equity
    const equityGroups = Object.entries(groups).filter(([name]) => name.toLowerCase().includes("equity"));
    printSection("Equity", equityGroups, totalEquity, "Total Equity");

    // ─── Balance Check ───
    const totalLiabEquity = totalLiabilities + totalEquity;
    const balanced = Math.abs(totalAssets - totalLiabEquity) < 0.01;

    doc.setFontSize(12);
    doc.setFont("helvetica", "bold");
    doc.setTextColor("#000000");
    if (balanced) {
      doc.text("Balanced", margin, y);
    } else {
      doc.text("Difference:", margin, y);
      drawCurrency(doc, totalAssets - totalLiabEquity, margin + 170, y, 12, "right", "#000");
    }
    y += 8;

    // Footer
    const footerY = pageHeight - margin - 5;
    doc.setFontSize(7);
    doc.setTextColor("#000000");
    doc.setFont("helvetica", "italic");
    doc.text(`Generated on ${new Date().toLocaleString()}`, margin, footerY);
    doc.text(`© ${org?.company_name || "Academy"}`, pageWidth / 2, footerY, { align: "center" });

    doc.save(`Balance_Sheet_${asOfDate}.pdf`);
  };

  const formatCurrency = (val) => `₹ ${Math.abs(val).toLocaleString("en-IN")}`;

  return (
    <div className="space-y-6 px-4 sm:px-6 lg:px-0">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold text-primary" style={{ fontFamily: headingFont }}>
            Balance Sheet
          </h1>
          <p className="text-sm text-primary-dark mt-1" style={{ fontFamily: bodyFont }}>
            Financial position snapshot
          </p>
        </div>
        <button
          onClick={handlePrintPDF}
          className="inline-flex items-center gap-2 px-4 py-2.5 bg-primary hover:bg-accent text-white rounded-lg transition-colors text-sm font-medium"
          style={{ fontFamily: bodyFont }}
        >
          <Printer size={16} /> Print PDF
        </button>
      </div>

      <div className="flex items-center gap-3">
        <label className="text-sm font-medium text-primary-dark" style={{ fontFamily: bodyFont }}>
          As of Date:
        </label>
        <input
          type="date"
          value={asOfDate}
          onChange={(e) => setAsOfDate(e.target.value)}
          className="border border-primary-bg bg-white text-primary rounded-lg p-2.5 text-sm"
        />
      </div>

      {isLoading ? (
        <div className="text-center py-12 text-primary-dark/60" style={{ fontFamily: bodyFont }}>
          Loading balance sheet…
        </div>
      ) : (
        <div className="bg-white rounded-xl shadow-sm border border-primary-bg p-6">
          {/* Assets */}
          <h2 className="text-xl font-semibold mb-4 border-b border-primary-bg pb-2 text-primary" style={{ fontFamily: headingFont }}>
            Assets
          </h2>
          {Object.entries(groups)
            .filter(([name]) => name.toLowerCase().includes("asset"))
            .map(([name, group]) => (
              <div key={name} className="mb-4">
                <h3 className="font-bold text-sm mb-2 text-primary" style={{ fontFamily: bodyFont }}>{name}</h3>
                <table className="w-full text-sm border border-primary-bg">
                  <thead>
                    <tr className="bg-primary-bg">
                      <th className="p-2 text-left border border-primary-bg text-primary-dark">Account</th>
                      <th className="p-2 text-right border border-primary-bg w-32 text-primary-dark">Amount</th>
                    </tr>
                  </thead>
                  <tbody>
                    {group.items.map(item => (
                      <tr key={item.account_code}>
                        <td className="p-2 border border-primary-bg text-primary-dark">{item.account_name}</td>
                        <td className="p-2 border border-primary-bg text-right text-primary">{formatCurrency(item.balance)}</td>
                      </tr>
                    ))}
                    <tr className="font-bold bg-primary-bg">
                      <td className="p-2 border border-primary-bg text-primary-dark">Total {name}</td>
                      <td className="p-2 border border-primary-bg text-right text-primary">{formatCurrency(group.total)}</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            ))}
          <div className="text-lg font-bold border-t-2 border-primary pt-3 mt-4 mb-8 text-primary">
            Total Assets: {formatCurrency(totalAssets)}
          </div>

          {/* Liabilities */}
          <h2 className="text-xl font-semibold mb-4 border-b border-primary-bg pb-2 text-primary" style={{ fontFamily: headingFont }}>
            Liabilities
          </h2>
          {Object.entries(groups)
            .filter(([name]) => name.toLowerCase().includes("liabilit"))
            .map(([name, group]) => (
              <div key={name} className="mb-4">
                <h3 className="font-bold text-sm mb-2 text-primary" style={{ fontFamily: bodyFont }}>{name}</h3>
                <table className="w-full text-sm border border-primary-bg">
                  <thead>
                    <tr className="bg-primary-bg">
                      <th className="p-2 text-left border border-primary-bg text-primary-dark">Account</th>
                      <th className="p-2 text-right border border-primary-bg w-32 text-primary-dark">Amount</th>
                    </tr>
                  </thead>
                  <tbody>
                    {group.items.map(item => (
                      <tr key={item.account_code}>
                        <td className="p-2 border border-primary-bg text-primary-dark">{item.account_name}</td>
                        <td className="p-2 border border-primary-bg text-right text-primary">{formatCurrency(item.balance)}</td>
                      </tr>
                    ))}
                    <tr className="font-bold bg-primary-bg">
                      <td className="p-2 border border-primary-bg text-primary-dark">Total {name}</td>
                      <td className="p-2 border border-primary-bg text-right text-primary">{formatCurrency(group.total)}</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            ))}
          <div className="text-lg font-bold border-t-2 border-primary pt-3 mt-4 mb-8 text-primary">
            Total Liabilities: {formatCurrency(totalLiabilities)}
          </div>

          {/* Equity */}
          <h2 className="text-xl font-semibold mb-4 border-b border-primary-bg pb-2 text-primary" style={{ fontFamily: headingFont }}>
            Equity
          </h2>
          {Object.entries(groups)
            .filter(([name]) => name.toLowerCase().includes("equity"))
            .map(([name, group]) => (
              <div key={name} className="mb-4">
                <h3 className="font-bold text-sm mb-2 text-primary" style={{ fontFamily: bodyFont }}>{name}</h3>
                <table className="w-full text-sm border border-primary-bg">
                  <thead>
                    <tr className="bg-primary-bg">
                      <th className="p-2 text-left border border-primary-bg text-primary-dark">Account</th>
                      <th className="p-2 text-right border border-primary-bg w-32 text-primary-dark">Amount</th>
                    </tr>
                  </thead>
                  <tbody>
                    {group.items.map(item => (
                      <tr key={item.account_code}>
                        <td className="p-2 border border-primary-bg text-primary-dark">{item.account_name}</td>
                        <td className="p-2 border border-primary-bg text-right text-primary">{formatCurrency(item.balance)}</td>
                      </tr>
                    ))}
                    <tr className="font-bold bg-primary-bg">
                      <td className="p-2 border border-primary-bg text-primary-dark">Total {name}</td>
                      <td className="p-2 border border-primary-bg text-right text-primary">{formatCurrency(group.total)}</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            ))}
          <div className="text-lg font-bold border-t-2 border-primary pt-3 mt-4 mb-8 text-primary">
            Total Equity: {formatCurrency(totalEquity)}
          </div>

          {/* Balance Check */}
          <div className="mt-6 p-4 bg-primary-bg rounded-lg border-2 border-primary">
            <div className="grid grid-cols-2 gap-4 text-center">
              <div>
                <p className="text-sm text-primary-dark" style={{ fontFamily: bodyFont }}>
                  Total Liabilities + Equity
                </p>
                <p className="text-2xl font-bold text-primary" style={{ fontFamily: headingFont }}>
                  {formatCurrency(totalLiabilities + totalEquity)}
                </p>
              </div>
              <div>
                <p className="text-sm text-primary-dark" style={{ fontFamily: bodyFont }}>
                  Total Assets
                </p>
                <p className="text-2xl font-bold text-primary" style={{ fontFamily: headingFont }}>
                  {formatCurrency(totalAssets)}
                </p>
              </div>
            </div>
            <div className="text-center mt-3">
              {Math.abs(totalAssets - (totalLiabilities + totalEquity)) < 0.01 ? (
                <span className="inline-block px-4 py-1 bg-primary-bg text-primary-dark rounded-full text-sm font-medium">
                  Balanced
                </span>
              ) : (
                <span className="inline-block px-4 py-1 bg-accent-bg text-accent-dark rounded-full text-sm font-medium">
                  Difference: {formatCurrency(totalAssets - (totalLiabilities + totalEquity))}
                </span>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}