// src/utils/generateReportPdf.js
import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";
import { supabase } from "../api/supabase";

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

async function getOrg() {
  const { data: org, error } = await supabase
    .from("organization")
    .select("company_name, letterhead_url")
    .eq("id", 1)
    .single();
  if (error) return null;
  return org;
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
  const orgData = org || await getOrg();
  const letterheadUrl = orgData?.letterhead_url || null;
  const companyName = orgData?.company_name || 'ShreeVidhya Academy';

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

  // Letterhead background on first page
  const addLetterhead = () => {
    if (letterheadBase64) {
      doc.addImage(letterheadBase64, "PNG", 0, 0, pageWidth, pageHeight);
    }
  };
  addLetterhead();

  let y = topMargin;

  // ── Title: full‑width white bar + black text ──
  const title = reportConfig.title;
  doc.setFillColor(255, 255, 255);
  doc.rect(sideMargin, y - 10, pageWidth - 2 * sideMargin, 20, 'F');
  doc.setFont("times", "bold");
  doc.setFontSize(22);
  doc.setTextColor("#000000");      // black text
  doc.text(title, pageWidth / 2, y, { align: "center" });
  y += 14;

  // ── Period subtitle: full‑width white bar ──
  if (filters.start_date || filters.end_date) {
    const period = `${filters.start_date || '?'} – ${filters.end_date || '?'}`;
    doc.setFillColor(255, 255, 255);
    doc.rect(sideMargin, y - 6, pageWidth - 2 * sideMargin, 14, 'F');
    doc.setFont("helvetica", "normal");
    doc.setFontSize(10);
    doc.setTextColor("#000000");
    doc.text(period, pageWidth / 2, y, { align: "center" });
    y += 12;
  }
  y += 4;

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

  // Reset text colour to black before table
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
      if (letterheadBase64) {
        doc.addImage(letterheadBase64, "PNG", 0, 0, pageWidth, pageHeight);
      }
    },
    didDrawPage: (data) => {
      const pgNum = doc.internal.getCurrentPageInfo().pageNumber;
      doc.setFontSize(7);
      doc.setTextColor("#aaa");
      doc.text(`Page ${pgNum}`, pageWidth - sideMargin, pageHeight - 10, { align: "right" });
    },
  });

  // Page numbers on all pages
  const totalPages = doc.getNumberOfPages();
  for (let i = 1; i <= totalPages; i++) {
    doc.setPage(i);
    doc.setFontSize(7);
    doc.setTextColor("#aaa");
    doc.text(`Page ${i} of ${totalPages}`, pageWidth - sideMargin, pageHeight - 10, { align: "right" });
  }

  return doc;
}