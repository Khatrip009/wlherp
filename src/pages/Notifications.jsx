import { useState, useRef, useEffect } from "react";
import {
  useInfiniteQuery,
  useMutation,
  useQueryClient,
} from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { Bell, Check, X, Search, Trash2 } from "lucide-react";
import { supabase } from "../api/supabase";
import { useAuth } from "../context/AuthContext";
import { useOrg } from "../context/OrganizationContext";
import toast from "react-hot-toast";
import BackButton from "../components/BackButton";

export default function NotificationListPage() {
  const { user, profile } = useAuth();
  const { branch, selectedFinancialYear } = useOrg();
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");

  const branchId = branch?.id;
  const financialYearId = selectedFinancialYear?.id;

  // ── Exact same helper as in NotificationBell ──
  const getBaseQuery = (select = "*") => {
    let query = supabase.from("notifications").select(select);

    const isTeacher = profile?.role === "teacher";

    if (isTeacher) {
      query = query.or(
        `user_id.eq.${user.id},and(user_id.is.null,title.neq."Fee Payment Received")`
      );
    } else {
      query = query.or(`user_id.eq.${user.id},user_id.is.null`);
    }

    if (branchId) {
      query = query.or(`branch_id.eq.${branchId},branch_id.is.null`);
    }

    if (financialYearId) {
      query = query.or(
        `financial_year_id.eq.${financialYearId},financial_year_id.is.null`
      );
    }

    return query;
  };

  // ── Infinite scroll for full notification list ──
  const {
    data,
    isLoading,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
  } = useInfiniteQuery({
    queryKey: ["notifications-list", user?.id, branchId, financialYearId, profile?.role, search],
    queryFn: async ({ pageParam = 0 }) => {
      if (!user?.id || !branchId || !financialYearId) {
        return { data: [], count: 0 };
      }

      const limit = 20;
      const from = pageParam * limit;
      const to = from + limit - 1;

      let query = getBaseQuery("*")
        .order("created_at", { ascending: false })
        .range(from, to);

      if (search) {
        query = query.or(`title.ilike.%${search}%,message.ilike.%${search}%`);
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
    enabled: !!user?.id && !!branchId && !!financialYearId,
    staleTime: 30_000,
    refetchOnWindowFocus: true,
  });

  const notifications = data?.pages.flatMap((page) => page.data) || [];

  // ── Mark single as read ──
  const markReadMutation = useMutation({
    mutationFn: async (id) => {
      const { error } = await supabase
        .from("notifications")
        .update({ is_read: true })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["notifications-list"] });
      queryClient.invalidateQueries({ queryKey: ["notification-unread-count"] });
    },
    onError: (err) => toast.error(err.message),
  });

  // ── Mark all as read ──
const markAllReadMutation = useMutation({
  mutationFn: async () => {
    if (!user?.id || !branchId || !financialYearId) return;

    let query = supabase
      .from("notifications")
      .update({ is_read: true })
      .eq("is_read", false);

    // Apply the same role‑based visibility rules
    const isTeacher = profile?.role === "teacher";
    if (isTeacher) {
      query = query.or(
        `user_id.eq.${user.id},and(user_id.is.null,title.neq."Fee Payment Received")`
      );
    } else {
      query = query.or(`user_id.eq.${user.id},user_id.is.null`);
    }

    // Branch & FY scoping
    if (branchId) {
      query = query.or(`branch_id.eq.${branchId},branch_id.is.null`);
    }
    if (financialYearId) {
      query = query.or(
        `financial_year_id.eq.${financialYearId},financial_year_id.is.null`
      );
    }

    const { error } = await query;
    if (error) throw error;
  },
  onSuccess: () => {
    toast.success("All notifications marked as read");
    queryClient.invalidateQueries({ queryKey: ["notifications-list"] });
    queryClient.invalidateQueries({ queryKey: ["notification-unread-count"] });
  },
  onError: (err) => toast.error(err.message),
});

  // ── Delete a notification (soft‑delete only if needed) ──
  const deleteMutation = useMutation({
    mutationFn: async (id) => {
      const { error } = await supabase
        .from("notifications")
        .delete()
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Notification deleted");
      queryClient.invalidateQueries({ queryKey: ["notifications-list"] });
    },
    onError: (err) => toast.error(err.message),
  });

  return (
    <>
      
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-6 gap-4">
          <div>
            <h1 className="text-3xl font-righteous text-primary-dark">
              My Notifications
            </h1>
            <p className="text-sm text-secondary-dark font-montserrat mt-1">
              Stay updated with announcements and personal messages
            </p>
          </div>
          <button
            onClick={() => markAllReadMutation.mutate()}
            className="border border-secondary-light px-4 py-2.5 rounded-lg text-secondary-dark hover:bg-secondary-bg font-montserrat text-sm flex items-center gap-2"
          >
            <Check size={18} /> Mark All Read
          </button>
        </div>

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

        <div className="space-y-3">
          {isLoading ? (
            <p className="text-center text-secondary py-8">Loading notifications…</p>
          ) : notifications.length === 0 ? (
            <div className="text-center text-secondary py-8">
              <Bell size={40} className="mx-auto text-secondary-light mb-2" />
              <p>No notifications found</p>
              <p className="text-xs text-secondary-light mt-1">
                {search ? "Try a different search term" : "You’re all caught up!"}
              </p>
            </div>
          ) : (
            notifications.map((n) => (
              <div
                key={n.id}
                className={`relative bg-white border border-secondary-light rounded-lg p-4 hover:shadow-sm transition ${
                  !n.is_read ? "border-l-4 border-l-primary bg-blue-50/30" : ""
                }`}
              >
                <div className="flex justify-between items-start gap-3">
                  <div className="flex-1 min-w-0">
                    <h3 className="font-semibold text-primary-dark">{n.title}</h3>
                    <p className="text-sm text-secondary-dark mt-1 whitespace-pre-wrap">
                      {n.message}
                    </p>
                    <span className="text-xs text-secondary-light mt-2 block">
                      {new Date(n.created_at).toLocaleString()}
                    </span>
                  </div>
                  <div className="flex flex-col items-end gap-2 flex-shrink-0">
                    {!n.is_read && (
                      <button
                        onClick={() => markReadMutation.mutate(n.id)}
                        className="text-primary hover:text-primary-light p-1"
                        title="Mark as read"
                      >
                        <Check size={18} />
                      </button>
                    )}
                    <button
                      onClick={() => {
                        if (window.confirm("Delete this notification?")) {
                          deleteMutation.mutate(n.id);
                        }
                      }}
                      className="text-red-500 hover:text-red-600 p-1"
                      title="Delete"
                    >
                      <Trash2 size={16} />
                    </button>
                  </div>
                </div>
              </div>
            ))
          )}
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
      </div>
    </>
  );
}