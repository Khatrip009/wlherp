// src/pages/BankReconciliation.jsx
import { useState, useRef } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import toast from "react-hot-toast";
import { Upload, Check, X, Printer } from "lucide-react";
import Papa from "papaparse";
import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";
import {
  getBankAccounts,
  getStatementLines,
  getUnreconciledEntries,
  getReconciledLineIds,
  reconcileLine,
  unreconcileLine,
  clearStatementLines,
  importStatementLines,
} from "../services/bankReconciliationService";
import { useOrg } from "../context/OrganizationContext";

/* ─── PDF helpers (identical to other reports) ─────────────── */
async function loadImageAsBase64(url) {
  if (!url) return null;
  try {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const blob = await res.blob();
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve(reader.result);
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
  } catch { return null; }
}

function createRupeeSymbolImage() {
  const canvas = document.createElement("canvas");
  canvas.width = 30; canvas.height = 30;
  const ctx = canvas.getContext("2d");
  ctx.font = "bold 24px sans-serif"; ctx.fillStyle = "#000";
  ctx.textAlign = "center"; ctx.textBaseline = "middle";
  ctx.fillText("₹", 15, 15);
  return canvas.toDataURL("image/png");
}
let rupeeImage = null;
function getRupeeImage() { if (!rupeeImage) rupeeImage = createRupeeSymbolImage(); return rupeeImage; }

