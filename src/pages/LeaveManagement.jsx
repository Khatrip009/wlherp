// src/pages/LeaveManagement.jsx
import { useState } from "react";
import {
  useInfiniteQuery,
  useMutation,
  useQueryClient,
} from "@tanstack/react-query";
import toast from "react-hot-toast";
import {
  Search,
  Check,
  X,
  Calendar,
  User,
  Clock,
  Mail,
  Download,
} from "lucide-react";
import BackButton from "../components/BackButton";
import { getLeaves, updateLeaveStatus } from "../services/leaveService";
import { useOrg } from "../context/OrganizationContext";
import { useTheme } from "../context/ThemeContext";               // ✅ dynamic theme
import { supabase } from "../api/supabase";
import { sendEmail } from "../services/emailService";
import { generateLeaveApplicationPdf } from "../utils/leaveApplicationPdf";

export default function LeaveManagement() {
  const queryClient = useQueryClient();
  const [statusFilter, setStatusFilter] = useState("");
  const [search, setSearch] = useState("");

  const { branch, selectedFinancialYear, org } = useOrg();
  const theme = useTheme();                                     // ✅ theme hook
  const branchId = branch?.id;
  const financialYearId = selectedFinancialYear?.id;
  const ctx = { branchId, financialYearId };

  const headingFont = theme?.font_heading || "Righteous";
  const bodyFont = theme?.font_body || "Montserrat";

  // ─── Helper: get admin emails ──────────────────────────────────────
  const getAdminEmails = async () => {
    if (!org?.id) return [];
    const { data, error } = await supabase
      .from("profiles")
      .select("email")
      .eq("organization_id", org.id)
      .in("role", ["admin", "super_admin", "organization_admin"])
      .eq("is_active", true);
    if (error) {
      console.error("Failed to fetch admin emails:", error);
      return [];
    }
    return data?.map(p => p.email).filter(Boolean) || [];
  };

  // ─── Send Report Email ─────────────────────────────────────────────
  const sendReportEmail = async () => {
    if (leaves.length === 0) {
      alert("No leave requests to send.");
      return;
    }

    try {
      const adminEmails = await getAdminEmails();
      if (adminEmails.length === 0) {
        alert("No admin emails found.");
        return;
      }

      let tableRows = leaves.map((l) => {
        const teacherName = l.teachers ? `${l.teachers.first_name || ''} ${l.teachers.last_name || ''}`.trim() : '—';
        const statusColor = l.status === "Approved" ? "#2e7d32" :
                            l.status === "Rejected" ? "#c62828" : "#e65100";
        const statusBg = l.status === "Approved" ? "#e8f5e9" :
                         l.status === "Rejected" ? "#ffebee" : "#fff3e0";

        return `
          <tr>
            <td style="padding:4px 8px;border:1px solid #ddd;">${teacherName}</td>
            <td style="padding:4px 8px;border:1px solid #ddd;">${l.start_date}</td>
            <td style="padding:4px 8px;border:1px solid #ddd;">${l.end_date}</td>
            <td style="padding:4px 8px;border:1px solid #ddd;">${l.reason || '—'}</td>
            <td style="padding:4px 8px;border:1px solid #ddd;">
              <span style="background:${statusBg};color:${statusColor};padding:2px 8px;border-radius:12px;font-size:10px;font-weight:600;">${l.status}</span>
            </td>
          </tr>
        `;
      }).join('');

      const pendingCount = leaves.filter(l => l.status === "Pending").length;
      const approvedCount = leaves.filter(l => l.status === "Approved").length;
      const rejectedCount = leaves.filter(l => l.status === "Rejected").length;

      const htmlBody = `
        <div style="font-family:Arial,sans-serif;max-width:800px;margin:0 auto;">
          <h2 style="color:#0D47A1;">Leave Management Report</h2>
          <p><strong>Branch:</strong> ${branch?.branch_name || 'N/A'}</p>
          <p><strong>Filters:</strong> Status: ${statusFilter || 'All'} | Search: ${search || 'None'}</p>
          <p><strong>Total Requests:</strong> ${leaves.length}</p>
          <p>Pending: ${pendingCount} | Approved: ${approvedCount} | Rejected: ${rejectedCount}</p>
          <hr />
          <table style="width:100%;border-collapse:collapse;font-size:11px;border:1px solid #ddd;">
            <thead style="background:#e3f2fd;">
              <tr>
                <th style="padding:4px 8px;border:1px solid #ddd;text-align:left;">Teacher</th>
                <th style="padding:4px 8px;border:1px solid #ddd;text-align:left;">Start Date</th>
                <th style="padding:4px 8px;border:1px solid #ddd;text-align:left;">End Date</th>
                <th style="padding:4px 8px;border:1px solid #ddd;text-align:left;">Reason</th>
                <th style="padding:4px 8px;border:1px solid #ddd;text-align:left;">Status</th>
              </tr>
            </thead>
            <tbody>
              ${tableRows}
            </tbody>
          </table>
          <p style="color:#888;font-size:10px;margin-top:20px;">Computer‑generated report from ${org?.company_name || 'Academy'}</p>
        </div>
      `;

      await sendEmail({
        to: adminEmails,
        subject: `Leave Report - ${new Date().toLocaleDateString()}`,
        html: htmlBody,
      });

      alert("Report sent to admins.");
    } catch (err) {
      console.error("Failed to send report:", err);
      alert("Failed to send report. Check console for details.");
    }
  };

  // ─── PDF download handler ─────────────────────────────────────────
  const handleDownloadLeave = async (leave) => {
    try {
      const doc = await generateLeaveApplicationPdf(leave, leave.teachers, org);
      doc.save(`Leave_${leave.teachers?.first_name}_${leave.teachers?.last_name}.pdf`);
    } catch (err) {
      console.error(err);
      toast.error("Failed to generate leave application PDF");
    }
  };

  const {
    data,
    isLoading,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
  } = useInfiniteQuery({
    queryKey: ["leaves", { status: statusFilter, search }, branchId, financialYearId],
    queryFn: ({ pageParam = 0 }) =>
      getLeaves({
        pageParam,
        filters: { status: statusFilter, search },
        branchId,
        financialYearId,
      }),
    getNextPageParam: (lastPage, allPages) => {
      const totalFetched = allPages.reduce((sum, page) => sum + page.data.length, 0);
      if (lastPage.count && totalFetched < lastPage.count) return allPages.length;
      return undefined;
    },
    initialPageParam: 0,
    enabled: !!branchId && !!financialYearId,
    staleTime: 2 * 60 * 1000,
  });

  const leaves = data?.pages.flatMap((page) => page.data) || [];

  const updateMutation = useMutation({
    mutationFn: ({ id, status, adminRemarks }) =>
      updateLeaveStatus(id, status, adminRemarks, ctx),
    onSuccess: () => {
      toast.success("Leave updated");
      queryClient.invalidateQueries({ queryKey: ["leaves"] });
    },
    onError: () => toast.error("Update failed"),
  });

  return (
    <>
      <BackButton to="/hr-hub" label="HR & Staff" />
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-6 gap-3">
        <div>
          <h1
            className="text-3xl font-bold text-primary"
            style={{ fontFamily: headingFont }}
          >
            Leave Management
          </h1>
          <p
            className="text-sm text-primary-dark mt-1"
            style={{ fontFamily: bodyFont }}
          >
            Approve or reject teacher leave requests
          </p>
        </div>
        <button
          onClick={sendReportEmail}
          className="inline-flex items-center gap-2 px-4 py-2.5 bg-accent hover:bg-accent-dark text-white rounded-lg transition-colors text-sm font-medium"
          style={{ fontFamily: bodyFont }}
        >
          <Mail size={18} /> Send Report
        </button>
      </div>

      <div className="flex flex-col sm:flex-row gap-3 mb-4">
        <div className="relative flex-1 max-w-md">
          <Search
            size={18}
            className="absolute left-3 top-1/2 -translate-y-1/2 text-primary-dark/60"
          />
          <input
            type="text"
            placeholder="Search by teacher name..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full border border-primary-bg bg-white text-primary-dark rounded-lg pl-10 pr-4 py-2.5 text-sm focus:ring-1 focus:ring-primary focus:border-primary outline-none placeholder-primary-dark/40"
            style={{ fontFamily: bodyFont }}
          />
        </div>
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="border border-primary-bg bg-white text-primary-dark rounded-lg p-2.5 text-sm focus:ring-1 focus:ring-primary outline-none"
          style={{ fontFamily: bodyFont }}
        >
          <option value="">All Status</option>
          <option value="Pending">Pending</option>
          <option value="Approved">Approved</option>
          <option value="Rejected">Rejected</option>
        </select>
      </div>

      <div className="bg-white rounded-xl shadow-sm overflow-hidden border border-primary-bg">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[700px]">
            <thead className="bg-primary-bg">
              <tr>
                <th
                  className="p-3 text-left text-sm font-medium text-primary-dark uppercase"
                  style={{ fontFamily: bodyFont }}
                >
                  Teacher
                </th>
                <th
                  className="text-left text-sm font-medium text-primary-dark uppercase"
                  style={{ fontFamily: bodyFont }}
                >
                  Start
                </th>
                <th
                  className="text-left text-sm font-medium text-primary-dark uppercase"
                  style={{ fontFamily: bodyFont }}
                >
                  End
                </th>
                <th
                  className="text-left text-sm font-medium text-primary-dark uppercase"
                  style={{ fontFamily: bodyFont }}
                >
                  Reason
                </th>
                <th
                  className="text-left text-sm font-medium text-primary-dark uppercase"
                  style={{ fontFamily: bodyFont }}
                >
                  Status
                </th>
                <th
                  className="text-left text-sm font-medium text-primary-dark uppercase"
                  style={{ fontFamily: bodyFont }}
                >
                  Actions
                </th>
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                <tr>
                  <td
                    colSpan={6}
                    className="p-6 text-center text-primary-dark/60"
                    style={{ fontFamily: bodyFont }}
                  >
                    Loading...
                  </td>
                </tr>
              ) : leaves.length === 0 ? (
                <tr>
                  <td
                    colSpan={6}
                    className="p-6 text-center text-primary-dark/60"
                    style={{ fontFamily: bodyFont }}
                  >
                    No leave requests found.
                  </td>
                </tr>
              ) : (
                leaves.map((l) => (
                  <tr
                    key={l.id}
                    className="border-b border-primary-bg hover:bg-primary-bg transition-colors"
                  >
                    <td className="p-3 text-sm text-primary-dark" style={{ fontFamily: bodyFont }}>
                      {l.teachers?.first_name} {l.teachers?.last_name}
                    </td>
                    <td className="text-sm text-primary-dark" style={{ fontFamily: bodyFont }}>
                      {l.start_date}
                    </td>
                    <td className="text-sm text-primary-dark" style={{ fontFamily: bodyFont }}>
                      {l.end_date}
                    </td>
                    <td className="text-sm text-primary-dark" style={{ fontFamily: bodyFont }}>
                      {l.reason || "-"}
                    </td>
                    <td className="text-sm">
                      <span
                        className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                          l.status === "Approved"
                            ? "bg-primary-bg text-primary-dark"
                            : l.status === "Rejected"
                            ? "bg-accent text-white"
                            : "bg-accent-bg text-accent-dark"
                        }`}
                      >
                        {l.status}
                      </span>
                    </td>
                    <td className="text-sm">
                      <div className="flex gap-2">
                        {l.status === "Pending" && (
                          <>
                            <button
                              onClick={() =>
                                updateMutation.mutate({ id: l.id, status: "Approved" })
                              }
                              className="text-primary hover:underline"
                            >
                              <Check size={15} /> Approve
                            </button>
                            <button
                              onClick={() => {
                                const remark = prompt("Rejection reason (optional):");
                                updateMutation.mutate({
                                  id: l.id,
                                  status: "Rejected",
                                  adminRemarks: remark || "",
                                });
                              }}
                              className="text-accent-dark hover:underline"
                            >
                              <X size={15} /> Reject
                            </button>
                          </>
                        )}
                        {/* Download button for all leave requests */}
                        <button
                          onClick={() => handleDownloadLeave(l)}
                          className="text-primary hover:underline"
                          title="Download Leave Application PDF"
                        >
                          <Download size={15} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {hasNextPage && (
        <div className="flex justify-center mt-6">
          <button
            onClick={() => fetchNextPage()}
            disabled={isFetchingNextPage}
            className="bg-primary hover:bg-primary-light text-white px-6 py-2.5 rounded-lg text-sm font-medium transition disabled:opacity-60"
            style={{ fontFamily: bodyFont }}
          >
            {isFetchingNextPage ? "Loading more…" : "Load More"}
          </button>
        </div>
      )}
    </>
  );
}