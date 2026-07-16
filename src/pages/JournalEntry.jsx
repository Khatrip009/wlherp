import { useState, useRef, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import toast from "react-hot-toast";
import { Plus, Trash2 } from "lucide-react";

import {
  getChartOfAccounts,
  createJournalEntry,
} from "../services/accountingService";
import { useOrg } from "../context/OrganizationContext";

export default function JournalEntry() {
  const queryClient = useQueryClient();

  // ── Branch & Financial Year context ──
  const { branch, selectedFinancialYear } = useOrg();
  const branchId = branch?.id;
  const financialYearId = selectedFinancialYear?.id;
  const contextReady = !!branchId && !!financialYearId;

  // Keep a ref that always has the current context
  const contextRef = useRef({ branchId, financialYearId });
  useEffect(() => {
    contextRef.current = { branchId, financialYearId };
  }, [branchId, financialYearId]);

  // Fetch accounts – scoped to branch & FY
  const { data: accounts = [] } = useQuery({
    queryKey: ["chart-of-accounts", branchId, financialYearId],
    queryFn: () => getChartOfAccounts(branchId, financialYearId),
    enabled: contextReady,
    staleTime: 10 * 60 * 1000,
  });

  const [date, setDate] = useState(new Date().toISOString().split("T")[0]);
  const [reference, setReference] = useState("");
  const [description, setDescription] = useState("");
  const [lines, setLines] = useState([
    { account_id: "", debit: "", credit: "", description: "" },
  ]);

  const addLine = () =>
    setLines([...lines, { account_id: "", debit: "", credit: "", description: "" }]);
  const removeLine = (idx) => setLines(lines.filter((_, i) => i !== idx));

  const updateLine = (idx, field, value) => {
    const updated = [...lines];
    updated[idx][field] = value;
    setLines(updated);
  };

  // Create mutation – now reads latest context from ref
  const createMutation = useMutation({
    mutationFn: (payload) => {
      // Use the latest branchId/financialYearId from the ref
      const { branchId: bId, financialYearId: fyId } = contextRef.current;
      if (!bId || !fyId) {
        throw new Error("Branch or Financial Year not selected. Please refresh the page.");
      }
      return createJournalEntry(payload, { branchId: bId, financialYearId: fyId });
    },
    onSuccess: () => {
      toast.success("Journal entry saved");
      queryClient.invalidateQueries({ queryKey: ["journal-entries"] });
      setLines([{ account_id: "", debit: "", credit: "", description: "" }]);
    },
    onError: (err) => {
      toast.error(err.message || "Failed to save journal entry");
    },
  });

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!contextReady) {
      toast.error("Branch and Financial Year are still loading. Please wait.");
      return;
    }
    const totalDebit = lines.reduce((sum, l) => sum + (parseFloat(l.debit) || 0), 0);
    const totalCredit = lines.reduce((sum, l) => sum + (parseFloat(l.credit) || 0), 0);
    if (Math.abs(totalDebit - totalCredit) > 0.001) {
      toast.error("Debit and credit must balance");
      return;
    }
    createMutation.mutate({ date, reference, description, lines });
  };

  return (
    <>
      <h1 className="text-3xl font-righteous text-primary-dark mb-6">
        Journal Entry
      </h1>
      <form
        onSubmit={handleSubmit}
        className="bg-white rounded-xl p-6 shadow-sm space-y-4"
      >
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div>
            <label className="block text-sm mb-1">Date</label>
            <input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className="w-full border rounded p-2.5 text-sm"
            />
          </div>
          <div>
            <label className="block text-sm mb-1">Reference</label>
            <input
              type="text"
              value={reference}
              onChange={(e) => setReference(e.target.value)}
              className="w-full border rounded p-2.5 text-sm"
            />
          </div>
          <div>
            <label className="block text-sm mb-1">Description</label>
            <input
              type="text"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="w-full border rounded p-2.5 text-sm"
            />
          </div>
        </div>

        <table className="w-full">
          <thead>
            <tr>
              <th className="p-2 text-left text-sm">Account</th>
              <th className="p-2 text-left text-sm">Debit</th>
              <th className="p-2 text-left text-sm">Credit</th>
              <th className="p-2 text-left text-sm">Description</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {lines.map((line, idx) => (
              <tr key={idx}>
                <td className="p-1">
                  <select
                    value={line.account_id}
                    onChange={(e) =>
                      updateLine(idx, "account_id", e.target.value)
                    }
                    className="w-full border rounded p-2 text-sm"
                    required
                  >
                    <option value="">Select</option>
                    {accounts.map((a) => (
                      <option key={a.id} value={a.id}>
                        {a.account_code} - {a.account_name}
                      </option>
                    ))}
                  </select>
                </td>
                <td className="p-1">
                  <input
                    type="number"
                    value={line.debit}
                    onChange={(e) =>
                      updateLine(idx, "debit", e.target.value)
                    }
                    className="w-full border rounded p-2 text-sm"
                  />
                </td>
                <td className="p-1">
                  <input
                    type="number"
                    value={line.credit}
                    onChange={(e) =>
                      updateLine(idx, "credit", e.target.value)
                    }
                    className="w-full border rounded p-2 text-sm"
                  />
                </td>
                <td className="p-1">
                  <input
                    type="text"
                    value={line.description}
                    onChange={(e) =>
                      updateLine(idx, "description", e.target.value)
                    }
                    className="w-full border rounded p-2 text-sm"
                  />
                </td>
                <td className="p-1">
                  <button type="button" onClick={() => removeLine(idx)}>
                    <Trash2 size={16} className="text-red-600" />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <button
          type="button"
          onClick={addLine}
          className="text-primary flex items-center gap-1 text-sm"
        >
          <Plus size={16} /> Add Line
        </button>
        <div className="flex justify-end">
          <button
            type="submit"
            disabled={!contextReady || createMutation.isLoading}
            className="bg-primary text-white px-6 py-2.5 rounded-lg disabled:opacity-50"
          >
            {createMutation.isLoading ? "Saving..." : "Save Entry"}
          </button>
        </div>
      </form>
    </>
  );
}