// src/pages/BankReconciliation.jsx
import { useState, useRef } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import toast from "react-hot-toast";
import { Upload, Check, X } from "lucide-react";
import Papa from "papaparse";
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
import { useOrg } from "../context/OrganizationContext";

export default function BankReconciliation() {
  const queryClient = useQueryClient();

  // ── Organization, Branch & Financial Year context ──
  const { org: currentOrg, branch, selectedFinancialYear } = useOrg();
  const branchId = branch?.id;
  const financialYearId = selectedFinancialYear?.id;

  // Fetch organization details
  const { data: org } = useQuery({
    queryKey: ["organization", currentOrg?.id],
    queryFn: () => getOrganization(currentOrg?.id),
    enabled: !!currentOrg?.id,
  });

  const [selectedAccountId, setSelectedAccountId] = useState("");
  const [startDate, setStartDate] = useState(
    new Date(new Date().getFullYear(), 0, 1).toISOString().split("T")[0]
  );
  const [endDate, setEndDate] = useState(
    new Date().toISOString().split("T")[0]
  );
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

  // Mutations – pass context
  const reconcileMut = useMutation({
    mutationFn: ({ lineId, statementId }) =>
      reconcileLine(lineId, statementId, { branchId, financialYearId }),
    onSuccess: () => {
      queryClient.invalidateQueries(["reconciled-ids"]);
      toast.success("Line reconciled");
    },
  });

  const unreconcileMut = useMutation({
    mutationFn: ({ lineId, statementId }) =>
      unreconcileLine(lineId, statementId, { branchId, financialYearId }),
    onSuccess: () => {
      queryClient.invalidateQueries(["reconciled-ids"]);
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
  const stmtTotal = statementLines.reduce(
    (s, l) => s + (l.debit || 0) - (l.credit || 0),
    0
  );
  const unreconciledTotal = unreconciled
    .filter((u) => !reconciledSet.has(u.id))
    .reduce((s, u) => s + (u.debit || 0) - (u.credit || 0), 0);

  return (
    <div className="space-y-6 px-4 sm:px-6 lg:px-0">
      {/* Header */}
      <div>
        <h1
          className="text-2xl sm:text-3xl font-bold"
          style={{ fontFamily: "var(--font-heading)", color: "var(--color-primary)" }}
        >
          Bank Reconciliation
        </h1>
        <p
          className="text-sm text-gray-600 dark:text-gray-400 mt-1"
          style={{ fontFamily: "var(--font-body)" }}
        >
          Match your bank statement with system entries
        </p>
      </div>

      {/* Account & Date Selectors */}
      <div className="flex flex-wrap gap-4 items-end">
        <select
          value={selectedAccountId}
          onChange={(e) => setSelectedAccountId(e.target.value)}
          className="border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 rounded-lg p-2.5 text-sm"
          style={{ fontFamily: "var(--font-body)" }}
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
          className="border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 rounded-lg p-2.5 text-sm"
          style={{ fontFamily: "var(--font-body)" }}
        />
        <input
          type="date"
          value={endDate}
          onChange={(e) => setEndDate(e.target.value)}
          className="border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 rounded-lg p-2.5 text-sm"
          style={{ fontFamily: "var(--font-body)" }}
        />
        <button
          onClick={() => fileInputRef.current?.click()}
          className="inline-flex items-center gap-2 px-4 py-2.5 border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-200 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors text-sm"
          style={{ fontFamily: "var(--font-body)" }}
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
        <div className="bg-white dark:bg-gray-800 rounded-xl p-10 text-center text-gray-500 dark:text-gray-400 border border-gray-200 dark:border-gray-700">
          Please select a bank/cash account to begin.
        </div>
      ) : (
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
          {/* Bank Statement Side */}
          <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 overflow-hidden">
            <h2 className="text-lg font-semibold p-4 border-b border-gray-200 dark:border-gray-700" style={{ fontFamily: "var(--font-heading)", color: "var(--color-primary)" }}>
              Bank Statement (Uploaded)
            </h2>
            <div className="max-h-96 overflow-y-auto">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 dark:bg-gray-700 sticky top-0">
                  <tr>
                    <th className="p-2 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Date</th>
                    <th className="p-2 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Description</th>
                    <th className="p-2 text-right text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Debit</th>
                    <th className="p-2 text-right text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Credit</th>
                    <th className="p-2 text-right text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Balance</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
                  {statementLines.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="p-4 text-center text-gray-500 dark:text-gray-400">
                        No statement lines. Upload a CSV.
                      </td>
                    </tr>
                  ) : (
                    statementLines.map((line) => (
                      <tr
                        key={line.id}
                        className={`cursor-pointer transition-colors ${
                          selectedStatementId === line.id
                            ? "bg-blue-50 dark:bg-blue-900/20"
                            : "hover:bg-gray-50 dark:hover:bg-gray-700"
                        }`}
                        onClick={() => setSelectedStatementId(line.id)}
                      >
                        <td className="p-2 text-gray-700 dark:text-gray-200">{line.statement_date}</td>
                        <td className="p-2 text-gray-700 dark:text-gray-200">{line.description}</td>
                        <td className="p-2 text-right text-gray-700 dark:text-gray-200">
                          {line.debit > 0 ? `₹ ${Number(line.debit).toLocaleString("en-IN")}` : ""}
                        </td>
                        <td className="p-2 text-right text-gray-700 dark:text-gray-200">
                          {line.credit > 0 ? `₹ ${Number(line.credit).toLocaleString("en-IN")}` : ""}
                        </td>
                        <td className="p-2 text-right font-medium text-gray-800 dark:text-gray-100">
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
            <div className="p-3 border-t border-gray-200 dark:border-gray-700 font-bold text-right text-gray-800 dark:text-gray-100">
              Statement Balance: ₹ {stmtTotal.toLocaleString("en-IN")}
            </div>
          </div>

          {/* System Entries Side */}
          <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 overflow-hidden">
            <h2 className="text-lg font-semibold p-4 border-b border-gray-200 dark:border-gray-700" style={{ fontFamily: "var(--font-heading)", color: "var(--color-primary)" }}>
              System Entries (Reconcile)
            </h2>
            <div className="max-h-96 overflow-y-auto">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 dark:bg-gray-700 sticky top-0">
                  <tr>
                    <th className="p-2 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase"></th>
                    <th className="p-2 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Date</th>
                    <th className="p-2 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Description</th>
                    <th className="p-2 text-right text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Receipt</th>
                    <th className="p-2 text-right text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Payment</th>
                    <th className="p-2 text-right text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Reconciled</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
                  {unreconciled.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="p-4 text-center text-gray-500 dark:text-gray-400">
                        No entries for this period.
                      </td>
                    </tr>
                  ) : (
                    unreconciled.map((entry) => {
                      const isRec = reconciledSet.has(entry.id);
                      return (
                        <tr
                          key={entry.id}
                          className={`${isRec ? "bg-green-50 dark:bg-green-900/10" : "hover:bg-gray-50 dark:hover:bg-gray-700"} transition-colors`}
                        >
                          <td className="p-1 text-center">
                            {selectedStatementId && !isRec && (
                              <button
                                onClick={() =>
                                  reconcileMut.mutate({
                                    lineId: entry.id,
                                    statementId: selectedStatementId,
                                  })
                                }
                                className="text-green-600 dark:text-green-400 p-1"
                                title="Match with selected statement line"
                              >
                                <Check size={14} />
                              </button>
                            )}
                            {isRec && (
                              <button
                                onClick={() =>
                                  unreconcileMut.mutate({
                                    lineId: entry.id,
                                    statementId: selectedStatementId,
                                  })
                                }
                                className="text-red-600 dark:text-red-400 p-1"
                                title="Un‑reconcile"
                              >
                                <X size={14} />
                              </button>
                            )}
                          </td>
                          <td className="p-2 text-gray-700 dark:text-gray-200">
                            {entry.journal_entries?.entry_date}
                          </td>
                          <td className="p-2 text-gray-700 dark:text-gray-200">{entry.description}</td>
                          <td className="p-2 text-right text-green-600 dark:text-green-400">
                            {entry.debit > 0
                              ? `₹ ${Number(entry.debit).toLocaleString("en-IN")}`
                              : ""}
                          </td>
                          <td className="p-2 text-right text-red-600 dark:text-red-400">
                            {entry.credit > 0
                              ? `₹ ${Number(entry.credit).toLocaleString("en-IN")}`
                              : ""}
                          </td>
                          <td className="p-2 text-center text-lg">{isRec ? "✅" : "⏳"}</td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
            <div className="p-3 border-t border-gray-200 dark:border-gray-700 font-bold text-right text-gray-800 dark:text-gray-100">
              Unreconciled Amount: ₹ {unreconciledTotal.toLocaleString("en-IN")}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}