// src/pages/Ledger.jsx
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Printer } from "lucide-react";
import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";
import { getChartOfAccounts, getAccountLedger } from "../services/accountingService";
import { useOrg } from "../context/OrganizationContext";
import { useTheme } from "../context/ThemeContext";

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
  const canvas = document.createElement('canvas');
  canvas.width = 30;
  canvas.height = 30;
  const ctx = canvas.getContext('2d');
  ctx.font = 'bold 24px sans-serif';
  ctx.fillStyle = '#000';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('₹', 15, 15);
  return canvas.toDataURL('image/png');
}

let rupeeImage = null;
function getRupeeImage() {
  if (!rupeeImage) rupeeImage = createRupeeSymbolImage();
  return rupeeImage;
}

function drawCurrency(doc, amount, x, y, fontSize = 10, align = 'left', color = '#000') {
  const img = getRupeeImage();
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(fontSize);
  doc.setTextColor(color);
  const amountText = amount.toLocaleString('en-IN');
  if (align === 'left') {
    doc.addImage(img, 'PNG', x, y - fontSize * 0.35, 4, 4);
    doc.text(amountText, x + 5, y);
  } else {
    const textWidth = doc.getTextWidth(amountText);
    doc.addImage(img, 'PNG', x - textWidth - 5, y - fontSize * 0.35, 4, 4);
    doc.text(amountText, x - textWidth, y);
  }
}

