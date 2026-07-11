// src/utils/receiptPdf.js
import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";
import { supabase } from "../api/supabase";

/* ------------------------------------------------------------------ */
/*  Helpers                                                           */
/* ------------------------------------------------------------------ */

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

function createRupeeSymbolImage() {
  const canvas = document.createElement('canvas');
  canvas.width = 30;
  canvas.height = 30;
  const ctx = canvas.getContext('2d');
  ctx.font = 'bold 24px serif';
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

  const amountText = amount.toLocaleString('en-IN');
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

/* ------------------------------------------------------------------ */
/*  Main PDF Generator – A5 format                                   */
/* ------------------------------------------------------------------ */
export async function generateReceiptPdf(receipt) {
  // ---------- 1. Organisation ----------
  const { data: org } = await supabase
    .from("organization")
    .select("company_name, letterhead_url")
    .eq("id", 1)
    .single();

  const letterheadUrl = org?.letterhead_url || null;
  const academyName = org?.company_name || "ShreeVidhya Academy";

  // Load letterhead
  let letterheadBase64 = null;
  if (letterheadUrl) {
    try {
      letterheadBase64 = await loadImageAsBase64(letterheadUrl);
    } catch (err) {
      console.warn("Letterhead could not be loaded for receipt PDF", err);
    }
  }

  // ---------- 2. Student details ----------
  const studentId = receipt.students?.id;
  let mediumName = "", batchName = "", courseName = "";

  if (studentId) {
    const { data: s } = await supabase
      .from("students")
      .select("*, mediums(name)")
      .eq("id", studentId)
      .single();
    if (s) mediumName = s.mediums?.name || "";

    const { data: sb } = await supabase
      .from("student_batches")
      .select("batch_id, batches(batch_name, courses(course_name))")
      .eq("student_id", studentId)
      .eq("status", "active")
      .maybeSingle();
    if (sb) {
      batchName = sb.batches?.batch_name || "";
      courseName = sb.batches?.courses?.course_name || "";
    }
  }

  // ---------- 3. Fee data, tax, installments ----------
  const payment = receipt.fee_payments;
  let installments = [], totalFee = 0, paidSoFar = 0;
  let taxRateName = "", taxRateValue = 0, taxInclusive = true;
  let baseAmount = 0, taxAmount = 0, totalDisplay = 0;

  if (payment?.student_fee_id) {
    const { data: studentFee } = await supabase
      .from("student_fees")
      .select(`
        *,
        fee_structures!inner (
          fee_amount,
          tax_rate_id,
          tax_inclusive
        ),
        fee_installments(*)
      `)
      .eq("id", payment.student_fee_id)
      .single();

    if (studentFee) {
      totalFee = Number(studentFee.final_fee);
      // ONLY keep paid installments
      installments = (studentFee.fee_installments || []).filter(inst => inst.status === 'Paid');
      const feeStructure = studentFee.fee_structures;
      if (feeStructure) {
        taxInclusive = feeStructure.tax_inclusive !== undefined ? feeStructure.tax_inclusive : true;

        // Fetch tax rate explicitly using tax_rate_id
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
        .eq("student_fee_id", payment.student_fee_id);
      paidSoFar = allPayments?.reduce((sum, p) => sum + Number(p.amount), 0) || 0;
    }
  }

  const amount = Number(receipt.amount);
  const amountWords = numberToWords(amount) + " Only";
  const balance = totalFee - paidSoFar;

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

  // ─── PDF Setup (A5) ────────────────────────────────────────────
  const doc = new jsPDF({ unit: 'mm', format: 'a5' });
  const pageWidth = doc.internal.pageSize.getWidth();   // 148 mm
  const pageHeight = doc.internal.pageSize.getHeight(); // 210 mm

  // Letterhead on every page
  const addLetterhead = () => {
    if (letterheadBase64) {
      doc.addImage(letterheadBase64, "PNG", 0, 0, pageWidth, pageHeight);
    }
  };
  addLetterhead();

  const margin = 12;
  const topMargin = 45;
  let y = topMargin;

  // ========== TITLE ==========
  doc.setFont("helvetica", "bold");
  doc.setFontSize(16);
  doc.setTextColor("#0D47A1");
  doc.text("FEE RECEIPT", pageWidth / 2, y, { align: "center" });
  y += 10;

  // ========== TWO‑COLUMN INFO ==========
  const leftColX = margin;
  const rightColX = pageWidth - margin - 55;
  const studentName = `${receipt.students?.first_name || ""} ${receipt.students?.last_name || ""}`.trim();

  doc.setFont("helvetica", "bold");
  doc.setFontSize(10);
  doc.setTextColor("#0D47A1");
  doc.text("Student Details", leftColX, y);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.setTextColor("#333");
  doc.text(`Student: ${studentName}`, leftColX, y + 5);
  doc.text(`Admission No: ${receipt.students?.admission_no || "-"}`, leftColX, y + 10);
  if (courseName) doc.text(`Course: ${courseName}`, leftColX, y + 15);

  doc.setFont("helvetica", "bold");
  doc.setFontSize(10);
  doc.setTextColor("#0D47A1");
  doc.text("Receipt Details", rightColX, y);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.setTextColor("#333");
  doc.text(`Receipt No: ${receipt.receipt_no}`, rightColX, y + 5);
  doc.text(`Date: ${receipt.receipt_date}`, rightColX, y + 10);

  const studentBlockLines = courseName ? 3 : 2;
  y += 8 + studentBlockLines * 5;

  // ========== ITEM TABLE (with tax rows) ==========
  const itemBody = [];
  itemBody.push({ sr: "1", desc: "Fee Payment", amount: amount });
  if (taxRateValue > 0) {
    itemBody.push({ sr: "", desc: `Base Amount (${taxRateName} ${taxRateValue}%)`, amount: baseAmount });
    itemBody.push({ sr: "", desc: "Tax Amount", amount: taxAmount });
  }

  const tableRows = itemBody.map(item => [item.sr, item.desc, item.amount.toLocaleString('en-IN')]);

  autoTable(doc, {
    startY: y,
    head: [["Sr. No.", "Description", "Amount"]],
    body: tableRows,
    theme: "grid",
    styles: { fontSize: 9, cellPadding: 3 },
    headStyles: { fillColor: "#0D47A1", textColor: "#FFFFFF" },
    columnStyles: {
      0: { cellWidth: 12, halign: 'center' },
      1: { cellWidth: 'auto' },
      2: { cellWidth: 35, halign: 'right' }
    },
    margin: { left: margin, right: margin },
    didDrawCell: (data) => {
      if (data.column.index === 2 && data.cell.raw) {
        const raw = data.cell.raw;
        const num = parseFloat(raw.replace(/,/g, ''));
        if (!isNaN(num)) {
          const cell = data.cell;
          if (cell.text) cell.text = [];
          const x = cell.x + 2;
          const yPos = cell.y + cell.height / 2 + 1.5;
          doc.setFillColor(255, 255, 255);
          doc.rect(cell.x, cell.y, cell.width, cell.height, 'F');
          drawCurrency(doc, num, x, yPos, 9, 'left', '#333');
        }
      }
    }
  });
  y = doc.lastAutoTable.finalY + 8;

  // ========== TOTALS & PAYMENT INFO ==========
  doc.setFillColor(245, 245, 245);
  doc.rect(margin, y, pageWidth - 2 * margin, 30, 'F');

  const totalX = margin + 4;
  doc.setFont("helvetica", "bold");
  doc.setFontSize(12);
  doc.setTextColor("#0D47A1");
  doc.text("Total Amount Paid:", totalX, y + 10);
  drawCurrency(doc, totalDisplay, totalX + 52, y + 10, 12, 'left', '#0D47A1');

  doc.setFont("helvetica", "normal");
  doc.setFontSize(7);
  doc.setTextColor("#555");
  doc.text(`In Words: ${amountWords}`, totalX, y + 19);

  // Move payment details to the far right
  const detailsX = pageWidth - margin - 45;   // 10mm more to the right
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);
  doc.setTextColor("#333");
  let detailY = y + 8;
  doc.text(`Mode: ${payment?.payment_mode || "N/A"}`, detailsX, detailY);
  detailY += 4;
  doc.text(`Txn No: ${payment?.transaction_no || "-"}`, detailsX, detailY);
  if (payment?.remarks) {
    detailY += 4;
    doc.text(`Remarks: ${payment.remarks}`, detailsX, detailY);
  }

  y += 36;   // increased to account for taller rectangle

  // ========== SIGNATURES ==========
  doc.setFontSize(9);
  doc.setTextColor("#333");
  doc.text("Authorized Signatory", margin, y);
  doc.line(margin, y + 5, margin + 35, y + 5);
  doc.text("Parent / Guardian", pageWidth - margin - 35, y);
  doc.line(pageWidth - margin - 35, y + 5, pageWidth - margin, y + 5);
  y += 14;

  // ========== PAGE 2 – PAID INSTALLMENTS ONLY (if any) ==========
  if (installments.length > 0) {
    doc.addPage();
    addLetterhead();
    y = topMargin;

    doc.setFont("helvetica", "bold");
    doc.setFontSize(12);
    doc.setTextColor("#0D47A1");
    doc.text("Paid Installments", margin, y);   // renamed
    y += 6;

    const installmentBody = installments.map((inst, i) => [
      i + 1,
      inst.due_date || "-",
      Number(inst.amount).toLocaleString('en-IN'),
      inst.status || "Paid",
    ]);

    autoTable(doc, {
      startY: y,
      head: [["Sr.", "Due Date", "Amount", "Status"]],
      body: installmentBody,
      theme: "striped",
      styles: { fontSize: 8, cellPadding: 2.5 },
      headStyles: { fillColor: "#0D47A1", textColor: "#FFFFFF" },
      columnStyles: {
        0: { cellWidth: 10, halign: 'center' },
        1: { cellWidth: 30 },
        2: { cellWidth: 35, halign: 'right' },
        3: { cellWidth: 25 },
      },
      margin: { left: margin, right: margin },
      didDrawCell: (data) => {
        if (data.column.index === 2 && data.cell.raw) {
          const raw = data.cell.raw;
          const num = parseFloat(raw.replace(/,/g, ''));
          if (!isNaN(num)) {
            const cell = data.cell;
            if (cell.text) cell.text = [];
            doc.setFillColor(255, 255, 255);
            doc.rect(cell.x, cell.y, cell.width, cell.height, 'F');
            drawCurrency(doc, num, cell.x + 2, cell.y + cell.height / 2 + 1.5, 8, 'left', '#333');
          }
        }
      }
    });
    y = doc.lastAutoTable.finalY + 8;

    // Fee Summary (always show, even if only paid installments)
    doc.setFont("helvetica", "bold");
    doc.setFontSize(12);
    doc.text("Fee Summary", margin, y);
    y += 6;

    const summaryBody = [
      ["Total Fee", totalFee.toLocaleString('en-IN')],
      ["Paid Till Date", paidSoFar.toLocaleString('en-IN')],
      ["Balance", balance.toLocaleString('en-IN')],
    ];

    autoTable(doc, {
      startY: y,
      head: [["Description", "Amount"]],
      body: summaryBody,
      theme: "grid",
      styles: { fontSize: 9, cellPadding: 3 },
      headStyles: { fillColor: "#0D47A1", textColor: "#FFFFFF" },
      columnStyles: {
        0: { cellWidth: 50 },
        1: { cellWidth: 40, halign: 'right' }
      },
      margin: { left: margin, right: margin },
      didDrawCell: (data) => {
        if (data.column.index === 1 && data.cell.raw) {
          const raw = data.cell.raw;
          const num = parseFloat(raw.replace(/,/g, ''));
          if (!isNaN(num)) {
            const cell = data.cell;
            if (cell.text) cell.text = [];
            doc.setFillColor(255, 255, 255);
            doc.rect(cell.x, cell.y, cell.width, cell.height, 'F');
            drawCurrency(doc, num, cell.x + 2, cell.y + cell.height / 2 + 1.5, 9, 'left', '#333');
          }
        }
      }
    });
  }

  // Save
  doc.save(`Receipt_${receipt.receipt_no}.pdf`);
}