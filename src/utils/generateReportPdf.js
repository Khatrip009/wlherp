// src/utils/generateReportPdf.js
import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";

// ─── Helper: load image as base64 (only for logo) ──────────
async function loadImageAsBase64(url) {
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
  } catch (err) {
    console.warn("Could not load image:", err);
    return null;
  }
}

// ─── Helper: resolve path with fallback aliases ──────────
function resolvePath(obj, path) {
  if (!obj || !path) return '';

  if (path.includes('.')) {
    const value = path.split('.').reduce((acc, part) => acc?.[part], obj);
    return value !== undefined && value !== null ? String(value) : '';
  }

  let value = obj[path];
  if (value === undefined || value === null) {
    const aliases = {
      'created': ['created_at', 'createdAt', 'CreationDate'],
      'student': ['student_name', 'studentName', 'full_name', 'name'],
      'parent': ['parent_name', 'parentName', 'guardian_name'],
      'inquiry_no': ['inquiry_number', 'inquiryNo'],
      'followup': ['followup_date', 'followUpDate'],
      'course': ['course_name', 'courseName'],
      'source': ['lead_source', 'leadSource'],
      'status': ['current_status', 'leadStatus'],
    };
    const possibleKeys = aliases[path] || [];
    for (const key of possibleKeys) {
      if (obj[key] !== undefined && obj[key] !== null) {
        value = obj[key];
        break;
      }
    }
  }

  return value !== undefined && value !== null ? String(value) : '';
}

