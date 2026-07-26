// src/utils/receiptPdf.js
import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";
import { supabase } from "../api/supabase";

// ─── Helpers ──────────────────────────────────────────────
function formatDate(dateStr) {
  if (!dateStr) return '-';
  const parts = dateStr.split('-');
  if (parts.length === 3) return `${parts[2]}-${parts[1]}-${parts[0]}`;
  return dateStr;
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
  doc.setFontSize(fontSize);
  doc.setTextColor(color);
  const amountText = amount.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  if (align === 'left') {
    doc.addImage(img, 'PNG', x, y - fontSize * 0.35, 4, 4);
    doc.text(amountText, x + 5, y);
  } else {
    const textWidth = doc.getTextWidth(amountText);
    doc.addImage(img, 'PNG', x - textWidth - 5, y - fontSize * 0.35, 4, 4);
    doc.text(amountText, x - textWidth, y);
  }
}

function numberToWords(num) {
  const a = [
    "", "One", "Two", "Three", "Four", "Five", "Six", "Seven", "Eight", "Nine", "Ten",
    "Eleven", "Twelve", "Thirteen", "Fourteen", "Fifteen", "Sixteen", "Seventeen", "Eighteen", "Nineteen"
  ];
  const b = ["", "", "Twenty", "Thirty", "Forty", "Fifty", "Sixty", "Seventy", "Eighty", "Ninety"];

  function convert(n) {
    if (n < 20) return a[n];
    if (n < 100) return b[Math.floor(n / 10)] + (n % 10 ? " " + a[n % 10] : "");
    if (n < 1000) return a[Math.floor(n / 100)] + " Hundred" + (n % 100 ? " and " + convert(n % 100) : "");
    if (n < 100000) return convert(Math.floor(n / 1000)) + " Thousand" + (n % 1000 ? " " + convert(n % 1000) : "");
    if (n < 10000000) return convert(Math.floor(n / 100000)) + " Lakh" + (n % 100000 ? " " + convert(n % 100000) : "");
    return convert(Math.floor(n / 10000000)) + " Crore" + (n % 10000000 ? " " + convert(n % 10000000) : "");
  }
  return num === 0 ? "Zero" : convert(num);
}

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
    console.warn("Could not load logo image:", err);
    return null;
  }
}

async function getOrganization(orgId = 3) {
  const { data, error } = await supabase
    .from("organization")
    .select("*")
    .eq("id", orgId)
    .single();
  if (error) throw error;
  return data;
}

async function getBranch(branchId) {
  const { data, error } = await supabase
    .from("branches")
    .select("branch_name, address, city, state, phone, email")
    .eq("id", branchId)
    .single();
  if (error) throw error;
  return data;
}

