// src/utils/reportExport.js
import html2canvas from 'html2canvas';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import * as XLSX from 'xlsx';

/* ------------------------------------------------------------------ */
/*  Helper to resolve nested property paths (e.g. "batches.name")     */
/* ------------------------------------------------------------------ */
function resolvePath(obj, path) {
  return path.split('.').reduce((acc, part) => acc?.[part], obj);
}

/* ------------------------------------------------------------------ */
/*  Export a table to PDF using jsPDF + jspdf-autotable               */
/* ------------------------------------------------------------------ */
export function exportToPDF(title, columns, data) {
  const doc = new jsPDF({ orientation: 'landscape', unit: 'mm' });

  // Title
  doc.setFontSize(16);
  doc.text(title, 14, 15);

  // Prepare header and rows
  const head = [columns.map((col) => col.header)];
  const body = data.map((row) =>
    columns.map((col) => resolvePath(row, col.accessor) ?? '')
  );

  // Generate table using the autoTable function
  autoTable(doc, {
    head,
    body,
    startY: 25,
    styles: { fontSize: 9, cellPadding: 2 },
    headStyles: { fillColor: [13, 71, 161] },   // primary blue #0D47A1
    alternateRowStyles: { fillColor: [245, 245, 245] },
  });

  // Save with sanitised filename
  const safeName = title.replace(/[^a-z0-9]/gi, '_').toLowerCase();
  doc.save(`${safeName}.pdf`);
}

/* ------------------------------------------------------------------ */
/*  Export a table to Excel (XLSX) using SheetJS                       */
/* ------------------------------------------------------------------ */
export function exportToExcel(title, columns, data) {
  const header = columns.map((col) => col.header);
  const rows = data.map((row) =>
    columns.map((col) => resolvePath(row, col.accessor) ?? '')
  );

  const worksheet = XLSX.utils.aoa_to_sheet([header, ...rows]);

  // Auto‑size columns (approximate)
  const colWidths = header.map((_, i) => {
    const maxLen = Math.max(
      header[i].length,
      ...rows.map((r) => (r[i]?.toString() || '').length)
    );
    return { wch: Math.min(maxLen + 2, 50) };
  });
  worksheet['!cols'] = colWidths;

  const workbook = XLSX.utils.book_new();
  const safeSheetName = title.substring(0, 31); // Excel sheet name limit
  XLSX.utils.book_append_sheet(workbook, worksheet, safeSheetName);

  const safeFileName = title.replace(/[^a-z0-9]/gi, '_').toLowerCase();
  XLSX.writeFile(workbook, `${safeFileName}.xlsx`);
}
export async function exportToPDFFromHTML(element, title) {
  const canvas = await html2canvas(element, { scale: 2, useCORS: true });
  const imgData = canvas.toDataURL('image/png');
  const pdf = new jsPDF('p', 'mm', 'a4');
  const imgWidth = 210;
  const imgHeight = (canvas.height * imgWidth) / canvas.width;
  pdf.addImage(imgData, 'PNG', 0, 0, imgWidth, imgHeight);
  pdf.save(`${title.replace(/\s/g, '_')}.pdf`);
}