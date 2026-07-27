// src/pages/ChartOfAccounts.jsx
import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import toast from "react-hot-toast";
import { Plus, Edit3, Trash2, X, Printer } from "lucide-react";
import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";

import {
  getChartOfAccounts,
  createAccount,
  updateAccount,
  deleteAccount,
} from "../services/accountingService";
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

export default function ChartOfAccounts() {
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
    account_code: "",
    account_name: "",
    account_type: "asset",
    parent_id: "",
  });

  // Fetch accounts – now scoped by org, branch, FY
  const { data: accounts = [], isLoading } = useQuery({
    queryKey: ["chart-of-accounts", orgId, branchId, financialYearId],
    queryFn: () => getChartOfAccounts(orgId, branchId, financialYearId),
    enabled: !!orgId,
    staleTime: 10 * 60 * 1000,
  });

  // Mutation context – includes branchId, financialYearId
  const context = { branchId, financialYearId };

  const createMutation = useMutation({
    mutationFn: (payload) => createAccount(payload, context),
    onSuccess: () => {
      toast.success("Account created");
      queryClient.invalidateQueries({ queryKey: ["chart-of-accounts"] });
      setShowForm(false);
      resetForm();
    },
    onError: (err) => toast.error(err.message || "Failed to create"),
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, payload }) => updateAccount(id, payload, context),
    onSuccess: () => {
      toast.success("Account updated");
      queryClient.invalidateQueries({ queryKey: ["chart-of-accounts"] });
      setEditing(null);
      setShowForm(false);
      resetForm();
    },
    onError: (err) => toast.error(err.message || "Failed to update"),
  });

  const deleteMutation = useMutation({
    mutationFn: (id) => deleteAccount(id, branchId, financialYearId),
    onSuccess: () => {
      toast.success("Account deleted");
      queryClient.invalidateQueries({ queryKey: ["chart-of-accounts"] });
    },
    onError: (err) => toast.error(err.message || "Delete failed"),
  });

  const resetForm = () =>
    setForm({ account_code: "", account_name: "", account_type: "asset", parent_id: "" });

  const openCreate = () => {
    resetForm();
    setEditing(null);
    setShowForm(true);
  };

  const openEdit = (account) => {
    setForm({
      account_code: account.account_code,
      account_name: account.account_name,
      account_type: account.account_type,
      parent_id: account.parent_id || "",
    });
    setEditing(account);
    setShowForm(true);
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!form.account_code.trim() || !form.account_name.trim()) {
      toast.error("Code and name are required");
      return;
    }
    // Always attach the organization id to the account
    const payload = {
      ...form,
      parent_id: form.parent_id ? Number(form.parent_id) : null,
      organization_id: orgId,   // ✅ ensures new account belongs to org
    };
    if (editing) {
      updateMutation.mutate({ id: editing.id, payload });
    } else {
      createMutation.mutate(payload);
    }
  };

  // Group accounts by type for display
  const grouped = accounts.reduce((acc, a) => {
    const type = a.account_type;
    if (!acc[type]) acc[type] = [];
    acc[type].push(a);
    return acc;
  }, {});

  // ─── PDF Export (all accounts, grouped by type) ────────────
  const handlePrintPDF = async () => {
    if (accounts.length === 0) return;

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
    doc.text("Chart of Accounts", pageWidth / 2, y, { align: "center" });
    y += 10;

    // Print each account type group
    for (const [type, accts] of Object.entries(grouped)) {
      doc.setFontSize(12);
      doc.setFont("helvetica", "bold");
      doc.setTextColor("#000000");
      doc.text(type.charAt(0).toUpperCase() + type.slice(1), margin, y);
      y += 7;

      const rows = accts.map((a) => [
        a.account_code,
        a.account_name,
        accounts.find((p) => p.id === a.parent_id)?.account_name || "-",
      ]);

      autoTable(doc, {
        startY: y,
        head: [["Code", "Name", "Parent"]],
        body: rows,
        theme: "plain",
        styles: { fontSize: 9, textColor: [0,0,0], fillColor: [255,255,255], lineColor: [0,0,0], lineWidth: 0.2 },
        headStyles: { fillColor: [255,255,255], textColor: [0,0,0], fontStyle: "bold", lineWidth: 0.2, lineColor: [0,0,0] },
        columnStyles: { 0: { cellWidth: 30 }, 1: { cellWidth: 100 }, 2: { cellWidth: 60 } },
        margin: { left: margin, right: margin },
      });
      y = doc.lastAutoTable.finalY + 8;
    }

    // Footer
    const footerY = pageHeight - margin - 5;
    doc.setFontSize(7);
    doc.setTextColor("#000000");
    doc.setFont("helvetica", "italic");
    doc.text(`Generated on ${new Date().toLocaleString()}`, margin, footerY);
    doc.text(`© ${org?.company_name || "Academy"}`, pageWidth / 2, footerY, { align: "center" });

    doc.save(`Chart_of_Accounts.pdf`);
  };

  return (
    <>
      <div className="flex justify-between items-center mb-6">
        <h1
          className="text-3xl font-bold text-primary"
          style={{ fontFamily: headingFont }}
        >
          Chart of Accounts
        </h1>
        <div className="flex gap-2">
          <button
            onClick={handlePrintPDF}
            className="bg-primary hover:bg-accent text-white px-4 py-2 rounded-lg flex items-center gap-2 text-sm transition"
            style={{ fontFamily: bodyFont }}
          >
            <Printer size={18} /> Print PDF
          </button>
          <button
            onClick={openCreate}
            className="bg-primary hover:bg-accent text-white px-4 py-2 rounded-lg flex items-center gap-2 text-sm transition"
            style={{ fontFamily: bodyFont }}
          >
            <Plus size={18} /> Add Account
          </button>
        </div>
      </div>

      {isLoading ? (
        <p className="text-center py-6 text-primary-dark/60" style={{ fontFamily: bodyFont }}>
          Loading…
        </p>
      ) : (
        Object.entries(grouped).map(([type, accts]) => (
          <div key={type} className="mb-6">
            <h2
              className="text-xl font-semibold text-primary capitalize mb-3"
              style={{ fontFamily: headingFont }}
            >
              {type}
            </h2>
            <div className="bg-white rounded-xl shadow-sm overflow-hidden border border-primary-bg">
              <table className="w-full">
                <thead className="bg-primary-bg">
                  <tr>
                    <th
                      className="p-3 text-left text-sm text-primary-dark"
                      style={{ fontFamily: bodyFont }}
                    >
                      Code
                    </th>
                    <th
                      className="p-3 text-left text-sm text-primary-dark"
                      style={{ fontFamily: bodyFont }}
                    >
                      Name
                    </th>
                    <th
                      className="p-3 text-left text-sm text-primary-dark"
                      style={{ fontFamily: bodyFont }}
                    >
                      Parent
                    </th>
                    <th
                      className="p-3 text-right text-sm text-primary-dark"
                      style={{ fontFamily: bodyFont }}
                    >
                      Actions
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {accts.map((a) => (
                    <tr
                      key={a.id}
                      className="border-t border-primary-bg hover:bg-primary-bg transition"
                    >
                      <td className="p-3 text-sm font-medium text-primary">
                        {a.account_code}
                      </td>
                      <td className="text-sm text-primary-dark">{a.account_name}</td>
                      <td className="text-sm text-primary-dark">
                        {accounts.find((p) => p.id === a.parent_id)?.account_name || "-"}
                      </td>
                      <td className="text-sm text-right">
                        <button
                          onClick={() => openEdit(a)}
                          className="text-primary hover:underline mr-2"
                        >
                          <Edit3 size={15} />
                        </button>
                        <button
                          onClick={() => {
                            if (window.confirm("Delete this account?"))
                              deleteMutation.mutate(a.id);
                          }}
                          className="text-accent hover:underline"
                        >
                          <Trash2 size={15} />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        ))
      )}

      {/* Add / Edit Modal */}
      {showForm && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl w-full max-w-md shadow-xl border border-primary-bg">
            <div className="flex items-center justify-between px-6 py-4 border-b border-primary-bg">
              <h2
                className="text-xl font-bold text-primary"
                style={{ fontFamily: headingFont }}
              >
                {editing ? "Edit Account" : "Add Account"}
              </h2>
              <button
                onClick={() => setShowForm(false)}
                className="p-2 hover:bg-primary-bg rounded transition-colors"
              >
                <X size={20} className="text-primary-dark" />
              </button>
            </div>
            <form onSubmit={handleSubmit} className="p-6 space-y-4">
              <div>
                <label
                  className="block text-sm mb-1 text-primary-dark"
                  style={{ fontFamily: bodyFont }}
                >
                  Account Code *
                </label>
                <input
                  type="text"
                  value={form.account_code}
                  onChange={(e) => setForm({ ...form, account_code: e.target.value })}
                  className="w-full border border-primary-bg bg-white text-primary rounded p-2.5 text-sm focus:ring-2 focus:ring-primary outline-none"
                  required
                />
              </div>
              <div>
                <label
                  className="block text-sm mb-1 text-primary-dark"
                  style={{ fontFamily: bodyFont }}
                >
                  Account Name *
                </label>
                <input
                  type="text"
                  value={form.account_name}
                  onChange={(e) => setForm({ ...form, account_name: e.target.value })}
                  className="w-full border border-primary-bg bg-white text-primary rounded p-2.5 text-sm focus:ring-2 focus:ring-primary outline-none"
                  required
                />
              </div>
              <div>
                <label
                  className="block text-sm mb-1 text-primary-dark"
                  style={{ fontFamily: bodyFont }}
                >
                  Type
                </label>
                <select
                  value={form.account_type}
                  onChange={(e) => setForm({ ...form, account_type: e.target.value })}
                  className="w-full border border-primary-bg bg-white text-primary rounded p-2.5 text-sm focus:ring-2 focus:ring-primary outline-none"
                >
                  <option value="asset">Asset</option>
                  <option value="liability">Liability</option>
                  <option value="equity">Equity</option>
                  <option value="income">Income</option>
                  <option value="expense">Expense</option>
                </select>
              </div>
              <div>
                <label
                  className="block text-sm mb-1 text-primary-dark"
                  style={{ fontFamily: bodyFont }}
                >
                  Parent Account
                </label>
                <select
                  value={form.parent_id}
                  onChange={(e) => setForm({ ...form, parent_id: e.target.value })}
                  className="w-full border border-primary-bg bg-white text-primary rounded p-2.5 text-sm focus:ring-2 focus:ring-primary outline-none"
                >
                  <option value="">None</option>
                  {accounts.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.account_code} - {a.account_name}
                    </option>
                  ))}
                </select>
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
    </>
  );
}