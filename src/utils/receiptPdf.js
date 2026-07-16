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

function drawCurrency(doc, amount, x, y, fontSize = 10, align = 'left', color = '#333') {
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

  const primaryColor = theme?.primary_color || "#0D47A1";
  const fontBody = theme?.font_body || "helvetica";

  const doc = new jsPDF({ unit: 'mm', format: 'a5', orientation: 'landscape' });
  const pageWidth = doc.internal.pageSize.getWidth();   // 210 mm
  const pageHeight = doc.internal.pageSize.getHeight(); // 148 mm
  const margin = 10;

  let logoBase64 = null;
  if (logoUrl) {
    logoBase64 = await loadImageAsBase64(logoUrl);
  }

  const payment = receipt.fee_payments;
  const studentName = `${student?.first_name || ""} ${student?.last_name || ""}`.trim();
  const admissionNo = student?.admission_no || "";
  const studentAddress = student?.address || "";
  const studentMobile = student?.mobile || "";

  // ── Fee / tax details ──
  let totalFee = 0, paidSoFar = 0, baseAmount = 0, taxAmount = 0, totalDisplay = 0;
  let taxRateName = "", taxRateValue = 0, taxInclusive = true;

  if (payment?.student_fee_id) {
    const studentFeeId = payment.student_fee_id;
    const { data: studentFee } = await supabase
      .from("student_fees")
      .select(`
        *,
        fee_structures!inner (
          fee_amount,
          tax_rate_id,
          tax_inclusive
        )
      `)
      .eq("id", studentFeeId)
      .single();

    if (studentFee) {
      totalFee = Number(studentFee.final_fee);
      const feeStructure = studentFee.fee_structures;
      if (feeStructure) {
        taxInclusive = feeStructure.tax_inclusive !== undefined ? feeStructure.tax_inclusive : true;
        if (feeStructure.tax_rate_id) {
          const { data: taxRateData } = await supabase
            .from("tax_rates")
            .select("name, rate")
            .eq("id", feeStructure.tax_rate_id)
            .single();
          if (taxRateData) {
            taxRateName = taxRateData.name || "";
            taxRateValue = Number(taxRateData.rate) || 0;
          }
        }
      }
      const { data: allPayments } = await supabase
        .from("fee_payments")
        .select("amount")
        .eq("student_fee_id", studentFeeId);
      paidSoFar = allPayments?.reduce((sum, p) => sum + Number(p.amount), 0) || 0;
    }
  }

  const amount = Number(receipt.amount);
  const amountWords = numberToWords(amount) + " Only";

  // Tax calculation
  if (taxRateValue > 0) {
    const rate = taxRateValue / 100;
    if (taxInclusive) {
      baseAmount = amount / (1 + rate);
      taxAmount = amount - baseAmount;
      totalDisplay = amount;
    } else {
      baseAmount = amount;
      taxAmount = amount * rate;
      totalDisplay = amount + taxAmount;
    }
    baseAmount = Math.round(baseAmount * 100) / 100;
    taxAmount = Math.round(taxAmount * 100) / 100;
    totalDisplay = Math.round(totalDisplay * 100) / 100;
  } else {
    baseAmount = amount;
    taxAmount = 0;
    totalDisplay = amount;
  }

  const sgst = taxAmount / 2;
  const cgst = taxAmount / 2;
  const roundOff = Math.round(totalDisplay) - totalDisplay;
  const grandTotal = totalDisplay + roundOff;

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
  doc.setTextColor(primaryColor);
  doc.text(companyName, textX, textY);
  doc.setFont(fontBody, 'normal');
  doc.setFontSize(7);
  doc.setTextColor('#333');
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

  doc.setDrawColor(primaryColor);
  doc.line(margin, y, pageWidth - margin, y);
  y += 4;

  doc.setFont(fontBody, 'bold');
  doc.setFontSize(16);
  doc.setTextColor(primaryColor);
  doc.text("FEE RECEIPT", pageWidth / 2, y, { align: 'center' });
  y += 8;

  // ── Two‑column Info ──
  const col1X = margin;
  const col2X = pageWidth - margin - 70;

  doc.setFont(fontBody, 'bold');
  doc.setFontSize(10);
  doc.setTextColor(primaryColor);
  doc.text("Student Details", col1X, y);
  doc.setFont(fontBody, 'normal');
  doc.setFontSize(9);
  doc.setTextColor('#333');
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
  doc.setTextColor(primaryColor);
  doc.text("Receipt Details", col2X, y);
  doc.setFont(fontBody, 'normal');
  doc.setFontSize(9);
  doc.setTextColor('#333');
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

  // ── Table (full width) ──
  const tableWidth = pageWidth - 2 * margin;
  const tableX = margin;

  const tableRows = [
    ["1", "Fee Payment", "1", amount, 0, amount]
  ];

  autoTable(doc, {
    startY: y,
    head: [["#", "Particular", "Qty", "Amount", "Discount", "Total"]],
    body: tableRows,
    theme: "grid",
    styles: { fontSize: 7, cellPadding: 1.5, overflow: 'linebreak' },
    headStyles: { fillColor: primaryColor, textColor: '#FFFFFF', fontStyle: 'bold', fontSize: 7 },
    columnStyles: {
      0: { cellWidth: 8, halign: 'center' },
      1: { cellWidth: 80, halign: 'left' }, // wide for description
      2: { cellWidth: 10, halign: 'center' },
      3: { cellWidth: 25, halign: 'right' },
      4: { cellWidth: 25, halign: 'right' },
      5: { cellWidth: 30, halign: 'right' },
    },
    margin: { left: tableX, right: margin },
    willDrawCell: (data) => {
      if ([3,4,5].includes(data.column.index) && typeof data.cell.raw === 'number') {
        data.cell.text = [];
      }
    },
    didDrawCell: (data) => {
      if ([3,4,5].includes(data.column.index) && typeof data.cell.raw === 'number') {
        const x = data.cell.x + 2;
        const yPos = data.cell.y + data.cell.height / 2 + 1.5;
        drawCurrency(doc, data.cell.raw, x, yPos, 7, 'left', '#333');
      }
    }
  });

  const tableEndY = doc.lastAutoTable.finalY;

  // ── Summary Box (below table, full width) ──
  const summaryStartY = tableEndY + 4;
  const summaryWidth = pageWidth - 2 * margin;
  const summaryX = margin;

  // Draw a light background box
  doc.setDrawColor(primaryColor);
  doc.setFillColor('#f8f9fa');
  // We'll calculate a fixed height based on number of summary items
  const summaryItemCount = 5; // Subtotal, SGST, CGST, Round Off, Grand Total
  const summaryHeight = 5 + summaryItemCount * 4.5 + 4; // header + items + padding

  doc.rect(summaryX, summaryStartY, summaryWidth, summaryHeight, 'FD');

  let sY = summaryStartY + 3;
  doc.setFont(fontBody, 'bold');
  doc.setFontSize(9);
  doc.setTextColor(primaryColor);
  doc.text("Summary", summaryX + 3, sY);
  sY += 5;

  doc.setFont(fontBody, 'normal');
  doc.setFontSize(7);
  doc.setTextColor('#333');

  const taxLabel = taxRateValue > 0 ? ` (${taxRateName} ${taxRateValue}%)` : '';
  const summaryItems = [
    { label: "Subtotal", value: baseAmount },
    { label: `SGST${taxLabel}`, value: sgst },
    { label: `CGST${taxLabel}`, value: cgst },
    { label: "Round Off", value: roundOff },
    { label: "Grand Total", value: grandTotal, bold: true },
  ];

  // We'll split into two columns inside the summary box for better use of space
  // But for simplicity, we'll keep it as a single column for now.
  summaryItems.forEach((item) => {
    const labelX = summaryX + 3;
    const valueX = summaryX + summaryWidth - 3;
    doc.setFont(fontBody, item.bold ? 'bold' : 'normal');
    doc.text(item.label, labelX, sY);
    drawCurrency(doc, item.value, valueX, sY, 7, 'right', item.bold ? primaryColor : '#333');
    sY += 4.5;
  });

  // ── Amount in Words (below summary) ──
  const wordsY = summaryStartY + summaryHeight + 6;
  doc.setFont(fontBody, 'italic');
  doc.setFontSize(8);
  doc.setTextColor('#555');
  const words = numberToWords(grandTotal);
  doc.text(`Amount in words: ${words} Only`, pageWidth / 2, wordsY, { align: 'center' });


  // ── Footer Signatures ──
  const footerY = pageHeight - 10;
  doc.setDrawColor('#ccc');
  doc.line(margin, footerY, margin + 40, footerY);
  doc.line(pageWidth - margin - 40, footerY, pageWidth - margin, footerY);
  doc.setFont(fontBody, 'normal');
  doc.setFontSize(6);
  doc.setTextColor('#333');
  doc.text("Authorized Signatory", margin + 10, footerY + 4);
  doc.text("Student/Parent", pageWidth - margin - 30, footerY + 4);

  doc.save(`Receipt_${receipt.receipt_no}.pdf`);
}