// ─── Main PDF Generator ────────────────────────────────────
export async function generateReceiptPdf(receipt, options = {}) {
  const { org: passedOrg, theme } = options;

  let org = passedOrg;
  if (!org || !org.id) {
    org = await getOrganization(3);
  }

  const student = receipt.students;
  let branch = null;
  if (student?.branch_id) {
    branch = await getBranch(student.branch_id);
  }

  const companyName = org?.company_name || "ShreeVidhya Academy";
  const address = org?.address || "";
  const gstin = org?.gstin || "";
  const stateCode = org?.state_code || "";
  const placeOfSupply = org?.place_of_supply || "";
  const registrationType = org?.registration_type || "";
  const logoUrl = org?.logo_dark_url || org?.logo_light_url || null;

  const accentColor = "#000000";
  const fontBody = theme?.font_body || "helvetica";

  const doc = new jsPDF({ unit: 'mm', format: 'a5', orientation: 'landscape' });
  const pageWidth = doc.internal.pageSize.getWidth();   // 210 mm
  const pageHeight = doc.internal.pageSize.getHeight(); // 148 mm
  const margin = 10; // same left/right margin for all content

  let logoBase64 = null;
  if (logoUrl) {
    logoBase64 = await loadImageAsBase64(logoUrl);
  }

  const payment = receipt.fee_payments;
  const studentName = `${student?.first_name || ""} ${student?.last_name || ""}`.trim();
  const admissionNo = student?.admission_no || "";
  const studentAddress = student?.address || "";
  const studentMobile = student?.mobile || "";

  // ── Payment allocations ──
  let allocations = [];
  let totalBase = 0;
  let totalTax = 0;
  let totalAllocated = 0;

  const { data: allocData, error: allocError } = await supabase
    .from("payment_allocations")
    .select(`
      *,
      student_fee_components (
        id,
        due_amount,
        paid_amount,
        fee_structure_components (
          component_name,
          tax_rate_id,
          tax_rates ( id, name, rate )
        )
      )
    `)
    .eq("payment_id", receipt.payment_id)
    .eq("branch_id", receipt.branch_id)
    .eq("financial_year_id", receipt.financial_year_id);

  if (!allocError && allocData) {
    allocations = allocData;
    allocations.forEach(a => {
      totalBase += Number(a.base_amount || 0);
      totalTax += Number(a.tax_amount || 0);
      totalAllocated += Number(a.allocated_amount || 0);
    });
  }

  const useFallback = allocations.length === 0;
  const amount = Number(receipt.amount);

  // ── Build table rows ──
  let tableRows = [];
  if (useFallback) {
    tableRows = [["1", "Fee Payment", "—", amount, "—", amount]];
  } else {
    allocations.forEach((alloc, idx) => {
      const comp = alloc.student_fee_components;
      const name = comp?.fee_structure_components?.component_name || `Component ${idx + 1}`;
      const base = Number(alloc.base_amount || 0);
      const tax = Number(alloc.tax_amount || 0);
      const total = Number(alloc.allocated_amount || 0);
      const rate = comp?.fee_structure_components?.tax_rates?.rate || 0;
      const rateDisplay = rate > 0 ? `${rate}%` : "—";
      tableRows.push([(idx + 1).toString(), name, base, tax, rateDisplay, total]);
    });
  }

  // ── Header ──
  let y = 10;

  const logoWidth = 35;
  const logoHeight = 14;
  if (logoBase64) {
    doc.addImage(logoBase64, 'PNG', margin, y, logoWidth, logoHeight);
  }
  const textX = margin + (logoBase64 ? logoWidth + 4 : 0);
  const textY = y + 1;
  doc.setFont(fontBody, 'bold');
  doc.setFontSize(14);
  doc.setTextColor(accentColor);
  doc.text(companyName, textX, textY);
  doc.setFont(fontBody, 'normal');
  doc.setFontSize(7);
  doc.setTextColor('#000');
  let detailY = textY + 4.5;
  if (address) {
    const addrLines = doc.splitTextToSize(address, pageWidth - textX - margin - 10);
    doc.text(addrLines, textX, detailY);
    detailY += addrLines.length * 3.5 + 1;
  }
  if (gstin) {
    doc.text(`GSTIN: ${gstin}`, textX, detailY);
    detailY += 4;
  }
  if (stateCode) {
    doc.text(`State Code: ${stateCode}  |  Place of Supply: ${placeOfSupply}`, textX, detailY);
    detailY += 4;
  }
  if (registrationType) {
    doc.text(`Registration Type: ${registrationType}`, textX, detailY);
  }

  const headerHeight = Math.max(logoHeight + 4, detailY - textY + 4);
  y += headerHeight + 2;

  doc.setDrawColor(accentColor);
  doc.line(margin, y, pageWidth - margin, y);
  y += 4;

  doc.setFont(fontBody, 'bold');
  doc.setFontSize(16);
  doc.setTextColor(accentColor);
  doc.text("FEE RECEIPT", pageWidth / 2, y, { align: 'center' });
  y += 8;

  // ── Two‑column Info ──
  const col1X = margin;
  const col2X = pageWidth - margin - 70;

  doc.setFont(fontBody, 'bold');
  doc.setFontSize(10);
  doc.setTextColor(accentColor);
  doc.text("Student Details", col1X, y);
  doc.setFont(fontBody, 'normal');
  doc.setFontSize(9);
  doc.setTextColor('#000');
  let colY = y + 5;
  doc.text(`Name: ${studentName}`, col1X, colY);
  colY += 5;
  doc.text(`Admission No: ${admissionNo}`, col1X, colY);
  colY += 5;
  if (studentAddress) {
    const addrLines = doc.splitTextToSize(studentAddress, 70);
    doc.text(addrLines, col1X, colY);
    colY += addrLines.length * 4 + 2;
  }
  doc.text(`Mobile: ${studentMobile}`, col1X, colY);
  colY += 5;

  doc.setFont(fontBody, 'bold');
  doc.setFontSize(10);
  doc.setTextColor(accentColor);
  doc.text("Receipt Details", col2X, y);
  doc.setFont(fontBody, 'normal');
  doc.setFontSize(9);
  doc.setTextColor('#000');
  let col2Y = y + 5;
  doc.text(`Receipt No: ${receipt.receipt_no}`, col2X, col2Y);
  col2Y += 5;
  doc.text(`Date: ${formatDate(receipt.receipt_date)}`, col2X, col2Y);
  col2Y += 5;
  if (payment?.payment_mode) {
    doc.text(`Payment Mode: ${payment.payment_mode}`, col2X, col2Y);
    col2Y += 5;
  }
  if (payment?.transaction_no) {
    doc.text(`Transaction No: ${payment.transaction_no}`, col2X, col2Y);
  }

  y = Math.max(colY, col2Y) + 4;

  // ── Table (centered, full available width, no double data) ──
  const availableWidth = pageWidth - 2 * margin;   // 190 mm
  const tableStartY = y;

  let tableHead;
  let columnStyles;

  if (useFallback) {
    // Total width must be exactly availableWidth = 190
    // #=9, Particular=91, Amount=28, Tax=28, Total=34 → 190
    tableHead = ["#", "Particular", "Amount", "Tax", "Total"];
    columnStyles = {
      0: { cellWidth: 9, halign: 'center' },
      1: { cellWidth: 91, halign: 'left' },
      2: { cellWidth: 28, halign: 'right' },
      3: { cellWidth: 28, halign: 'right' },
      4: { cellWidth: 34, halign: 'right' },
    };
  } else {
    // #=10, Component=66, Base=29, Tax=29, Rate=23, Total=33 → 190
    tableHead = ["#", "Component", "Base", "Tax", "Rate", "Total"];
    columnStyles = {
      0: { cellWidth: 10, halign: 'center' },
      1: { cellWidth: 66, halign: 'left' },
      2: { cellWidth: 29, halign: 'right' },
      3: { cellWidth: 29, halign: 'right' },
      4: { cellWidth: 23, halign: 'center' },
      5: { cellWidth: 33, halign: 'right' },
    };
  }

  autoTable(doc, {
    startY: tableStartY,
    head: [tableHead],
    body: tableRows,
    theme: 'plain',
    styles: {
      fontSize: 7,
      cellPadding: 1.5,
      overflow: 'linebreak',
      textColor: [0, 0, 0],
      fillColor: [255, 255, 255],
      lineColor: [0, 0, 0],
      lineWidth: 0.2,
    },
    headStyles: {
      textColor: [0, 0, 0],
      fontStyle: 'bold',
      fontSize: 7,
      fillColor: [255, 255, 255],
      lineWidth: 0.2,               // all header borders visible
      lineColor: [0, 0, 0],
    },
    columnStyles,
    margin: { left: margin, right: margin },   // centered, same as summary
    willDrawCell: (data) => {
      // Prevent raw number from being drawn in currency columns
      let currencyCols = useFallback ? [2, 3, 4] : [2, 3, 5];
      if (currencyCols.includes(data.column.index) && typeof data.cell.raw === 'number') {
        data.cell.text = '';   // clear text, will be drawn in didDrawCell
      }
    },
    didDrawCell: (data) => {
      let currencyCols = useFallback ? [2, 3, 4] : [2, 3, 5];
      if (currencyCols.includes(data.column.index) && typeof data.cell.raw === 'number') {
        const x = data.cell.x + 2;
        const yPos = data.cell.y + data.cell.height / 2 + 1.5;
        drawCurrency(doc, data.cell.raw, x, yPos, 7, 'left', '#000');
      }
    },
  });

  const tableEndY = doc.lastAutoTable.finalY;

  // ── Summary Box (same width, same left/right margins → perfectly aligned) ──
  const summaryStartY = tableEndY + 4;
  const summaryWidth = availableWidth;   // exactly the same as table
  const summaryX = margin;               // same left edge

  let totalSubtotal = 0, totalTaxAmount = 0, totalGrand = 0;
  if (!useFallback) {
    totalSubtotal = totalBase;
    totalTaxAmount = totalTax;
    totalGrand = totalAllocated;
  } else {
    totalSubtotal = Number(payment?.base_amount || amount);
    totalTaxAmount = Number(payment?.tax_amount || 0);
    totalGrand = amount;
  }

  const roundOff = Math.round(totalGrand) - totalGrand;
  const grandTotal = totalGrand + roundOff;

  const summaryHeight = 5 + 4 * 4.5 + 4;
  doc.setDrawColor('#000');
  doc.setFillColor(255, 255, 255);
  doc.rect(summaryX, summaryStartY, summaryWidth, summaryHeight, 'FD');

  let sY = summaryStartY + 3;
  doc.setFont(fontBody, 'bold');
  doc.setFontSize(9);
  doc.setTextColor('#000');
  doc.text("Summary", summaryX + 3, sY);
  sY += 5;

  doc.setFont(fontBody, 'normal');
  doc.setFontSize(7);
  doc.setTextColor('#000');

  const summaryItems = [
    { label: "Total Base Amount", value: totalSubtotal },
    { label: "Total Tax Amount", value: totalTaxAmount },
    { label: "Round Off", value: roundOff },
    { label: "Grand Total", value: grandTotal, bold: true },
  ];

  summaryItems.forEach((item) => {
    const labelX = summaryX + 3;
    const valueX = summaryX + summaryWidth - 3;
    doc.setFont(fontBody, item.bold ? 'bold' : 'normal');
    doc.setTextColor('#000');
    doc.text(item.label, labelX, sY);
    drawCurrency(doc, item.value, valueX, sY, 7, 'right', '#000');
    sY += 4.5;
  });

  // ── Amount in Words ──
  const wordsY = summaryStartY + summaryHeight + 6;
  doc.setFont(fontBody, 'italic');
  doc.setFontSize(8);
  doc.setTextColor('#000');
  const words = numberToWords(grandTotal);
  doc.text(`Amount in words: ${words} Only`, pageWidth / 2, wordsY, { align: 'center' });

  // ── Footer Signatures ──
  const footerY = pageHeight - 10;
  doc.setDrawColor('#000');
  doc.line(margin, footerY, margin + 40, footerY);
  doc.line(pageWidth - margin - 40, footerY, pageWidth - margin, footerY);
  doc.setFont(fontBody, 'normal');
  doc.setFontSize(6);
  doc.setTextColor('#000');
  doc.text("Authorized Signatory", margin + 10, footerY + 4);
  doc.text("Student/Parent", pageWidth - margin - 30, footerY + 4);

  doc.save(`Receipt_${receipt.receipt_no}.pdf`);
}