import { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";
import toast from "react-hot-toast";
import { Printer, Edit3, Save, X, ArrowLeft, Plus, Trash2 } from "lucide-react";
import {
  getVoucherById,
  updateVoucher,
  createVoucher,
  getVoucherTypes,
} from "../services/voucherService";
import { getChartOfAccounts } from "../services/accountingService";
import { useOrg } from "../context/OrganizationContext";

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
  const imgSize = fontSize * 0.4;
  if (align === 'left') {
    doc.addImage(img, 'PNG', x, y - fontSize * 0.35, imgSize, imgSize);
    doc.text(amountText, x + imgSize + 1, y);
  } else {
    doc.addImage(img, 'PNG', x - textWidth - imgSize - 1, y - fontSize * 0.35, imgSize, imgSize);
    doc.text(amountText, x - textWidth, y);
  }
}

// ─── Helper: load image as base64 ──────────────────────────
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

export default function VoucherDetail({ standalone = true }) {
  const { id } = useParams();
  const isNew = !id || id === "new";
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const { org, branch, selectedFinancialYear, theme } = useOrg();
  const branchId = branch?.id;
  const financialYearId = selectedFinancialYear?.id;
  const ctx = { branchId, financialYearId };

  const { data: accounts = [] } = useQuery({
    queryKey: ["chart-of-accounts", branchId, financialYearId],
    queryFn: () => getChartOfAccounts(branchId, financialYearId),
    enabled: !!branchId && !!financialYearId,
    staleTime: 10 * 60 * 1000,
  });

  const { data: voucherTypes = [] } = useQuery({
    queryKey: ["voucher-types"],
    queryFn: getVoucherTypes,
  });

  const { data: voucher, isLoading } = useQuery({
    queryKey: ["voucher", id, branchId, financialYearId],
    queryFn: () => getVoucherById(id, branchId, financialYearId),
    enabled: !isNew && !!branchId && !!financialYearId,
  });

  const [editing, setEditing] = useState(isNew);
  const [voucherTypeCode, setVoucherTypeCode] = useState("payment");
  const [form, setForm] = useState({
    entry_date: new Date().toISOString().split("T")[0],
    reference: "",
    description: "",
    lines: [{ account_id: "", debit: "", credit: "", description: "" }],
  });

  useEffect(() => {
    if (voucher) {
      setForm({
        entry_date: voucher.entry_date,
        reference: voucher.reference || "",
        description: voucher.description || "",
        lines:
          voucher.journal_entries?.journal_entry_lines?.map((l) => ({
            id: l.id,
            account_id: l.account_id,
            debit: l.debit,
            credit: l.credit,
            description: l.description,
          })) || [],
      });
      setVoucherTypeCode(voucher.voucher_types?.code || "journal");
    }
  }, [voucher]);

  const saveMutation = useMutation({
    mutationFn: (payload) =>
      isNew
        ? createVoucher(payload, ctx)
        : updateVoucher(id, payload, ctx),
    onSuccess: (data) => {
      toast.success(isNew ? "Voucher created" : "Voucher updated");
      queryClient.invalidateQueries(["vouchers"]);
      if (isNew) {
        navigate(`/vouchers/${data?.id || data?.voucher?.id || ""}`);
      } else {
        setEditing(false);
      }
    },
    onError: (err) => toast.error(err.message || "Save failed"),
  });

  const handleEditToggle = () => {
    if (editing) {
      setForm({
        entry_date: voucher.entry_date,
        reference: voucher.reference || "",
        description: voucher.description || "",
        lines:
          voucher.journal_entries?.journal_entry_lines?.map((l) => ({
            id: l.id,
            account_id: l.account_id,
            debit: l.debit,
            credit: l.credit,
            description: l.description,
          })) || [],
      });
    }
    setEditing(!editing);
  };

  const handleSave = () => {
    const totalDebit = form.lines.reduce(
      (s, l) => s + (parseFloat(l.debit) || 0),
      0
    );
    const totalCredit = form.lines.reduce(
      (s, l) => s + (parseFloat(l.credit) || 0),
      0
    );
    if (Math.abs(totalDebit - totalCredit) > 0.001) {
      toast.error("Debit and credit must balance");
      return;
    }
    const payload = {
      voucher_type_code: voucherTypeCode,
      entry_date: form.entry_date,
      reference: form.reference,
      description: form.description,
      lines: form.lines.map((l) => ({
        account_id: parseInt(l.account_id),
        debit: parseFloat(l.debit) || 0,
        credit: parseFloat(l.credit) || 0,
        description: l.description,
      })),
    };
    saveMutation.mutate(payload);
  };

  const addLine = () =>
    setForm({
      ...form,
      lines: [...form.lines, { account_id: "", debit: "", credit: "", description: "" }],
    });
  const removeLine = (idx) =>
    setForm({ ...form, lines: form.lines.filter((_, i) => i !== idx) });
  const updateLine = (idx, field, value) => {
    const updated = [...form.lines];
    updated[idx][field] = value;
    setForm({ ...form, lines: updated });
  };

  // ─── Print as PDF (A5 Landscape) with ₹ symbol ──────────
  const handlePrint = async () => {
    if (isNew || !voucher) return;

    try {
      const doc = new jsPDF({ unit: "mm", format: "a5", orientation: "landscape" });
      const pageWidth = doc.internal.pageSize.getWidth();
      const pageHeight = doc.internal.pageSize.getHeight();
      const margin = 10;

      // ── Load logo ──
      let logoBase64 = null;
      if (org?.logo_dark_url) {
        logoBase64 = await loadImageAsBase64(org.logo_dark_url);
      }

      const primaryColor = theme?.primary_color || "#0D47A1";
      const companyName = org?.company_name || "ShreeVidhya Academy";
      const address = org?.address || "";
      const gstin = org?.gstin || "";
      const stateCode = org?.state_code || "";
      const placeOfSupply = org?.place_of_supply || "";
      const registrationType = org?.registration_type || "";
      const phone = org?.phone || "";
      const email = org?.email || "";

      let y = 10;

      // ── Header ──
      if (logoBase64) {
        doc.addImage(logoBase64, "PNG", margin, y, 30, 12);
        y += 14;
      }
      const textX = logoBase64 ? margin + 34 : margin;
      const textY = y - 12;
      doc.setFont("helvetica", "bold");
      doc.setFontSize(14);
      doc.setTextColor(primaryColor);
      doc.text(companyName, textX, textY + 2);

      doc.setFont("helvetica", "normal");
      doc.setFontSize(7);
      doc.setTextColor("#333");
      let detailY = textY + 6;
      if (address) {
        const addrLines = doc.splitTextToSize(address, pageWidth - textX - margin - 10);
        doc.text(addrLines, textX, detailY);
        detailY += addrLines.length * 3.5 + 1;
      }
      if (gstin) {
        doc.text(`GSTIN: ${gstin}`, textX, detailY);
        detailY += 4;
      }
      if (stateCode) {
        doc.text(`State Code: ${stateCode}  |  Place of Supply: ${placeOfSupply}`, textX, detailY);
        detailY += 4;
      }
      if (registrationType) {
        doc.text(`Registration Type: ${registrationType}`, textX, detailY);
        detailY += 4;
      }
      if (phone) {
        doc.text(`Phone: ${phone}`, textX, detailY);
        detailY += 4;
      }
      if (email) {
        doc.text(`Email: ${email}`, textX, detailY);
      }

      y = Math.max(y, detailY + 2);

      // Separator line
      doc.setDrawColor(primaryColor);
      doc.line(margin, y, pageWidth - margin, y);
      y += 4;

      // ── Voucher Title ──
      doc.setFont("helvetica", "bold");
      doc.setFontSize(16);
      doc.setTextColor(primaryColor);
      doc.text(`${voucher.voucher_types?.name || ""} Voucher`, pageWidth / 2, y, { align: "center" });
      y += 8;

      // ── Voucher Meta ──
      doc.setFont("helvetica", "normal");
      doc.setFontSize(9);
      doc.setTextColor("#333");
      doc.text(`No: ${voucher.voucher_no}`, margin, y);
      doc.text(`Date: ${voucher.entry_date}`, pageWidth / 2, y, { align: "center" });
      doc.text(`Ref: ${voucher.reference || "—"}`, pageWidth - margin, y, { align: "right" });
      y += 6;

      // ── Table ──
      const lines = voucher.journal_entries?.journal_entry_lines || [];
      // Build table rows with empty text for debit/credit – we'll draw currency via didDrawCell
      const tableRows = lines.map((line) => [
        line.account?.account_name || "—",
        line.description || "",
        Number(line.debit || 0),
        Number(line.credit || 0),
      ]);

      const totalDebit = lines.reduce((s, l) => s + (Number(l.debit) || 0), 0);
      const totalCredit = lines.reduce((s, l) => s + (Number(l.credit) || 0), 0);

      autoTable(doc, {
        startY: y,
        head: [["Account", "Description", "Debit", "Credit"]],
        body: tableRows,
        theme: "grid",
        styles: { fontSize: 7, cellPadding: 2 },
        headStyles: { fillColor: primaryColor, textColor: "#FFFFFF", fontStyle: "bold", fontSize: 7 },
        columnStyles: {
          0: { cellWidth: 50 },
          1: { cellWidth: "auto" },
          2: { cellWidth: 25, halign: "right" },
          3: { cellWidth: 25, halign: "right" },
        },
        margin: { left: margin, right: margin },
        didDrawCell: (data) => {
          // For debit (col 2) and credit (col 3)
          if (data.column.index === 2 || data.column.index === 3) {
            const amount = data.cell.raw;
            if (typeof amount === 'number') {
              const x = data.cell.x + data.cell.width - 1; // right edge
              const yPos = data.cell.y + data.cell.height / 2 + 1.5;
              drawCurrency(doc, amount, x, yPos, 7, 'right', '#333');
            }
          }
        },
        // Clear the default text for debit/credit columns so we only draw the currency
        willDrawCell: (data) => {
          if (data.column.index === 2 || data.column.index === 3) {
            data.cell.text = [];
          }
        },
      });

      y = doc.lastAutoTable.finalY + 4;

      // ── Totals with ₹ ──
      const rightEdge = pageWidth - margin;
      doc.setFont("helvetica", "bold");
      doc.setFontSize(9);
      doc.setTextColor(primaryColor);
      doc.text("Total Debit:", rightEdge - 60, y);
      drawCurrency(doc, totalDebit, rightEdge, y, 9, 'right', primaryColor);
      y += 5;
      doc.text("Total Credit:", rightEdge - 60, y);
      drawCurrency(doc, totalCredit, rightEdge, y, 9, 'right', primaryColor);
      y += 8;

      // ── Footer ──
      doc.setFont("helvetica", "italic");
      doc.setFontSize(7);
      doc.setTextColor("#888");
      doc.text(
        `Generated on ${new Date().toLocaleString()} | Page 1 of 1`,
        pageWidth / 2,
        pageHeight - 8,
        { align: "center" }
      );

      // ── Save ──
      doc.save(`Voucher_${voucher.voucher_no}.pdf`);
      toast.success("PDF downloaded");
    } catch (err) {
      console.error(err);
      toast.error("Failed to generate voucher PDF");
    }
  };

  if (isLoading)
    return (
      <div className="p-8 text-center">Loading…</div>
    );
  if (!isNew && !voucher)
    return (
      <div className="p-8 text-center text-red-600">Voucher not found</div>
    );

  const lines = form.lines;
  const displayLines = editing
    ? lines
    : voucher?.journal_entries?.journal_entry_lines || [];

  return (
    <>
      {standalone && (
        <button
          onClick={() => navigate("/vouchers")}
          className="inline-flex items-center gap-2 text-secondary hover:text-primary-dark mb-4 text-sm"
        >
          <ArrowLeft size={18} /> Back to Vouchers
        </button>
      )}

      <div className="flex justify-between items-center mb-6">
        <div>
          <h1 className="text-3xl font-righteous text-primary-dark">
            {isNew
              ? "New Voucher"
              : `${voucher?.voucher_types?.name || ""} Voucher`}
          </h1>
          <p className="text-sm text-secondary-dark">
            {isNew ? "Create a new accounting entry" : voucher?.voucher_no}
          </p>
        </div>
        <div className="flex gap-3">
          {!isNew && (
            <button
              onClick={handlePrint}
              className="bg-primary text-white px-4 py-2 rounded-lg text-sm flex items-center gap-2"
            >
              <Printer size={16} /> PDF
            </button>
          )}
          {!isNew && !editing && (
            <button
              onClick={handleEditToggle}
              className="border px-4 py-2 rounded-lg text-sm flex items-center gap-2"
            >
              <Edit3 size={16} /> Edit
            </button>
          )}
          {editing && (
            <>
              <button
                onClick={() =>
                  isNew ? navigate("/vouchers") : handleEditToggle()
                }
                className="border px-4 py-2 rounded-lg text-sm flex items-center gap-2"
              >
                <X size={16} /> Cancel
              </button>
              <button
                onClick={handleSave}
                className="bg-primary text-white px-4 py-2 rounded-lg text-sm flex items-center gap-2"
              >
                <Save size={16} /> Save
              </button>
            </>
          )}
        </div>
      </div>

      {isNew && (
        <div className="mb-4">
          <label className="block text-sm font-medium mb-1">Voucher Type</label>
          <select
            value={voucherTypeCode}
            onChange={(e) => setVoucherTypeCode(e.target.value)}
            className="border rounded p-2.5 text-sm w-full max-w-xs"
          >
            {voucherTypes.map((t) => (
              <option key={t.code} value={t.code}>
                {t.name}
              </option>
            ))}
          </select>
        </div>
      )}

      <div className="bg-white rounded-xl p-6 shadow-sm">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
          <div>
            <label className="block text-sm text-secondary-dark mb-1">Date</label>
            {editing ? (
              <input
                type="date"
                value={form.entry_date}
                onChange={(e) => setForm({ ...form, entry_date: e.target.value })}
                className="w-full border rounded p-2.5 text-sm"
              />
            ) : (
              <p className="text-sm font-medium">{voucher?.entry_date}</p>
            )}
          </div>
          <div>
            <label className="block text-sm text-secondary-dark mb-1">Reference</label>
            {editing ? (
              <input
                type="text"
                value={form.reference}
                onChange={(e) => setForm({ ...form, reference: e.target.value })}
                className="w-full border rounded p-2.5 text-sm"
              />
            ) : (
              <p className="text-sm font-medium">{voucher?.reference || "—"}</p>
            )}
          </div>
          <div>
            <label className="block text-sm text-secondary-dark mb-1">Description</label>
            {editing ? (
              <input
                type="text"
                value={form.description}
                onChange={(e) => setForm({ ...form, description: e.target.value })}
                className="w-full border rounded p-2.5 text-sm"
              />
            ) : (
              <p className="text-sm font-medium">{voucher?.description || "—"}</p>
            )}
          </div>
        </div>

        <table className="w-full mb-4">
          <thead className="bg-slate-100">
            <tr>
              <th className="p-3 text-left text-sm">Account</th>
              <th className="p-3 text-left text-sm">Description</th>
              <th className="p-3 text-right text-sm">Debit</th>
              <th className="p-3 text-right text-sm">Credit</th>
              {editing && <th></th>}
            </tr>
          </thead>
          <tbody>
            {editing
              ? lines.map((line, idx) => (
                  <tr key={idx} className="border-t">
                    <td className="p-2">
                      <select
                        value={line.account_id}
                        onChange={(e) => updateLine(idx, "account_id", e.target.value)}
                        className="w-full border rounded p-2 text-sm"
                      >
                        <option value="">Select Account</option>
                        {accounts.map((a) => (
                          <option key={a.id} value={a.id}>
                            {a.account_code} - {a.account_name}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td className="p-2">
                      <input
                        type="text"
                        value={line.description}
                        onChange={(e) => updateLine(idx, "description", e.target.value)}
                        className="w-full border rounded p-2 text-sm"
                      />
                    </td>
                    <td className="p-2">
                      <input
                        type="number"
                        value={line.debit}
                        onChange={(e) => updateLine(idx, "debit", e.target.value)}
                        className="w-full border rounded p-2 text-sm text-right"
                      />
                    </td>
                    <td className="p-2">
                      <input
                        type="number"
                        value={line.credit}
                        onChange={(e) => updateLine(idx, "credit", e.target.value)}
                        className="w-full border rounded p-2 text-sm text-right"
                      />
                    </td>
                    <td className="p-1">
                      <button
                        type="button"
                        onClick={() => removeLine(idx)}
                        className="text-red-600"
                      >
                        <Trash2 size={16} />
                      </button>
                    </td>
                  </tr>
                ))
              : displayLines.map((line, idx) => (
                  <tr key={idx} className="border-t">
                    <td className="p-3 text-sm">
                      {line.account?.account_name || "—"}
                    </td>
                    <td className="p-3 text-sm">{line.description}</td>
                    <td className="p-3 text-sm text-right">
                      ₹{Number(line.debit).toLocaleString()}
                    </td>
                    <td className="p-3 text-sm text-right">
                      ₹{Number(line.credit).toLocaleString()}
                    </td>
                  </tr>
                ))}
          </tbody>
        </table>

        {editing && (
          <button
            type="button"
            onClick={addLine}
            className="text-primary flex items-center gap-1 text-sm mb-4"
          >
            <Plus size={16} /> Add Line
          </button>
        )}
      </div>
    </>
  );
}