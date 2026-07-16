import React, { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "../api/supabase";

import { Download, Printer } from "lucide-react";
import toast from "react-hot-toast";
import Papa from "papaparse";
import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";
import { useOrg } from "../context/OrganizationContext";   // NEW

// ─── Helper: load image as base64 ────────────────────────────
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

export default function TaxReport() {
  const [startDate, setStartDate] = useState(
    new Date(new Date().getFullYear(), 0, 1).toISOString().split("T")[0]
  );
  const [endDate, setEndDate] = useState(
    new Date().toISOString().split("T")[0]
  );

  // ── Branch & Financial Year context ──
  const { org: currentOrg, branch, selectedFinancialYear } = useOrg();
  const branchId = branch?.id;
  const financialYearId = selectedFinancialYear?.id;

  // Fetch tax_collections – scoped to branch & FY
  const { data: taxRecords = [], isLoading } = useQuery({
    queryKey: ["tax-report", startDate, endDate, branchId, financialYearId],
    queryFn: async () => {
      let query = supabase
        .from("tax_collections")
        .select(`
          collection_date,
          amount,
          category,
          tax_rate_id,
          tax_rates (name, rate)
        `)
        .gte("collection_date", startDate)
        .lte("collection_date", endDate)
        .order("collection_date", { ascending: true });

      if (branchId) query = query.eq("branch_id", branchId);
      if (financialYearId) query = query.eq("financial_year_id", financialYearId);

      const { data, error } = await query;
      if (error) throw error;
      return data || [];
    },
    enabled: !!branchId && !!financialYearId,
    staleTime: 2 * 60 * 1000,
  });

  // Group by tax rate name
  const summary = taxRecords.reduce((acc, row) => {
    const rateName = row.tax_rates?.name || "Unknown";
    const rate = row.tax_rates?.rate || 0;
    if (!acc[rateName]) {
      acc[rateName] = { rate, count: 0, totalTax: 0 };
    }
    acc[rateName].count += 1;
    acc[rateName].totalTax += Number(row.amount || 0);
    return acc;
  }, {});

  const summaryArray = Object.entries(summary).map(([name, val]) => ({
    name,
    ...val,
  }));

  const totalTax = summaryArray.reduce((s, r) => s + r.totalTax, 0);

  // CSV Export (unchanged)
  const handleExport = () => {
    if (taxRecords.length === 0) {
      toast.error("No data to export");
      return;
    }
    const csv = Papa.unparse(
      taxRecords.map((r) => ({
        date: r.collection_date,
        category: r.category,
        tax_rate: r.tax_rates?.name || "Unknown",
        rate: r.tax_rates?.rate || 0,
        tax_amount: r.amount,
      }))
    );
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "tax_report.csv";
    a.click();
    URL.revokeObjectURL(url);
  };

  // ─── PDF Generation with letterhead ─────────────────────────
  const handlePrintPdf = async () => {
    if (summaryArray.length === 0) {
      toast.error("No data to export");
      return;
    }

    // 1. Load organization (letterhead) using current org id
    const { data: org } = await supabase
      .from("organization")
      .select("company_name, letterhead_url")
      .eq("id", currentOrg?.id)   // use current org from context
      .single();

    const letterheadUrl = org?.letterhead_url || null;
    const companyName = org?.company_name || "ShreeVidhya Academy";

    let letterheadBase64 = null;
    if (letterheadUrl) {
      try {
        letterheadBase64 = await loadImageAsBase64(letterheadUrl);
      } catch (err) {
        console.warn("Letterhead load failed", err);
      }
    }

    // 2. PDF setup (A4 portrait)
    const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
    const pageWidth = doc.internal.pageSize.getWidth();
    const pageHeight = doc.internal.pageSize.getHeight();
    const topMargin = 55;
    const sideMargin = 16;
    const bottomMargin = 20;

    // Add letterhead
    if (letterheadBase64) {
      doc.addImage(letterheadBase64, "PNG", 0, 0, pageWidth, pageHeight);
    }

    let y = topMargin;

    // Title
    doc.setFont("times", "bold");
    doc.setFontSize(22);
    doc.setTextColor("#0D47A1");
    doc.text("Tax Report", pageWidth / 2, y, { align: "center" });
    y += 12;

    // Period subtitle
    const period = `${startDate} – ${endDate}`;
    doc.setFont("helvetica", "normal");
    doc.setFontSize(10);
    doc.setTextColor("#333");
    const periodWidth = doc.getTextWidth(`Period: ${period}`);
    doc.setFillColor(255, 255, 255);
    doc.rect(pageWidth / 2 - periodWidth / 2 - 4, y - 5, periodWidth + 8, 8, "F");
    doc.text(`Period: ${period}`, pageWidth / 2, y, { align: "center" });
    y += 12;

    // Total Tax Collected (highlighted)
    doc.setFont("helvetica", "bold");
    doc.setFontSize(14);
    doc.setTextColor("#0D47A1");
    doc.text(`Total Tax Collected: ₹${totalTax.toLocaleString("en-IN")}`, sideMargin, y);
    y += 10;

    // Summary table
    const headers = [["Tax Rate", "Rate %", "Transactions", "Tax Total (₹)"]];
    const body = summaryArray.map(row => [
      row.name,
      `${row.rate}%`,
      row.count.toString(),
      row.totalTax.toLocaleString("en-IN"),
    ]);

    autoTable(doc, {
      startY: y,
      head: headers,
      body,
      theme: "grid",
      styles: {
        fontSize: 10,
        cellPadding: 3,
        textColor: "#000000",
        fillColor: "#FFFFFF",
        lineColor: "#cccccc",
        lineWidth: 0.5,
      },
      headStyles: {
        fillColor: "#0D47A1",
        textColor: "#FFFFFF",
        fontStyle: "bold",
        fontSize: 11,
        cellPadding: 3,
      },
      alternateRowStyles: {
        fillColor: "#F5F8FF",
        textColor: "#000000",
      },
      margin: {
        top: topMargin,
        left: sideMargin,
        bottom: bottomMargin,
        right: sideMargin,
      },
      didParseCell: (data) => {
        if (data.row.section === "body") {
          data.cell.styles.textColor = "#000000";
        } else if (data.row.section === "head") {
          data.cell.styles.textColor = "#FFFFFF";
        }
      },
      willDrawPage: (data) => {
        if (letterheadBase64) {
          doc.addImage(letterheadBase64, "PNG", 0, 0, pageWidth, pageHeight);
        }
      },
      didDrawPage: (data) => {
        const pgNum = doc.internal.getCurrentPageInfo().pageNumber;
        doc.setFontSize(7);
        doc.setTextColor("#aaa");
        doc.text(`Page ${pgNum}`, pageWidth - sideMargin, pageHeight - 10, { align: "right" });
      },
    });

    // Final page numbers
    const totalPages = doc.getNumberOfPages();
    for (let i = 1; i <= totalPages; i++) {
      doc.setPage(i);
      doc.setFontSize(7);
      doc.setTextColor("#aaa");
      doc.text(`Page ${i} of ${totalPages}`, pageWidth - sideMargin, pageHeight - 10, { align: "right" });
    }

    doc.save(`Tax_Report_${startDate}_to_${endDate}.pdf`);
    toast.success("PDF downloaded");
  };

  return (
    <>
      <div className="mb-6">
        <h1 className="text-3xl font-righteous text-primary-dark">Tax Report</h1>
        <p className="text-sm text-secondary-dark font-montserrat mt-1">
          Tax collected (from fee payments & income)
        </p>
      </div>

      {/* Date filters & buttons */}
      <div className="flex flex-wrap items-end gap-4 mb-6">
        <div>
          <label className="text-xs font-montserrat text-secondary-dark">From Date</label>
          <input
            type="date"
            value={startDate}
            onChange={(e) => setStartDate(e.target.value)}
            className="border border-gray-300 rounded p-2 text-sm mt-1"
          />
        </div>
        <div>
          <label className="text-xs font-montserrat text-secondary-dark">To Date</label>
          <input
            type="date"
            value={endDate}
            onChange={(e) => setEndDate(e.target.value)}
            className="border border-gray-300 rounded p-2 text-sm mt-1"
          />
        </div>
        <button
          onClick={handlePrintPdf}
          className="bg-primary text-white px-4 py-2 rounded-lg text-sm flex items-center gap-2"
        >
          <Printer size={16} /> Print PDF
        </button>
        <button
          onClick={handleExport}
          className="bg-primary text-white px-4 py-2 rounded-lg text-sm flex items-center gap-2"
        >
          <Download size={16} /> Export CSV
        </button>
      </div>

      {/* Total Tax */}
      <div className="bg-white rounded-xl shadow-sm p-6 mb-6">
        <h2 className="text-lg font-righteous text-primary-dark mb-4">Total Tax Collected</h2>
        {isLoading ? (
          <p className="text-secondary">Loading…</p>
        ) : (
          <p className="text-3xl font-bold text-primary-dark">
            ₹{totalTax.toLocaleString("en-IN")}
          </p>
        )}
        <p className="text-xs text-secondary-light mt-1">
          {startDate} – {endDate}
        </p>
      </div>

      {/* Summary table by tax rate */}
      {isLoading ? (
        <div className="text-center p-6 text-secondary">Loading…</div>
      ) : summaryArray.length === 0 ? (
        <div className="text-center p-6 text-secondary">
          No tax records found for the selected period.
        </div>
      ) : (
        <div className="bg-white rounded-xl shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[600px]">
              <thead className="bg-slate-100">
                <tr>
                  <th className="p-3 text-left text-sm font-montserrat">Tax Rate</th>
                  <th className="p-3 text-left text-sm font-montserrat">Rate %</th>
                  <th className="p-3 text-left text-sm font-montserrat">Transactions</th>
                  <th className="p-3 text-left text-sm font-montserrat">Tax Total (₹)</th>
                </tr>
              </thead>
              <tbody>
                {summaryArray.map((row) => (
                  <tr key={row.name} className="border-t hover:bg-gray-50">
                    <td className="p-3 text-sm font-medium">{row.name}</td>
                    <td className="p-3 text-sm">{row.rate}%</td>
                    <td className="p-3 text-sm">{row.count}</td>
                    <td className="p-3 text-sm">₹{row.totalTax.toLocaleString("en-IN")}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </>
  );
}