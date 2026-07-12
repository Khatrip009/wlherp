import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import toast from "react-hot-toast";
import { Plus, Trash2 } from "lucide-react";
import AdminLayout from "../layouts/AdminLayout";
import {
  getChartOfAccounts,
  createJournalEntry,
} from "../services/accountingService";
import { useOrg } from "../context/OrganizationContext"; // NEW

export default function JournalEntry() {
  const queryClient = useQueryClient();

  // ── Branch & Financial Year context ──
  const { branch, selectedFinancialYear } = useOrg(); // NEW
  const branchId = branch?.id;
  const financialYearId = selectedFinancialYear?.id;
  const context = { branchId, financialYearId };

  // Fetch accounts – now scoped to branch & FY
  const { data: accounts = [] } = useQuery({
    queryKey: ["chart-of-accounts", branchId, financialYearId],
    queryFn: () => getChartOfAccounts(branchId, financialYearId),
    enabled: !!branchId && !!financialYearId,
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

  // Create mutation – now passes context
  const createMutation = useMutation({
    mutationFn: (payload) => createJournalEntry(payload, context),
    onSuccess: () => {
      toast.success("Journal entry saved");
      queryClient.invalidateQueries(["journal-entries"]);
      setLines([{ account_id: "", debit: "", credit: "", description: "" }]);
    },
    onError: () => toast.error("Failed to save"),
  });

  const handleSubmit = (e) => {
    e.preventDefault();
    const totalDebit = lines.reduce((sum, l) => sum + (parseFloat(l.debit) || 0), 0);
    const totalCredit = lines.reduce((sum, l) => sum + (parseFloat(l.credit) || 0), 0);
    if (Math.abs(totalDebit - totalCredit) > 0.001) {
      toast.error("Debit and credit must balance");
      return;
    }
    createMutation.mutate({ date, reference, description, lines });
  };

  return (
    <AdminLayout>
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
            className="bg-primary text-white px-6 py-2.5 rounded-lg"
          >
            Save Entry
          </button>
        </div>
      </form>
    </AdminLayout>
  );
}