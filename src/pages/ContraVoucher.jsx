// src/pages/ContraVoucher.jsx
import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import toast from "react-hot-toast";
import AdminLayout from "../layouts/AdminLayout";
import { getChartOfAccounts } from "../services/accountingService";
import { createVoucher } from "../services/voucherService";
import { useOrg } from "../context/OrganizationContext";
import { useTheme } from "../context/ThemeContext";

export default function ContraVoucher() {
  const queryClient = useQueryClient();
  const { branch, selectedFinancialYear } = useOrg();
  const theme = useTheme();
  const branchId = branch?.id;
  const financialYearId = selectedFinancialYear?.id;

  const headingFont = theme?.font_heading || "Righteous";
  const bodyFont = theme?.font_body || "Montserrat";

  const context = { branchId, financialYearId };

  // Fetch accounts – now scoped to current branch & FY
  const { data: accounts = [] } = useQuery({
    queryKey: ["chart-of-accounts", branchId, financialYearId],
    queryFn: () => getChartOfAccounts(branchId, financialYearId),
    enabled: !!branchId && !!financialYearId,
  });

  const [date, setDate] = useState(new Date().toISOString().split("T")[0]);
  const [reference, setReference] = useState("");
  const [fromAccount, setFromAccount] = useState("");
  const [toAccount, setToAccount] = useState("");
  const [amount, setAmount] = useState("");

  const createMutation = useMutation({
    mutationFn: async () => {
      await createVoucher(
        {
          voucher_type_code: "contra",
          entry_date: date,
          reference,
          description: "Contra transfer",
          lines: [
            { account_id: parseInt(toAccount), debit: parseFloat(amount), credit: 0, description: "Transfer in" },
            { account_id: parseInt(fromAccount), debit: 0, credit: parseFloat(amount), description: "Transfer out" },
          ],
        },
        context   // passes branchId & financialYearId
      );
    },
    onSuccess: () => {
      toast.success("Contra voucher created");
      queryClient.invalidateQueries(["vouchers"]);
      setAmount("");
    },
    onError: () => toast.error("Failed to create voucher"),
  });

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!fromAccount || !toAccount || !amount) {
      toast.error("Fill all fields");
      return;
    }
    createMutation.mutate();
  };

  return (
    <AdminLayout>
      <h1
        className="text-3xl font-bold text-primary-dark mb-6"
        style={{ fontFamily: headingFont }}
      >
        Contra Voucher
      </h1>
      <form
        onSubmit={handleSubmit}
        className="bg-white rounded-xl p-6 shadow-sm space-y-4 max-w-lg border border-primary-bg"
      >
        <div>
          <label
            className="block text-sm mb-1 text-primary-dark"
            style={{ fontFamily: bodyFont }}
          >
            Date
          </label>
          <input
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            className="w-full border border-primary-bg bg-white text-primary rounded p-2.5 text-sm"
          />
        </div>
        <div>
          <label
            className="block text-sm mb-1 text-primary-dark"
            style={{ fontFamily: bodyFont }}
          >
            Reference
          </label>
          <input
            type="text"
            value={reference}
            onChange={(e) => setReference(e.target.value)}
            className="w-full border border-primary-bg bg-white text-primary rounded p-2.5 text-sm"
          />
        </div>
        <div>
          <label
            className="block text-sm mb-1 text-primary-dark"
            style={{ fontFamily: bodyFont }}
          >
            From Account (Credit)
          </label>
          <select
            value={fromAccount}
            onChange={(e) => setFromAccount(e.target.value)}
            className="w-full border border-primary-bg bg-white text-primary rounded p-2.5 text-sm"
            required
          >
            <option value="">Select</option>
            {accounts
              .filter((a) => a.account_code === "1001" || a.account_code === "1002")
              .map((a) => (
                <option key={a.id} value={a.id}>
                  {a.account_name}
                </option>
              ))}
          </select>
        </div>
        <div>
          <label
            className="block text-sm mb-1 text-primary-dark"
            style={{ fontFamily: bodyFont }}
          >
            To Account (Debit)
          </label>
          <select
            value={toAccount}
            onChange={(e) => setToAccount(e.target.value)}
            className="w-full border border-primary-bg bg-white text-primary rounded p-2.5 text-sm"
            required
          >
            <option value="">Select</option>
            {accounts
              .filter((a) => a.account_code === "1001" || a.account_code === "1002")
              .map((a) => (
                <option key={a.id} value={a.id}>
                  {a.account_name}
                </option>
              ))}
          </select>
        </div>
        <div>
          <label
            className="block text-sm mb-1 text-primary-dark"
            style={{ fontFamily: bodyFont }}
          >
            Amount
          </label>
          <input
            type="number"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            className="w-full border border-primary-bg bg-white text-primary rounded p-2.5 text-sm"
            required
          />
        </div>
        <button
          type="submit"
          className="bg-primary hover:bg-primary-light text-white px-6 py-2.5 rounded-lg text-sm font-medium transition-colors"
          style={{ fontFamily: bodyFont }}
        >
          Save Voucher
        </button>
      </form>
    </AdminLayout>
  );
}