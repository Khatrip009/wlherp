import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import toast from "react-hot-toast";
import { Plus, Trash2 } from "lucide-react";
import AdminLayout from "../layouts/AdminLayout";
import { getChartOfAccounts } from "../services/accountingService";
import { createVoucher } from "../services/voucherService";
import { useOrg } from "../context/OrganizationContext";

export default function ReceiptVoucher() {
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
      const totalAmount = lines.reduce((s, l) => s + (parseFloat(l.amount) || 0), 0);
      const journalLines = [
        { account_id: parseInt(cashBankAccount), debit: totalAmount, credit: 0, description: "Cash/Bank receipt" },
        ...lines.map(l => ({ account_id: parseInt(l.account_id), debit: 0, credit: parseFloat(l.amount) || 0, description: l.description })),
      ];
      await createVoucher(
        { voucher_type_code: "receipt", entry_date: date, reference, description, lines: journalLines },
        context   // pass branch & FY context
      );
    },
    onSuccess: () => {
      toast.success("Receipt voucher created");
      queryClient.invalidateQueries(["vouchers"]);
      setLines([{ account_id: "", amount: "", description: "" }]);
    },
    onError: () => toast.error("Failed to create voucher"),
  });

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!cashBankAccount) { toast.error("Select bank/cash account"); return; }
    createMutation.mutate();
  };

  return (
    <AdminLayout>
      <h1 className="text-3xl font-righteous text-primary-dark mb-6">Receipt Voucher</h1>
      <form onSubmit={handleSubmit} className="bg-white rounded-xl p-6 shadow-sm space-y-4">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div><label className="block text-sm mb-1">Date</label><input type="date" value={date} onChange={e => setDate(e.target.value)} className="w-full border rounded p-2.5 text-sm" /></div>
          <div><label className="block text-sm mb-1">Reference</label><input type="text" value={reference} onChange={e => setReference(e.target.value)} className="w-full border rounded p-2.5 text-sm" /></div>
          <div><label className="block text-sm mb-1">Description</label><input type="text" value={description} onChange={e => setDescription(e.target.value)} className="w-full border rounded p-2.5 text-sm" /></div>
        </div>
        <div>
          <label className="block text-sm mb-1">Bank / Cash Account (Debit)</label>
          <select value={cashBankAccount} onChange={e => setCashBankAccount(e.target.value)} className="w-full border rounded p-2.5 text-sm" required>
            <option value="">Select account</option>
            {accounts.filter(a => a.account_code === '1001' || a.account_code === '1002').map(a => <option key={a.id} value={a.id}>{a.account_name}</option>)}
          </select>
        </div>
        <table className="w-full">
          <thead><tr>
            <th className="p-2 text-left text-sm">Income Account (Credit)</th>
            <th className="p-2 text-left text-sm">Amount</th>
            <th className="p-2 text-left text-sm">Description</th>
            <th></th>
          </tr></thead>
          <tbody>
            {lines.map((line, idx) => (
              <tr key={idx}>
                <td className="p-1"><select value={line.account_id} onChange={e => updateLine(idx, "account_id", e.target.value)} className="w-full border rounded p-2 text-sm" required><option value="">Select</option>{accounts.filter(a => a.account_type === 'income').map(a => <option key={a.id} value={a.id}>{a.account_name}</option>)}</select></td>
                <td className="p-1"><input type="number" value={line.amount} onChange={e => updateLine(idx, "amount", e.target.value)} className="w-full border rounded p-2 text-sm" required /></td>
                <td className="p-1"><input type="text" value={line.description} onChange={e => updateLine(idx, "description", e.target.value)} className="w-full border rounded p-2 text-sm" /></td>
                <td className="p-1"><button type="button" onClick={() => removeLine(idx)}><Trash2 size={16} className="text-red-600" /></button></td>
              </tr>
            ))}
          </tbody>
        </table>
        <button type="button" onClick={addLine} className="text-primary flex items-center gap-1 text-sm"><Plus size={16} /> Add Line</button>
        <div className="flex justify-end"><button type="submit" className="bg-primary text-white px-6 py-2.5 rounded-lg">Save Voucher</button></div>
      </form>
    </AdminLayout>
  );
}