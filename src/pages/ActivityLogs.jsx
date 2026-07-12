import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "../api/supabase";
import AdminLayout from "../layouts/AdminLayout";
import { Search, Download, Filter, X, User, Activity, Calendar } from "lucide-react";
import { useOrg } from "../context/OrganizationContext";

export default function ActivityLogs() {
  const { branch, selectedFinancialYear } = useOrg();
  const branchId = branch?.id;
  const financialYearId = selectedFinancialYear?.id;

  const [search, setSearch] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [actionFilter, setActionFilter] = useState("");

  const { data: logs = [], isLoading } = useQuery({
    queryKey: ["activity-logs", search, startDate, endDate, actionFilter, branchId, financialYearId],
    queryFn: async () => {
      let query = supabase
        .from("activity_logs")
        .select("id, user_id, organization_id, branch_id, action, entity_type, entity_id, details, ip_address, user_agent, created_at")
        .eq("branch_id", branchId)
        .eq("financial_year_id", financialYearId)
        .order("created_at", { ascending: false })
        .limit(500);

      if (search) {
        query = query.or(`action.ilike.%${search}%,entity_type.ilike.%${search}%`);
      }
      if (startDate) query = query.gte("created_at", startDate);
      if (endDate) query = query.lte("created_at", endDate);
      if (actionFilter) query = query.eq("action", actionFilter);

      const { data, error } = await query;
      if (error) throw error;
      return data || [];
    },
    enabled: !!branchId && !!financialYearId,
    staleTime: 30 * 1000,
  });

  const exportCSV = () => {
    const rows = logs.map((l) => [
      l.created_at,
      l.action,
      l.entity_type,
      l.entity_id,
      JSON.stringify(l.details),
      l.ip_address,
    ]);
    const csvContent = "data:text/csv;charset=utf-8," + rows.map((e) => e.join(",")).join("\n");
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", "activity_logs.csv");
    document.body.appendChild(link);
    link.click();
  };

  return (
    <AdminLayout>
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-6 gap-4">
        <h1 className="text-3xl font-righteous text-primary-dark">Activity Logs</h1>
        <div className="flex items-center gap-3">
          <button onClick={exportCSV} className="border px-4 py-2 rounded-lg text-sm flex items-center gap-2">
            <Download size={16} /> Export
          </button>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-3 mb-4">
        <div className="relative flex-1">
          <Search size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-secondary" />
          <input
            type="text"
            placeholder="Search by action or entity..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-10 pr-4 py-2.5 border rounded-lg text-sm"
          />
        </div>
        <div>
          <input
            type="date"
            value={startDate}
            onChange={(e) => setStartDate(e.target.value)}
            className="border rounded-lg p-2.5 text-sm"
          />
        </div>
        <div>
          <input
            type="date"
            value={endDate}
            onChange={(e) => setEndDate(e.target.value)}
            className="border rounded-lg p-2.5 text-sm"
          />
        </div>
        <select
          value={actionFilter}
          onChange={(e) => setActionFilter(e.target.value)}
          className="border rounded-lg px-4 py-2.5 text-sm"
        >
          <option value="">All Actions</option>
          <option value="create_student">Create Student</option>
          <option value="update_student">Update Student</option>
          <option value="delete_student">Delete Student</option>
          <option value="create_batch">Create Batch</option>
          <option value="collect_payment">Collect Payment</option>
          <option value="login">Login</option>
          <option value="logout">Logout</option>
        </select>
      </div>

      {/* Table */}
      <div className="bg-white rounded-xl shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[700px]">
            <thead className="bg-slate-100">
              <tr>
                <th className="p-3 text-left text-sm">Timestamp</th>
                <th className="p-3 text-left text-sm">Action</th>
                <th className="p-3 text-left text-sm">Entity</th>
                <th className="p-3 text-left text-sm">Details</th>
                <th className="p-3 text-left text-sm">IP Address</th>
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                <tr><td colSpan={5} className="p-6 text-center">Loading…</td></tr>
              ) : logs.length === 0 ? (
                <tr><td colSpan={5} className="p-6 text-center text-secondary">No logs found.</td></tr>
              ) : (
                logs.map((log) => (
                  <tr key={log.id} className="border-t hover:bg-gray-50">
                    <td className="p-3 text-sm">{new Date(log.created_at).toLocaleString()}</td>
                    <td className="p-3 text-sm">{log.action}</td>
                    <td className="p-3 text-sm">
                      {log.entity_type}{log.entity_id ? ` #${log.entity_id}` : ""}
                    </td>
                    <td className="p-3 text-sm max-w-xs truncate">
                      {log.details ? JSON.stringify(log.details) : "—"}
                    </td>
                    <td className="p-3 text-sm">{log.ip_address || "—"}</td>
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