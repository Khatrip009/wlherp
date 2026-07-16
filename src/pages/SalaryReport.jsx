import { useState, useMemo, useRef } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "../api/supabase";
import toast from "react-hot-toast";
import { Calendar, Download, FileText, TrendingUp, IndianRupee, AlertCircle } from "lucide-react";
import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";
import { getOrganization } from "../services/organizationService";
import { useOrg } from "../context/OrganizationContext";

// ─── Helper: Create rupee symbol as image ──────────────
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

// ─── Draw currency amount with ₹ image ──────────────────
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

export default function SalaryReport() {
  const today = new Date();
  const [month, setMonth] = useState(today.getMonth() + 1);
  const [year, setYear] = useState(today.getFullYear());
  const tableRef = useRef();

  // ── Organisation, Branch & Financial Year context ──
  const { org: currentOrg, branch, selectedFinancialYear } = useOrg();
  const branchId = branch?.id;
  const financialYearId = selectedFinancialYear?.id;

  const { data: org } = useQuery({
    queryKey: ["organization", currentOrg?.id],
    queryFn: () => getOrganization(currentOrg?.id),
    enabled: !!currentOrg?.id,
    staleTime: 10 * 60 * 1000,
  });

  const { data: payments = [], isLoading, refetch } = useQuery({
    queryKey: ["salary-report", month, year, branchId, financialYearId],
    queryFn: async () => {
      const startDate = `${year}-${String(month).padStart(2, "0")}-01`;
      const endDate = new Date(year, month, 0).toISOString().split("T")[0];

      // 1. Fetch salary payments – scoped
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
      if (financialYearId) salaryQuery = salaryQuery.eq("financial_year_id", financialYearId);

      const { data: salaryData, error: sErr } = await salaryQuery;
      if (sErr) throw sErr;
      if (!salaryData || salaryData.length === 0) return [];

      // 2. Fetch journal entries – scoped (if the table has branch/FY)
      const paymentIds = salaryData.map((p) => p.id);
      const references = paymentIds.map((id) => `Salary #${id}`);

      let journalQuery = supabase
        .from("journal_entries")
        .select("id, reference, is_posted, entry_date")
        .in("reference", references);

      if (branchId) journalQuery = journalQuery.eq("branch_id", branchId);
      if (financialYearId) journalQuery = journalQuery.eq("financial_year_id", financialYearId);

      const { data: journalEntries, error: jErr } = await journalQuery;
      if (jErr) throw jErr;

      const journalMap = {};
      journalEntries.forEach((je) => {
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
    },
    enabled: !!branchId && !!financialYearId,
    staleTime: 2 * 60 * 1000,
  });

  const summary = useMemo(() => {
    const totalGross = payments.reduce((sum, p) => sum + (p.amount || 0), 0);
    const totalTDS = payments.reduce((sum, p) => sum + (p.tds_amount || 0), 0);
    const totalNet = payments.reduce((sum, p) => sum + (p.net_amount || 0), 0);
    const teacherCount = new Set(payments.map((p) => p.teacher_id)).size;
    const journalCreatedCount = payments.filter((p) => p.journal_entry_id !== null).length;
    return { totalGross, totalTDS, totalNet, teacherCount, journalCreatedCount };
  }, [payments]);

  // ─── PDF Export ──────────────────────────────────────────────
  const handleExportPDF = async () => {
    if (payments.length === 0) {
      toast.error("No data to export");
      return;
    }

    const doc = new jsPDF({ unit: 'mm', format: 'a4', orientation: 'landscape' });
    const pageWidth = doc.internal.pageSize.getWidth();
    const pageHeight = doc.internal.pageSize.getHeight();
    const margin = 14;
    let y = 16;

    // ── Organisation Header ──
    const orgName = org?.company_name || "ShreeVidhya Academy";
    const address = org?.address || "";
    const phone = org?.phone || "";
    const email = org?.email || "";

    doc.setFontSize(20);
    doc.setFont("helvetica", "bold");
    doc.setTextColor("#0D47A1");
    doc.text(orgName, margin, y);
    y += 7;
    doc.setFontSize(9);
    doc.setFont("helvetica", "normal");
    doc.setTextColor("#555");
    doc.text(address, margin, y);
    y += 5;
    doc.text(`Phone: ${phone} | Email: ${email}`, margin, y);
    y += 12;

    // ── Title ──
    const monthName = new Date(year, month - 1).toLocaleString('default', { month: 'long' });
    doc.setFontSize(16);
    doc.setFont("helvetica", "bold");
    doc.setTextColor("#0D47A1");
    const title = `Salary Report – ${monthName} ${year}`;
    doc.text(title, pageWidth / 2, y, { align: 'center' });
    y += 10;

    // ── Summary Boxes ──
    const boxWidth = (pageWidth - 2 * margin - 20) / 5;
    const boxHeight = 18;
    const boxY = y;
    const summaryItems = [
      { label: "Total Gross", value: summary.totalGross, color: "#0D47A1" },
      { label: "Total TDS", value: summary.totalTDS, color: "#D32F2F" },
      { label: "Total Net", value: summary.totalNet, color: "#2E7D32" },
      { label: "Teachers", value: summary.teacherCount, color: "#1976D2" },
      { label: "Journal Entries", value: `${summary.journalCreatedCount} / ${payments.length}`, color: "#6A1B9A" },
    ];

    summaryItems.forEach((item, i) => {
      const x = margin + i * (boxWidth + 5);
      doc.setFillColor(245, 245, 245);
      doc.setDrawColor(200, 200, 200);
      doc.roundedRect(x, boxY, boxWidth, boxHeight, 2, 2, 'FD');
      doc.setTextColor("#333");
      doc.setFontSize(8);
      doc.setFont("helvetica", "normal");
      doc.text(item.label, x + 3, boxY + 6);

      if (typeof item.value === 'number' && item.label !== 'Teachers' && !item.label.includes('Journal')) {
        drawCurrency(doc, item.value, x + 3, boxY + 15, 11, 'left', item.color);
      } else {
        doc.setTextColor(item.color);
        doc.setFontSize(11);
        doc.setFont("helvetica", "bold");
        doc.text(String(item.value), x + 3, boxY + 15);
      }
    });
    y += boxHeight + 12;

    // ── Detailed Table ──
    const tableRows = payments.map((p) => [
      `${p.teachers?.first_name || ''} ${p.teachers?.last_name || ''}`.trim(),
      p.teachers?.employee_code || '',
      p.teachers?.monthly_salary || 0,
      p.teachers?.per_lecture_rate || 0,
      p.amount || 0,
      `${p.tds_percentage || 0}%`,
      p.net_amount || 0,
      p.payment_type === 'fixed' ? 'Fixed' : 'Lecture',
      p.journal_entry_id ? '✓' : '✗',
    ]);

    const totalGross = payments.reduce((s, p) => s + (p.amount || 0), 0);
    const totalNet = payments.reduce((s, p) => s + (p.net_amount || 0), 0);
    tableRows.push([
      'TOTAL',
      '',
      '',
      '',
      totalGross,
      '',
      totalNet,
      '',
      '',
    ]);

    autoTable(doc, {
      startY: y,
      head: [['Teacher', 'Code', 'Monthly', 'Lecture', 'Gross', 'TDS%', 'Net', 'Type', 'JE']],
      body: tableRows,
      theme: 'grid',
      styles: { fontSize: 8, cellPadding: 2 },
      headStyles: {
        fillColor: '#0D47A1',
        textColor: '#FFFFFF',
        fontSize: 8,
        fontStyle: 'bold',
      },
      columnStyles: {
        0: { cellWidth: 40 },
        1: { cellWidth: 22 },
        2: { cellWidth: 25, halign: 'right' },
        3: { cellWidth: 25, halign: 'right' },
        4: { cellWidth: 30, halign: 'right' },
        5: { cellWidth: 18, halign: 'center' },
        6: { cellWidth: 30, halign: 'right' },
        7: { cellWidth: 22 },
        8: { cellWidth: 12, halign: 'center' },
      },
      didDrawCell: function (data) {
        if (data.column.index === 4 || data.column.index === 6) {
          const cell = data.cell;
          const raw = data.cell.raw;
          if (typeof raw === 'number' && raw > 0) {
            doc.setFillColor(255, 255, 255);
            doc.rect(cell.x, cell.y, cell.width, cell.height, 'F');
            const x = cell.x + 2;
            const yPos = cell.y + cell.height / 2 + 1.5;
            drawCurrency(doc, raw, x, yPos, 8, 'left', '#333');
          }
        }
        if (data.row.index === tableRows.length - 1) {
          data.cell.styles.fillColor = [230, 240, 250];
          data.cell.styles.fontStyle = 'bold';
        }
      },
      margin: { left: margin, right: margin },
    });

    y = doc.lastAutoTable.finalY + 10;

    const footerY = pageHeight - 12;
    doc.setFontSize(7);
    doc.setTextColor("#999");
    doc.setFont("helvetica", "italic");
    doc.text(`Generated on ${new Date().toLocaleString()}`, margin, footerY);
    doc.text(`© ${orgName}`, pageWidth / 2, footerY, { align: 'center' });

    doc.save(`Salary_Report_${monthName}_${year}.pdf`);
  };

  // ─── CSV Export ──────────────────────────────────────────────
  const handleExportCSV = () => {
    if (payments.length === 0) {
      toast.error("No data to export");
      return;
    }
    import('papaparse').then((Papa) => {
      const csvData = payments.map((p) => ({
        "Teacher": `${p.teachers?.first_name} ${p.teachers?.last_name}`.trim(),
        "Employee Code": p.teachers?.employee_code || "",
        "Monthly Salary": p.teachers?.monthly_salary || 0,
        "Per Lecture Rate": p.teachers?.per_lecture_rate || 0,
        "Payment Date": p.payment_date,
        "Gross Amount": p.amount,
        "TDS %": p.tds_percentage,
        "TDS Amount": p.tds_amount,
        "Net Amount": p.net_amount,
        "Payment Type": p.payment_type,
        "Lectures": p.total_lectures || 0,
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

  return (
    <>
      <div className="flex flex-col sm:flex-row sm:items-center justify-between mb-6">
        <h1 className="text-3xl font-righteous text-primary-dark">Monthly Salary Report</h1>
        <div className="flex items-center gap-3 mt-2 sm:mt-0">
          <div className="flex items-center gap-2 bg-white border rounded-lg p-1">
            <Calendar className="text-secondary-light w-4 h-4 ml-2" />
            <select
              value={month}
              onChange={(e) => setMonth(Number(e.target.value))}
              className="border-0 bg-transparent p-1 text-sm focus:ring-0"
            >
              {Array.from({ length: 12 }, (_, i) => i + 1).map((m) => (
                <option key={m} value={m}>
                  {new Date(0, m - 1).toLocaleString("default", { month: "long" })}
                </option>
              ))}
            </select>
            <input
              type="number"
              min="2020"
              max="2030"
              value={year}
              onChange={(e) => setYear(Number(e.target.value))}
              className="border-0 bg-transparent p-1 text-sm w-20 focus:ring-0"
            />
          </div>
          <button onClick={() => refetch()} className="border px-3 py-1.5 rounded-lg text-sm hover:bg-gray-50 transition">
            Refresh
          </button>
          <button
            onClick={handleExportCSV}
            className="border px-3 py-1.5 rounded-lg text-sm hover:bg-gray-50 transition flex items-center gap-1"
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
          <div className="bg-white rounded-lg shadow-sm p-4 border">
            <p className="text-xs text-secondary-light">Total Gross</p>
            <p className="text-lg font-bold text-primary">₹ {summary.totalGross.toLocaleString("en-IN")}</p>
          </div>
          <div className="bg-white rounded-lg shadow-sm p-4 border">
            <p className="text-xs text-secondary-light">Total TDS</p>
            <p className="text-lg font-bold text-red-600">₹ {summary.totalTDS.toLocaleString("en-IN")}</p>
          </div>
          <div className="bg-white rounded-lg shadow-sm p-4 border">
            <p className="text-xs text-secondary-light">Total Net</p>
            <p className="text-lg font-bold text-green-600">₹ {summary.totalNet.toLocaleString("en-IN")}</p>
          </div>
          <div className="bg-white rounded-lg shadow-sm p-4 border">
            <p className="text-xs text-secondary-light">Teachers</p>
            <p className="text-lg font-bold text-indigo-600">{summary.teacherCount}</p>
          </div>
          <div className="bg-white rounded-lg shadow-sm p-4 border">
            <p className="text-xs text-secondary-light">Journal Entries</p>
            <p className="text-lg font-bold">{summary.journalCreatedCount} / {payments.length}</p>
          </div>
        </div>
      )}

      {/* Table */}
      <div className="bg-white rounded-xl shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full" ref={tableRef}>
            <thead className="bg-slate-50 border-b">
              <tr>
                <th className="px-4 py-3 text-left text-sm font-medium text-secondary-dark">Teacher</th>
                <th className="px-4 py-3 text-right text-sm font-medium text-secondary-dark">Monthly Salary</th>
                <th className="px-4 py-3 text-right text-sm font-medium text-secondary-dark">Per Lecture</th>
                <th className="px-4 py-3 text-right text-sm font-medium text-secondary-dark">Gross</th>
                <th className="px-4 py-3 text-right text-sm font-medium text-secondary-dark">TDS %</th>
                <th className="px-4 py-3 text-right text-sm font-medium text-secondary-dark">Net</th>
                <th className="px-4 py-3 text-left text-sm font-medium text-secondary-dark">Type</th>
                <th className="px-4 py-3 text-center text-sm font-medium text-secondary-dark">Accounting</th>
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                <tr>
                  <td colSpan={8} className="text-center py-8 text-secondary">Loading report...</td>
                </tr>
              ) : payments.length === 0 ? (
                <tr>
                  <td colSpan={8} className="text-center py-8 text-secondary">
                    No salary payments found for {month}/{year}.
                  </td>
                </tr>
              ) : (
                payments.map((p) => (
                  <tr key={p.id} className="border-t hover:bg-gray-50 transition">
                    <td className="px-4 py-3 text-sm">
                      <div className="font-medium">{p.teachers?.first_name} {p.teachers?.last_name}</div>
                      <div className="text-xs text-secondary-light">{p.teachers?.employee_code}</div>
                    </td>
                    <td className="px-4 py-3 text-right text-sm">
                      {p.teachers?.monthly_salary ? `₹ ${p.teachers.monthly_salary.toLocaleString("en-IN")}` : "—"}
                    </td>
                    <td className="px-4 py-3 text-right text-sm">
                      {p.teachers?.per_lecture_rate ? `₹ ${p.teachers.per_lecture_rate.toLocaleString("en-IN")}` : "—"}
                    </td>
                    <td className="px-4 py-3 text-right text-sm font-medium">₹ {p.amount?.toLocaleString("en-IN")}</td>
                    <td className="px-4 py-3 text-right text-sm">{p.tds_percentage || 0}%</td>
                    <td className="px-4 py-3 text-right text-sm font-semibold text-green-700">
                      ₹ {p.net_amount?.toLocaleString("en-IN")}
                    </td>
                    <td className="px-4 py-3 text-sm">
                      <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                        p.payment_type === "fixed" ? "bg-blue-100 text-blue-700" : "bg-purple-100 text-purple-700"
                      }`}>
                        {p.payment_type === "fixed" ? "Fixed" : "Lecture"}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-center text-sm">
                      {p.journal_entry_id ? (
                        <span className="inline-flex items-center gap-1 text-green-600 bg-green-50 px-2 py-0.5 rounded-full text-xs font-medium">
                          <FileText className="w-3 h-3" /> Posted
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 text-red-600 bg-red-50 px-2 py-0.5 rounded-full text-xs font-medium">
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
          <div className="px-4 py-2 text-xs text-secondary-light border-t">
            {payments.length} payments shown
          </div>
        )}
      </div>
    </>
  );
}