// src/pages/TrialBalance.jsx
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Printer } from "lucide-react";
import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";
import { supabase } from "../api/supabase";
import { useOrg } from "../context/OrganizationContext";
import { useTheme } from "../context/ThemeContext";

// ─── Helpers ─────────────────────────────────────────────
async function loadImageAsBase64(url) {
  if (!url) return null;
  try {
    const response = await fetch(url);
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const blob = await response.blob();
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve(reader.result);
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
  } catch {
    return null;
  }
}

function createRupeeSymbolImage() {
  const canvas = document.createElement("canvas");
  canvas.width = 30;
  canvas.height = 30;
  const ctx = canvas.getContext("2d");
  ctx.font = "bold 24px sans-serif";
  ctx.fillStyle = "#000";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText("₹", 15, 15);
  return canvas.toDataURL("image/png");
}

let rupeeImage = null;
function getRupeeImage() {
  if (!rupeeImage) rupeeImage = createRupeeSymbolImage();
  return rupeeImage;
}

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

export default function TrialBalance() {
  const [asOfDate, setAsOfDate] = useState(new Date().toISOString().split("T")[0]);

  const { org, branch, selectedFinancialYear } = useOrg();
  const { theme } = useTheme();   // dynamic theme (used if needed)
  const branchId = branch?.id;
  const financialYearId = selectedFinancialYear?.id;

  const { data, isLoading, isError, error } = useQuery({
    queryKey: ["trial-balance", asOfDate, branchId, financialYearId],
    queryFn: async () => {
      const { data } = await supabase.rpc("get_trial_balance", {
        as_of_date: asOfDate,
        p_branch_id: branchId,
        p_financial_year_id: financialYearId,
      });
      return data;
    },
    enabled: !!asOfDate && !!branchId && !!financialYearId,
  });

  const rows = Array.isArray(data) ? data : [];

  // ─── PDF Export (unchanged logic, centered table) ────
  const handlePrintPDF = async () => {
    if (rows.length === 0) return;

    const doc = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4" });
    const pageWidth = doc.internal.pageSize.getWidth();
    const pageHeight = doc.internal.pageSize.getHeight();
    const margin = 10;
    const availableWidth = pageWidth - 2 * margin;
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
    if (org?.gstin) {
      doc.text(`GSTIN: ${org.gstin}`, textX, detailY);
      detailY += 4;
    }
    if (org?.phone) {
      doc.text(`Phone: ${org.phone}`, textX, detailY);
      detailY += 4;
    }
    if (org?.email) {
      doc.text(`Email: ${org.email}`, textX, detailY);
      detailY += 4;
    }

    const headerHeight = Math.max(logoHeight + 4, detailY - textY + 4);
    y += headerHeight + 2;
    doc.setDrawColor("#000000");
    doc.line(margin, y, pageWidth - margin, y);
    y += 6;

    doc.setFontSize(16);
    doc.setFont("helvetica", "bold");
    doc.setTextColor("#000000");
    doc.text("Trial Balance", pageWidth / 2, y, { align: "center" });
    y += 10;

    doc.setFontSize(10);
    doc.setFont("helvetica", "normal");
    doc.text(`As of: ${asOfDate}`, pageWidth / 2, y, { align: "center" });
    y += 10;

    const tableRows = rows.map((row) => [
      `${row.account_code} - ${row.account_name}`,
      row.total_debit || 0,
      row.total_credit || 0,
    ]);

    const totalDebit = rows.reduce((sum, r) => sum + (Number(r.total_debit) || 0), 0);
    const totalCredit = rows.reduce((sum, r) => sum + (Number(r.total_credit) || 0), 0);
    const difference = totalDebit - totalCredit;
    tableRows.push(["TOTAL", totalDebit, totalCredit]);
    tableRows.push(["Difference (Dr - Cr)", difference, ""]);

    const col0Width = availableWidth - 110;
    const col1Width = 55;
    const col2Width = 55;

    autoTable(doc, {
      startY: y,
      head: [["Account", "Debit", "Credit"]],
      body: tableRows,
      theme: "plain",
      styles: {
        fontSize: 9,
        cellPadding: 2,
        textColor: [0, 0, 0],
        fillColor: [255, 255, 255],
        lineColor: [0, 0, 0],
        lineWidth: 0.2,
      },
      headStyles: {
        fillColor: [255, 255, 255],
        textColor: [0, 0, 0],
        fontStyle: "bold",
        lineWidth: 0.2,
        lineColor: [0, 0, 0],
      },
      columnStyles: {
        0: { cellWidth: col0Width, halign: "left" },
        1: { cellWidth: col1Width, halign: "right" },
        2: { cellWidth: col2Width, halign: "right" },
      },
      margin: { left: margin, right: margin },
      willDrawCell: (data) => {
        if ([1, 2].includes(data.column.index) && typeof data.cell.raw === "number") {
          data.cell.text = [];
        }
      },
      didDrawCell: (data) => {
        if ([1, 2].includes(data.column.index) && typeof data.cell.raw === "number") {
          const x = data.cell.x + data.cell.width - 2;
          const yPos = data.cell.y + data.cell.height / 2 + 1.5;
          drawCurrency(doc, data.cell.raw, x, yPos, 9, "right", "#000");
        }
        if (data.row.index >= tableRows.length - 2) {
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

    doc.save(`Trial_Balance_${asOfDate}.pdf`);
  };

  return (
    <div className="space-y-6 px-4 sm:px-6 lg:px-0">
      <h1 className="text-3xl font-heading text-primary-dark mb-6">Trial Balance</h1>
      <div className="flex flex-wrap items-end gap-4 mb-4">
        <div>
          <label className="text-sm text-gray-700 dark:text-gray-300 mr-2">As of Date:</label>
          <input
            type="date"
            value={asOfDate}
            onChange={(e) => setAsOfDate(e.target.value)}
            className="border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 rounded p-2 text-sm focus:ring-2 focus:ring-primary outline-none"
          />
        </div>
        {rows.length > 0 && (
          <button
            onClick={handlePrintPDF}
            className="bg-primary hover:bg-primary-light text-white px-4 py-2 rounded-lg text-sm flex items-center gap-2 transition-colors"
          >
            <Printer size={16} /> Print PDF
          </button>
        )}
      </div>

      {isError && (
        <div className="bg-accent-bg text-accent-dark rounded-lg p-4 mb-4">
          Failed to load trial balance: {error?.message || "Unknown error"}
        </div>
      )}

      <div className="bg-white dark:bg-accent rounded-xl shadow-sm overflow-hidden border border-gray-200 dark:border-gray-700">
        <table className="w-full">
          <thead className="bg-gray-50 dark:bg-gray-700">
            <tr>
              <th className="p-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                Account
              </th>
              <th className="p-3 text-right text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                Debit
              </th>
              <th className="p-3 text-right text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                Credit
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
            {isLoading ? (
              <tr>
                <td colSpan={3} className="p-6 text-center text-gray-500 dark:text-gray-400">
                  Loading…
                </td>
              </tr>
            ) : rows.length === 0 ? (
              <tr>
                <td colSpan={3} className="p-6 text-center text-gray-500 dark:text-gray-400">
                  No data found for the selected date.
                </td>
              </tr>
            ) : (
              rows.map((row) => (
                <tr key={row.account_code} className="hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors">
                  <td className="p-3 text-sm text-gray-700 dark:text-gray-200">
                    {row.account_code} - {row.account_name}
                  </td>
                  <td className="p-3 text-sm text-right text-gray-800 dark:text-gray-100">
                    ₹{Number(row.total_debit || 0).toLocaleString()}
                  </td>
                  <td className="p-3 text-sm text-right text-gray-800 dark:text-gray-100">
                    ₹{Number(row.total_credit || 0).toLocaleString()}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}