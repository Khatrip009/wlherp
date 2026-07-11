// src/pages/BankReconciliation.jsx
import { useState, useRef } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import toast from "react-hot-toast";
import { Upload, Check, X } from "lucide-react";
import Papa from "papaparse";
import AdminLayout from "../layouts/AdminLayout";
import { getOrganization } from "../services/organizationService";
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
import { useOrg } from "../context/OrganizationContext";   // NEW

export default function BankReconciliation() {
  const queryClient = useQueryClient();

  // ── Organization, Branch & Financial Year context ──
  const { org: currentOrg, branch, selectedFinancialYear } = useOrg();   // NEW
  const context = {
    branchId: branch?.id,
    financialYearId: selectedFinancialYear?.id,
  };

  // Fetch organization details (pass org id)
  const { data: org } = useQuery({
    queryKey: ["organization", currentOrg?.id],
    queryFn: () => getOrganization(currentOrg?.id),
    enabled: !!currentOrg?.id,
  });

  const [selectedAccountId, setSelectedAccountId] = useState("");
  const [startDate, setStartDate] = useState(new Date(new Date().getFullYear(), 0, 1).toISOString().split("T")[0]);
  const [endDate, setEndDate] = useState(new Date().toISOString().split("T")[0]);
  const [selectedStatementId, setSelectedStatementId] = useState(null);
  const fileInputRef = useRef(null);

  const { data: accounts = [] } = useQuery({
    queryKey: ["bank-accounts"],
    queryFn: getBankAccounts,
    staleTime: 10 * 60 * 1000,
  });

  const { data: statementLines = [] } = useQuery({
    queryKey: ["statement-lines", selectedAccountId],
    queryFn: () => getStatementLines(selectedAccountId),
    enabled: !!selectedAccountId,
  });

  const { data: unreconciled = [] } = useQuery({
    queryKey: ["unreconciled-entries", selectedAccountId, startDate, endDate],
    queryFn: () => getUnreconciledEntries(selectedAccountId, startDate, endDate),
    enabled: !!selectedAccountId && !!startDate && !!endDate,
  });

  const { data: reconciledIds = [] } = useQuery({
    queryKey: ["reconciled-ids", selectedAccountId],
    queryFn: () => getReconciledLineIds(selectedAccountId),
    enabled: !!selectedAccountId,
  });

  const reconciledSet = new Set(reconciledIds);

  // Mutations now pass context
  const reconcileMut = useMutation({
    mutationFn: ({ lineId, statementId }) => reconcileLine(lineId, statementId, context),
    onSuccess: () => {
      queryClient.invalidateQueries(["reconciled-ids"]);
      toast.success("Line reconciled");
    },
  });

  const unreconcileMut = useMutation({
    mutationFn: ({ lineId, statementId }) => unreconcileLine(lineId, statementId), // no context needed for delete
    onSuccess: () => {
      queryClient.invalidateQueries(["reconciled-ids"]);
      toast.success("Line un‑reconciled");
    },
  });

  // CSV upload – pass context to importStatementLines
  const handleFileUpload = async (e) => {
    const file = e.target.files[0];
    if (!file || !selectedAccountId) return;
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
          await clearStatementLines(selectedAccountId);
          await importStatementLines(rows, context);   // pass context
          queryClient.invalidateQueries(["statement-lines"]);
          toast.success(`${rows.length} statement lines imported`);
        } catch (err) {
          toast.error("Import failed");
        }
      },
      error: () => toast.error("CSV parsing error"),
    });
  };

  // Calculate totals
  const stmtTotal = statementLines.reduce((s, l) => s + (l.debit || 0) - (l.credit || 0), 0);
  const unreconciledTotal = unreconciled
    .filter((u) => !reconciledSet.has(u.id))
    .reduce((s, u) => s + (u.debit || 0) - (u.credit || 0), 0);

  return (
    <AdminLayout>
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-3xl font-righteous text-primary-dark">Bank Reconciliation</h1>
      </div>

      {/* Account & Date Selectors */}
      <div className="flex flex-wrap gap-4 mb-6">
        <select
          value={selectedAccountId}
          onChange={(e) => setSelectedAccountId(e.target.value)}
          className="border rounded p-2.5 text-sm"
        >
          <option value="">Select Bank / Cash Account</option>
          {accounts.map((a) => (
            <option key={a.id} value={a.id}>
              {a.account_code} - {a.account_name}
            </option>
          ))}
        </select>
        <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} className="border rounded p-2 text-sm" />
        <input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} className="border rounded p-2 text-sm" />
        <button
          onClick={() => fileInputRef.current?.click()}
          className="border px-4 py-2 rounded-lg text-sm flex items-center gap-2"
        >
          <Upload size={16} /> Upload Statement CSV
        </button>
        <input type="file" ref={fileInputRef} className="hidden" accept=".csv" onChange={handleFileUpload} />
      </div>

      {!selectedAccountId ? (
        <div className="bg-white rounded-xl p-10 text-center text-secondary">
          Please select a bank/cash account to begin.
        </div>
      ) : (
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
          {/* Bank Statement Side */}
          <div className="bg-white rounded-xl shadow-sm overflow-hidden">
            <h2 className="text-lg font-semibold p-4 border-b">Bank Statement (Uploaded)</h2>
            <div className="max-h-96 overflow-y-auto">
              <table className="w-full text-sm">
                <thead className="bg-slate-100 sticky top-0">
                  <tr>
                    <th className="p-2 text-left">Date</th>
                    <th className="p-2 text-left">Description</th>
                    <th className="p-2 text-right">Debit</th>
                    <th className="p-2 text-right">Credit</th>
                    <th className="p-2 text-right">Balance</th>
                  </tr>
                </thead>
                <tbody>
                  {statementLines.length === 0 ? (
                    <tr><td colSpan={5} className="p-4 text-center text-secondary">No statement lines. Upload a CSV.</td></tr>
                  ) : (
                    statementLines.map((line) => (
                      <tr
                        key={line.id}
                        className={`border-t cursor-pointer ${selectedStatementId === line.id ? "bg-blue-50" : ""}`}
                        onClick={() => setSelectedStatementId(line.id)}
                      >
                        <td className="p-2">{line.statement_date}</td>
                        <td className="p-2">{line.description}</td>
                        <td className="p-2 text-right">{line.debit > 0 ? `₹ ${Number(line.debit).toLocaleString("en-IN")}` : ""}</td>
                        <td className="p-2 text-right">{line.credit > 0 ? `₹ ${Number(line.credit).toLocaleString("en-IN")}` : ""}</td>
                        <td className="p-2 text-right font-medium">
                          ₹ {statementLines.filter((l, i) => i <= statementLines.indexOf(line)).reduce((s, l) => s + (l.debit || 0) - (l.credit || 0), 0).toLocaleString("en-IN")}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
            <div className="p-3 border-t font-bold text-right">
              Statement Balance: ₹ {stmtTotal.toLocaleString("en-IN")}
            </div>
          </div>

          {/* System Entries Side */}
          <div className="bg-white rounded-xl shadow-sm overflow-hidden">
            <h2 className="text-lg font-semibold p-4 border-b">System Entries (Reconcile)</h2>
            <div className="max-h-96 overflow-y-auto">
              <table className="w-full text-sm">
                <thead className="bg-slate-100 sticky top-0">
                  <tr>
                    <th className="p-2 text-left"></th>
                    <th className="p-2 text-left">Date</th>
                    <th className="p-2 text-left">Description</th>
                    <th className="p-2 text-right">Receipt</th>
                    <th className="p-2 text-right">Payment</th>
                    <th className="p-2 text-right">Reconciled</th>
                  </tr>
                </thead>
                <tbody>
                  {unreconciled.length === 0 ? (
                    <tr><td colSpan={6} className="p-4 text-center text-secondary">No entries for this period.</td></tr>
                  ) : (
                    unreconciled.map((entry) => {
                      const isRec = reconciledSet.has(entry.id);
                      return (
                        <tr key={entry.id} className={`border-t ${isRec ? "bg-green-50" : ""}`}>
                          <td className="p-1 text-center">
                            {selectedStatementId && !isRec && (
                              <button
                                onClick={() => reconcileMut.mutate({ lineId: entry.id, statementId: selectedStatementId })}
                                className="text-green-600 p-1"
                                title="Match with selected statement line"
                              >
                                <Check size={14} />
                              </button>
                            )}
                            {isRec && (
                              <button
                                onClick={() => unreconcileMut.mutate({ lineId: entry.id, statementId: selectedStatementId })}
                                className="text-red-600 p-1"
                                title="Un‑reconcile"
                              >
                                <X size={14} />
                              </button>
                            )}
                          </td>
                          <td className="p-2">{entry.journal_entries?.entry_date}</td>
                          <td className="p-2">{entry.description}</td>
                          <td className="p-2 text-right text-green-600">{entry.debit > 0 ? `₹ ${Number(entry.debit).toLocaleString("en-IN")}` : ""}</td>
                          <td className="p-2 text-right text-red-600">{entry.credit > 0 ? `₹ ${Number(entry.credit).toLocaleString("en-IN")}` : ""}</td>
                          <td className="p-2 text-center">{isRec ? "✅" : "⏳"}</td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
            <div className="p-3 border-t font-bold text-right">
              Unreconciled Amount: ₹ {unreconciledTotal.toLocaleString("en-IN")}
            </div>
          </div>
        </div>
      )}
    </AdminLayout>
  );
}