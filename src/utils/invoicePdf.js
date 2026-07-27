// src/utils/invoicePdf.js
import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";
import { supabase } from "../api/supabase";

// ─── Rupee symbol helper ──────────────────────────────────
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
  const amountText = amount.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const textWidth = doc.getTextWidth(amountText);
  const imgSize = fontSize * 0.4;
  if (align === 'left') {
    doc.addImage(img, 'PNG', x, y - fontSize * 0.35, imgSize, imgSize);
    doc.text(amountText, x + imgSize + 1, y);
  } else {
    doc.addImage(img, 'PNG', x - textWidth - imgSize - 1, y - fontSize * 0.35, imgSize, imgSize);
    doc.text(amountText, x - textWidth, y);
  }
}

// ─── Number to words ─────────────────────────────────────
export function numberToWords(num) {
  if (num === 0) return "Zero";
  const ones = ['', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine',
    'Ten', 'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen', 'Seventeen', 'Eighteen', 'Nineteen'];
  const tens = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'];
  const numToWords = (n) => {
    if (n < 20) return ones[n];
    if (n < 100) return tens[Math.floor(n/10)] + (n%10 ? ' ' + ones[n%10] : '');
    if (n < 1000) return ones[Math.floor(n/100)] + ' Hundred' + (n%100 ? ' ' + numToWords(n%100) : '');
    if (n < 100000) return numToWords(Math.floor(n/1000)) + ' Thousand' + (n%1000 ? ' ' + numToWords(n%1000) : '');
    if (n < 10000000) return numToWords(Math.floor(n/100000)) + ' Lakh' + (n%100000 ? ' ' + numToWords(n%100000) : '');
    return numToWords(Math.floor(n/10000000)) + ' Crore' + (n%10000000 ? ' ' + numToWords(n%10000000) : '');
  };
  const rupees = Math.floor(num);
  const paise = Math.round((num - rupees) * 100);
  let result = numToWords(rupees) + ' Rupee' + (rupees !== 1 ? 's' : '');
  if (paise > 0) result += ' and ' + numToWords(paise) + ' Paise';
  return result;
}

// ─── Load image as base64 ────────────────────────────────
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

