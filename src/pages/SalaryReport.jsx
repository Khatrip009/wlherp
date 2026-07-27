// src/pages/SalaryReport.jsx
import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "../api/supabase";
import toast from "react-hot-toast";
import { Calendar, Download, FileText, Mail, AlertCircle } from "lucide-react";
import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";
import { useOrg } from "../context/OrganizationContext";
import { useTheme } from "../context/ThemeContext"; // 👈 import theme
import { sendEmail } from "../services/emailService";

// ─── Helper: Create rupee symbol as image ──────────────
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

// ─── Draw currency amount with ₹ image ──────────────────
function drawCurrency(
  doc,
  amount,
  x,
  y,
  fontSize = 10,
  align = "left",
  color = "#000"
) {
  const img = getRupeeImage();
  doc.setFont("helvetica", "normal");
  doc.setFontSize(fontSize);
  doc.setTextColor(color);
  const amountText = amount.toLocaleString("en-IN");
  if (align === "left") {
    doc.addImage(img, "PNG", x, y - fontSize * 0.35, 4, 4);
    doc.text(amountText, x + 5, y);
  } else {
    const textWidth = doc.getTextWidth(amountText);
    doc.addImage(img, "PNG", x - textWidth - 5, y - fontSize * 0.35, 4, 4);
    doc.text(amountText, x - textWidth, y);
  }
}

