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
} from "lucide-react";
import BackButton from "../components/BackButton";
import { getLeaves, updateLeaveStatus } from "../services/leaveService";
import { useOrg } from "../context/OrganizationContext";

export default function LeaveManagement() {
  const queryClient = useQueryClient();
  const [statusFilter, setStatusFilter] = useState("");
  const [search, setSearch] = useState("");

  const { branch, selectedFinancialYear } = useOrg();
  const branchId = branch?.id;
  const financialYearId = selectedFinancialYear?.id;
  const ctx = { branchId, financialYearId };

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
      <div className="mb-6">
        <h1 className="text-3xl font-righteous text-primary-dark">Leave Management</h1>
        <p className="text-sm text-secondary-dark font-montserrat">Approve or reject teacher leave requests</p>
      </div>

      <div className="flex flex-col sm:flex-row gap-3 mb-4">
        <div className="relative flex-1 max-w-md">
          <Search size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-secondary" />
          <input
            type="text"
            placeholder="Search by teacher name..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full border border-secondary-light rounded-lg pl-10 pr-4 py-2.5 text-sm focus:ring-1 focus:ring-primary focus:border-primary outline-none placeholder-secondary-light"
          />
        </div>
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="border border-secondary-light rounded-lg p-2.5 text-sm focus:ring-1 focus:ring-primary outline-none"
        >
          <option value="">All Status</option>
          <option value="Pending">Pending</option>
          <option value="Approved">Approved</option>
          <option value="Rejected">Rejected</option>
        </select>
      </div>

      <div className="bg-white rounded-xl shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[700px]">
            <thead className="bg-slate-100 border-b border-secondary-light">
              <tr>
                <th className="p-3 text-left text-sm font-montserrat text-secondary-dark">Teacher</th>
                <th className="text-left">Start</th>
                <th className="text-left">End</th>
                <th className="text-left">Reason</th>
                <th className="text-left">Status</th>
                <th className="text-left">Actions</th>
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                <tr><td colSpan={6} className="p-6 text-center text-secondary">Loading...</td></tr>
              ) : leaves.length === 0 ? (
                <tr><td colSpan={6} className="p-6 text-center text-secondary">No leave requests found.</td></tr>
              ) : (
                leaves.map((l) => (
                  <tr key={l.id} className="border-b border-secondary-light hover:bg-primary-bg transition">
                    <td className="p-3 text-sm">{l.teachers?.first_name} {l.teachers?.last_name}</td>
                    <td className="text-sm">{l.start_date}</td>
                    <td className="text-sm">{l.end_date}</td>
                    <td className="text-sm">{l.reason || "-"}</td>
                    <td className="text-sm">
                      <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                        l.status === "Approved" ? "bg-green-100 text-green-700" :
                        l.status === "Rejected" ? "bg-red-100 text-red-700" :
                        "bg-yellow-100 text-yellow-700"
                      }`}>{l.status}</span>
                    </td>
                    <td className="text-sm">
                      {l.status === "Pending" && (
                        <div className="flex gap-2">
                          <button
                            onClick={() => updateMutation.mutate({ id: l.id, status: "Approved" })}
                            className="text-green-600 hover:underline"
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
                            className="text-red-600 hover:underline"
                          >
                            <X size={15} /> Reject
                          </button>
                        </div>
                      )}
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
            className="bg-primary hover:bg-primary-light text-white px-6 py-2.5 rounded-lg font-montserrat text-sm transition disabled:opacity-60"
          >
            {isFetchingNextPage ? "Loading more…" : "Load More"}
          </button>
        </div>
      )}
    </>
  );
}