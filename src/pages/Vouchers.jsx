// src/pages/Vouchers.jsx
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { Filter, Search, Printer, Plus } from "lucide-react";
import AdminLayout from "../layouts/AdminLayout";
import BackButton from "../components/BackButton";

import { getVoucherTypes, getVouchers } from "../services/voucherService";
import { getOrganization } from "../services/organizationService";
import { useOrg } from "../context/OrganizationContext";

export default function Vouchers() {
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [typeFilter, setTypeFilter] = useState("");
  const [search, setSearch] = useState("");

  // ── Organisation, Branch & Financial Year from context ──
  const { org: currentOrg, branch, selectedFinancialYear } = useOrg();
  const branchId = branch?.id;
  const financialYearId = selectedFinancialYear?.id;

  const { data: types = [] } = useQuery({
    queryKey: ["voucher-types"],
    queryFn: getVoucherTypes,
  });

  // Fetch organization (org‑wide)
  const { data: org } = useQuery({
    queryKey: ["organization", currentOrg?.id],
    queryFn: () => getOrganization(currentOrg?.id),
    enabled: !!currentOrg?.id,
  });

  // Scoped voucher list
  const { data: vouchers = [], isLoading } = useQuery({
    queryKey: ["vouchers", startDate, endDate, typeFilter, search, branchId, financialYearId],
    queryFn: () =>
      getVouchers(
        {
          start_date: startDate,
          end_date: endDate,
          voucher_type_id: typeFilter,
          search,
        },
        branchId,
        financialYearId
      ),
    enabled: !!branchId && !!financialYearId,
    staleTime: 2 * 60 * 1000,
  });

  const handlePrintList = () => {
    const table = document.getElementById("voucher-list-table");
    if (!table) return;
    const content = table.outerHTML;
    const orgName = org?.company_name || "ShreeVidhya Academy";
    const orgAddr = org?.address || "";
    const orgPhone = org?.phone || "";
    const orgEmail = org?.email || "";
    const filterText = [
      startDate && `From: ${startDate}`,
      endDate && `To: ${endDate}`,
      typeFilter && `Type: ${types.find((t) => t.id == typeFilter)?.name || ""}`,
    ]
      .filter(Boolean)
      .join("  |  ");

    const printWindow = window.open("", "_blank", "width=1100,height=700");
    printWindow.document.write(`
      <html>
        <head>
          <title>Voucher List</title>
          <style>
            body { font-family: Montserrat, sans-serif; margin: 25px; color: #333; }
            .header { display: flex; align-items: center; border-bottom: 2px solid #0D47A1; padding-bottom: 10px; margin-bottom: 15px; }
            .header img { height: 50px; margin-right: 20px; }
            .header .org-name { font-size: 20px; font-weight: bold; color: #0D47A1; }
            .header .org-details { font-size: 10px; color: #666; margin-top: 4px; }
            .filter-info { text-align: center; font-size: 12px; color: #555; margin-bottom: 15px; }
            table { width: 100%; border-collapse: collapse; font-size: 11px; }
            th { background-color: #E3F2FD; padding: 8px; border: 1px solid #ccc; text-align: left; }
            td { padding: 6px 8px; border: 1px solid #eee; }
            .footer { margin-top: 25px; font-size: 10px; color: #888; text-align: center; border-top: 1px solid #ddd; padding-top: 10px; }
            @media print { body { margin: 0; } }
          </style>
        </head>
        <body>
          <div class="header">
            <img src="${org?.logo_dark_url || '/ShreeVidhyaDark.png'}" alt="Logo" />
            <div>
              <div class="org-name">${orgName}</div>
              <div class="org-details">${orgAddr}</div>
              <div class="org-details">Ph: ${orgPhone}  |  Email: ${orgEmail}</div>
            </div>
          </div>
          <h2 style="text-align:center; color:#0D47A1; margin:15px 0;">Voucher List</h2>
          ${filterText ? `<div class="filter-info">${filterText}</div>` : ""}
          ${content}
          <div class="footer">Computer‑generated report – ${orgName}</div>
          <script>window.print();</script>
        </body>
      </html>
    `);
    printWindow.document.close();
  };

  return (
    <AdminLayout>
      <BackButton to="/accounting" label="Finance & Accounting" />
      <div className="flex justify-between items-center mb-6">
        <div>
          <h1 className="text-3xl font-righteous text-primary-dark">Vouchers</h1>
          <p className="text-sm text-secondary-dark mt-1">All accounting transactions</p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={handlePrintList}
            className="border border-secondary-light px-4 py-2 rounded-lg text-sm flex items-center gap-2"
          >
            <Printer size={16} /> Print List
          </button>
          <Link
            to="/vouchers/new"
            className="bg-primary text-white px-4 py-2 rounded-lg text-sm flex items-center gap-2"
          >
            <Plus size={18} /> New Voucher
          </Link>
        </div>
      </div>

      <div className="flex flex-wrap gap-4 mb-6">
        <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} className="border rounded p-2 text-sm" />
        <input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} className="border rounded p-2 text-sm" />
        <select value={typeFilter} onChange={(e) => setTypeFilter(e.target.value)} className="border rounded p-2 text-sm">
          <option value="">All Types</option>
          {types.map((t) => (
            <option key={t.id} value={t.id}>{t.name}</option>
          ))}
        </select>
        <div className="relative flex-1 max-w-xs">
          <Search size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-secondary" />
          <input type="text" placeholder="Search voucher no or reference..." value={search} onChange={(e) => setSearch(e.target.value)} className="w-full pl-10 pr-4 py-2 border rounded text-sm" />
        </div>
      </div>

      <div className="bg-white rounded-xl shadow-sm overflow-hidden">
        <div id="voucher-list-table">
          <table className="w-full">
            <thead className="bg-slate-100"><tr>
              <th className="p-3 text-left text-sm">Voucher No</th>
              <th className="p-3 text-left text-sm">Type</th>
              <th className="p-3 text-left text-sm">Date</th>
              <th className="p-3 text-left text-sm">Reference</th>
              <th className="p-3 text-left text-sm">Description</th>
            </tr></thead>
            <tbody>
              {isLoading ? (
                <tr><td colSpan={5} className="p-6 text-center">Loading…</td></tr>
              ) : vouchers.length === 0 ? (
                <tr><td colSpan={5} className="p-6 text-center">No vouchers found.</td></tr>
              ) : (
                vouchers.map((v) => (
                  <tr key={v.id} className="border-t hover:bg-gray-50">
                    <td className="p-3 text-sm font-medium">
                      <Link to={`/vouchers/${v.id}`} className="text-primary hover:underline">{v.voucher_no}</Link>
                    </td>
                    <td className="text-sm">{v.voucher_types?.name}</td>
                    <td className="text-sm">{v.entry_date}</td>
                    <td className="text-sm">{v.reference}</td>
                    <td className="text-sm">{v.description}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </AdminLayout>
  );
}