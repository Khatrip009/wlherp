// src/utils/profitLossPdf.js
import { jsPDF } from "jspdf";
import { supabase } from "../api/supabase";

// ─── Rupee symbol helper (canvas‑generated image) ────────────
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

// ─── Number to words ───────────────────────────────────────────
function numberToWords(num) {
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

// ─── Load image as base64 ─────────────────────────────────────
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
  } catch {
    return null;
  }
}

// ─── Main PDF generator ───────────────────────────────────────
export async function generateProfitLossPdf({
  groups,
  summary,
  startDate,
  endDate,
  periodLabel,
  orgId,
}) {
  // 1. Fetch organization
  let org = null;
  try {
    const { data, error } = await supabase
      .from("organization")
      .select("*")
      .eq("id", orgId)
      .single();
    if (!error) org = data;
  } catch (e) { /* ignore */ }
  const orgName = org?.company_name || "Your Academy";

  const doc = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4" });
  const pageWidth = doc.internal.pageSize.getWidth();   // 297
  const pageHeight = doc.internal.pageSize.getHeight(); // 210
  const margin = 14;
  const accentColor = "#000000";

  // ── Load logo ─────────────────────────────────────────────
  let logoBase64 = null;
  if (org?.logo_dark_url) {
    logoBase64 = await loadImageAsBase64(org.logo_dark_url);
  }

  // ── HEADER (same as invoice) ──────────────────────────────
  let y = 10;
  const logoWidth = 36;
  const logoHeight = 14;
  if (logoBase64) {
    doc.addImage(logoBase64, 'PNG', margin, y, logoWidth, logoHeight);
  }

  const textX = margin + (logoBase64 ? logoWidth + 6 : 0);
  const textY = y + 2;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(16);
  doc.setTextColor(accentColor);
  doc.text(orgName, textX, textY);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.setTextColor('#000');
  let detailY = textY + 5;

  if (org?.address) {
    const addrLines = doc.splitTextToSize(org.address, pageWidth - textX - margin - 10);
    doc.text(addrLines, textX, detailY);
    detailY += addrLines.length * 4 + 1;
  }
  if (org?.gstin) {
    doc.text(`GSTIN: ${org.gstin}`, textX, detailY);
    detailY += 4.5;
  }
  if (org?.phone) {
    doc.text(`Phone: ${org.phone}`, textX, detailY);
    detailY += 4.5;
  }
  if (org?.email) {
    doc.text(`Email: ${org.email}`, textX, detailY);
    detailY += 4.5;
  }
  if (org?.website) {
    doc.text(`Web: ${org.website}`, textX, detailY);
  }

  const headerHeight = Math.max(logoHeight + 6, detailY - textY + 8);
  y += headerHeight + 2;
  doc.setDrawColor('#000');
  doc.line(margin, y, pageWidth - margin, y);
  y += 6;

  // ── Title ─────────────────────────────────────────────────
  doc.setFont('times', 'bold');
  doc.setFontSize(22);
  doc.text("Profit & Loss Statement", pageWidth / 2, y, { align: "center" });
  y += 10;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10);
  doc.text(`Period: ${periodLabel}`, pageWidth / 2, y, { align: "center" });
  y += 8;

  // ── KPI Cards (4 small boxes) – using rupee image, not text ──
  const cardW = 58, cardH = 14, cardGap = 10;
  const totalCardsWidth = cardW * 4 + cardGap * 3;
  const cardsXStart = (pageWidth - totalCardsWidth) / 2;
  const cardY = y;

  // Helper to draw a card with label and a numeric value (rupee image)
  function drawCard(x, cy, label, valueNum) {
    doc.setDrawColor('#000');
    doc.rect(x, cy, cardW, cardH);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    doc.setTextColor('#000');
    doc.text(label, x + 2, cy + 4);
    // Draw the amount with rupee symbol via image
    drawCurrency(doc, valueNum, x + cardW - 2, cy + 11, 12, 'right', '#000');
  }

  drawCard(cardsXStart, cardY, "Total Income", summary.totalIncome);
  drawCard(cardsXStart + cardW + cardGap, cardY, "Total Expenses", summary.totalExpense);
  const netLabel = summary.profit >= 0 ? "Net Profit" : "Net Loss";
  drawCard(cardsXStart + 2 * (cardW + cardGap), cardY, netLabel, Math.abs(summary.profit));
  const marginPercent = summary.totalIncome > 0
    ? ((summary.profit / summary.totalIncome) * 100).toFixed(1) + '%'
    : '0.0%';
  // Margin % is not a currency, so just text
  doc.setDrawColor('#000');
  doc.rect(cardsXStart + 3 * (cardW + cardGap), cardY, cardW, cardH);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.setTextColor('#000');
  doc.text("Margin %", cardsXStart + 3 * (cardW + cardGap) + 2, cardY + 4);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(12);
  doc.text(marginPercent, cardsXStart + 3 * (cardW + cardGap) + 2, cardY + 11);

  y = cardY + cardH + 10;

  // ── Two‑Panel Layout ───────────────────────────────────────
  const panelWidth = (pageWidth - margin * 2 - 10) / 2;   // 10mm gap
  const leftX = margin;
  const rightX = margin + panelWidth + 10;

  const incomeGroups = Object.entries(groups).filter(([name]) => name.toLowerCase().includes("income"));
  const expenseGroups = Object.entries(groups).filter(([name]) => name.toLowerCase().includes("expense"));

  const drawPanel = (x, startY, title, groupsList, total, isIncome) => {
    const headerColor = isIncome ? '#E8F0FE' : '#FEE2E2';
    let currentY = startY;

    doc.setFillColor(headerColor);
    doc.rect(x, currentY, panelWidth, 8, 'F');
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(10);
    doc.setTextColor('#000');
    doc.text(title, x + 4, currentY + 5.5);
    currentY += 10;

    if (groupsList.length === 0) {
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(9);
      doc.text("No entries", x + 4, currentY);
      currentY += 7;
    } else {
      for (const [groupName, group] of groupsList) {
        if (group.items.length === 0 && group.total === 0) continue;

        doc.setFont('helvetica', 'bold');
        doc.setFontSize(9);
        doc.text(groupName, x + 4, currentY);
        currentY += 6;

        for (const item of group.items) {
          const name = item.account_name || 'N/A';
          const bal = item.balance || 0;
          doc.setFont('helvetica', 'normal');
          doc.setFontSize(8.5);
          const shortName = name.length > 25 ? name.substring(0, 25) + '…' : name;
          doc.text(shortName, x + 6, currentY);
          drawCurrency(doc, bal, x + panelWidth - 4, currentY, 8.5, 'right', '#000');
          currentY += 5.5;
        }

        doc.setFont('helvetica', 'bold');
        doc.setFontSize(9);
        doc.text(`Total ${groupName}`, x + 4, currentY);
        drawCurrency(doc, group.total, x + panelWidth - 4, currentY, 9, 'right', '#000');
        currentY += 7;
      }
    }

    doc.setDrawColor('#000');
    doc.line(x + 2, currentY, x + panelWidth - 2, currentY);
    currentY += 4;

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(11);
    doc.text("Total", x + 4, currentY);
    drawCurrency(doc, total, x + panelWidth - 4, currentY, 11, 'right', '#000');
    currentY += 8;

    return currentY;
  };

  const leftEndY = drawPanel(leftX, y, "INCOME (CREDIT)", incomeGroups, summary.totalIncome, true);
  const rightEndY = drawPanel(rightX, y, "EXPENSES (DEBIT)", expenseGroups, summary.totalExpense, false);

  y = Math.max(leftEndY, rightEndY) + 10;

  // ── Net Profit / Loss ────────────────────────────────────
  doc.setDrawColor('#000');
  doc.line(margin, y, pageWidth - margin, y);
  y += 6;
  const netLabelText = summary.profit >= 0 ? "Net Profit" : "Net Loss";
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(14);
  doc.setTextColor('#000');
  doc.text(netLabelText, margin, y);
  drawCurrency(doc, Math.abs(summary.profit), pageWidth - margin, y, 14, 'right', '#000');
  y += 10;

  // Amount in words
  const netWords = numberToWords(Math.abs(summary.profit));
  const wordLine = (summary.profit >= 0 ? "Net Profit in words: " : "Net Loss in words: ") + netWords;
  doc.setFont('helvetica', 'italic');
  doc.setFontSize(9);
  doc.text(wordLine, pageWidth / 2, y, { align: "center" });

  // ── Footer ────────────────────────────────────────────────
  const footerY = pageHeight - 8;
  doc.setFontSize(7);
  doc.setTextColor('#000');
  doc.text(`Generated on ${new Date().toLocaleDateString()}`, margin, footerY);
  doc.text(`© ${orgName}`, pageWidth / 2, footerY, { align: "center" });
  doc.text("Page 1 of 1", pageWidth - margin, footerY, { align: "right" });

  doc.save(`Profit_Loss_${periodLabel.replace(/\s+/g, "_")}.pdf`);
}