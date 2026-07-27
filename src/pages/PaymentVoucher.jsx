// src/pages/PaymentVoucher.jsx
import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import toast from "react-hot-toast";
import { Plus, Trash2 } from "lucide-react";

import { getChartOfAccounts } from "../services/accountingService";
import { createVoucher } from "../services/voucherService";
import { useOrg } from "../context/OrganizationContext";

export default function PaymentVoucher() {
  const queryClient = useQueryClient();
  const { branch, selectedFinancialYear } = useOrg();
  const branchId = branch?.id;
  const financialYearId = selectedFinancialYear?.id;
  const context = { branchId, financialYearId };

  // Scoped chart of accounts
  const { data: accounts = [] } = useQuery({
    queryKey: ["chart-of-accounts", branchId, financialYearId],
    queryFn: () => getChartOfAccounts(branchId, financialYearId),
    enabled: !!branchId && !!financialYearId,
    staleTime: 10 * 60 * 1000,
  });

  const [date, setDate] = useState(new Date().toISOString().split("T")[0]);
  const [reference, setReference] = useState("");
  const [description, setDescription] = useState("");
  const [lines, setLines] = useState([{ account_id: "", amount: "", description: "" }]);

  // The first line is always the bank/cash account (credit)
  const [cashBankAccount, setCashBankAccount] = useState("");

  const addLine = () => setLines([...lines, { account_id: "", amount: "", description: "" }]);
  const removeLine = (idx) => setLines(lines.filter((_, i) => i !== idx));
  const updateLine = (idx, field, value) => {
    const updated = [...lines];
    updated[idx][field] = value;
    setLines(updated);
  };

  const createMutation = useMutation({
    mutationFn: async () => {
      const journalLines = [];
      const totalAmount = lines.reduce((s, l) => s + (parseFloat(l.amount) || 0), 0);
      journalLines.push({
        account_id: parseInt(cashBankAccount),
        debit: 0,
        credit: totalAmount,
        description: "Cash/Bank payment",
      });
      lines.forEach((l) => {
        journalLines.push({
          account_id: parseInt(l.account_id),
          debit: parseFloat(l.amount) || 0,
          credit: 0,
          description: l.description,
        });
      });
      await createVoucher(
        {
          voucher_type_code: "payment",
          entry_date: date,
          reference,
          description,
          lines: journalLines,
        },
        context
      );
    },
    onSuccess: () => {
      toast.success("Payment voucher created");
      queryClient.invalidateQueries(["vouchers"]);
      setLines([{ account_id: "", amount: "", description: "" }]);
    },
    onError: () => toast.error("Failed to create voucher"),
  });

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!cashBankAccount) {
      toast.error("Select bank/cash account");
      return;
    }
    createMutation.mutate();
  };

  return (
    <div className="space-y-6 px-4 sm:px-6 lg:px-0">
      <h1 className="text-3xl font-heading text-primary-dark mb-6">
        Payment Voucher
      </h1>
      <form
        onSubmit={handleSubmit}
        className="bg-white dark:bg-accent rounded-xl p-6 shadow-sm space-y-4 border border-gray-200 dark:border-gray-700"
      >
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div>
            <label className="block text-sm font-body text-gray-700 dark:text-gray-300 mb-1">
              Date
            </label>
            <input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className="w-full border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 rounded-lg p-2.5 text-sm focus:ring-2 focus:ring-primary outline-none"
            />
          </div>
          <div>
            <label className="block text-sm font-body text-gray-700 dark:text-gray-300 mb-1">
              Reference
            </label>
            <input
              type="text"
              value={reference}
              onChange={(e) => setReference(e.target.value)}
              className="w-full border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 rounded-lg p-2.5 text-sm focus:ring-2 focus:ring-primary outline-none"
            />
          </div>
          <div>
            <label className="block text-sm font-body text-gray-700 dark:text-gray-300 mb-1">
              Description
            </label>
            <input
              type="text"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="w-full border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 rounded-lg p-2.5 text-sm focus:ring-2 focus:ring-primary outline-none"
            />
          </div>
        </div>

        <div>
          <label className="block text-sm font-body text-gray-700 dark:text-gray-300 mb-1">
            Bank / Cash Account (Credit)
          </label>
          <select
            value={cashBankAccount}
            onChange={(e) => setCashBankAccount(e.target.value)}
            className="w-full border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 rounded-lg p-2.5 text-sm focus:ring-2 focus:ring-primary outline-none"
            required
          >
            <option value="">Select account</option>
            {accounts
              .filter(
                (a) =>
                  a.account_type === "asset" &&
                  (a.account_code === "1001" || a.account_code === "1002")
              )
              .map((a) => (
                <option key={a.id} value={a.id}>
                  {a.account_name}
                </option>
              ))}
          </select>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full min-w-[600px]">
            <thead>
              <tr className="border-b border-gray-200 dark:border-gray-700">
                <th className="p-2 text-left text-sm font-body text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                  Expense Account (Debit)
                </th>
                <th className="p-2 text-left text-sm font-body text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                  Amount
                </th>
                <th className="p-2 text-left text-sm font-body text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                  Description
                </th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {lines.map((line, idx) => (
                <tr key={idx} className="border-b border-gray-200 dark:border-gray-700">
                  <td className="p-1">
                    <select
                      value={line.account_id}
                      onChange={(e) => updateLine(idx, "account_id", e.target.value)}
                      className="w-full border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 rounded p-2 text-sm focus:ring-2 focus:ring-primary outline-none"
                      required
                    >
                      <option value="">Select</option>
                      {accounts
                        .filter((a) => a.account_type === "expense")
                        .map((a) => (
                          <option key={a.id} value={a.id}>
                            {a.account_name}
                          </option>
                        ))}
                    </select>
                  </td>
                  <td className="p-1">
                    <input
                      type="number"
                      value={line.amount}
                      onChange={(e) => updateLine(idx, "amount", e.target.value)}
                      className="w-full border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 rounded p-2 text-sm focus:ring-2 focus:ring-primary outline-none"
                      required
                    />
                  </td>
                  <td className="p-1">
                    <input
                      type="text"
                      value={line.description}
                      onChange={(e) => updateLine(idx, "description", e.target.value)}
                      className="w-full border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 rounded p-2 text-sm focus:ring-2 focus:ring-primary outline-none"
                    />
                  </td>
                  <td className="p-1">
                    <button type="button" onClick={() => removeLine(idx)}>
                      <Trash2 size={16} className="text-accent-dark dark:text-accent-light" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <button
          type="button"
          onClick={addLine}
          className="text-primary hover:text-primary-light flex items-center gap-1 text-sm font-body"
        >
          <Plus size={16} /> Add Line
        </button>

        <div className="flex justify-end">
          <button
            type="submit"
            className="bg-primary hover:bg-primary-light text-white px-6 py-2.5 rounded-lg font-body text-sm transition"
          >
            Save Voucher
          </button>
        </div>
      </form>
    </div>
  );
}