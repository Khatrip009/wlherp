// src/utils/salarySlipPdf.js
import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";

// ─── Helpers (unchanged) ──────────────────────────────────
function createRupeeSymbolImage() {
  const canvas = document.createElement("canvas");
  canvas.width = 30;
  canvas.height = 30;
  const ctx = canvas.getContext("2d");
  ctx.font = "bold 24px sans-serif";
  ctx.fillStyle = "#000";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText("₹", 15, 15);
  return canvas.toDataURL("image/png");
}

let rupeeImage = null;
function getRupeeImage() {
  if (!rupeeImage) rupeeImage = createRupeeSymbolImage();
  return rupeeImage;
}

function drawCurrency(doc, amount, x, y, fontSize = 9, align = "left", color = "#333") {
  const img = getRupeeImage();
  doc.setFontSize(fontSize);
  doc.setTextColor(color);
  const amountText = amount.toLocaleString("en-IN", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  const imgSize = fontSize * 0.5;
  if (align === "left") {
    doc.addImage(img, "PNG", x, y - imgSize * 0.6, imgSize, imgSize);
    doc.text(amountText, x + imgSize + 1, y);
  } else {
    const textWidth = doc.getTextWidth(amountText);
    doc.addImage(img, "PNG", x - textWidth - imgSize - 1, y - imgSize * 0.6, imgSize, imgSize);
    doc.text(amountText, x - textWidth, y);
  }
}

function numberToWords(num) {
  const a = ["", "One", "Two", "Three", "Four", "Five", "Six", "Seven", "Eight", "Nine", "Ten",
    "Eleven", "Twelve", "Thirteen", "Fourteen", "Fifteen", "Sixteen", "Seventeen", "Eighteen", "Nineteen"];
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
    console.warn("Could not load image:", err);
    return null;
  }
}

