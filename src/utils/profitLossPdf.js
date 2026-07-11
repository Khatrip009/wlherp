// src/utils/profitLossPdf.js
import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";
import { supabase } from "../api/supabase";

// ─── HELPERS ────────────────────────────────────────────────────────────────

const formatCurrency = (amount) => `Rs.${amount.toLocaleString("en-IN")}`;

function numberToWords(num) {
  if (num === 0) return "Zero";
  const a = [
    "", "One", "Two", "Three", "Four", "Five", "Six", "Seven", "Eight", "Nine",
    "Ten", "Eleven", "Twelve", "Thirteen", "Fourteen", "Fifteen", "Sixteen",
    "Seventeen", "Eighteen", "Nineteen",
  ];
  const b = ["", "", "Twenty", "Thirty", "Forty", "Fifty", "Sixty", "Seventy", "Eighty", "Ninety"];
  const getWords = (n) => {
    if (n < 20) return a[n];
    if (n < 100) return b[Math.floor(n / 10)] + (n % 10 ? " " + a[n % 10] : "");
    if (n < 1000) return a[Math.floor(n / 100)] + " Hundred" + (n % 100 ? " and " + getWords(n % 100) : "");
    if (n < 100000) return getWords(Math.floor(n / 1000)) + " Thousand" + (n % 1000 ? " " + getWords(n % 1000) : "");
    if (n < 10000000) return getWords(Math.floor(n / 100000)) + " Lakh" + (n % 100000 ? " " + getWords(n % 100000) : "");
    return getWords(Math.floor(n / 10000000)) + " Crore" + (n % 10000000 ? " " + getWords(n % 10000000) : "");
  };
  const integerPart = Math.abs(Math.round(num));
  const paise = Math.round((Math.abs(num) - integerPart) * 100);
  let word = getWords(integerPart);
  if (paise > 0) word += " and " + getWords(paise) + " Paise";
  if (num < 0) word = "Minus " + word;
  return word + " Only";
}

async function fetchDetailedIncomes(startDate, endDate) {
  const { data, error } = await supabase
    .from("income")
    .select("income_date, category, description, payment_mode, amount")
    .gte("income_date", startDate)
    .lte("income_date", endDate)
    .order("income_date");
  if (error) throw error;
  return data || [];
}

async function fetchDetailedExpenses(startDate, endDate) {
  const { data, error } = await supabase
    .from("expenses")
    .select("expense_date, category, description, bill_number, payment_mode, amount")
    .gte("expense_date", startDate)
    .lte("expense_date", endDate)
    .order("expense_date");
  if (error) throw error;
  return data || [];
}

function groupByMonth(data, dateField, amountField) {
  const months = {};
  data.forEach(row => {
    const date = new Date(row[dateField]);
    const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
    if (!months[key]) months[key] = 0;
    months[key] += Number(row[amountField]);
  });
  return Object.entries(months).sort().map(([label, total]) => ({ label, total }));
}

// ─── CHART FUNCTIONS (scaled for A4 portrait) ─────────────────────────────

function drawMonthlyChart(doc, startY, incomes, expenses) {
  const pageWidth = doc.internal.pageSize.getWidth();
  const margin = 20;
  const chartWidth = pageWidth - 2 * margin;
  const chartHeight = 70;
  const x = margin;
  const y = startY;
  const maxMonths = Math.max(incomes.length, expenses.length, 1);
  const colWidth = Math.min((chartWidth / maxMonths) - 4, 22);
  if (colWidth < 6) return startY + 10;

  const allMonths = [...new Set([...incomes.map(i => i.label), ...expenses.map(e => e.label)])].sort();
  const maxVal = Math.max(
    ...allMonths.map(m => {
      const inc = incomes.find(i => i.label === m)?.total || 0;
      const exp = expenses.find(e => e.label === m)?.total || 0;
      return Math.max(inc, exp);
    }),
    1
  );

  doc.setDrawColor(200);
  doc.line(x, y + chartHeight, x + chartWidth, y + chartHeight);
  doc.line(x, y, x, y + chartHeight);

  let colX = x + 4;
  allMonths.forEach(month => {
    const inc = incomes.find(i => i.label === month)?.total || 0;
    const exp = expenses.find(e => e.label === month)?.total || 0;
    const incHeight = (inc / maxVal) * chartHeight;
    const expHeight = (exp / maxVal) * chartHeight;

    doc.setFillColor("#16a34a");
    doc.rect(colX, y + chartHeight - incHeight, colWidth / 2 - 1, incHeight, "F");
    doc.setFillColor("#dc2626");
    doc.rect(colX + colWidth / 2, y + chartHeight - expHeight, colWidth / 2 - 1, expHeight, "F");

    doc.setFontSize(6);
    doc.setTextColor("#666");
    doc.text(month.substring(5), colX + colWidth / 2, y + chartHeight + 8, { align: "center" });
    colX += colWidth + 3;
  });

  // legend
  doc.setFillColor("#16a34a");
  doc.rect(x + 10, y - 10, 8, 6, "F");
  doc.setFontSize(8);
  doc.setTextColor("#333");
  doc.text("Income", x + 20, y - 5);
  doc.setFillColor("#dc2626");
  doc.rect(x + 50, y - 10, 8, 6, "F");
  doc.text("Expense", x + 60, y - 5);

  return y + chartHeight + 18;
}

