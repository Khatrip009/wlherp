// src/pages/ActivityLogs.jsx
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "../api/supabase";
import { Search, Download } from "lucide-react";
import { useOrg } from "../context/OrganizationContext";
import { useTheme } from "../context/ThemeContext";

export default function ActivityLogs() {
  const { branch, selectedFinancialYear } = useOrg();
  const theme = useTheme();
  const branchId = branch?.id;
  const financialYearId = selectedFinancialYear?.id;   // kept for query key only

  const headingFont = theme?.font_heading || "Righteous";
  const bodyFont = theme?.font_body || "Montserrat";

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
        .eq("organization_id", 3)                             // restrict to org 3
        .or(`branch_id.eq.${branchId},branch_id.is.null`)    // include both branch‑specific and global logs
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
    enabled: !!branchId,   // financialYearId no longer required for the query itself
    staleTime: 30 * 1000,
  });

  const exportCSV = () => {
    if (logs.length === 0) return;
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
    <div className="space-y-6 px-4 sm:px-6 lg:px-0">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold text-primary" style={{ fontFamily: headingFont }}>
            Activity Logs
          </h1>
          <p className="text-sm text-primary-dark mt-1" style={{ fontFamily: bodyFont }}>
            Track all system events and user actions
          </p>
        </div>
        <button
          onClick={exportCSV}
          className="inline-flex items-center gap-2 px-4 py-2.5 border border-primary-bg bg-white text-primary-dark rounded-lg hover:bg-primary-bg transition-colors text-sm font-medium"
          style={{ fontFamily: bodyFont }}
        >
          <Download size={16} /> Export CSV
        </button>
      </div>

      {/* Filters */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
        <div className="relative">
          <Search size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-primary-dark" />
          <input
            type="text"
            placeholder="Search action or entity..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-10 pr-4 py-2.5 border border-primary-bg bg-white text-primary-dark rounded-lg text-sm"
            style={{ fontFamily: bodyFont }}
          />
        </div>
        <input
          type="date"
          value={startDate}
          onChange={(e) => setStartDate(e.target.value)}
          className="border border-primary-bg bg-white text-primary-dark rounded-lg p-2.5 text-sm"
          style={{ fontFamily: bodyFont }}
        />
        <input
          type="date"
          value={endDate}
          onChange={(e) => setEndDate(e.target.value)}
          className="border border-primary-bg bg-white text-primary-dark rounded-lg p-2.5 text-sm"
          style={{ fontFamily: bodyFont }}
        />
        <select
          value={actionFilter}
          onChange={(e) => setActionFilter(e.target.value)}
          className="border border-primary-bg bg-white text-primary-dark rounded-lg px-4 py-2.5 text-sm"
          style={{ fontFamily: bodyFont }}
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
      <div className="bg-white rounded-xl shadow-sm border border-primary-bg overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[700px]">
            <thead className="bg-primary-bg">
              <tr>
                <th className="p-3 text-left text-xs font-medium text-primary-dark uppercase tracking-wider" style={{ fontFamily: bodyFont }}>
                  Timestamp
                </th>
                <th className="p-3 text-left text-xs font-medium text-primary-dark uppercase tracking-wider" style={{ fontFamily: bodyFont }}>
                  Action
                </th>
                <th className="p-3 text-left text-xs font-medium text-primary-dark uppercase tracking-wider" style={{ fontFamily: bodyFont }}>
                  Entity
                </th>
                <th className="p-3 text-left text-xs font-medium text-primary-dark uppercase tracking-wider" style={{ fontFamily: bodyFont }}>
                  Details
                </th>
                <th className="p-3 text-left text-xs font-medium text-primary-dark uppercase tracking-wider" style={{ fontFamily: bodyFont }}>
                  IP Address
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-primary-bg">
              {isLoading ? (
                <tr>
                  <td colSpan={5} className="p-6 text-center text-primary-dark" style={{ fontFamily: bodyFont }}>
                    Loading…
                  </td>
                </tr>
              ) : logs.length === 0 ? (
                <tr>
                  <td colSpan={5} className="p-6 text-center text-primary-dark" style={{ fontFamily: bodyFont }}>
                    No logs found.
                  </td>
                </tr>
              ) : (
                logs.map((log) => (
                  <tr key={log.id} className="hover:bg-primary-bg transition-colors">
                    <td className="p-3 text-sm text-primary-dark" style={{ fontFamily: bodyFont }}>
                      {new Date(log.created_at).toLocaleString()}
                    </td>
                    <td className="p-3 text-sm">
                      <span className="inline-block px-2 py-1 rounded-full text-xs font-medium capitalize bg-primary-bg text-primary-dark">
                        {log.action}
                      </span>
                    </td>
                    <td className="p-3 text-sm text-primary-dark" style={{ fontFamily: bodyFont }}>
                      {log.entity_type}{log.entity_id ? ` #${log.entity_id}` : ""}
                    </td>
                    <td className="p-3 text-sm max-w-xs truncate text-primary-dark" style={{ fontFamily: bodyFont }}>
                      {log.details ? JSON.stringify(log.details) : "—"}
                    </td>
                    <td className="p-3 text-sm text-primary-dark" style={{ fontFamily: bodyFont }}>
                      {log.ip_address || "—"}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}