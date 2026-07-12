// src/utils/generateReportPdf.js
import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";

async function loadImageAsBase64(url) {
  const response = await fetch(url);
  const blob = await response.blob();
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

// ─── Content‑aware column widths ──────────────────────────────
function computeColumnWidths(doc, headers, rows, pageWidth, sideMargin) {
  const availableWidth = pageWidth - 2 * sideMargin;
  const maxWidths = headers.map((header, colIdx) => {
    let max = doc.getTextWidth(header) + 6;
    rows.forEach(row => {
      const text = row[colIdx] || '';
      max = Math.max(max, doc.getTextWidth(text) + 6);
    });
    return max;
  });

  const total = maxWidths.reduce((a, b) => a + b, 0);
  if (total <= availableWidth) return maxWidths;

  const minWidth = 15;
  let scaled = maxWidths.map(w => Math.max(w * (availableWidth / total), minWidth));
  const totalScaled = scaled.reduce((a, b) => a + b, 0);
  const diff = availableWidth - totalScaled;
  if (Math.abs(diff) > 0.1) {
    scaled = scaled.map(w => w + (w / totalScaled) * diff);
  }
  return scaled;
}

// ─── Main PDF generator ───────────────────────────────────────
export async function generateReportPdf(reportConfig, filters = {}, org = null) {
  const letterheadEnabled = reportConfig.useLetterhead !== false;
  const letterheadUrl = org?.letterhead_url || null;
  const companyName = org?.company_name || 'ShreeVidhya Academy';

  let letterheadBase64 = null;
  if (letterheadEnabled && letterheadUrl) {
    try {
      letterheadBase64 = await loadImageAsBase64(letterheadUrl);
    } catch (e) {
      console.warn("Letterhead load failed", e);
    }
  }

  // Fetch data
  const queryPromise = reportConfig.queryBuilder(filters);
  const result = await queryPromise;
  if (result?.error) throw result.error;
  let rows = result?.data !== undefined ? result.data : result;
  if (reportConfig.transform) rows = reportConfig.transform(rows);
  if (!Array.isArray(rows)) rows = [rows];

  // ─── PDF Setup (A4 portrait) ─────────────────────────────────
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();

  const topMargin = 55;
  const bottomMargin = 20;
  const sideMargin = 16;

  // Helper to draw letterhead on any page
  const drawLetterhead = () => {
    if (letterheadBase64) {
      doc.addImage(letterheadBase64, "PNG", 0, 0, pageWidth, pageHeight);
    }
  };

  // Draw letterhead for the first page
  drawLetterhead();

  let y = topMargin;

  // ── Title bar (blue with white text) ──
  const titleBarHeight = 16;
  doc.setFillColor("#0D47A1");
  doc.rect(sideMargin, y - 6, pageWidth - 2 * sideMargin, titleBarHeight, 'F');
  doc.setFont("helvetica", "bold");
  doc.setFontSize(18);
  doc.setTextColor("#FFFFFF");
  doc.text(reportConfig.title, pageWidth / 2, y + 3, { align: "center" });
  y += titleBarHeight + 4;

  // ── Subtitle bar (light grey with dark text) ──
  if (filters.start_date || filters.end_date) {
    const period = `${filters.start_date || '?'} – ${filters.end_date || '?'}`;
    const subtitleBarHeight = 9;
    doc.setFillColor("#F0F0F0");
    doc.rect(sideMargin, y - 3, pageWidth - 2 * sideMargin, subtitleBarHeight, 'F');
    doc.setFont("helvetica", "normal");
    doc.setFontSize(10);
    doc.setTextColor("#333333");
    doc.text(period, pageWidth / 2, y + 1.5, { align: "center" });
    y += subtitleBarHeight + 6;
  }
  y += 4;

  // ── Empty state ─────────────────────────────────────────────
  if (rows.length === 0) {
    doc.setFontSize(12);
    doc.setTextColor("#333");
    doc.text("No data available.", sideMargin, y);
    return doc;
  }

  // Build table
  const columns = reportConfig.columns || [];
  const headers = columns.map(col => col.header);
  const body = rows.map(row =>
    columns.map(col => {
      let val = row[col.accessor];
      return val === undefined || val === null ? '—' : String(val);
    })
  );

  const columnWidths = computeColumnWidths(doc, headers, body, pageWidth, sideMargin);
  const columnStyles = {};
  columnWidths.forEach((w, idx) => {
    columnStyles[idx] = { cellWidth: w };
  });

  // Reset to black for the table
  doc.setTextColor("#000000");

  autoTable(doc, {
    startY: y,
    head: [headers],
    body,
    theme: "grid",
    styles: {
      fontSize: 10,
      cellPadding: 3,
      textColor: "#000000",
      fillColor: "#FFFFFF",
      lineColor: "#cccccc",
      lineWidth: 0.5,
    },
    headStyles: {
      fillColor: "#0D47A1",
      textColor: "#FFFFFF",
      fontStyle: "bold",
      fontSize: 11,
      cellPadding: 3,
    },
    alternateRowStyles: {
      fillColor: "#F5F8FF",
      textColor: "#000000",
    },
    margin: {
      top: topMargin,
      left: sideMargin,
      bottom: bottomMargin,
      right: sideMargin,
    },
    columnStyles,
    didParseCell: (data) => {
      if (data.row.section === 'body') {
        data.cell.styles.textColor = "#000000";
      } else if (data.row.section === 'head') {
        data.cell.styles.textColor = "#FFFFFF";
      }
    },
    willDrawPage: (data) => {
      // Redraw letterhead for every subsequent page (page 2 and beyond)
      if (data.pageNumber > 1) {
        drawLetterhead();
      }
    },
    didDrawPage: (data) => {
      const pgNum = doc.internal.getCurrentPageInfo().pageNumber;
      doc.setFontSize(7);
      doc.setTextColor("#aaa");
      doc.text(`Page ${pgNum}`, pageWidth - sideMargin, pageHeight - 10, { align: "right" });
    },
  });

  // Final page numbers
  const totalPages = doc.getNumberOfPages();
  for (let i = 1; i <= totalPages; i++) {
    doc.setPage(i);
    doc.setFontSize(7);
    doc.setTextColor("#aaa");
    doc.text(`Page ${i} of ${totalPages}`, pageWidth - sideMargin, pageHeight - 10, { align: "right" });
  }

  return doc;
}