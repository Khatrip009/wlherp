// src/pages/Budgets.jsx
import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import toast from "react-hot-toast";
import { Plus, Edit3, Trash2, BarChart3, Printer } from "lucide-react";
import { Link } from "react-router-dom";
import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";
import { supabase } from "../api/supabase";
import { useOrg } from "../context/OrganizationContext";
import { useTheme } from "../context/ThemeContext"; // ✅ dynamic theme

/* ─── PDF helpers (unchanged) ──────────────────────────────── */
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

export default function Budgets() {
  const queryClient = useQueryClient();
  const { org, branch, selectedFinancialYear } = useOrg();
  const theme = useTheme();
  const orgId = org?.id;
  const branchId = branch?.id;
  const financialYearId = selectedFinancialYear?.id;

  const headingFont = theme?.font_heading || "Righteous";
  const bodyFont = theme?.font_body || "Montserrat";

  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState({
    account_id: "",
    period_start: "",
    period_end: "",
    amount: "",
  });

  // ✅ Fetch budgets – scoped by branch & FY only
  const { data: budgets = [], isLoading } = useQuery({
    queryKey: ["budgets", branchId, financialYearId],
    queryFn: async () => {
      let query = supabase
        .from("budgets")
        .select("*, chart_of_accounts!inner(account_code, account_name)")
        .order("period_start", { ascending: false });

      if (branchId) query = query.eq("branch_id", branchId);
      if (financialYearId) query = query.eq("financial_year_id", financialYearId);

      const { data, error } = await query;
      if (error) throw error;
      return data || [];
    },
    enabled: !!branchId && !!financialYearId,
    staleTime: 5 * 60 * 1000,
  });

  // ✅ Fetch expense accounts for dropdown – scoped by organisation, branch, FY
  const { data: accounts = [] } = useQuery({
    queryKey: ["expense-accounts", orgId, branchId, financialYearId],
    queryFn: async () => {
      let query = supabase
        .from("chart_of_accounts")
        .select("id, account_code, account_name")
        .eq("organization_id", orgId)
        .eq("account_type", "expense")
        .order("account_code");

      if (branchId) query = query.eq("branch_id", branchId);
      if (financialYearId) query = query.eq("financial_year_id", financialYearId);

      const { data, error } = await query;
      if (error) throw error;
      return data || [];
    },
    enabled: !!orgId,
    staleTime: 10 * 60 * 1000,
  });

  // ✅ Mutations – no org_id, only branch/fy
  const createMut = useMutation({
    mutationFn: async (payload) => {
      const { data, error } = await supabase
        .from("budgets")
        .insert({
          account_id: payload.account_id,
          period_start: payload.period_start,
          period_end: payload.period_end,
          amount: payload.amount,
          branch_id: branchId,
          financial_year_id: financialYearId,
        })
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      toast.success("Budget created");
      queryClient.invalidateQueries({ queryKey: ["budgets"] });
      setShowForm(false);
    },
    onError: () => toast.error("Failed to create budget"),
  });

  const updateMut = useMutation({
    mutationFn: async ({ id, payload }) => {
      const { data, error } = await supabase
        .from("budgets")
        .update({
          account_id: payload.account_id,
          period_start: payload.period_start,
          period_end: payload.period_end,
          amount: payload.amount,
          branch_id: branchId,
          financial_year_id: financialYearId,
        })
        .eq("id", id)
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      toast.success("Budget updated");
      queryClient.invalidateQueries({ queryKey: ["budgets"] });
      setEditing(null);
      setShowForm(false);
    },
    onError: () => toast.error("Failed to update budget"),
  });

  const deleteMut = useMutation({
    mutationFn: async (id) => {
      let query = supabase.from("budgets").delete().eq("id", id);
      if (branchId) query = query.eq("branch_id", branchId);
      if (financialYearId) query = query.eq("financial_year_id", financialYearId);
      const { error } = await query;
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Budget deleted");
      queryClient.invalidateQueries({ queryKey: ["budgets"] });
    },
    onError: () => toast.error("Delete failed"),
  });

  const openCreate = () => {
    setForm({ account_id: "", period_start: "", period_end: "", amount: "" });
    setEditing(null);
    setShowForm(true);
  };

  const openEdit = (budget) => {
    setForm({
      account_id: budget.account_id,
      period_start: budget.period_start,
      period_end: budget.period_end,
      amount: budget.amount,
    });
    setEditing(budget);
    setShowForm(true);
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    const payload = {
      ...form,
      amount: parseFloat(form.amount),
    };
    if (editing) updateMut.mutate({ id: editing.id, payload });
    else createMut.mutate(payload);
  };

  // ─── PDF Export (unchanged, uses black theme) ─────────────
  const handlePrintPDF = async () => {
    if (budgets.length === 0) return;

    const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
    const pageWidth = doc.internal.pageSize.getWidth();
    const pageHeight = doc.internal.pageSize.getHeight();
    const margin = 14;
    let y = margin;

    // Logo
    let logoBase64 = null;
    if (org?.logo_dark_url) {
      logoBase64 = await loadImageAsBase64(org.logo_dark_url);
    }

    // Header
    const logoWidth = 30, logoHeight = 12;
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
    doc.text("Budgets", pageWidth / 2, y, { align: "center" });
    y += 10;

    // Build rows
    const rows = budgets.map((b) => [
      `${b.chart_of_accounts?.account_code || ""} - ${b.chart_of_accounts?.account_name || ""}`,
      b.period_start,
      b.period_end,
      b.amount,
    ]);

    autoTable(doc, {
      startY: y,
      head: [["Account", "Period Start", "Period End", "Budget Amount"]],
      body: rows,
      theme: "plain",
      styles: { fontSize: 9, textColor: [0,0,0], fillColor: [255,255,255], lineColor: [0,0,0], lineWidth: 0.2 },
      headStyles: { fillColor: [255,255,255], textColor: [0,0,0], fontStyle: "bold", lineWidth: 0.2, lineColor: [0,0,0] },
      columnStyles: {
        0: { cellWidth: 80, halign: "left" },
        1: { cellWidth: 35 },
        2: { cellWidth: 35 },
        3: { cellWidth: 40, halign: "right" },
      },
      margin: { left: margin, right: margin },
      willDrawCell: (data) => {
        if (data.column.index === 3 && typeof data.cell.raw === "number") {
          data.cell.text = [];
        }
      },
      didDrawCell: (data) => {
        if (data.column.index === 3 && typeof data.cell.raw === "number") {
          drawCurrency(doc, data.cell.raw, data.cell.x + data.cell.width - 2, data.cell.y + data.cell.height / 2 + 1.5, 9, "right", "#000");
        }
      },
    });

    y = doc.lastAutoTable.finalY + 10;

    // Footer
    const footerY = pageHeight - margin - 5;
    doc.setFontSize(7);
    doc.setTextColor("#000000");
    doc.setFont("helvetica", "italic");
    doc.text(`Generated on ${new Date().toLocaleString()}`, margin, footerY);
    doc.text(`© ${org?.company_name || "Academy"}`, pageWidth / 2, footerY, { align: "center" });

    doc.save(`Budgets_${new Date().toISOString().slice(0, 10)}.pdf`);
  };

  return (
    <div className="space-y-6 px-4 sm:px-6 lg:px-0">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1
            className="text-2xl sm:text-3xl font-bold text-primary"
            style={{ fontFamily: headingFont }}
          >
            Budgets
          </h1>
          <p
            className="text-sm text-primary-dark mt-1"
            style={{ fontFamily: bodyFont }}
          >
            Set and manage expense budgets
          </p>
        </div>
        <div className="flex gap-2">
          <Link
            to="/budget-vs-actual"
            className="inline-flex items-center gap-2 px-4 py-2.5 border border-primary-bg bg-white text-primary-dark rounded-lg hover:bg-primary-bg transition-colors text-sm"
            style={{ fontFamily: bodyFont }}
          >
            <BarChart3 size={16} /> Budget vs Actual
          </Link>
          <button
            onClick={handlePrintPDF}
            className="inline-flex items-center gap-2 px-4 py-2.5 bg-primary hover:bg-accent text-white rounded-lg transition-colors text-sm font-medium"
            style={{ fontFamily: bodyFont }}
          >
            <Printer size={16} /> Print PDF
          </button>
          <button
            onClick={openCreate}
            className="inline-flex items-center gap-2 px-4 py-2.5 bg-primary hover:bg-accent text-white rounded-lg transition-colors text-sm font-medium"
            style={{ fontFamily: bodyFont }}
          >
            <Plus size={16} /> Add Budget
          </button>
        </div>
      </div>

      {/* Budgets Table */}
      <div className="bg-white rounded-xl shadow-sm border border-primary-bg overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[600px]">
            <thead className="bg-primary-bg">
              <tr>
                <th className="p-3 text-left text-xs font-medium text-primary-dark uppercase tracking-wider">
                  Account
                </th>
                <th className="p-3 text-left text-xs font-medium text-primary-dark uppercase tracking-wider">
                  Period Start
                </th>
                <th className="p-3 text-left text-xs font-medium text-primary-dark uppercase tracking-wider">
                  Period End
                </th>
                <th className="p-3 text-right text-xs font-medium text-primary-dark uppercase tracking-wider">
                  Budget Amount
                </th>
                <th className="p-3 text-left text-xs font-medium text-primary-dark uppercase tracking-wider">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-primary-bg">
              {isLoading ? (
                <tr>
                  <td colSpan={5} className="p-6 text-center text-primary-dark/60" style={{ fontFamily: bodyFont }}>
                    Loading…
                  </td>
                </tr>
              ) : budgets.length === 0 ? (
                <tr>
                  <td colSpan={5} className="p-6 text-center text-primary-dark/60" style={{ fontFamily: bodyFont }}>
                    No budgets set. Create one to start.
                  </td>
                </tr>
              ) : (
                budgets.map((b) => (
                  <tr key={b.id} className="hover:bg-primary-bg transition-colors">
                    <td className="p-3 text-sm text-primary">
                      {b.chart_of_accounts?.account_code} - {b.chart_of_accounts?.account_name}
                    </td>
                    <td className="text-sm text-primary-dark">{b.period_start}</td>
                    <td className="text-sm text-primary-dark">{b.period_end}</td>
                    <td className="text-sm text-right font-medium text-primary">
                      ₹ {Number(b.amount).toLocaleString("en-IN")}
                    </td>
                    <td className="text-sm">
                      <div className="flex gap-2">
                        <button onClick={() => openEdit(b)} className="text-primary hover:underline">
                          <Edit3 size={15} />
                        </button>
                        <button
                          onClick={() => {
                            if (window.confirm("Delete?")) deleteMut.mutate(b.id);
                          }}
                          className="text-accent hover:underline"
                        >
                          <Trash2 size={15} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Add / Edit Modal */}
      {showForm && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl max-w-md w-full p-6 shadow-xl border border-primary-bg">
            <h2 className="text-xl font-bold mb-4 text-primary" style={{ fontFamily: headingFont }}>
              {editing ? "Edit Budget" : "Add Budget"}
            </h2>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-primary-dark mb-1" style={{ fontFamily: bodyFont }}>
                  Account *
                </label>
                <select
                  value={form.account_id}
                  onChange={(e) => setForm({ ...form, account_id: e.target.value })}
                  className="w-full border border-primary-bg bg-white text-primary rounded-lg p-2.5 text-sm"
                  required
                >
                  <option value="">Select account</option>
                  {accounts.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.account_code} - {a.account_name}
                    </option>
                  ))}
                </select>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-primary-dark mb-1" style={{ fontFamily: bodyFont }}>
                    Period Start *
                  </label>
                  <input
                    type="date"
                    value={form.period_start}
                    onChange={(e) => setForm({ ...form, period_start: e.target.value })}
                    className="w-full border border-primary-bg bg-white text-primary rounded-lg p-2.5 text-sm"
                    required
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-primary-dark mb-1" style={{ fontFamily: bodyFont }}>
                    Period End *
                  </label>
                  <input
                    type="date"
                    value={form.period_end}
                    onChange={(e) => setForm({ ...form, period_end: e.target.value })}
                    className="w-full border border-primary-bg bg-white text-primary rounded-lg p-2.5 text-sm"
                    required
                  />
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-primary-dark mb-1" style={{ fontFamily: bodyFont }}>
                  Budget Amount *
                </label>
                <input
                  type="number"
                  value={form.amount}
                  onChange={(e) => setForm({ ...form, amount: e.target.value })}
                  className="w-full border border-primary-bg bg-white text-primary rounded-lg p-2.5 text-sm"
                  required
                />
              </div>
              <div className="flex justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setShowForm(false)}
                  className="border border-primary-bg px-4 py-2 rounded-lg text-sm text-primary-dark hover:bg-primary-bg transition-colors"
                  style={{ fontFamily: bodyFont }}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="bg-primary hover:bg-accent text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors"
                  style={{ fontFamily: bodyFont }}
                >
                  {editing ? "Update" : "Create"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}