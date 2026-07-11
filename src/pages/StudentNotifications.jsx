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
import StudentLayout from "../layouts/AdminLayout"; // Reusing AdminLayout for now, can create a separate StudentLayout if needed

export default function StudentNotifications() {
  const { profile } = useAuth();
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");

  // Infinite query – only for the current user
  const {
    data,
    isLoading,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
  } = useInfiniteQuery({
    queryKey: ["student-notifications", { search, userId: profile?.id }],
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
    enabled: !!profile?.id,
  });

  const notifications = data?.pages.flatMap((page) => page.data) || [];

  // Mark single as read
  const markReadMutation = useMutation({
    mutationFn: async (id) => {
      const { error } = await supabase
        .from("notifications")
        .update({ is_read: true })
        .eq("id", id)
        .eq("user_id", profile.id); // extra safety
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["student-notifications"] });
      // also invalidate the header count
      queryClient.invalidateQueries({ queryKey: ["notification-unread-count", profile.id] });
    },
  });

  // Mark all as read
  const markAllReadMutation = useMutation({
    mutationFn: async () => {
      const { error } = await supabase
        .from("notifications")
        .update({ is_read: true })
        .eq("user_id", profile.id)
        .eq("is_read", false);
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
          <h1 className="text-3xl font-righteous text-primary-dark">My Notifications</h1>
          <p className="text-sm text-secondary-dark font-montserrat mt-1">
            Stay updated with your announcements
          </p>
        </div>
        {notifications.some(n => !n.is_read) && (
          <button
            onClick={() => markAllReadMutation.mutate()}
            className="bg-primary hover:bg-primary-light text-white px-5 py-2.5 rounded-lg transition font-montserrat text-sm flex items-center gap-2"
          >
            <Check size={18} /> Mark All Read
          </button>
        )}
      </div>

      {/* Search */}
      <div className="relative mb-6 max-w-md">
        <Search
          size={18}
          className="absolute left-3 top-1/2 -translate-y-1/2 text-secondary"
        />
        <input
          type="text"
          placeholder="Search by title or message..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full border border-secondary-light rounded-lg pl-10 pr-4 py-2.5 text-sm focus:ring-1 focus:ring-primary focus:border-primary outline-none placeholder-secondary-light"
        />
      </div>

      {/* Notifications List */}
      <div className="bg-white rounded-xl shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[600px]">
            <thead className="bg-slate-100 border-b border-secondary-light">
              <tr>
                <th className="p-3 text-left text-sm font-montserrat text-secondary-dark">Title</th>
                <th className="text-left text-sm font-montserrat text-secondary-dark">Message</th>
                <th className="text-left text-sm font-montserrat text-secondary-dark">Date</th>
                <th className="text-left text-sm font-montserrat text-secondary-dark">Status</th>
                <th className="text-left text-sm font-montserrat text-secondary-dark">Action</th>
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                <tr>
                  <td colSpan={5} className="p-6 text-center text-secondary">Loading notifications…</td>
                </tr>
              ) : notifications.length === 0 ? (
                <tr>
                  <td colSpan={5} className="p-6 text-center text-secondary">
                    <div className="flex flex-col items-center gap-2">
                      <Bell size={32} className="text-secondary-light" />
                      <span>No notifications for you</span>
                      <span className="text-xs text-secondary-light">
                        {search ? "Try adjusting your search" : "You’re all caught up!"}
                      </span>
                    </div>
                  </td>
                </tr>
              ) : (
                notifications.map((n) => (
                  <tr
                    key={n.id}
                    className={`border-b border-secondary-light hover:bg-primary-bg transition ${
                      !n.is_read ? "bg-blue-50/50" : ""
                    }`}
                  >
                    <td className="p-3 text-sm font-medium">{n.title}</td>
                    <td className="text-sm max-w-xs truncate">{n.message}</td>
                    <td className="text-sm">
                      {new Date(n.created_at).toLocaleDateString()}
                    </td>
                    <td className="text-sm">
                      {n.is_read ? (
                        <span className="text-xs text-secondary">Read</span>
                      ) : (
                        <span className="text-xs text-accent font-medium">New</span>
                      )}
                    </td>
                    <td className="text-sm">
                      {!n.is_read && (
                        <button
                          onClick={() => markReadMutation.mutate(n.id)}
                          className="text-green-600 hover:underline flex items-center gap-1"
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
            className="bg-primary hover:bg-primary-light text-white px-6 py-2.5 rounded-lg font-montserrat text-sm transition disabled:opacity-60"
          >
            {isFetchingNextPage ? "Loading more…" : "Load More"}
          </button>
        </div>
      )}
    </StudentLayout>
  );
}