function drawPieChart(doc, cx, cy, radius, data, colors) {
  const total = data.reduce((sum, d) => sum + d.value, 0);
  if (total === 0) return;
  let angleStart = 0;
  data.forEach((item, i) => {
    const sliceAngle = (item.value / total) * 2 * Math.PI;
    if (sliceAngle <= 0) return;
    doc.setFillColor(colors[i % colors.length]);
    const steps = Math.max(Math.floor(sliceAngle * 20), 2);
    const points = [{ x: cx, y: cy }];
    for (let s = 0; s <= steps; s++) {
      const a = angleStart + (s / steps) * sliceAngle;
      points.push({ x: cx + radius * Math.cos(a), y: cy + radius * Math.sin(a) });
    }
    doc.moveTo(points[0].x, points[0].y);
    for (let p = 1; p < points.length; p++) {
      doc.lineTo(points[p].x, points[p].y);
    }
    doc.lineTo(points[0].x, points[0].y);
    doc.fill();
    angleStart += sliceAngle;
  });
}

// ─── MAIN FUNCTION (A4 PORTRAIT) ─────────────────────────────────────────

export async function generateProfitLossPdf(summary, startDate, endDate, periodLabel) {
  // Fetch organisation (for letterhead)
  const { data: org } = await supabase
    .from("organization")
    .select("company_name, letterhead_url")
    .eq("id", 1)
    .single();

  const orgName = org?.company_name || "ShreeVidhya Academy";
  const letterheadUrl = org?.letterhead_url || null;

  // Load letterhead as base64
  let letterheadBase64 = null;
  if (letterheadUrl) {
    try {
      const response = await fetch(letterheadUrl);
      const blob = await response.blob();
      letterheadBase64 = await new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onloadend = () => resolve(reader.result);
        reader.onerror = reject;
        reader.readAsDataURL(blob);
      });
    } catch (e) { /* ignore */ }
  }

  const incomes = await fetchDetailedIncomes(startDate, endDate);
  const expenses = await fetchDetailedExpenses(startDate, endDate);

  // A4 Portrait
  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
  const pageWidth = doc.internal.pageSize.getWidth();   // 210 mm
  const pageHeight = doc.internal.pageSize.getHeight(); // 297 mm

  // Full‑page letterhead on every page
  const addLetterhead = () => {
    if (letterheadBase64) {
      doc.addImage(letterheadBase64, "PNG", 0, 0, pageWidth, pageHeight);
    }
  };
  addLetterhead();

  const topMargin = 85;   // consistent with other A4 reports
  let y = topMargin;

  // ── Title ──
  doc.setFont("times", "bold");
  doc.setFontSize(24);
  doc.setTextColor("#0D47A1");
  doc.text("Profit & Loss Statement", pageWidth / 2, y, { align: "center" });
  y += 8;
  doc.setFont("helvetica", "normal");
  doc.setFontSize(12);
  doc.setTextColor("#4B5563");
  doc.text(`Period: ${periodLabel}`, pageWidth / 2, y, { align: "center" });
  y += 14;

  // ── KPI Cards (two rows of two, fitting portrait width) ──
  const cardWidth = 88;
  const cardHeight = 26;
  const cardGap = 10;
  const cardsX1 = (pageWidth - 2 * cardWidth - cardGap) / 2;
  const cardsX2 = cardsX1 + cardWidth + cardGap;
  const cardY1 = y;

  function drawKpiCard(x, y, label, value, valueColor = "#0D47A1") {
    doc.setFillColor("#F0F7FF");
    doc.roundedRect(x, y, cardWidth, cardHeight, 3, 3, "F");
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
    doc.setTextColor("#4B5563");
    doc.text(label, x + 4, y + 10);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(14);
    doc.setTextColor(valueColor);
    doc.text(value, x + 4, y + 22);
  }

  drawKpiCard(cardsX1, cardY1, "Total Income", formatCurrency(summary.totalIncome));
  drawKpiCard(cardsX2, cardY1, "Total Expenses", formatCurrency(summary.totalExpense));

  const netText = summary.profit >= 0 ? formatCurrency(summary.profit) : `- ${formatCurrency(Math.abs(summary.profit))}`;
  const netColor = summary.profit >= 0 ? "#16a34a" : "#dc2626";
  drawKpiCard(cardsX1, cardY1 + cardHeight + 6, "Net P&L", netText, netColor);

  const marginPercent = summary.totalIncome > 0 ? ((summary.profit / summary.totalIncome) * 100).toFixed(1) : "0.0";
  drawKpiCard(cardsX2, cardY1 + cardHeight + 6, "Margin %", `${marginPercent}%`);

  y = cardY1 + 2 * cardHeight + 18;

  // Net in words
  const netWords = numberToWords(Math.abs(summary.profit));
  const wordLabel = summary.profit >= 0
    ? `Net Profit in words: ${netWords}`
    : `Net Loss in words: ${netWords}`;
  doc.setFont("helvetica", "italic");
  doc.setFontSize(10);
  doc.setTextColor("#4B5563");
  doc.text(wordLabel, pageWidth / 2, y, { align: "center" });
  y += 14;

  // ── Expenses Table (stacked, full width) ──
  doc.setFont("helvetica", "bold");
  doc.setFontSize(14);
  doc.setTextColor("#0D47A1");
  doc.text("Expenses Breakdown", 14, y);
  y += 6;

  autoTable(doc, {
    startY: y,
    margin: { left: 14, right: 14 },
    head: [["Date", "Category", "Bill No", "Mode", "Amount"]],
    body: expenses.map(row => [
      row.expense_date,
      row.category,
      row.bill_number || "",
      row.payment_mode || "",
      formatCurrency(row.amount),
    ]),
    theme: "grid",
    headStyles: { fillColor: "#dc2626", textColor: "#FFFFFF", fontStyle: "bold", fontSize: 8 },
    bodyStyles: { fontSize: 9, textColor: "#1F2937" },
    alternateRowStyles: { fillColor: "#FEF2F2" },
    didDrawPage: addLetterhead,   // letterhead on any overflow page
  });

  y = doc.lastAutoTable.finalY + 8;

  // Expenses total
  doc.setFont("helvetica", "bold");
  doc.setFontSize(10);
  doc.setTextColor("#0D47A1");
  doc.text("Total Expenses:", 14, y);
  doc.text(formatCurrency(summary.totalExpense), 50, y);
  y += 12;

  // ── Income Table (stacked) ──
  // Check if enough space; if not, new page
  if (y > pageHeight - 60) {
    doc.addPage();
    addLetterhead();
    y = topMargin;
  }

  doc.setFont("helvetica", "bold");
  doc.setFontSize(14);
  doc.setTextColor("#0D47A1");
  doc.text("Income Breakdown", 14, y);
  y += 6;

  autoTable(doc, {
    startY: y,
    margin: { left: 14, right: 14 },
    head: [["Date", "Category", "Mode", "Amount"]],
    body: incomes.map(row => [
      row.income_date,
      row.category,
      row.payment_mode || "",
      formatCurrency(row.amount),
    ]),
    theme: "grid",
    headStyles: { fillColor: "#16a34a", textColor: "#FFFFFF", fontStyle: "bold", fontSize: 8 },
    bodyStyles: { fontSize: 9, textColor: "#1F2937" },
    alternateRowStyles: { fillColor: "#F0FDF4" },
    didDrawPage: addLetterhead,
  });

  y = doc.lastAutoTable.finalY + 8;

  // Income total
  doc.setFont("helvetica", "bold");
  doc.setFontSize(10);
  doc.setTextColor("#0D47A1");
  doc.text("Total Income:", 14, y);
  doc.text(formatCurrency(summary.totalIncome), 50, y);
  y += 15;

  // ── CHARTS (page 2) ──
  doc.addPage();
  addLetterhead();
  let chartY = topMargin;

  // Monthly trend
  const monthlyIncomes = groupByMonth(incomes, 'income_date', 'amount');
  const monthlyExpenses = groupByMonth(expenses, 'expense_date', 'amount');
  doc.setFont("times", "bold");
  doc.setFontSize(16);
  doc.setTextColor("#0D47A1");
  doc.text("Monthly Income vs Expenses", pageWidth / 2, chartY, { align: "center" });
  chartY += 8;
  chartY = drawMonthlyChart(doc, chartY + 5, monthlyIncomes, monthlyExpenses);

  // Category pies (if space, else new page)
  const incomeCategoryTotals = {};
  incomes.forEach(r => {
    const cat = r.category || "Uncategorized";
    incomeCategoryTotals[cat] = (incomeCategoryTotals[cat] || 0) + Number(r.amount);
  });
  const expenseCategoryTotals = {};
  expenses.forEach(r => {
    const cat = r.category || "Uncategorized";
    expenseCategoryTotals[cat] = (expenseCategoryTotals[cat] || 0) + Number(r.amount);
  });

  const incData = Object.entries(incomeCategoryTotals).map(([label, value]) => ({ label, value }));
  const expData = Object.entries(expenseCategoryTotals).map(([label, value]) => ({ label, value }));
  const pieColors = ["#0D47A1", "#1565C0", "#1976D2", "#1E88E5", "#42A5F5", "#64B5F6", "#90CAF9", "#BBDEFB"];

  if (incData.length > 0 || expData.length > 0) {
    if (chartY + 80 > pageHeight) {
      doc.addPage();
      addLetterhead();
      chartY = topMargin;
    }
    doc.setFont("times", "bold");
    doc.setFontSize(15);
    doc.setTextColor("#0D47A1");
    doc.text("Category Distribution", pageWidth / 2, chartY, { align: "center" });
    chartY += 10;

    const pieRadius = 24;
    const pieCY = chartY + 10;

    // Income pie (left)
    if (incData.length > 0) {
      doc.setFont("helvetica", "bold");
      doc.setFontSize(10);
      doc.setTextColor("#16a34a");
      doc.text("Income Categories", 20, pieCY - 4);
      drawPieChart(doc, 55, pieCY + 15, pieRadius, incData, pieColors);
      let legendX = 90;
      let legendY = pieCY;
      incData.forEach((item, i) => {
        if (legendY > pageHeight - 20) return;
        doc.setFillColor(pieColors[i % pieColors.length]);
        doc.rect(legendX, legendY, 6, 6, "F");
        doc.setFont("helvetica", "normal");
        doc.setFontSize(8);
        doc.setTextColor("#333");
        doc.text(`${item.label} (${formatCurrency(item.value)})`, legendX + 8, legendY + 5);
        legendY += 8;
      });
    }

    // Expense pie (right)
    if (expData.length > 0) {
      const expCX = pageWidth - 55;
      doc.setFont("helvetica", "bold");
      doc.setFontSize(10);
      doc.setTextColor("#dc2626");
      doc.text("Expense Categories", pageWidth - 40 - 60, pieCY - 4);
      drawPieChart(doc, expCX, pieCY + 15, pieRadius, expData, pieColors);
      let legendX = pageWidth - 45;
      let legendY = pieCY;
      expData.forEach((item, i) => {
        if (legendY > pageHeight - 20) return;
        doc.setFillColor(pieColors[i % pieColors.length]);
        doc.rect(legendX, legendY, 6, 6, "F");
        doc.setFont("helvetica", "normal");
        doc.setFontSize(8);
        doc.setTextColor("#333");
        doc.text(`${item.label} (${formatCurrency(item.value)})`, legendX + 8, legendY + 5);
        legendY += 8;
      });
    }

    chartY = pieCY + 40 + Math.max(
      incData.length * 8,
      expData.length * 8
    );
  }

  // ── Audit Notes ──
  if (chartY > pageHeight - 70) {
    doc.addPage();
    addLetterhead();
    chartY = topMargin;
  }

  const auditY = chartY + 8;
  doc.setFont("helvetica", "bold");
  doc.setFontSize(12);
  doc.setTextColor("#0D47A1");
  doc.text("Audit Notes & Accounting Policies", pageWidth / 2, auditY, { align: "center" });
  const notes = [
    "1. All amounts are in Indian Rupees (INR) and have been rounded to the nearest whole number.",
    "2. This statement is prepared on a cash basis; income and expenses are recorded when received or paid.",
    "3. All entries are supported by valid invoices, receipts, and payment vouchers.",
    "4. Figures are subject to verification by the management and may be adjusted upon final audit.",
    "5. This report does not include any contingent liabilities or provisions.",
    "6. The institute follows the generally accepted accounting principles applicable to educational institutions.",
    "7. Any discrepancies must be reported to the administration within 7 days of receipt of this report.",
  ];
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.setTextColor("#4B5563");
  let noteY = auditY + 12;
  notes.forEach((note) => {
    if (noteY > pageHeight - 15) {
      doc.addPage();
      addLetterhead();
      noteY = topMargin;
    }
    doc.text(note, 20, noteY);
    noteY += 7;
  });

  // ── Page numbers ──
  const totalPages = doc.getNumberOfPages();
  for (let i = 1; i <= totalPages; i++) {
    doc.setPage(i);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(7);
    doc.setTextColor("#aaa");
    doc.text(`Page ${i} of ${totalPages}`, pageWidth - 15, pageHeight - 8, { align: "right" });
  }

  doc.save(`Profit_Loss_${periodLabel.replace(/\s+/g, "_")}.pdf`);
}