// src/pages/VoucherDetail.jsx
import { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import toast from "react-hot-toast";
import { Printer, Edit3, Save, X, ArrowLeft, Plus, Trash2 } from "lucide-react";
import AdminLayout from "../layouts/AdminLayout";
import {
  getVoucherById,
  updateVoucher,
  createVoucher,
  getVoucherTypes,
} from "../services/voucherService";
import { getOrganization } from "../services/organizationService";
import { getChartOfAccounts } from "../services/accountingService";
import { useOrg } from "../context/OrganizationContext";   // NEW

export default function VoucherDetail() {
  const { id } = useParams();
  const isNew = !id || id === "new";
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  // ── Organisation / Branch / Financial Year context ──
  const { org: currentOrg, branch, selectedFinancialYear } = useOrg();   // NEW
  const ctx = { branchId: branch?.id, financialYearId: selectedFinancialYear?.id };

  // Fetch organization with current org id
  const { data: org } = useQuery({
    queryKey: ["organization", currentOrg?.id],
    queryFn: () => getOrganization(currentOrg?.id),
    enabled: !!currentOrg?.id,
  });

  const { data: accounts = [] } = useQuery({
    queryKey: ["chart-of-accounts"],
    queryFn: getChartOfAccounts,
  });
  const { data: voucherTypes = [] } = useQuery({
    queryKey: ["voucher-types"],
    queryFn: getVoucherTypes,
  });
  const { data: voucher, isLoading } = useQuery({
    queryKey: ["voucher", id],
    queryFn: () => getVoucherById(id),
    enabled: !isNew,
  });

  const [editing, setEditing] = useState(isNew);
  const [voucherTypeCode, setVoucherTypeCode] = useState("payment");
  const [form, setForm] = useState({
    entry_date: new Date().toISOString().split("T")[0],
    reference: "",
    description: "",
    lines: [{ account_id: "", debit: "", credit: "", description: "" }],
  });

  // Populate form when existing voucher loads
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

  // Save mutation – now passes context
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

  // Toggle edit mode
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

  // Save handler
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

  // Line management
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

  // Print function (unchanged, uses org data which is now correctly scoped)
  const handlePrint = () => {
    if (isNew || !voucher) return;

    const orgName = org?.company_name || "ShreeVidhya Academy";
    const orgAddr = org?.address || "";
    const orgPhone = org?.phone || "";
    const orgEmail = org?.email || "";
    const logoUrl = org?.logo_dark_url || "/ShreeVidhyaDark.png";

    const lines = voucher.journal_entries?.journal_entry_lines || [];
    const totalDebit = lines.reduce((s, l) => s + (Number(l.debit) || 0), 0);
    const totalCredit = lines.reduce((s, l) => s + (Number(l.credit) || 0), 0);

    const rows = lines
      .map(
        (line) => `
      <tr>
        <td>${line.account?.account_name || "—"}</td>
        <td>${line.description || ""}</td>
        <td class="text-right">₹${Number(line.debit).toLocaleString()}</td>
        <td class="text-right">₹${Number(line.credit).toLocaleString()}</td>
      </tr>`
      )
      .join("");

    const printHTML = `
  <!DOCTYPE html>
  <html>
  <head>
    <title>${voucher.voucher_no}</title>
    <style>
      @page {
        size: 190mm 83mm;
        margin: 4mm 5mm;
      }
      * { box-sizing: border-box; }
      body {
        font-family: 'Montserrat', 'Segoe UI', sans-serif;
        color: #222;
        margin: 0;
        padding: 0;
        font-size: 8.5px;
        line-height: 1.3;
      }
      .voucher-container {
        width: 100%;
        padding: 2mm 0;
      }
      .header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        border-bottom: 1.5px solid #0D47A1;
        padding-bottom: 4px;
        margin-bottom: 6px;
      }
      .header-left {
        display: flex;
        align-items: center;
        gap: 8px;
      }
      .header img {
        height: 30px;
      }
      .org-name {
        font-size: 14px;
        font-weight: 700;
        color: #0D47A1;
      }
      .org-details {
        font-size: 7px;
        color: #555;
        margin-top: 1px;
      }
      .voucher-title {
        text-align: center;
        font-size: 13px;
        font-weight: 700;
        color: #0D47A1;
        text-transform: uppercase;
        letter-spacing: 1px;
        margin: 4px 0 6px;
      }
      .voucher-meta {
        display: flex;
        justify-content: space-between;
        font-size: 8px;
        border: 1px solid #ddd;
        padding: 3px 8px;
        background: #f9f9f9;
        margin-bottom: 6px;
      }
      .voucher-meta span {
        margin-right: 20px;
      }
      table {
        width: 100%;
        border-collapse: collapse;
        margin-bottom: 6px;
      }
      th {
        background-color: #E3F2FD;
        color: #0D47A1;
        padding: 4px 6px;
        border: 1px solid #ccc;
        text-align: left;
        font-weight: 600;
        font-size: 8px;
      }
      td {
        padding: 3px 6px;
        border: 1px solid #ddd;
        vertical-align: top;
        font-size: 8px;
      }
      .text-right { text-align: right; }
      .totals {
        margin-left: auto;
        width: 50%;
        font-weight: 600;
        font-size: 8px;
      }
      .totals td {
        border: none;
        padding: 2px 6px;
      }
      .footer {
        margin-top: 6px;
        text-align: center;
        font-size: 6.5px;
        color: #777;
        border-top: 1px solid #ccc;
        padding-top: 4px;
      }
      @media print {
        body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
      }
    </style>
  </head>
  <body>
    <div class="voucher-container">
      <div class="header">
        <div class="header-left">
          <img src="${logoUrl}" alt="Logo" onerror="this.style.display='none'" />
          <div>
            <div class="org-name">${orgName}</div>
            <div class="org-details">${orgAddr} | Ph: ${orgPhone} | Email: ${orgEmail}</div>
          </div>
        </div>
      </div>
      <div class="voucher-title">${voucher.voucher_types?.name || ""} Voucher</div>
      <div class="voucher-meta">
        <span><strong>No:</strong> ${voucher.voucher_no}</span>
        <span><strong>Date:</strong> ${voucher.entry_date}</span>
        <span><strong>Ref:</strong> ${voucher.reference || "—"}</span>
      </div>
      <table>
        <thead>
          <tr>
            <th>Account</th>
            <th>Description</th>
            <th class="text-right">Debit (₹)</th>
            <th class="text-right">Credit (₹)</th>
          </tr>
        </thead>
        <tbody>
          ${rows}
        </tbody>
      </table>
      <table class="totals">
        <tr>
          <td class="text-right">Total Debit:</td>
          <td class="text-right">₹${totalDebit.toLocaleString()}</td>
        </tr>
        <tr>
          <td class="text-right">Total Credit:</td>
          <td class="text-right">₹${totalCredit.toLocaleString()}</td>
        </tr>
      </table>
      <div class="footer">
        This is a computer‑generated voucher. For queries, contact ${orgName}.
      </div>
    </div>
    <script>window.print();</script>
  </body>
  </html>
    `;

    const printWindow = window.open("", "_blank", "width=800,height=600");
    if (printWindow) {
      printWindow.document.write(printHTML);
      printWindow.document.close();
    }
  };

  if (isLoading)
    return (
      <AdminLayout>
        <div className="p-8 text-center">Loading…</div>
      </AdminLayout>
    );
  if (!isNew && !voucher)
    return (
      <AdminLayout>
        <div className="p-8 text-center text-red-600">Voucher not found</div>
      </AdminLayout>
    );

  const lines = form.lines;
  const displayLines = editing
    ? lines
    : voucher?.journal_entries?.journal_entry_lines || [];

  return (
    <AdminLayout>
      <button
        onClick={() => navigate("/vouchers")}
        className="inline-flex items-center gap-2 text-secondary hover:text-primary-dark mb-4 text-sm"
      >
        <ArrowLeft size={18} /> Back to Vouchers
      </button>

      {/* Header */}
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
              <Printer size={16} /> Print
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

      {/* Voucher Type (new only) */}
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

      {/* Form / View */}
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

        {/* Lines Table */}
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
    </AdminLayout>
  );
}