// ─── Main PDF generator ──────────────────────────────────
export async function generateReportPdf(config, data, filters, org, theme = {}, options = {}) {
  const safeData = Array.isArray(data) ? data : [];

  const TOP_MARGIN = 35;

  const pdfConfig = {
    orientation: 'landscape',
    pageSize: 'a4',
    showHeader: true,
    showFooter: true,
    fontSize: 8,
    headerFontSize: 14,
    footerFontSize: 8,
    topMargin: TOP_MARGIN,
    ...(config.pdfConfig || {}),
    ...options,
  };

  const {
    orientation,
    pageSize,
    showHeader,
    showFooter,
    fontSize,
    headerFontSize,
    footerFontSize,
    topMargin,
  } = pdfConfig;

  const primaryColor = "#000000";
  const fontHeading = theme?.font_heading || "Righteous";
  const fontBody = theme?.font_body || "Montserrat";

  const doc = new jsPDF({ orientation, unit: 'mm', format: pageSize });
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();

  let logoBase64 = null;
  if (org?.logo_dark_url) {
    logoBase64 = await loadImageAsBase64(org.logo_dark_url);
  }

  // ── Header ──
  const drawHeader = (doc, pageWidth, org, startY) => {
    if (!showHeader) return startY || 12;
    const logoWidth = 35;
    const logoHeight = 14;
    let y = startY || 12;
    if (logoBase64) {
      doc.addImage(logoBase64, "PNG", 14, y, logoWidth, logoHeight);
    }
    const textX = logoBase64 ? 14 + logoWidth + 4 : 14;
    const textY = y + 1;
    const companyName = org?.company_name || "ShreeVidhya Academy";
    const address = org?.address || "";
    const gstin = org?.gstin || "";
    const phone = org?.phone || "";
    const email = org?.email || "";

    doc.setFont(fontHeading, "bold");
    doc.setFontSize(headerFontSize);
    doc.setTextColor("#000000");
    doc.text(companyName, textX, textY);

    doc.setFont(fontBody, "normal");
    doc.setFontSize(7);
    doc.setTextColor("#000000");
    let detailY = textY + 4.5;
    if (address) {
      const addrLines = doc.splitTextToSize(address, pageWidth - textX - 14 - 10);
      doc.text(addrLines, textX, detailY);
      detailY += addrLines.length * 3.5 + 1;
    }
    if (gstin) {
      doc.text(`GSTIN: ${gstin}`, textX, detailY);
      detailY += 4;
    }
    if (phone) {
      doc.text(`Phone: ${phone}`, textX, detailY);
      detailY += 4;
    }
    if (email) {
      doc.text(`Email: ${email}`, textX, detailY);
      detailY += 4;
    }

    const headerHeight = Math.max(logoHeight + 4, detailY - textY + 4);
    y += headerHeight + 4;
    doc.setDrawColor("#000000");
    doc.setLineWidth(0.4);
    doc.line(14, y, pageWidth - 14, y);
    y += 6;
    return y;
  };

  // ── Footer ──
  const drawFooter = (doc, pageWidth, pageHeight, pageNumber, totalPages) => {
    if (!showFooter) return;
    const dateStr = new Date().toLocaleString();
    doc.setFont(fontBody, "italic");
    doc.setFontSize(footerFontSize);
    doc.setTextColor("#000000");
    doc.text(
      `Generated on ${dateStr} | Page ${pageNumber} of ${totalPages}`,
      pageWidth / 2,
      pageHeight - 10,
      { align: "center" }
    );
  };

  // ─── First page ──
  let y = drawHeader(doc, pageWidth, org, 12);

  // Title
  const title = config.title || "Report";
  doc.setFont(fontHeading, "bold");
  doc.setFontSize(16);
  doc.setTextColor("#000000");
  doc.text(title, pageWidth / 2, y, { align: "center" });
  y += 8;

  // Subtitle
  let subtitle = "";
  if (filters.start_date && filters.end_date) {
    subtitle = `${filters.start_date} to ${filters.end_date}`;
  } else if (filters.start_date) {
    subtitle = `From ${filters.start_date}`;
  } else if (filters.end_date) {
    subtitle = `Until ${filters.end_date}`;
  }
  if (subtitle) {
    doc.setFont(fontBody, "normal");
    doc.setFontSize(10);
    doc.setTextColor("#000000");
    doc.text(subtitle, pageWidth / 2, y, { align: "center" });
    y += 6;
  }

  y = Math.max(y, topMargin);

  // ─── Table columns and data ──
  const columns = config.columns || [];
  const head = [columns.map((col) => col.header)];
  const body = safeData.map((row) =>
    columns.map((col) => resolvePath(row, col.accessor))
  );

  // Column width overrides
  const columnStyles = {};
  columns.forEach((col, idx) => {
    if (['inquiry_no', 'student', 'parent', 'course', 'source', 'status'].includes(col.accessor)) {
      columnStyles[idx] = { cellWidth: 'auto' };
    } else if (['created', 'followup'].includes(col.accessor)) {
      columnStyles[idx] = { cellWidth: 25 };
    } else if (['mobile'].includes(col.accessor)) {
      columnStyles[idx] = { cellWidth: 30 };
    }
  });

  // ─── Generate table with borders, transparent background ──
  autoTable(doc, {
    head,
    body,
    startY: y,
    margin: { top: topMargin, left: 14, right: 14 },
    styles: {
      fontSize,
      cellPadding: 2,
      font: fontBody || "helvetica",
      textColor: [0, 0, 0],
      fillColor: [255, 255, 255],       // white background for all cells
      lineWidth: 0.2,                   // thin border
      lineColor: [0, 0, 0],             // black border
    },
    headStyles: {
      fillColor: [255, 255, 255],       // transparent header
      textColor: [0, 0, 0],
      fontStyle: "bold",
      font: fontHeading || "helvetica",
      lineWidth: 0.2,                   // ✅ FULL border for header cells (all sides)
      lineColor: [0, 0, 0],
    },
    alternateRowStyles: {
      fillColor: [255, 255, 255],       // no alternate row color
    },
    columnStyles,
    didDrawPage: (data) => {
      drawHeader(doc, pageWidth, org, 12);
      const totalPages = doc.internal.getNumberOfPages();
      drawFooter(doc, pageWidth, pageHeight, data.pageNumber, totalPages);
    },
  });

  return doc;
}