async function loadImageAsBase64(url) {
  if (!url) return null;
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

export default function SalaryReport() {
  const today = new Date();
  const [month, setMonth] = useState(today.getMonth() + 1);
  const [year, setYear] = useState(today.getFullYear());
  const [sendingReport, setSendingReport] = useState(false);

  const { org, branch, selectedFinancialYear } = useOrg();
  const theme = useTheme(); // 👈 get theme colours
  const branchId = branch?.id;
  const financialYearId = selectedFinancialYear?.id;

  const getAdminEmails = async () => {
    if (!org?.id) return [];
    const { data, error } = await supabase
      .from("profiles")
      .select("email")
      .eq("organization_id", org.id)
      .in("role", ["admin", "super_admin", "organization_admin"])
      .eq("is_active", true);
    if (error) {
      console.error("Failed to fetch admin emails:", error);
      return [];
    }
    return data?.map((p) => p.email).filter(Boolean) || [];
  };

  // ─── Send salary report email ──────────────────────────────
  const sendReportEmail = async (paymentsToSend) => {
    if (!paymentsToSend || paymentsToSend.length === 0) {
      alert("No data to send.");
      return;
    }

    setSendingReport(true);
    try {
      const adminEmails = await getAdminEmails();
      if (adminEmails.length === 0) {
        alert("No admin emails found.");
        setSendingReport(false);
        return;
      }

      const monthName = new Date(year, month - 1).toLocaleString("default", {
        month: "long",
      });

      // Build HTML table rows using theme colours
      let tableRows = paymentsToSend
        .map(
          (p) => `
        <tr>
          <td style="padding:4px 8px;border:1px solid #ddd;">${
            `${p.teachers?.first_name || ""} ${p.teachers?.last_name || ""}`.trim() ||
            "—"
          }</td>
          <td style="padding:4px 8px;border:1px solid #ddd;">${
            p.teachers?.employee_code || "—"
          }</td>
          <td style="padding:4px 8px;border:1px solid #ddd;text-align:right;">₹ ${Number(
            p.amount || 0
          ).toLocaleString("en-IN")}</td>
          <td style="padding:4px 8px;border:1px solid #ddd;text-align:center;">${
            p.tds_percentage || 0
          }%</td>
          <td style="padding:4px 8px;border:1px solid #ddd;text-align:right;">₹ ${Number(
            p.tds_amount || 0
          ).toLocaleString("en-IN")}</td>
          <td style="padding:4px 8px;border:1px solid #ddd;text-align:right;">₹ ${Number(
            p.net_amount || 0
          ).toLocaleString("en-IN")}</td>
          <td style="padding:4px 8px;border:1px solid #ddd;text-align:center;">${
            p.payment_type === "fixed" ? "Fixed" : "Lecture"
          }</td>
          <td style="padding:4px 8px;border:1px solid #ddd;text-align:center;">${
            p.journal_entry_id ? "✓" : "✗"
          }</td>
        </tr>
      `
        )
        .join("");

      const summary = {
        totalGross: paymentsToSend.reduce((sum, p) => sum + (p.amount || 0), 0),
        totalTDS: paymentsToSend.reduce(
          (sum, p) => sum + (p.tds_amount || 0),
          0
        ),
        totalNet: paymentsToSend.reduce(
          (sum, p) => sum + (p.net_amount || 0),
          0
        ),
        teacherCount: new Set(paymentsToSend.map((p) => p.teacher_id)).size,
      };

      const htmlBody = `
        <div style="font-family:Arial,sans-serif;max-width:800px;margin:0 auto;">
          <h2 style="color:${theme.primary_color};">Salary Report – ${monthName} ${year}</h2>
          <p><strong>Branch:</strong> ${branch?.branch_name || "N/A"}</p>
          <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:10px;margin-bottom:15px;">
            <div style="border:1px solid #ddd;padding:8px 12px;border-radius:6px;background:#f9f9f9;text-align:center;">
              <div style="font-size:10px;color:#888;">Gross</div>
              <div style="font-size:16px;font-weight:700;">₹ ${summary.totalGross.toLocaleString(
                "en-IN"
              )}</div>
            </div>
            <div style="border:1px solid #ddd;padding:8px 12px;border-radius:6px;background:#f9f9f9;text-align:center;">
              <div style="font-size:10px;color:#888;">TDS</div>
              <div style="font-size:16px;font-weight:700;color:${theme.accent_color};">
                ₹ ${summary.totalTDS.toLocaleString("en-IN")}
              </div>
            </div>
            <div style="border:1px solid #ddd;padding:8px 12px;border-radius:6px;background:#f9f9f9;text-align:center;">
              <div style="font-size:10px;color:#888;">Net</div>
              <div style="font-size:16px;font-weight:700;color:${theme.primary_color};">
                ₹ ${summary.totalNet.toLocaleString("en-IN")}
              </div>
            </div>
            <div style="border:1px solid #ddd;padding:8px 12px;border-radius:6px;background:#f9f9f9;text-align:center;">
              <div style="font-size:10px;color:#888;">Teachers</div>
              <div style="font-size:16px;font-weight:700;">${summary.teacherCount}</div>
            </div>
          </div>
          <table style="width:100%;border-collapse:collapse;font-size:11px;border:1px solid #ddd;">
            <thead style="background:${theme.primary_light_color || "#e3f2fd"};">
              <tr>
                <th style="padding:4px 8px;border:1px solid #ddd;text-align:left;">Teacher</th>
                <th style="padding:4px 8px;border:1px solid #ddd;text-align:left;">Code</th>
                <th style="padding:4px 8px;border:1px solid #ddd;text-align:right;">Gross</th>
                <th style="padding:4px 8px;border:1px solid #ddd;text-align:center;">TDS%</th>
                <th style="padding:4px 8px;border:1px solid #ddd;text-align:right;">TDS</th>
                <th style="padding:4px 8px;border:1px solid #ddd;text-align:right;">Net</th>
                <th style="padding:4px 8px;border:1px solid #ddd;text-align:center;">Type</th>
                <th style="padding:4px 8px;border:1px solid #ddd;text-align:center;">JE</th>
              </tr>
            </thead>
            <tbody>
              ${tableRows}
            </tbody>
          </table>
          <p style="color:#888;font-size:10px;margin-top:20px;">Computer‑generated report from ${
            org?.company_name || "Academy"
          }</p>
        </div>
      `;

      await sendEmail({
        to: adminEmails,
        subject: `Salary Report – ${monthName} ${year}`,
        html: htmlBody,
      });

      toast.success("Report sent to admins.");
    } catch (err) {
      console.error("Failed to send report:", err);
      toast.error("Failed to send report.");
    } finally {
      setSendingReport(false);
    }
  };

  const {
    data: payments = [],
    isLoading,
    refetch,
  } = useQuery({
    queryKey: ["salary-report", month, year, branchId, financialYearId],
    queryFn: async () => {
      try {
        const startDate = `${year}-${String(month).padStart(2, "0")}-01`;
        const endDate = new Date(year, month, 0).toISOString().split("T")[0];

        let salaryQuery = supabase
          .from("salary_payments")
          .select(
            `*,
            teachers!inner (
              id,
              first_name,
              last_name,
              employee_code,
              salary_type,
              monthly_salary,
              per_lecture_rate,
              tds_percentage
            )`
          )
          .gte("payment_date", startDate)
          .lte("payment_date", endDate)
          .order("payment_date", { ascending: false });

        if (branchId) salaryQuery = salaryQuery.eq("branch_id", branchId);
        if (financialYearId)
          salaryQuery = salaryQuery.eq("financial_year_id", financialYearId);

        const { data: salaryData, error: sErr } = await salaryQuery;
        if (sErr) throw sErr;
        if (!salaryData || salaryData.length === 0) return [];

        const paymentIds = salaryData.map((p) => p.id);
        const references = paymentIds.map((id) => `Salary #${id}`);

        let journalQuery = supabase
          .from("journal_entries")
          .select("id, reference, is_posted, entry_date")
          .in("reference", references);

        if (branchId) journalQuery = journalQuery.eq("branch_id", branchId);
        if (financialYearId)
          journalQuery = journalQuery.eq("financial_year_id", financialYearId);

        const { data: journalEntries, error: jErr } = await journalQuery;
        if (jErr) throw jErr;

        const journalMap = {};
        (journalEntries || []).forEach((je) => {
          journalMap[je.reference] = je;
        });

        return salaryData.map((p) => {
          const ref = `Salary #${p.id}`;
          const journal = journalMap[ref] || null;
          return {
            ...p,
            journal_entry_id: journal?.id || null,
            journal_is_posted: journal?.is_posted || false,
            journal_entry_date: journal?.entry_date || null,
          };
        });
      } catch (err) {
        console.error("Salary report query error:", err);
        toast.error("Failed to load salary report");
        return [];
      }
    },
    enabled: !!branchId && !!financialYearId,
    staleTime: 2 * 60 * 1000,
  });

  const summary = useMemo(() => {
    const totalGross = payments.reduce((sum, p) => sum + (p.amount || 0), 0);
    const totalTDS = payments.reduce((sum, p) => sum + (p.tds_amount || 0), 0);
    const totalNet = payments.reduce(
      (sum, p) => sum + (p.net_amount || 0),
      0
    );
    const teacherCount = new Set(payments.map((p) => p.teacher_id)).size;
    const journalCreatedCount = payments.filter(
      (p) => p.journal_entry_id !== null
    ).length;
    return {
      totalGross,
      totalTDS,
      totalNet,
      teacherCount,
      journalCreatedCount,
    };
  }, [payments]);

  // ─── PDF Export (unchanged – uses black colour) ───────────
  const handleExportPDF = async () => {
    if (!payments.length) {
      toast.error("No data to export");
      return;
    }

    const doc = new jsPDF({
      orientation: "landscape",
      unit: "mm",
      format: "a4",
    });
    const pageWidth = doc.internal.pageSize.getWidth();
    const pageHeight = doc.internal.pageSize.getHeight();
    const margin = 10;
    let y = margin;

    let logoBase64 = null;
    if (org?.logo_dark_url) {
      logoBase64 = await loadImageAsBase64(org.logo_dark_url);
    }

    const logoWidth = 35;
    const logoHeight = 14;
    if (logoBase64) {
      doc.addImage(logoBase64, "PNG", margin, y, logoWidth, logoHeight);
    }
    const textX = margin + (logoBase64 ? logoWidth + 4 : 0);
    const textY = y + 1;

    doc.setFont("helvetica", "bold");
    doc.setFontSize(14);
    doc.setTextColor("#000000");
    doc.text(org?.company_name || "Academy", textX, textY);

    doc.setFont("helvetica", "normal");
    doc.setFontSize(7);
    doc.setTextColor("#000000");
    let detailY = textY + 4.5;
    if (org?.address) {
      const addrLines = doc.splitTextToSize(
        org.address,
        pageWidth - textX - margin - 10
      );
      doc.text(addrLines, textX, detailY);
      detailY += addrLines.length * 3.5 + 1;
    }
    if (org?.gstin) {
      doc.text(`GSTIN: ${org.gstin}`, textX, detailY);
      detailY += 4;
    }
    if (org?.phone) {
      doc.text(`Phone: ${org.phone}`, textX, detailY);
      detailY += 4;
    }
    if (org?.email) {
      doc.text(`Email: ${org.email}`, textX, detailY);
      detailY += 4;
    }

    const headerHeight = Math.max(logoHeight + 4, detailY - textY + 4);
    y += headerHeight + 2;
    doc.setDrawColor("#000000");
    doc.line(margin, y, pageWidth - margin, y);
    y += 6;

    const monthName = new Date(year, month - 1).toLocaleString("default", {
      month: "long",
    });
    doc.setFontSize(16);
    doc.setFont("helvetica", "bold");
    doc.setTextColor("#000000");
    doc.text(
      `Salary Report – ${monthName} ${year}`,
      pageWidth / 2,
      y,
      { align: "center" }
    );
    y += 10;

    // Summary boxes
    const boxWidth = (pageWidth - 2 * margin - 20) / 5;
    const boxHeight = 18;
    const boxY = y;
    const summaryItems = [
      { label: "Total Gross", value: summary.totalGross },
      { label: "Total TDS", value: summary.totalTDS },
      { label: "Total Net", value: summary.totalNet },
      { label: "Teachers", value: summary.teacherCount },
      {
        label: "Journal Entries",
        value: `${summary.journalCreatedCount} / ${payments.length}`,
      },
    ];

    summaryItems.forEach((item, i) => {
      const x = margin + i * (boxWidth + 5);
      doc.setDrawColor("#000000");
      doc.setFillColor(255, 255, 255);
      doc.rect(x, boxY, boxWidth, boxHeight, "FD");
      doc.setTextColor("#000000");
      doc.setFontSize(8);
      doc.setFont("helvetica", "normal");
      doc.text(item.label, x + 3, boxY + 6);
      if (
        typeof item.value === "number" &&
        item.label !== "Teachers" &&
        !item.label.includes("Journal")
      ) {
        drawCurrency(doc, item.value, x + 3, boxY + 15, 11, "left", "#000");
      } else {
        doc.setFontSize(11);
        doc.setFont("helvetica", "bold");
        doc.setTextColor("#000000");
        doc.text(String(item.value), x + 3, boxY + 15);
      }
    });
    y += boxHeight + 12;

    // Table rows
    const tableRows = payments.map((p) => [
      `${p.teachers?.first_name || ""} ${p.teachers?.last_name || ""}`.trim(),
      p.teachers?.employee_code || "",
      p.teachers?.monthly_salary || 0,
      p.teachers?.per_lecture_rate || 0,
      p.amount || 0,
      `${p.tds_percentage || 0}%`,
      p.net_amount || 0,
      p.payment_type === "fixed" ? "Fixed" : "Lecture",
      p.journal_entry_id ? "✓" : "✗",
    ]);

    const totalGross = summary.totalGross;
    const totalNet = summary.totalNet;
    tableRows.push(["TOTAL", "", "", "", totalGross, "", totalNet, "", ""]);

    autoTable(doc, {
      startY: y,
      head: [
        [
          "Teacher",
          "Code",
          "Monthly",
          "Lecture",
          "Gross",
          "TDS%",
          "Net",
          "Type",
          "JE",
        ],
      ],
      body: tableRows,
      theme: "plain",
      styles: {
        fontSize: 8,
        cellPadding: 2,
        textColor: [0, 0, 0],
        fillColor: [255, 255, 255],
        lineColor: [0, 0, 0],
        lineWidth: 0.2,
      },
      headStyles: {
        fillColor: [255, 255, 255],
        textColor: [0, 0, 0],
        fontStyle: "bold",
        lineWidth: 0.2,
        lineColor: [0, 0, 0],
      },
      columnStyles: {
        0: { cellWidth: 55, halign: "left" },
        1: { cellWidth: 20, halign: "center" },
        2: { cellWidth: 32, halign: "right" },
        3: { cellWidth: 32, halign: "right" },
        4: { cellWidth: 35, halign: "right" },
        5: { cellWidth: 20, halign: "center" },
        6: { cellWidth: 35, halign: "right" },
        7: { cellWidth: 22, halign: "center" },
        8: { cellWidth: 20, halign: "center" },
      },
      margin: { left: margin, right: margin },
      willDrawCell: (data) => {
        const numCols = [4, 6];
        if (
          numCols.includes(data.column.index) &&
          typeof data.cell.raw === "number"
        ) {
          data.cell.text = [];
        }
      },
      didDrawCell: (data) => {
        const numCols = [4, 6];
        if (
          numCols.includes(data.column.index) &&
          typeof data.cell.raw === "number"
        ) {
          const x = data.cell.x + 2;
          const yPos = data.cell.y + data.cell.height / 2 + 1.5;
          drawCurrency(doc, data.cell.raw, x, yPos, 8, "left", "#000");
        }
        if (data.row.index === tableRows.length - 1) {
          data.cell.styles.fontStyle = "bold";
        }
      },
    });

    y = doc.lastAutoTable.finalY + 10;

    const footerY = pageHeight - margin - 5;
    doc.setFontSize(7);
    doc.setTextColor("#000000");
    doc.setFont("helvetica", "italic");
    doc.text(
      `Generated on ${new Date().toLocaleString()}`,
      margin,
      footerY
    );
    doc.text(
      `© ${org?.company_name || "Academy"}`,
      pageWidth / 2,
      footerY,
      { align: "center" }
    );

    doc.save(`Salary_Report_${monthName}_${year}.pdf`);
  };

  // ─── CSV Export (unchanged) ────────────────────────────
  const handleExportCSV = () => {
    if (!payments.length) {
      toast.error("No data to export");
      return;
    }
    import("papaparse").then((Papa) => {
      const csvData = payments.map((p) => ({
        Teacher: `${p.teachers?.first_name} ${p.teachers?.last_name}`.trim(),
        "Employee Code": p.teachers?.employee_code || "",
        "Monthly Salary": p.teachers?.monthly_salary || 0,
        "Per Lecture Rate": p.teachers?.per_lecture_rate || 0,
        "Payment Date": p.payment_date,
        "Gross Amount": p.amount,
        "TDS %": p.tds_percentage,
        "TDS Amount": p.tds_amount,
        "Net Amount": p.net_amount,
        "Payment Type": p.payment_type,
        Lectures: p.total_lectures || 0,
        "Journal Entry": p.journal_entry_id ? "Posted" : "Missing",
      }));
      const csv = Papa.unparse(csvData);
      const blob = new Blob([csv], { type: "text/csv" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `Salary_Report_${month}_${year}.csv`;
      a.click();
      URL.revokeObjectURL(url);
    });
  };

  const monthName = new Date(year, month - 1).toLocaleString("default", {
    month: "long",
  });

  return (
    <div className="space-y-6 px-4 sm:px-6 lg:px-0">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between mb-6">
        <h1 className="text-3xl font-heading text-primary">
          Monthly Salary Report
        </h1>
        <div className="flex items-center gap-3 mt-2 sm:mt-0">
          <div className="flex items-center gap-2 bg-white dark:bg-accent border border-gray-300 dark:border-gray-600 rounded-lg p-1">
            <Calendar className="text-gray-500 dark:text-gray-400 w-4 h-4 ml-2" />
            <select
              value={month}
              onChange={(e) => setMonth(Number(e.target.value))}
              className="border-0 bg-transparent p-1 text-sm text-gray-900 dark:text-gray-100 focus:ring-0"
            >
              {Array.from({ length: 12 }, (_, i) => i + 1).map((m) => (
                <option key={m} value={m}>
                  {new Date(0, m - 1).toLocaleString("default", {
                    month: "long",
                  })}
                </option>
              ))}
            </select>
            <input
              type="number"
              min="2020"
              max="2030"
              value={year}
              onChange={(e) => setYear(Number(e.target.value))}
              className="border-0 bg-transparent p-1 text-sm w-20 text-gray-900 dark:text-gray-100 focus:ring-0"
            />
          </div>
          <button
            onClick={() => refetch()}
            className="border border-gray-300 dark:border-gray-600 bg-white dark:bg-accent text-gray-700 dark:text-gray-200 px-3 py-1.5 rounded-lg text-sm hover:bg-gray-50 dark:hover:bg-gray-700 transition"
          >
            Refresh
          </button>
          <button
            onClick={() => sendReportEmail(payments)}
            disabled={sendingReport || payments.length === 0}
            className="bg-primary hover:bg-primary-dark text-white px-4 py-1.5 rounded-lg text-sm flex items-center gap-2 transition disabled:opacity-50"
          >
            <Mail className="w-4 h-4" />
            {sendingReport ? "Sending..." : "Send Report"}
          </button>
          <button
            onClick={handleExportCSV}
            className="border border-gray-300 dark:border-gray-600 bg-white dark:bg-accent text-gray-700 dark:text-gray-200 px-3 py-1.5 rounded-lg text-sm hover:bg-gray-50 dark:hover:bg-gray-700 transition flex items-center gap-1"
          >
            <Download className="w-4 h-4" /> CSV
          </button>
          <button
            onClick={handleExportPDF}
            className="bg-primary hover:bg-primary-light text-white px-4 py-1.5 rounded-lg text-sm flex items-center gap-2 transition"
          >
            <FileText className="w-4 h-4" /> PDF
          </button>
        </div>
      </div>

      {/* Summary Cards */}
      {!isLoading && payments.length > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-4 mb-6">
          <div className="bg-white dark:bg-accent rounded-xl shadow-sm p-4 border border-gray-200 dark:border-gray-700">
            <p className="text-xs text-gray-500 dark:text-gray-400">
              Total Gross
            </p>
            <p className="text-lg font-bold text-primary">
              ₹ {summary.totalGross.toLocaleString("en-IN")}
            </p>
          </div>
          <div className="bg-white dark:bg-accent rounded-xl shadow-sm p-4 border border-gray-200 dark:border-gray-700">
            <p className="text-xs text-gray-500 dark:text-gray-400">
              Total TDS
            </p>
            <p className="text-lg font-bold text-accent-dark">
              ₹ {summary.totalTDS.toLocaleString("en-IN")}
            </p>
          </div>
          <div className="bg-white dark:bg-accent rounded-xl shadow-sm p-4 border border-gray-200 dark:border-gray-700">
            <p className="text-xs text-gray-500 dark:text-gray-400">
              Total Net
            </p>
            <p className="text-lg font-bold text-accent">
              ₹ {summary.totalNet.toLocaleString("en-IN")}
            </p>
          </div>
          <div className="bg-white dark:bg-accent rounded-xl shadow-sm p-4 border border-gray-200 dark:border-gray-700">
            <p className="text-xs text-gray-500 dark:text-gray-400">
              Teachers
            </p>
            <p className="text-lg font-bold text-primary">
              {summary.teacherCount}
            </p>
          </div>
          <div className="bg-white dark:bg-accent rounded-xl shadow-sm p-4 border border-gray-200 dark:border-gray-700">
            <p className="text-xs text-gray-500 dark:text-gray-400">
              Journal Entries
            </p>
            <p className="text-lg font-bold text-primary">
              {summary.journalCreatedCount} / {payments.length}
            </p>
          </div>
        </div>
      )}

      {/* Data Table */}
      <div className="bg-white dark:bg-accent rounded-xl shadow-sm overflow-hidden border border-gray-200 dark:border-gray-700">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-gray-50 dark:bg-gray-700 border-b border-gray-200 dark:border-gray-600">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                  Teacher
                </th>
                <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                  Monthly Salary
                </th>
                <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                  Per Lecture
                </th>
                <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                  Gross
                </th>
                <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                  TDS %
                </th>
                <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                  Net
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                  Type
                </th>
                <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                  Accounting
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
              {isLoading ? (
                <tr>
                  <td
                    colSpan={8}
                    className="text-center py-8 text-gray-500 dark:text-gray-400"
                  >
                    Loading report...
                  </td>
                </tr>
              ) : payments.length === 0 ? (
                <tr>
                  <td
                    colSpan={8}
                    className="text-center py-8 text-gray-500 dark:text-gray-400"
                  >
                    No salary payments found for {month}/{year}.
                  </td>
                </tr>
              ) : (
                payments.map((p) => (
                  <tr
                    key={p.id}
                    className="hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
                  >
                    <td className="px-4 py-3 text-sm text-gray-800 dark:text-gray-100">
                      <div className="font-medium">
                        {p.teachers?.first_name} {p.teachers?.last_name}
                      </div>
                      <div className="text-xs text-gray-500 dark:text-gray-400">
                        {p.teachers?.employee_code}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-right text-sm text-gray-700 dark:text-gray-200">
                      {p.teachers?.monthly_salary
                        ? `₹ ${p.teachers.monthly_salary.toLocaleString("en-IN")}`
                        : "—"}
                    </td>
                    <td className="px-4 py-3 text-right text-sm text-gray-700 dark:text-gray-200">
                      {p.teachers?.per_lecture_rate
                        ? `₹ ${p.teachers.per_lecture_rate.toLocaleString("en-IN")}`
                        : "—"}
                    </td>
                    <td className="px-4 py-3 text-right text-sm font-medium text-gray-800 dark:text-gray-100">
                      ₹ {p.amount?.toLocaleString("en-IN")}
                    </td>
                    <td className="px-4 py-3 text-right text-sm text-gray-700 dark:text-gray-200">
                      {p.tds_percentage || 0}%
                    </td>
                    <td className="px-4 py-3 text-right text-sm font-semibold text-primary">
                      ₹ {p.net_amount?.toLocaleString("en-IN")}
                    </td>
                    <td className="px-4 py-3 text-sm">
                      <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-primary-bg text-primary">
                        {p.payment_type === "fixed" ? "Fixed" : "Lecture"}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-center text-sm">
                      {p.journal_entry_id ? (
                        <span className="inline-flex items-center gap-1 text-primary bg-primary-bg px-2 py-0.5 rounded-full text-xs font-medium">
                          <FileText className="w-3 h-3" /> Posted
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 text-accent-dark bg-accent-bg px-2 py-0.5 rounded-full text-xs font-medium">
                          <AlertCircle className="w-3 h-3" /> Missing
                        </span>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
        {payments.length > 0 && (
          <div className="px-4 py-2 text-xs text-gray-500 dark:text-gray-400 border-t border-gray-200 dark:border-gray-700">
            {payments.length} payments shown
          </div>
        )}
      </div>
    </div>
  );
}