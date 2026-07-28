// src/pages/StudentNotifications.jsx
import React, { useState } from "react";
import {
  useInfiniteQuery,
  useMutation,
  useQueryClient,
} from "@tanstack/react-query";
import toast from "react-hot-toast";
import { Search, Check, Bell } from "lucide-react";
import { supabase } from "../api/supabase";
import { useAuth } from "../context/AuthContext";
import StudentLayout from "../layouts/AdminLayout";
import { useOrg } from "../context/OrganizationContext";

export default function StudentNotifications() {
  const { profile } = useAuth();
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");

  const { branch, selectedFinancialYear } = useOrg();
  const branchId = branch?.id;
  const financialYearId = selectedFinancialYear?.id;

  // Infinite query – scoped to branch & FY
  const {
    data,
    isLoading,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
  } = useInfiniteQuery({
    queryKey: ["student-notifications", { search, userId: profile?.id }, branchId, financialYearId],
    queryFn: async ({ pageParam = 0 }) => {
      const limit = 20;
      const from = pageParam * limit;
      const to = from + limit - 1;

      let query = supabase
        .from("notifications")
        .select("*", { count: "exact" })
        .eq("user_id", profile.id)
        .order("created_at", { ascending: false })
        .range(from, to);

      if (branchId) query = query.eq("branch_id", branchId);
      if (financialYearId) query = query.eq("financial_year_id", financialYearId);

      if (search) {
        query = query.or(
          `title.ilike.%${search}%,message.ilike.%${search}%`
        );
      }

      const { data, error, count } = await query;
      if (error) throw error;
      return { data: data || [], count };
    },
    getNextPageParam: (lastPage, allPages) => {
      const totalFetched = allPages.reduce((sum, page) => sum + page.data.length, 0);
      if (lastPage.count && totalFetched < lastPage.count) {
        return allPages.length;
      }
      return undefined;
    },
    initialPageParam: 0,
    staleTime: 2 * 60 * 1000,
    enabled: !!profile?.id && !!branchId && !!financialYearId,
  });

  const notifications = data?.pages.flatMap((page) => page.data) || [];

  // Mark single as read – scoped update
  const markReadMutation = useMutation({
    mutationFn: async (id) => {
      let query = supabase
        .from("notifications")
        .update({ is_read: true })
        .eq("id", id)
        .eq("user_id", profile.id);

      if (branchId) query = query.eq("branch_id", branchId);
      if (financialYearId) query = query.eq("financial_year_id", financialYearId);

      const { error } = await query;
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["student-notifications"] });
      queryClient.invalidateQueries({ queryKey: ["notification-unread-count", profile.id] });
    },
  });

  // Mark all as read – scoped
  const markAllReadMutation = useMutation({
    mutationFn: async () => {
      let query = supabase
        .from("notifications")
        .update({ is_read: true })
        .eq("user_id", profile.id)
        .eq("is_read", false);

      if (branchId) query = query.eq("branch_id", branchId);
      if (financialYearId) query = query.eq("financial_year_id", financialYearId);

      const { error } = await query;
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("All notifications marked as read");
      queryClient.invalidateQueries({ queryKey: ["student-notifications"] });
      queryClient.invalidateQueries({ queryKey: ["notification-unread-count", profile.id] });
    },
  });

  return (
    <StudentLayout>
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-6 gap-4">
        <div>
          <h1 className="text-3xl font-heading text-primary-dark">My Notifications</h1>
          <p className="text-sm text-gray-600 dark:text-gray-400 font-body mt-1">
            Stay updated with your announcements
          </p>
        </div>
        {notifications.some((n) => !n.is_read) && (
          <button
            onClick={() => markAllReadMutation.mutate()}
            className="bg-primary hover:bg-primary-light text-white px-5 py-2.5 rounded-lg transition font-body text-sm flex items-center gap-2"
          >
            <Check size={18} /> Mark All Read
          </button>
        )}
      </div>

      {/* Search */}
      <div className="relative mb-6 max-w-md">
        <Search
          size={18}
          className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 dark:text-gray-500"
        />
        <input
          type="text"
          placeholder="Search by title or message..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 rounded-lg pl-10 pr-4 py-2.5 text-sm focus:ring-2 focus:ring-primary focus:border-primary outline-none placeholder-gray-400 dark:placeholder-gray-500"
        />
      </div>

      {/* Notifications List */}
      <div className="bg-white dark:bg-accent rounded-xl shadow-sm overflow-hidden border border-gray-200 dark:border-gray-700">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[600px]">
            <thead className="bg-gray-50 dark:bg-gray-700 border-b border-gray-200 dark:border-gray-600">
              <tr>
                <th className="p-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                  Title
                </th>
                <th className="p-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                  Message
                </th>
                <th className="p-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                  Date
                </th>
                <th className="p-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                  Status
                </th>
                <th className="p-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                  Action
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
              {isLoading ? (
                <tr>
                  <td colSpan={5} className="p-6 text-center text-gray-500 dark:text-gray-400">
                    Loading notifications…
                  </td>
                </tr>
              ) : notifications.length === 0 ? (
                <tr>
                  <td colSpan={5} className="p-6 text-center text-gray-500 dark:text-gray-400">
                    <div className="flex flex-col items-center gap-2">
                      <Bell size={32} className="text-gray-400 dark:text-gray-500" />
                      <span>No notifications for you</span>
                      <span className="text-xs text-gray-400 dark:text-gray-500">
                        {search ? "Try adjusting your search" : "You’re all caught up!"}
                      </span>
                    </div>
                  </td>
                </tr>
              ) : (
                notifications.map((n) => (
                  <tr
                    key={n.id}
                    className={`hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors ${
                      !n.is_read ? "bg-primary-bg/30" : ""
                    }`}
                  >
                    <td className="p-3 text-sm font-medium text-gray-800 dark:text-gray-100">
                      {n.title}
                    </td>
                    <td className="p-3 text-sm text-gray-700 dark:text-gray-200 max-w-xs truncate">
                      {n.message}
                    </td>
                    <td className="p-3 text-sm text-gray-700 dark:text-gray-200">
                      {new Date(n.created_at).toLocaleDateString()}
                    </td>
                    <td className="p-3 text-sm">
                      {n.is_read ? (
                        <span className="text-xs text-gray-500 dark:text-gray-400">Read</span>
                      ) : (
                        <span className="text-xs text-accent font-medium">New</span>
                      )}
                    </td>
                    <td className="p-3 text-sm">
                      {!n.is_read && (
                        <button
                          onClick={() => markReadMutation.mutate(n.id)}
                          className="text-primary hover:underline flex items-center gap-1"
                          title="Mark as read"
                        >
                          <Check size={15} /> Mark Read
                        </button>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Load More */}
      {hasNextPage && (
        <div className="flex justify-center mt-6">
          <button
            onClick={() => fetchNextPage()}
            disabled={isFetchingNextPage}
            className="bg-primary hover:bg-primary-light text-white px-6 py-2.5 rounded-lg font-body text-sm transition disabled:opacity-60"
          >
            {isFetchingNextPage ? "Loading more…" : "Load More"}
          </button>
        </div>
      )}
    </StudentLayout>
  );
}