function drawCurrency(doc, amount, x, y, fontSize = 10, align = "left", color = "#000") {
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

export default function BankReconciliation() {
  const queryClient = useQueryClient();

  const { org, branch, selectedFinancialYear } = useOrg();
  const branchId = branch?.id;
  const financialYearId = selectedFinancialYear?.id;

  const [selectedAccountId, setSelectedAccountId] = useState("");
  const [startDate, setStartDate] = useState(
    new Date(new Date().getFullYear(), 0, 1).toISOString().split("T")[0]
  );
  const [endDate, setEndDate] = useState(new Date().toISOString().split("T")[0]);
  const [selectedStatementId, setSelectedStatementId] = useState(null);
  const fileInputRef = useRef(null);

  // Bank accounts – scoped
  const { data: accounts = [] } = useQuery({
    queryKey: ["bank-accounts", branchId, financialYearId],
    queryFn: () => getBankAccounts(branchId, financialYearId),
    enabled: !!branchId && !!financialYearId,
    staleTime: 10 * 60 * 1000,
  });

  // Statement lines – scoped
  const { data: statementLines = [] } = useQuery({
    queryKey: ["statement-lines", selectedAccountId, branchId, financialYearId],
    queryFn: () => getStatementLines(selectedAccountId, branchId, financialYearId),
    enabled: !!selectedAccountId && !!branchId && !!financialYearId,
  });

  // Unreconciled entries – scoped
  const { data: unreconciled = [] } = useQuery({
    queryKey: ["unreconciled-entries", selectedAccountId, startDate, endDate, branchId, financialYearId],
    queryFn: () =>
      getUnreconciledEntries(selectedAccountId, startDate, endDate, branchId, financialYearId),
    enabled: !!selectedAccountId && !!startDate && !!endDate && !!branchId && !!financialYearId,
  });

  // Reconciled IDs – scoped
  const { data: reconciledIds = [] } = useQuery({
    queryKey: ["reconciled-ids", selectedAccountId, branchId, financialYearId],
    queryFn: () => getReconciledLineIds(selectedAccountId, branchId, financialYearId),
    enabled: !!selectedAccountId && !!branchId && !!financialYearId,
  });

  const reconciledSet = new Set(reconciledIds);

  // Mutations
  const reconcileMut = useMutation({
    mutationFn: ({ lineId, statementId }) =>
      reconcileLine(lineId, statementId, { branchId, financialYearId }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["reconciled-ids"] });
      toast.success("Line reconciled");
    },
  });

  const unreconcileMut = useMutation({
    mutationFn: ({ lineId, statementId }) =>
      unreconcileLine(lineId, statementId, { branchId, financialYearId }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["reconciled-ids"] });
      toast.success("Line un‑reconciled");
    },
  });

  // CSV upload – scoped
  const handleFileUpload = async (e) => {
    const file = e.target.files[0];
    if (!file || !selectedAccountId || !branchId || !financialYearId) return;
    Papa.parse(file, {
      header: true,
      skipEmptyLines: true,
      complete: async (results) => {
        const rows = results.data.map((r) => ({
          account_id: selectedAccountId,
          statement_date: r.Date || r.statement_date || new Date().toISOString().split("T")[0],
          description: r.Description || r.description || "",
          debit: parseFloat(r.Debit || r.debit) || 0,
          credit: parseFloat(r.Credit || r.credit) || 0,
          reference: r.Reference || r.reference || "",
        }));
        try {
          await clearStatementLines(selectedAccountId, branchId, financialYearId);
          await importStatementLines(rows, { branchId, financialYearId });
          queryClient.invalidateQueries({ queryKey: ["statement-lines"] });
          toast.success(`${rows.length} statement lines imported`);
        } catch (err) {
          toast.error("Import failed");
        }
      },
      error: () => toast.error("CSV parsing error"),
    });
  };

  // Totals
  const stmtTotal = statementLines.reduce((s, l) => s + (l.debit || 0) - (l.credit || 0), 0);
  const unreconciledTotal = unreconciled
    .filter((u) => !reconciledSet.has(u.id))
    .reduce((s, u) => s + (u.debit || 0) - (u.credit || 0), 0);

  // ─── PDF Export (reconciliation summary) ──────────────────
  const handlePrintPDF = async () => {
    if (!selectedAccountId) return;

    const doc = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4" });
    const pageWidth = doc.internal.pageSize.getWidth();
    const pageHeight = doc.internal.pageSize.getHeight();
    const margin = 10;
    let y = margin;

    // Logo
    let logoBase64 = null;
    if (org?.logo_dark_url) {
      logoBase64 = await loadImageAsBase64(org.logo_dark_url);
    }

    // Header
    const logoWidth = 35, logoHeight = 14;
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
      const addrLines = doc.splitTextToSize(org.address, pageWidth - textX - margin - 10);
      doc.text(addrLines, textX, detailY);
      detailY += addrLines.length * 3.5 + 1;
    }
    if (org?.gstin) { doc.text(`GSTIN: ${org.gstin}`, textX, detailY); detailY += 4; }
    if (org?.phone) { doc.text(`Phone: ${org.phone}`, textX, detailY); detailY += 4; }
    if (org?.email) { doc.text(`Email: ${org.email}`, textX, detailY); detailY += 4; }

    const headerHeight = Math.max(logoHeight + 4, detailY - textY + 4);
    y += headerHeight + 2;
    doc.setDrawColor("#000000");
    doc.line(margin, y, pageWidth - margin, y);
    y += 6;

    // Title
    doc.setFontSize(16);
    doc.setFont("helvetica", "bold");
    doc.setTextColor("#000000");
    doc.text("Bank Reconciliation", pageWidth / 2, y, { align: "center" });
    y += 10;

    const accountName = accounts.find((a) => a.id == selectedAccountId)?.account_name || "Selected Account";
    doc.setFontSize(10);
    doc.setFont("helvetica", "normal");
    doc.text(`Account: ${accountName}  |  Period: ${startDate} – ${endDate}`, pageWidth / 2, y, { align: "center" });
    y += 10;

    // System entries table
    const tableRows = unreconciled.map((entry) => {
      const isRec = reconciledSet.has(entry.id);
      return [
        entry.journal_entries?.entry_date || "",
        entry.description || "",
        entry.debit > 0 ? entry.debit : "",
        entry.credit > 0 ? entry.credit : "",
        isRec ? "Reconciled" : "Pending",
      ];
    });

    autoTable(doc, {
      startY: y,
      head: [["Date", "Description", "Receipt", "Payment", "Status"]],
      body: tableRows,
      theme: "plain",
      styles: { fontSize: 9, textColor: [0,0,0], fillColor: [255,255,255], lineColor: [0,0,0], lineWidth: 0.2 },
      headStyles: { fillColor: [255,255,255], textColor: [0,0,0], fontStyle: "bold", lineWidth: 0.2, lineColor: [0,0,0] },
      columnStyles: {
        0: { cellWidth: 40 },
        1: { cellWidth: 80, halign: "left" },
        2: { cellWidth: 40, halign: "right" },
        3: { cellWidth: 40, halign: "right" },
        4: { cellWidth: 35 },
      },
      margin: { left: margin, right: margin },
      didDrawCell: (data) => {
        if ([2,3].includes(data.column.index) && typeof data.cell.raw === "number") {
          drawCurrency(doc, data.cell.raw, data.cell.x + data.cell.width - 2, data.cell.y + data.cell.height / 2 + 1.5, 9, "right", "#000");
        }
      },
    });

    y = doc.lastAutoTable.finalY + 8;

    // Summary
    const reconciledCount = unreconciled.filter((u) => reconciledSet.has(u.id)).length;
    const pendingCount = unreconciled.length - reconciledCount;

    doc.setFontSize(10);
    doc.setFont("helvetica", "normal");
    doc.text(`Reconciled Items: ${reconciledCount}`, margin, y);
    y += 5;
    doc.text(`Pending Items: ${pendingCount}`, margin, y);
    y += 5;
    doc.text(`Unreconciled Amount: ₹ ${unreconciledTotal.toLocaleString("en-IN")}`, margin, y);
    y += 8;

    // Footer
    const footerY = pageHeight - margin - 5;
    doc.setFontSize(7);
    doc.setTextColor("#000000");
    doc.setFont("helvetica", "italic");
    doc.text(`Generated on ${new Date().toLocaleString()}`, margin, footerY);
    doc.text(`© ${org?.company_name || "Academy"}`, pageWidth / 2, footerY, { align: "center" });

    doc.save(`Bank_Reconciliation_${accountName}.pdf`);
  };

  return (
    <div className="space-y-6 px-4 sm:px-6 lg:px-0">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold text-gray-900">Bank Reconciliation</h1>
          <p className="text-sm text-gray-600 mt-1">Match your bank statement with system entries</p>
        </div>
        {selectedAccountId && (
          <button
            onClick={handlePrintPDF}
            className="inline-flex items-center gap-2 px-4 py-2.5 bg-primary hover:bg-accent text-white rounded-lg transition-colors text-sm font-medium"
          >
            <Printer size={16} /> Print PDF
          </button>
        )}
      </div>

      {/* Account & Date Selectors */}
      <div className="flex flex-wrap gap-4 items-end">
        <select
          value={selectedAccountId}
          onChange={(e) => setSelectedAccountId(e.target.value)}
          className="border border-gray-300 bg-white text-gray-900 rounded-lg p-2.5 text-sm"
        >
          <option value="">Select Bank / Cash Account</option>
          {accounts.map((a) => (
            <option key={a.id} value={a.id}>
              {a.account_code} - {a.account_name}
            </option>
          ))}
        </select>
        <input
          type="date"
          value={startDate}
          onChange={(e) => setStartDate(e.target.value)}
          className="border border-gray-300 bg-white text-gray-900 rounded-lg p-2.5 text-sm"
        />
        <input
          type="date"
          value={endDate}
          onChange={(e) => setEndDate(e.target.value)}
          className="border border-gray-300 bg-white text-gray-900 rounded-lg p-2.5 text-sm"
        />
        <button
          onClick={() => fileInputRef.current?.click()}
          className="inline-flex items-center gap-2 px-4 py-2.5 border border-gray-300 bg-white text-gray-700 rounded-lg hover:bg-gray-50 transition-colors text-sm"
        >
          <Upload size={16} /> Upload Statement CSV
        </button>
        <input
          type="file"
          ref={fileInputRef}
          className="hidden"
          accept=".csv"
          onChange={handleFileUpload}
        />
      </div>

      {!selectedAccountId ? (
        <div className="bg-white rounded-xl p-10 text-center text-gray-500 border border-gray-200">
          Please select a bank/cash account to begin.
        </div>
      ) : (
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
          {/* Bank Statement Side (unchanged except text colors) */}
          <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
            <h2 className="text-lg font-semibold p-4 border-b border-gray-200 text-gray-900">
              Bank Statement (Uploaded)
            </h2>
            <div className="max-h-96 overflow-y-auto">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 sticky top-0">
                  <tr>
                    <th className="p-2 text-left text-xs font-medium text-gray-500 uppercase">Date</th>
                    <th className="p-2 text-left text-xs font-medium text-gray-500 uppercase">Description</th>
                    <th className="p-2 text-right text-xs font-medium text-gray-500 uppercase">Debit</th>
                    <th className="p-2 text-right text-xs font-medium text-gray-500 uppercase">Credit</th>
                    <th className="p-2 text-right text-xs font-medium text-gray-500 uppercase">Balance</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200">
                  {statementLines.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="p-4 text-center text-gray-500">No statement lines. Upload a CSV.</td>
                    </tr>
                  ) : (
                    statementLines.map((line) => (
                      <tr
                        key={line.id}
                        className={`cursor-pointer transition-colors ${
                          selectedStatementId === line.id ? "bg-blue-50" : "hover:bg-gray-50"
                        }`}
                        onClick={() => setSelectedStatementId(line.id)}
                      >
                        <td className="p-2 text-gray-700">{line.statement_date}</td>
                        <td className="p-2 text-gray-700">{line.description}</td>
                        <td className="p-2 text-right text-gray-700">
                          {line.debit > 0 ? `₹ ${Number(line.debit).toLocaleString("en-IN")}` : ""}
                        </td>
                        <td className="p-2 text-right text-gray-700">
                          {line.credit > 0 ? `₹ ${Number(line.credit).toLocaleString("en-IN")}` : ""}
                        </td>
                        <td className="p-2 text-right font-medium text-gray-900">
                          ₹ {statementLines
                            .filter((l, i) => i <= statementLines.indexOf(line))
                            .reduce((s, l) => s + (l.debit || 0) - (l.credit || 0), 0)
                            .toLocaleString("en-IN")}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
            <div className="p-3 border-t border-gray-200 font-bold text-right text-gray-900">
              Statement Balance: ₹ {stmtTotal.toLocaleString("en-IN")}
            </div>
          </div>

          {/* System Entries Side (unchanged except text colors) */}
          <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
            <h2 className="text-lg font-semibold p-4 border-b border-gray-200 text-gray-900">
              System Entries (Reconcile)
            </h2>
            <div className="max-h-96 overflow-y-auto">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 sticky top-0">
                  <tr>
                    <th className="p-2 text-left text-xs font-medium text-gray-500 uppercase"></th>
                    <th className="p-2 text-left text-xs font-medium text-gray-500 uppercase">Date</th>
                    <th className="p-2 text-left text-xs font-medium text-gray-500 uppercase">Description</th>
                    <th className="p-2 text-right text-xs font-medium text-gray-500 uppercase">Receipt</th>
                    <th className="p-2 text-right text-xs font-medium text-gray-500 uppercase">Payment</th>
                    <th className="p-2 text-right text-xs font-medium text-gray-500 uppercase">Reconciled</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200">
                  {unreconciled.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="p-4 text-center text-gray-500">No entries for this period.</td>
                    </tr>
                  ) : (
                    unreconciled.map((entry) => {
                      const isRec = reconciledSet.has(entry.id);
                      return (
                        <tr
                          key={entry.id}
                          className={`${isRec ? "bg-green-50" : "hover:bg-gray-50"} transition-colors`}
                        >
                          <td className="p-1 text-center">
                            {selectedStatementId && !isRec && (
                              <button
                                onClick={() =>
                                  reconcileMut.mutate({ lineId: entry.id, statementId: selectedStatementId })
                                }
                                className="text-green-600 p-1"
                                title="Match with selected statement line"
                              >
                                <Check size={14} />
                              </button>
                            )}
                            {isRec && (
                              <button
                                onClick={() =>
                                  unreconcileMut.mutate({ lineId: entry.id, statementId: selectedStatementId })
                                }
                                className="text-red-600 p-1"
                                title="Un‑reconcile"
                              >
                                <X size={14} />
                              </button>
                            )}
                          </td>
                          <td className="p-2 text-gray-700">{entry.journal_entries?.entry_date}</td>
                          <td className="p-2 text-gray-700">{entry.description}</td>
                          <td className="p-2 text-right text-green-600">
                            {entry.debit > 0 ? `₹ ${Number(entry.debit).toLocaleString("en-IN")}` : ""}
                          </td>
                          <td className="p-2 text-right text-red-600">
                            {entry.credit > 0 ? `₹ ${Number(entry.credit).toLocaleString("en-IN")}` : ""}
                          </td>
                          <td className="p-2 text-center text-lg">{isRec ? "✅" : "⏳"}</td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
            <div className="p-3 border-t border-gray-200 font-bold text-right text-gray-900">
              Unreconciled Amount: ₹ {unreconciledTotal.toLocaleString("en-IN")}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}