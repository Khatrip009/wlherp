// src/pages/Ledger.jsx
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Printer } from "lucide-react";
import AdminLayout from "../layouts/AdminLayout";
import { getChartOfAccounts, getAccountLedger } from "../services/accountingService";

export default function Ledger() {
  const { data: accounts = [] } = useQuery({
    queryKey: ["chart-of-accounts"],
    queryFn: getChartOfAccounts,
  });

  const [selectedAccount, setSelectedAccount] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");

  const { data: ledger = [], isLoading } = useQuery({
    queryKey: ["ledger", selectedAccount, startDate, endDate],
    queryFn: () => getAccountLedger(selectedAccount, startDate, endDate),
    enabled: !!selectedAccount,
  });

  const selectedAccountName = accounts.find((a) => a.id == selectedAccount)?.account_name || "Ledger";

  const handlePrint = () => {
    const printContent = document.getElementById("ledger-table")?.outerHTML;
    if (!printContent) return;

    const printWindow = window.open("", "_blank", "width=1000,height=700");
    if (!printWindow) return;

    printWindow.document.write(`
      <html>
        <head>
          <title>${selectedAccountName}</title>
          <style>
            body { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; margin: 30px; color: #333; }
            .header { text-align: center; margin-bottom: 20px; }
            .header h2 { color: #0D47A1; margin-bottom: 4px; }
            .header p { font-size: 13px; color: #666; }
            table { width: 100%; border-collapse: collapse; font-size: 12px; }
            th { background-color: #0D47A1; color: #fff; padding: 10px; text-align: left; }
            td { padding: 8px; border: 1px solid #ddd; }
            .text-right { text-align: right; }
            .footer { margin-top: 20px; font-size: 10px; color: #999; text-align: center; }
            @media print { body { margin: 0; } }
          </style>
        </head>
        <body>
          <div class="header">
            <h2>${selectedAccountName}</h2>
            <p>${startDate ? `From: ${startDate}` : ""} ${endDate ? `To: ${endDate}` : ""}</p>
          </div>
          ${printContent}
          <div class="footer">Computer‑generated statement – ShreeVidhya Academy</div>
        </body>
      </html>
    `);
    printWindow.document.close();
    printWindow.focus();
    printWindow.print();
  };

  return (
    <AdminLayout>
      <h1 className="text-3xl font-righteous text-primary-dark mb-6">Account Ledger</h1>

      {/* Filters & Print */}
      <div className="flex flex-wrap items-end gap-4 mb-6">
        <select
          value={selectedAccount}
          onChange={(e) => setSelectedAccount(e.target.value)}
          className="border rounded p-2.5 text-sm w-64"
        >
          <option value="">Select Account</option>
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
          className="border rounded p-2 text-sm"
        />
        <input
          type="date"
          value={endDate}
          onChange={(e) => setEndDate(e.target.value)}
          className="border rounded p-2 text-sm"
        />
        {selectedAccount && (
          <button
            onClick={handlePrint}
            className="bg-primary text-white px-4 py-2 rounded-lg text-sm flex items-center gap-2 hover:bg-primary-light"
          >
            <Printer size={16} /> Print Ledger
          </button>
        )}
      </div>

      {/* Ledger Table */}
      {selectedAccount && (
        <div className="bg-white rounded-xl shadow-sm overflow-hidden">
          <div id="ledger-table">
            <table className="w-full">
              <thead className="bg-slate-100">
                <tr>
                  <th className="p-3 text-left text-sm">Date</th>
                  <th className="p-3 text-left text-sm">Reference</th>
                  <th className="p-3 text-left text-sm">Description</th>
                  <th className="p-3 text-right text-sm">Debit</th>
                  <th className="p-3 text-right text-sm">Credit</th>
                </tr>
              </thead>
              <tbody>
                {isLoading ? (
                  <tr>
                    <td colSpan={5} className="p-6 text-center">
                      Loading…
                    </td>
                  </tr>
                ) : ledger.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="p-6 text-center text-secondary">
                      No transactions found for this period.
                    </td>
                  </tr>
                ) : (
                  ledger.map((line, i) => (
                    <tr key={i} className="border-t hover:bg-gray-50">
                      <td className="p-3 text-sm">{line.journal_entries?.entry_date}</td>
                      <td className="text-sm">{line.journal_entries?.reference}</td>
                      <td className="text-sm">{line.description}</td>
                      <td className="text-sm text-right">
                        ₹{Number(line.debit).toLocaleString()}
                      </td>
                      <td className="text-sm text-right">
                        ₹{Number(line.credit).toLocaleString()}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </AdminLayout>
  );
}