export default function Ledger() {
  const { org, branch, selectedFinancialYear } = useOrg();
  const theme = useTheme(); // ✅ use theme for dynamic fonts and styles
  const branchId = branch?.id;
  const financialYearId = selectedFinancialYear?.id;
  const orgId = org?.id;

  const headingFont = theme?.font_heading || "Righteous";
  const bodyFont = theme?.font_body || "Montserrat";

  // Chart of accounts
  const { data: accounts = [] } = useQuery({
    queryKey: ["chart-of-accounts", orgId, branchId, financialYearId],
    queryFn: () => getChartOfAccounts(orgId, branchId, financialYearId),
    enabled: !!orgId,
  });

  const [selectedAccount, setSelectedAccount] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");

  // Ledger
  const { data: ledger = [], isLoading } = useQuery({
    queryKey: ["ledger", selectedAccount, startDate, endDate, orgId, branchId],
    queryFn: () => getAccountLedger(selectedAccount, startDate, endDate, orgId, branchId),
    enabled: !!selectedAccount && !!orgId,
  });
  const selectedAccountName =
    accounts.find((a) => a.id == selectedAccount)?.account_name || "Ledger";

  // PDF export (unchanged)
  const handlePrintPDF = async () => {
    if (!ledger.length) return;

    const doc = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4" });
    const pageWidth = doc.internal.pageSize.getWidth();
    const pageHeight = doc.internal.pageSize.getHeight();
    const margin = 10;
    let y = margin;

    let logoBase64 = null;
    if (org?.logo_dark_url) {
      logoBase64 = await loadImageAsBase64(org.logo_dark_url);
    }

    const logoWidth = 35;
    const logoHeight = 14;
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
    doc.text(`${selectedAccountName} Ledger`, pageWidth / 2, y, { align: "center" });
    y += 10;

    if (startDate || endDate) {
      doc.setFontSize(10);
      doc.setFont("helvetica", "normal");
      doc.setTextColor("#000000");
      const rangeText = [startDate && `From: ${startDate}`, endDate && `To: ${endDate}`]
        .filter(Boolean)
        .join("   ");
      doc.text(rangeText, pageWidth / 2, y, { align: "center" });
      y += 8;
    }

    let runningBalance = 0;
    const tableRows = ledger.map((line) => {
      const debit = Number(line.debit) || 0;
      const credit = Number(line.credit) || 0;
      runningBalance += debit - credit;
      return [
        line.journal_entries?.entry_date || "",
        line.journal_entries?.reference || "",
        line.description || "",
        debit,
        credit,
        runningBalance,
      ];
    });

    const totalDebit = ledger.reduce((sum, l) => sum + (Number(l.debit) || 0), 0);
    const totalCredit = ledger.reduce((sum, l) => sum + (Number(l.credit) || 0), 0);
    tableRows.push(["", "", "TOTAL", totalDebit, totalCredit, ""]);

    autoTable(doc, {
      startY: y,
      head: [["Date", "Reference", "Description", "Debit", "Credit", "Balance"]],
      body: tableRows,
      theme: "plain",
      styles: {
        fontSize: 8,
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
        0: { cellWidth: 30 },
        1: { cellWidth: 30 },
        2: { cellWidth: 80, halign: "left" },
        3: { cellWidth: 35, halign: "right" },
        4: { cellWidth: 35, halign: "right" },
        5: { cellWidth: 35, halign: "right" },
      },
      margin: { left: margin, right: margin },
      willDrawCell: (data) => {
        if ([3, 4, 5].includes(data.column.index) && typeof data.cell.raw === "number") {
          data.cell.text = [];
        }
      },
      didDrawCell: (data) => {
        if ([3, 4, 5].includes(data.column.index) && typeof data.cell.raw === "number") {
          const x = data.cell.x + 2;
          const yPos = data.cell.y + data.cell.height / 2 + 1.5;
          drawCurrency(doc, data.cell.raw, x, yPos, 8, "left", "#000");
        }
        if (data.row.index === tableRows.length - 1) {
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

    doc.save(`${selectedAccountName}_Ledger.pdf`);
  };

  return (
    <>
      <h1
        className="text-3xl font-bold text-primary mb-6"
        style={{ fontFamily: headingFont }}
      >
        Account Ledger
      </h1>

      <div className="flex flex-wrap items-end gap-4 mb-6">
        <select
          value={selectedAccount}
          onChange={(e) => setSelectedAccount(e.target.value)}
          className="border border-primary-bg bg-white text-primary-dark rounded p-2.5 text-sm w-64"
          style={{ fontFamily: bodyFont }}
        >
          <option value="">Select Account</option>
          {accounts.map((a) => (
            <option key={a.id} value={a.id}>
              {a.account_code} - {a.account_name}
            </option>
          ))}
        </select>
        <input
          type="date"
          value={startDate}
          onChange={(e) => setStartDate(e.target.value)}
          className="border border-primary-bg bg-white text-primary-dark rounded p-2 text-sm"
        />
        <input
          type="date"
          value={endDate}
          onChange={(e) => setEndDate(e.target.value)}
          className="border border-primary-bg bg-white text-primary-dark rounded p-2 text-sm"
        />
        {selectedAccount && (
          <button
            onClick={handlePrintPDF}
            className="bg-primary hover:bg-accent text-white px-4 py-2 rounded-lg text-sm flex items-center gap-2 transition"
            style={{ fontFamily: bodyFont }}
          >
            <Printer size={16} /> Print Ledger
          </button>
        )}
      </div>

      {selectedAccount && (
        <div className="bg-white rounded-xl shadow-sm overflow-hidden border border-primary-bg">
          <div id="ledger-table">
            <table className="w-full">
              <thead className="bg-primary-bg">
                <tr>
                  <th className="p-3 text-left text-sm font-medium text-primary-dark uppercase" style={{ fontFamily: bodyFont }}>Date</th>
                  <th className="p-3 text-left text-sm font-medium text-primary-dark uppercase" style={{ fontFamily: bodyFont }}>Reference</th>
                  <th className="p-3 text-left text-sm font-medium text-primary-dark uppercase" style={{ fontFamily: bodyFont }}>Description</th>
                  <th className="p-3 text-right text-sm font-medium text-primary-dark uppercase" style={{ fontFamily: bodyFont }}>Debit</th>
                  <th className="p-3 text-right text-sm font-medium text-primary-dark uppercase" style={{ fontFamily: bodyFont }}>Credit</th>
                </tr>
              </thead>
              <tbody>
                {isLoading ? (
                  <tr>
                    <td colSpan={5} className="p-6 text-center text-primary-dark/60" style={{ fontFamily: bodyFont }}>Loading…</td>
                  </tr>
                ) : ledger.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="p-6 text-center text-primary-dark/60" style={{ fontFamily: bodyFont }}>
                      No transactions found for this period.
                    </td>
                  </tr>
                ) : (
                  ledger.map((line, i) => (
                    <tr key={i} className="border-t border-primary-bg hover:bg-primary-bg transition-colors">
                      <td className="p-3 text-sm text-primary-dark" style={{ fontFamily: bodyFont }}>{line.journal_entries?.entry_date}</td>
                      <td className="text-sm text-primary-dark" style={{ fontFamily: bodyFont }}>{line.journal_entries?.reference}</td>
                      <td className="text-sm text-primary-dark" style={{ fontFamily: bodyFont }}>{line.description}</td>
                      <td className="text-sm text-right text-primary-dark" style={{ fontFamily: bodyFont }}>
                        ₹{Number(line.debit).toLocaleString()}
                      </td>
                      <td className="text-sm text-right text-primary-dark" style={{ fontFamily: bodyFont }}>
                        ₹{Number(line.credit).toLocaleString()}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </>
  );
}