// ─── Main PDF Generator (balanced A5 landscape) ───────────
export async function generateSalarySlipPDF(paymentData, options = {}) {
  const { org, branch, theme } = options;

  const companyName = org?.company_name || "ShreeVidhya Academy";
  const orgAddress = org?.address || "";
  const gstin = org?.gstin || "";
  const stateCode = org?.state_code || "";
  const placeOfSupply = org?.place_of_supply || "";
  const registrationType = org?.registration_type || "";
  const logoUrl = org?.logo_dark_url || org?.logo_light_url || null;

  const branchName = branch?.branch_name || "";
  const branchAddress = branch?.address || "";

  const primaryColor = theme?.primary_color || "#0D47A1";
  const fontBody = theme?.font_body || "helvetica";

  // A5 landscape: width 210, height 148
  const doc = new jsPDF({ unit: "mm", format: "a5", orientation: "landscape" });
  const pageWidth = doc.internal.pageSize.getWidth();   // 210
  const pageHeight = doc.internal.pageSize.getHeight(); // 148
  const margin = 12;

  let logoBase64 = null;
  if (logoUrl) {
    logoBase64 = await loadImageAsBase64(logoUrl);
  }

  // ── Header (comfortably spaced) ──
  let y = margin;

  const logoWidth = 28;
  const logoHeight = 10;
  if (logoBase64) {
    doc.addImage(logoBase64, "PNG", margin, y, logoWidth, logoHeight);
  }

  const textX = margin + (logoBase64 ? logoWidth + 3 : 0);
  const textY = y + 1;
  doc.setFont(fontBody, "bold");
  doc.setFontSize(13);
  doc.setTextColor(primaryColor);
  doc.text(companyName, textX, textY);

  doc.setFont(fontBody, "normal");
  doc.setFontSize(7);
  doc.setTextColor("#333");
  let detailY = textY + 4.5;

  // Org address
  if (orgAddress) {
    const addrLines = doc.splitTextToSize(orgAddress, pageWidth - textX - margin - 10);
    doc.text(addrLines, textX, detailY);
    detailY += addrLines.length * 3.5 + 1;
  }

  // Branch info
  if (branchName) {
    doc.setFont(fontBody, "bold");
    doc.setFontSize(7.5);
    doc.setTextColor(primaryColor);
    doc.text(`Branch: ${branchName}`, textX, detailY);
    detailY += 3.5;
    if (branchAddress) {
      doc.setFont(fontBody, "normal");
      doc.setFontSize(7);
      doc.setTextColor("#333");
      const brLines = doc.splitTextToSize(branchAddress, pageWidth - textX - margin - 10);
      doc.text(brLines, textX, detailY);
      detailY += brLines.length * 3.5 + 1;
    }
  }

  // GST / registration (on one line if possible)
  if (gstin || stateCode) {
    doc.setFont(fontBody, "normal");
    doc.setFontSize(7);
    let infoLine = "";
    if (gstin) infoLine += `GSTIN: ${gstin}`;
    if (stateCode) infoLine += `  |  State Code: ${stateCode}`;
    if (placeOfSupply) infoLine += `  |  Place of Supply: ${placeOfSupply}`;
    if (registrationType) infoLine += `  |  Reg: ${registrationType}`;
    doc.text(infoLine.trim(), textX, detailY);
    detailY += 3.5;
  }

  y = detailY + 2;
  doc.setDrawColor(primaryColor);
  doc.line(margin, y, pageWidth - margin, y);
  y += 5;

  // ── Title ──
  doc.setFont(fontBody, "bold");
  doc.setFontSize(16);
  doc.setTextColor(primaryColor);
  doc.text("SALARY SLIP", pageWidth / 2, y, { align: "center" });
  y += 10;

  // ── Two‑column info (nice readable size) ──
  const leftX = margin;
  const rightX = pageWidth - margin - 80;

  doc.setFont(fontBody, "bold");
  doc.setFontSize(9);
  doc.setTextColor(primaryColor);
  doc.text("Teacher Details", leftX, y);
  doc.text("Payment Details", rightX, y);

  doc.setFont(fontBody, "normal");
  doc.setFontSize(8);
  doc.setTextColor("#333");
  let lY = y + 5;
  doc.text(`Name: ${paymentData.teacher_name || "—"}`, leftX, lY);
  lY += 5;
  doc.text(`Emp Code: ${paymentData.employee_code || "—"}`, leftX, lY);

  let rY = y + 5;
  doc.text(`Date: ${paymentData.payment_date || "—"}`, rightX, rY);
  rY += 5;
  doc.text(`Mode: ${paymentData.payment_mode || "—"}`, rightX, rY);

  y = Math.max(lY, rY) + 5;

  // ── Salary table (comfortable) ──
  const gross = Number(paymentData.amount || 0);
  const tdsAmount = Number(paymentData.tds_amount || 0);
  const tdsPercent = paymentData.tds_percentage || 0;
  const net = Number(paymentData.net_amount || 0);

  const tableRows = [
    ["Gross Salary", gross],
    ["TDS Deduction", tdsAmount],
    ["TDS Percentage", `${tdsPercent}%`],
    ["Net Salary", net],
    ["Payment Mode", paymentData.payment_mode || "—"],
    ["Remarks", paymentData.remarks || "—"],
  ];

  autoTable(doc, {
    startY: y,
    head: [["Particulars", "Details"]],
    body: tableRows,
    theme: "grid",
    styles: { fontSize: 8, cellPadding: 2, halign: "left" },
    headStyles: { fillColor: primaryColor, textColor: "#FFFFFF", fontStyle: "bold", fontSize: 8 },
    columnStyles: {
      0: { cellWidth: 65 },
      1: { cellWidth: 85, halign: "right" },
    },
    margin: { left: margin, right: margin },
    willDrawCell: (data) => {
      if (data.column.index === 1 && typeof data.cell.raw === "number") {
        data.cell.text = [];
      }
    },
    didDrawCell: (data) => {
      if (data.column.index === 1 && typeof data.cell.raw === "number") {
        const x = data.cell.x + data.cell.width - 2;
        const yPos = data.cell.y + data.cell.height / 2 + 1.2;
        drawCurrency(doc, data.cell.raw, x, yPos, 8, "right", "#333");
      }
    },
  });

  const tableEndY = doc.lastAutoTable.finalY;

  // ── Amount in words (clear) ──
  const wordsY = tableEndY + 6;
  doc.setFont(fontBody, "italic");
  doc.setFontSize(8);
  doc.setTextColor("#555");
  const netWords = numberToWords(Math.round(net));
  doc.text(`In words: ${netWords} Only`, pageWidth / 2, wordsY, { align: "center" });

  // ── Signatures (bottom) ──
  const footerY = pageHeight - margin - 5;
  doc.setDrawColor("#ccc");
  doc.line(margin, footerY, margin + 42, footerY);
  doc.line(pageWidth - margin - 42, footerY, pageWidth - margin, footerY);
  doc.setFont(fontBody, "normal");
  doc.setFontSize(7);
  doc.setTextColor("#333");
  doc.text("Authorized Signatory", margin + 8, footerY + 4);
  doc.text("Employee", pageWidth - margin - 30, footerY + 4);

  doc.save(`Salary_Slip_${paymentData.employee_code || "Unknown"}_${paymentData.payment_date}.pdf`);
}