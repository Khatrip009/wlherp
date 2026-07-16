import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";

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

function drawCurrency(doc, amount, x, y, fontSize = 10, align = 'left', color = '#333') {
  const img = getRupeeImage();
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(fontSize);
  doc.setTextColor(color);
  const amountText = amount.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const textWidth = doc.getTextWidth(amountText);
  const imgSize = fontSize * 0.4; // dynamic size
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
  console.log('Generating invoice PDF with:', invoice);

  // ── Theme (supports underscore keys from your context) ──
  const theme = options.theme || {};
  const primaryColor = theme.primary_color || '#0D47A1';
  const secondaryColor = theme.secondary_color || '#1565C0'; // not used but kept
  const headingFont = theme.font_heading || 'helvetica';
  const bodyFont = theme.font_body || 'helvetica';

  const doc = new jsPDF({ unit: 'mm', format: 'a4', orientation: 'portrait' });
  const pageWidth = doc.internal.pageSize.getWidth();   // 210 mm
  const pageHeight = doc.internal.pageSize.getHeight(); // 297 mm
  const margin = 14;

  // ── Load company dark logo ──
  let logoBase64 = null;
  if (org?.logo_dark_url) {
    logoBase64 = await loadImageAsBase64(org.logo_dark_url);
  }

  // ── Header ──
  let y = 12;

  // Logo (left) and company details (right)
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

  // Company details on the right (next to logo)
  const textX = margin + (logoBase64 ? logoWidth + 6 : 0);
  const textY = y + 2;
  doc.setFont(headingFont, 'bold');
  doc.setFontSize(14);
  doc.setTextColor(primaryColor);
  doc.text(companyName, textX, textY);
  doc.setFont(bodyFont, 'normal');
  doc.setFontSize(8);
  doc.setTextColor('#333');
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

  // Move y below the header (max of logo height and text height)
  const headerHeight = Math.max(logoHeight + 6, detailY - textY + 8);
  y += headerHeight + 4;

  // ── Separator line ──
  doc.setDrawColor(primaryColor);
  doc.line(margin, y, pageWidth - margin, y);
  y += 6;

  // ── Title ──
  const title = type === 'sales' ? 'TAX INVOICE' : 'PURCHASE INVOICE';
  doc.setFont(headingFont, 'bold');
  doc.setFontSize(22);
  doc.setTextColor(primaryColor);
  doc.text(title, pageWidth / 2, y, { align: 'center' });
  y += 12;

  // ── Two‑column party & invoice details ──
  const isSales = type === 'sales';
  const partyName = isSales
    ? `${invoice.students?.first_name || ''} ${invoice.students?.last_name || ''}`.trim() || 'N/A'
    : invoice.vendors?.vendor_name || 'N/A';
  const partyGstin = isSales ? invoice.students?.gstin : invoice.vendors?.gstin;
  const partyAddress = isSales ? invoice.students?.billing_address : invoice.vendors?.address;
  const placeOfSupply = invoice.place_of_supply || '';
  const paymentTerms = invoice.payment_terms || 'Standard';
  const invNo = invoice.invoice_number || 'N/A';
  const invDate = invoice.invoice_date || '';
  const dueDate = invoice.due_date || '';
  const status = invoice.status || 'Draft';

  // Left column
  doc.setFont(headingFont, 'bold');
  doc.setFontSize(11);
  doc.setTextColor(primaryColor);
  doc.text(isSales ? 'Billed To:' : 'Vendor:', margin, y);
  doc.setFont(bodyFont, 'normal');
  doc.setTextColor('#333');
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
  doc.text(`Payment Terms: ${paymentTerms}`, margin, leftY);
  const leftBottom = leftY + 4;

  // Right column
  let rightY = y;
  doc.setFont(headingFont, 'bold');
  doc.setFontSize(11);
  doc.setTextColor(primaryColor);
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
  const rightBottom = rightY;

  y = Math.max(leftBottom, rightBottom) + 6;

  // ── Items Table ──
  const items = (type === 'sales' ? invoice.invoice_items : invoice.purchase_invoice_items) || [];
  let tableRows = [];
  if (items.length === 0) {
    tableRows.push(["", "No items found", "", "", "", "", "", "", "", ""]);
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
      return [idx + 1, desc, hsn, qty, unitPrice, taxable, cgst, sgst, igst, total];
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
  const grandTotal = totals.total + roundOff;

  // ── Table with theme-aware header color ──
  autoTable(doc, {
    startY: y,
    head: [['#', 'Description', 'HSN/SAC', 'Qty', 'Unit Price', 'Taxable', 'CGST', 'SGST', 'IGST', 'Total']],
    body: tableRows,
    theme: 'grid',
    styles: { fontSize: 8, cellPadding: 2, font: bodyFont },
    headStyles: { fillColor: primaryColor, textColor: '#FFFFFF', fontSize: 8, fontStyle: 'bold', font: headingFont },
    columnStyles: {
      0: { cellWidth: 10, halign: 'center' },
      1: { cellWidth: 38, halign: 'left' },
      2: { cellWidth: 18, halign: 'center' },
      3: { cellWidth: 10, halign: 'center' },
      4: { cellWidth: 20, halign: 'right' },
      5: { cellWidth: 18, halign: 'right' },
      6: { cellWidth: 18, halign: 'right' },
      7: { cellWidth: 18, halign: 'right' },
      8: { cellWidth: 18, halign: 'right' },
      9: { cellWidth: 18, halign: 'right' },
    },
    margin: { left: margin, right: margin },
    willDrawCell: (data) => {
      if ([4,5,6,7,8,9].includes(data.column.index) && typeof data.cell.raw === 'number') {
        data.cell.text = [];
      }
    },
    didDrawCell: (data) => {
      if ([4,5,6,7,8,9].includes(data.column.index) && typeof data.cell.raw === 'number') {
        const x = data.cell.x + 1.5;
        const yPos = data.cell.y + data.cell.height / 2 + 1.5;
        drawCurrency(doc, data.cell.raw, x, yPos, 8, 'left', '#333');
      }
    },
  });

  y = doc.lastAutoTable.finalY + 6;

  // ── Totals ──
  const colX = pageWidth - margin - 65;
  const rightEdge = pageWidth - margin - 6;
  doc.setFont(bodyFont, 'normal');
  doc.setFontSize(10);
  doc.setTextColor('#333');
  doc.text('Taxable Amount:', colX, y);
  drawCurrency(doc, totals.taxable, rightEdge, y, 10, 'right', '#333');
  y += 6;
  doc.text('CGST:', colX, y);
  drawCurrency(doc, totals.cgst, rightEdge, y, 10, 'right', '#333');
  y += 6;
  doc.text('SGST:', colX, y);
  drawCurrency(doc, totals.sgst, rightEdge, y, 10, 'right', '#333');
  y += 6;
  doc.text('IGST:', colX, y);
  drawCurrency(doc, totals.igst, rightEdge, y, 10, 'right', '#333');
  y += 6;
  if (roundOff !== 0) {
    doc.text('Round Off:', colX, y);
    drawCurrency(doc, roundOff, rightEdge, y, 10, 'right', '#333');
    y += 6;
  }
  doc.setFont(headingFont, 'bold');
  doc.setTextColor(primaryColor);
  doc.setFontSize(14);
  doc.text('Grand Total:', colX, y);
  drawCurrency(doc, grandTotal, rightEdge, y, 14, 'right', primaryColor);
  y += 10;

  // ── Reverse Charge Note ──
  if (invoice.reverse_charge) {
    doc.setFontSize(9);
    doc.setTextColor('#CC0000');
    doc.text('** Reverse Charge Applicable – Tax payable by recipient **', margin, y);
    y += 7;
  }

  // ── Amount in Words ──
  doc.setFont(bodyFont, 'normal');
  doc.setFontSize(10);
  doc.setTextColor('#333');
  const words = numberToWords(grandTotal);
  doc.text(`Amount in words: ${words}`, margin, y);
  y += 12;

  // ── Terms & Conditions ──
  doc.setDrawColor('#cccccc');
  doc.line(margin, y, pageWidth - margin, y);
  y += 6;
  const terms = [
    '1. Payment is due within 15 days from invoice date.',
    '2. Late payment will attract interest @18% p.a.',
    '3. Goods once sold will not be taken back.',
    '4. This is a system‑generated invoice, no signature required.',
    '5. Any dispute shall be subject to local jurisdiction.',
  ];
  doc.setFontSize(7.5);
  doc.setTextColor('#555');
  terms.forEach((line) => {
    doc.text(line, margin, y);
    y += 4.5;
  });

  return doc;
}