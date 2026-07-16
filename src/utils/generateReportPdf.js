// src/utils/generateReportPdf.js
import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";

// ─── Helper: load image as base64 ──────────────────────────
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

  // ─── SET THIS VALUE TO CONTROL TOP MARGIN ON ALL PAGES ───
  const TOP_MARGIN = 35; // mm (adjust as needed)

  const pdfConfig = {
    orientation: 'landscape',
    pageSize: 'a4',
    includeLetterhead: false,
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
    includeLetterhead,
    showHeader,
    showFooter,
    fontSize,
    headerFontSize,
    footerFontSize,
    topMargin,
  } = pdfConfig;

  // ─── Theme colors and fonts ──────────────────────────────
  const primaryColor = theme?.primary_color || "#0D47A1";
  const primaryLight = theme?.primary_light_color || "#1565C0";
  const primaryDark = theme?.primary_dark_color || "#0A3478";
  const accentColor = theme?.accent_color || "#D15839";
  const accentLight = theme?.accent_light_color || "#DD7A5F";
  const accentDark = theme?.accent_dark_color || "#A63E2A";
  const fontHeading = theme?.font_heading || "Righteous";
  const fontBody = theme?.font_body || "Montserrat";

  const doc = new jsPDF({ orientation, unit: 'mm', format: pageSize });
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();

  // ── Load images ──
  let logoBase64 = null;
  if (org?.logo_dark_url) {
    logoBase64 = await loadImageAsBase64(org.logo_dark_url);
  }

  let letterheadBase64 = null;
  if (includeLetterhead && org?.letterhead_url) {
    letterheadBase64 = await loadImageAsBase64(org.letterhead_url);
  }

  const addLetterhead = () => {
    if (letterheadBase64) {
      doc.addImage(letterheadBase64, "PNG", 0, 0, pageWidth, pageHeight);
    }
  };

  // ── Header drawing function ──
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

    // Use theme fonts if available
    const headerFont = fontHeading || "helvetica";
    const bodyFont = fontBody || "helvetica";

    doc.setFont(headerFont, "bold");
    doc.setFontSize(headerFontSize);
    doc.setTextColor(primaryColor);
    doc.text(companyName, textX, textY);

    doc.setFont(bodyFont, "normal");
    doc.setFontSize(7);
    doc.setTextColor("#333");
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
    doc.setDrawColor(primaryColor);
    doc.setLineWidth(0.4);
    doc.line(14, y, pageWidth - 14, y);
    y += 6;

    return y;
  };

  // ── Footer ──
  const drawFooter = (doc, pageWidth, pageHeight, pageNumber, totalPages) => {
    if (!showFooter) return;
    const dateStr = new Date().toLocaleString();
    const bodyFont = fontBody || "helvetica";
    doc.setFont(bodyFont, "italic");
    doc.setFontSize(footerFontSize);
    doc.setTextColor("#888");
    doc.text(
      `Generated on ${dateStr} | Page ${pageNumber} of ${totalPages}`,
      pageWidth / 2,
      pageHeight - 10,
      { align: "center" }
    );
  };

  // ─── First page setup ──
  addLetterhead();
  let y = drawHeader(doc, pageWidth, org, 12);

  // Title (only on first page)
  const title = config.title || "Report";
  const headingFont = fontHeading || "helvetica";
  doc.setFont(headingFont, "bold");
  doc.setFontSize(16);
  doc.setTextColor(primaryColor);
  doc.text(title, pageWidth / 2, y, { align: "center" });
  y += 8;

  // Subtitle (only on first page)
  let subtitle = "";
  if (filters.start_date && filters.end_date) {
    subtitle = `${filters.start_date} to ${filters.end_date}`;
  } else if (filters.start_date) {
    subtitle = `From ${filters.start_date}`;
  } else if (filters.end_date) {
    subtitle = `Until ${filters.end_date}`;
  }
  if (subtitle) {
    const bodyFont = fontBody || "helvetica";
    doc.setFont(bodyFont, "normal");
    doc.setFontSize(10);
    doc.setTextColor("#333");
    doc.text(subtitle, pageWidth / 2, y, { align: "center" });
    y += 6;
  }

  // Ensure top margin is respected
  y = Math.max(y, topMargin);

  // ─── Table ──
  const columns = config.columns || [];
  const head = [columns.map((col) => col.header)];
  const body = safeData.map((row) =>
    columns.map((col) => resolvePath(row, col.accessor))
  );

  // Column widths
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

  // ─── Generate table ──
  autoTable(doc, {
    head,
    body,
    startY: y,
    margin: { top: topMargin, left: 14, right: 14 },
    styles: { 
      fontSize, 
      cellPadding: 2,
      font: fontBody || "helvetica",
    },
    headStyles: { 
      fillColor: hexToRgb(primaryColor), 
      textColor: [255, 255, 255], 
      fontStyle: "bold",
      font: fontHeading || "helvetica",
    },
    alternateRowStyles: { fillColor: [245, 245, 245] },
    columnStyles,
    didDrawPage: (data) => {
      addLetterhead();
      drawHeader(doc, pageWidth, org, 12);
      const totalPages = doc.internal.getNumberOfPages();
      drawFooter(doc, pageWidth, pageHeight, data.pageNumber, totalPages);
    },
  });

  return doc;
}

// ─── Helper: convert hex color to RGB array for jsPDF ──
function hexToRgb(hex) {
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  return result
    ? [parseInt(result[1], 16), parseInt(result[2], 16), parseInt(result[3], 16)]
    : [13, 71, 161]; // fallback to #0D47A1
}