// ─── Main PDF generator ──────────────────────────────────
export async function generateInvoicePDF(invoice, org, type = 'sales', options = {}) {
  let { receiptNumber = null, theme = {} } = options;

  const accentColor = theme.primary_color || '#000000';
  const headingFont = theme.font_heading || 'helvetica';
  const bodyFont = theme.font_body || 'helvetica';

  const doc = new jsPDF({ unit: 'mm', format: 'a4', orientation: 'portrait' });
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const margin = 14;
  const availableWidth = pageWidth - 2 * margin;

  // ── Load company logo ──
  let logoBase64 = null;
  if (org?.logo_dark_url) {
    logoBase64 = await loadImageAsBase64(org.logo_dark_url);
  }

  // ── Fetch real student fee components for accurate balance calculation ──
  let totalCourseFee = 0;        // total due (inclusive) from components
  let totalPaidOverall = 0;      // total paid (inclusive) across all payments
  let overallBalance = 0;        // calculated correctly

  if (invoice.student_fee_id) {
    // Get the sum of all due amounts from student_fee_components
    const { data: components, error: compError } = await supabase
      .from("student_fee_components")
      .select("due_amount, paid_amount")
      .eq("student_fee_id", invoice.student_fee_id)
      .eq("branch_id", invoice.branch_id)
      .eq("financial_year_id", invoice.financial_year_id);

    if (compError) {
      console.error("Failed to fetch fee components for balance:", compError);
    } else if (components && components.length > 0) {
      // Total original amount student must pay (sum of due_amounts = base + tax)
      totalCourseFee = components.reduce((sum, c) => sum + Number(c.due_amount), 0);

      // Total amount already paid (sum of paid_amounts = base + tax already collected)
      totalPaidOverall = components.reduce((sum, c) => sum + Number(c.paid_amount), 0);

      overallBalance = Math.max(totalCourseFee - totalPaidOverall, 0);
    } else {
      // Fallback (should not happen if fee structure exists)
      const { data: studentFee } = await supabase
        .from("student_fees")
        .select("final_fee")
        .eq("id", invoice.student_fee_id)
        .single();
      if (studentFee) {
        totalCourseFee = Number(studentFee.final_fee);
      }
      const { data: payments } = await supabase
        .from("fee_payments")
        .select("amount")
        .eq("student_fee_id", invoice.student_fee_id);
      totalPaidOverall = (payments || []).reduce((sum, p) => sum + Number(p.amount), 0);
      overallBalance = Math.max(totalCourseFee - totalPaidOverall, 0);
    }
  } else {
    totalCourseFee = Number(invoice.grand_total) || 0;
    totalPaidOverall = Number(invoice.paid_amount) || 0;
    overallBalance = Number(invoice.balance_due) || (totalCourseFee - totalPaidOverall);
  }

  // ── Auto‑fetch receipt number if not provided but invoice has receipt_id ──
  if (!receiptNumber && invoice.receipt_id) {
    const { data: receipt } = await supabase
      .from("receipts")
      .select("receipt_no")
      .eq("id", invoice.receipt_id)
      .single();
    if (receipt) {
      receiptNumber = receipt.receipt_no;
    }
  }

  // ── Header ──
  let y = 12;
  const logoWidth = 40;
  const logoHeight = 16;
  if (logoBase64) {
    doc.addImage(logoBase64, 'PNG', margin, y, logoWidth, logoHeight);
  }
  const companyName = org?.company_name || "ShreeVidhya Academy";
  const address = org?.address || "";
  const gstin = org?.gstin || "";
  const phone = org?.phone || "";
  const email = org?.email || "";
  const website = org?.website || "";

  const textX = margin + (logoBase64 ? logoWidth + 6 : 0);
  const textY = y + 2;
  doc.setFont(headingFont, 'bold');
  doc.setFontSize(14);
  doc.setTextColor(accentColor);
  doc.text(companyName, textX, textY);
  doc.setFont(bodyFont, 'normal');
  doc.setFontSize(8);
  doc.setTextColor('#000');
  let detailY = textY + 5;
  if (address) {
    const addrLines = doc.splitTextToSize(address, pageWidth - textX - margin - 10);
    doc.text(addrLines, textX, detailY);
    detailY += addrLines.length * 4 + 1;
  }
  if (gstin) {
    doc.text(`GSTIN: ${gstin}`, textX, detailY);
    detailY += 4.5;
  }
  if (phone) {
    doc.text(`Phone: ${phone}`, textX, detailY);
    detailY += 4.5;
  }
  if (email) {
    doc.text(`Email: ${email}`, textX, detailY);
    detailY += 4.5;
  }
  if (website) {
    doc.text(`Web: ${website}`, textX, detailY);
  }

  const headerHeight = Math.max(logoHeight + 6, detailY - textY + 8);
  y += headerHeight + 4;

  doc.setDrawColor('#000');
  doc.line(margin, y, pageWidth - margin, y);
  y += 6;

  const title = type === 'sales' ? 'TAX INVOICE' : 'PURCHASE INVOICE';
  doc.setFont(headingFont, 'bold');
  doc.setFontSize(22);
  doc.setTextColor(accentColor);
  doc.text(title, pageWidth / 2, y, { align: 'center' });
  y += 12;

  // ── Two‑column details ──
  const isSales = type === 'sales';
  const partyName = isSales
    ? `${invoice.students?.first_name || ''} ${invoice.students?.last_name || ''}`.trim() || 'N/A'
    : invoice.vendors?.vendor_name || 'N/A';
  const partyGstin = isSales ? invoice.students?.gstin : invoice.vendors?.gstin;
  const partyAddress = isSales ? invoice.students?.billing_address : invoice.vendors?.address;
  const placeOfSupply = invoice.place_of_supply || '';
  const invNo = invoice.invoice_number || 'N/A';
  const invDate = invoice.invoice_date || '';
  const dueDate = invoice.due_date || '';
  const status = invoice.status || 'Draft';

  doc.setFont(headingFont, 'bold');
  doc.setFontSize(11);
  doc.setTextColor(accentColor);
  doc.text(isSales ? 'Billed To:' : 'Vendor:', margin, y);
  doc.setFont(bodyFont, 'normal');
  doc.setTextColor('#000');
  let leftY = y + 6;
  doc.setFontSize(10);
  doc.text(partyName, margin, leftY);
  leftY += 6;
  if (isSales && invoice.students?.admission_no) {
    doc.text(`Admission: ${invoice.students.admission_no}`, margin, leftY);
    leftY += 6;
  }
  if (partyGstin) {
    doc.text(`GSTIN: ${partyGstin}`, margin, leftY);
    leftY += 6;
  }
  if (partyAddress) {
    const addrLines = doc.splitTextToSize(partyAddress, 80);
    doc.text(addrLines, margin, leftY);
    leftY += addrLines.length * 5;
  }
  if (!isSales && invoice.vendors?.state_code) {
    doc.text(`State Code: ${invoice.vendors.state_code}`, margin, leftY);
    leftY += 6;
  }
  if (isSales && placeOfSupply) {
    doc.text(`Place of Supply: ${placeOfSupply}`, margin, leftY);
    leftY += 6;
  }
  const leftBottom = leftY + 4;

  let rightY = y;
  doc.setFont(headingFont, 'bold');
  doc.setFontSize(11);
  doc.setTextColor(accentColor);
  doc.text('Invoice Details', pageWidth - margin, rightY, { align: 'right' });
  rightY += 6;
  doc.setFont(bodyFont, 'normal');
  doc.setFontSize(10);
  doc.text(`No: ${invNo}`, pageWidth - margin, rightY, { align: 'right' });
  rightY += 6;
  doc.text(`Date: ${invDate}`, pageWidth - margin, rightY, { align: 'right' });
  rightY += 6;
  doc.text(`Status: ${status}`, pageWidth - margin, rightY, { align: 'right' });
  rightY += 6;
  if (dueDate) {
    doc.text(`Due Date: ${dueDate}`, pageWidth - margin, rightY, { align: 'right' });
    rightY += 6;
  }
  if (receiptNumber) {
    doc.text(`Receipt(s): ${receiptNumber}`, pageWidth - margin, rightY, { align: 'right' });
    rightY += 6;
  }
  const rightBottom = rightY;

  y = Math.max(leftBottom, rightBottom) + 6;

  // ── Items Table ──
  const items = (type === 'sales' ? invoice.invoice_items : invoice.purchase_invoice_items) || [];
  let tableRows = [];
  if (items.length === 0) {
    tableRows.push(["", "No items found", "", "", "", "", "", "", "", "", ""]);
  } else {
    tableRows = items.map((item, idx) => {
      let desc;
      if (type === 'sales') {
        desc = item.description || '';
      } else {
        const itemName = item.inventory_items?.item_name || '';
        const extraDesc = item.description && item.description !== itemName ? ` (${item.description})` : '';
        desc = itemName + extraDesc;
      }
      const hsn = item.hsn_sac_code || '—';
      const qty = Number(item.quantity || 1);
      const unitPrice = Number(item.unit_price || 0);
      const taxable = Number(item.taxable_amount || 0);
      const cgst = Number(item.cgst_amount || 0);
      const sgst = Number(item.sgst_amount || 0);
      const igst = Number(item.igst_amount || 0);
      const total = Number(item.total_amount || 0);

      let taxRate = 0;
      if (item.tax_rates?.rate !== undefined) {
        taxRate = item.tax_rates.rate;
      } else if (taxable > 0) {
        const totalTax = cgst + sgst + igst;
        taxRate = (totalTax / taxable) * 100;
      }
      const taxRateDisplay = taxRate > 0 ? taxRate.toFixed(1) + '%' : '—';

      return [idx + 1, desc, hsn, taxRateDisplay, qty, unitPrice, taxable, cgst, sgst, igst, total];
    });
  }

  const totals = {
    taxable: items.reduce((sum, item) => sum + Number(item.taxable_amount || 0), 0),
    cgst: items.reduce((sum, item) => sum + Number(item.cgst_amount || 0), 0),
    sgst: items.reduce((sum, item) => sum + Number(item.sgst_amount || 0), 0),
    igst: items.reduce((sum, item) => sum + Number(item.igst_amount || 0), 0),
    total: items.reduce((sum, item) => sum + Number(item.total_amount || 0), 0),
  };
  const roundOff = Number(invoice.round_off || 0);
  const fullGrandTotal = totals.total + roundOff;

  autoTable(doc, {
    startY: y,
    head: [['#', 'Description', 'HSN/SAC', 'GST %', 'Qty', 'Unit Price', 'Taxable', 'CGST', 'SGST', 'IGST', 'Total']],
    body: tableRows,
    theme: 'plain',
    styles: {
      fontSize: 8,
      cellPadding: 2,
      font: bodyFont,
      textColor: [0, 0, 0],
      fillColor: [255, 255, 255],
      lineColor: [0, 0, 0],
      lineWidth: 0.2,
    },
    headStyles: {
      textColor: [0, 0, 0],
      fontStyle: 'bold',
      fontSize: 8,
      font: headingFont,
      fillColor: [255, 255, 255],
      lineWidth: 0.2,
      lineColor: [0, 0, 0],
    },
    columnStyles: {
      0:  { cellWidth: 8,  halign: 'center' },
      1:  { cellWidth: 34, halign: 'left' },
      2:  { cellWidth: 16, halign: 'center' },
      3:  { cellWidth: 12, halign: 'center' },
      4:  { cellWidth: 10, halign: 'center' },
      5:  { cellWidth: 18, halign: 'right' },
      6:  { cellWidth: 16, halign: 'right' },
      7:  { cellWidth: 16, halign: 'right' },
      8:  { cellWidth: 16, halign: 'right' },
      9:  { cellWidth: 16, halign: 'right' },
      10: { cellWidth: 20, halign: 'right' },
    },
    margin: { left: margin, right: margin },
    willDrawCell: (data) => {
      const numCols = [5,6,7,8,9,10];
      if (numCols.includes(data.column.index) && typeof data.cell.raw === 'number') {
        data.cell.text = [];
      }
    },
    didDrawCell: (data) => {
      const numCols = [5,6,7,8,9,10];
      if (numCols.includes(data.column.index) && typeof data.cell.raw === 'number') {
        const x = data.cell.x + 1.5;
        const yPos = data.cell.y + data.cell.height / 2 + 1.5;
        drawCurrency(doc, data.cell.raw, x, yPos, 8, 'left', '#000');
      }
    },
  });

  let currentY = doc.lastAutoTable.finalY + 6;

  // ── Tax Summary Box (includes amount in words) ──
  const summaryStartY = currentY;
  const summaryX = margin;
  const summaryWidth = availableWidth;

  const wordLines = doc.splitTextToSize(
    `Amount in words: ${numberToWords(overallBalance > 0 ? overallBalance : fullGrandTotal)} Only`,
    summaryWidth - 8
  );
  let linesCount = 5;
  if (roundOff !== 0) linesCount++;
  const summaryHeight = linesCount * 6 + 6 + (wordLines.length * 5);

  doc.setDrawColor('#000');
  doc.setFillColor(255, 255, 255);
  doc.rect(summaryX, summaryStartY, summaryWidth, summaryHeight, 'FD');

  let sY = summaryStartY + 4;
  doc.setFont(bodyFont, 'normal');
  doc.setFontSize(10);
  doc.setTextColor('#000');

  doc.text('Taxable Amount:', summaryX + 4, sY);
  drawCurrency(doc, totals.taxable, summaryX + summaryWidth - 4, sY, 10, 'right', '#000');
  sY += 6;

  doc.text('CGST:', summaryX + 4, sY);
  drawCurrency(doc, totals.cgst, summaryX + summaryWidth - 4, sY, 10, 'right', '#000');
  sY += 6;

  doc.text('SGST:', summaryX + 4, sY);
  drawCurrency(doc, totals.sgst, summaryX + summaryWidth - 4, sY, 10, 'right', '#000');
  sY += 6;

  doc.text('IGST:', summaryX + 4, sY);
  drawCurrency(doc, totals.igst, summaryX + summaryWidth - 4, sY, 10, 'right', '#000');
  sY += 6;

  if (roundOff !== 0) {
    doc.text('Round Off:', summaryX + 4, sY);
    drawCurrency(doc, roundOff, summaryX + summaryWidth - 4, sY, 10, 'right', '#000');
    sY += 6;
  }

  // Total Amount (bold)
  doc.setFont(bodyFont, 'bold');
  doc.setFontSize(11);
  doc.text('Total Amount:', summaryX + 4, sY);
  drawCurrency(doc, fullGrandTotal, summaryX + summaryWidth - 4, sY, 11, 'right', '#000');
  sY += 8;

  // ── Amount in words (inside the box, right after total) ──
  doc.setFont(bodyFont, 'italic');
  doc.setFontSize(8);
  doc.setTextColor('#000');
  for (const line of wordLines) {
    doc.text(line, summaryX + 4, sY);
    sY += 5;
  }

  currentY = summaryStartY + summaryHeight + 6;

  // ── Course Fee Summary (now uses inclusive totals) ──
  doc.setFont(bodyFont, 'bold');
  doc.setFontSize(11);
  doc.setTextColor('#000');
  doc.text('Course Fee Summary', summaryX, currentY);
  currentY += 6;

  doc.setFont(bodyFont, 'normal');
  doc.setFontSize(10);
  const alignRight = summaryX + summaryWidth - 4;

  doc.text('Total Course Fee:', summaryX + 4, currentY);
  drawCurrency(doc, totalCourseFee, alignRight, currentY, 10, 'right', '#000');
  currentY += 7;

  doc.text('Total Paid:', summaryX + 4, currentY);
  drawCurrency(doc, totalPaidOverall, alignRight, currentY, 10, 'right', '#000');
  currentY += 7;

  doc.setFont(bodyFont, 'bold');
  doc.text('Balance Due:', summaryX + 4, currentY);
  drawCurrency(doc, overallBalance, alignRight, currentY, 10, 'right', '#000');
  currentY += 10;

  // ── Reverse Charge ──
  if (invoice.reverse_charge) {
    doc.setFont(bodyFont, 'normal');
    doc.setFontSize(9);
    doc.setTextColor('#000');
    doc.text('** Reverse Charge Applicable – Tax payable by recipient **', margin, currentY);
    currentY += 7;
  }

  // ── Terms & Conditions ──
  doc.setDrawColor('#000');
  doc.line(margin, currentY, pageWidth - margin, currentY);
  currentY += 6;
  const terms = [
    '1. Payment is due within 15 days from invoice date.',
    '2. Late payment will attract interest @18% p.a.',
    '3. Goods once sold will not be taken back.',
    '4. This is a system‑generated invoice, no signature required.',
    '5. Any dispute shall be subject to local jurisdiction.',
  ];
  doc.setFontSize(7.5);
  doc.setTextColor('#000');
  terms.forEach((line) => {
    doc.text(line, margin, currentY);
    currentY += 4.5;
  });

  // Tax note
  currentY += 2;
  doc.setFontSize(7);
  doc.setTextColor('#000');
  const taxNote = '* Tax is calculated per item based on applicable rates. Prices may be inclusive or exclusive of tax as per item configuration.';
  doc.text(taxNote, margin, currentY);
  currentY += 6;

  // Payment Terms
  const paymentTerms = invoice.payment_terms || 'Standard';
  doc.setFont(bodyFont, 'bold');
  doc.setFontSize(9);
  doc.setTextColor('#000');
  doc.text(`Payment Terms: ${paymentTerms}`, margin, currentY);
  currentY += 6;

  // Authorized Signatory
  doc.setDrawColor('#000');
  doc.line(pageWidth - margin - 50, currentY, pageWidth - margin, currentY);
  currentY += 4;
  doc.setFontSize(9);
  doc.setTextColor('#000');
  doc.text('Authorized Signatory', pageWidth - margin - 20, currentY, { align: 'center' });

  return doc;
}