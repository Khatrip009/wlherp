import { useState, useRef, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { Bell, Check } from "lucide-react";
import { supabase } from "../api/supabase";
import { useAuth } from "../context/AuthContext";
import { useOrg } from "../context/OrganizationContext";
import { useTheme } from "../context/ThemeContext";            // ✅ dynamic theme
import toast from "react-hot-toast";

export default function NotificationBell() {
  const { user, profile } = useAuth();
  const { branch, selectedFinancialYear } = useOrg();
  const queryClient = useQueryClient();
  const dropdownRef = useRef(null);
  const [dropdownOpen, setDropdownOpen] = useState(false);

  const branchId = branch?.id;
  const financialYearId = selectedFinancialYear?.id;

  const theme = useTheme();
  const bodyFont = theme?.font_body || "Montserrat";

  // ── Helper: build base query with scope and role‑based filtering ──
  const getBaseQuery = (select = "*") => {
    let query = supabase
      .from("notifications")
      .select(select);

    // ─── Role‑based filter ─────────────────────────────────
    const isTeacher = profile?.role === "teacher";

    // A user sees notifications:
    // 1. Personal: user_id = their ID
    // 2. Global: user_id IS NULL
    //    - For teachers: exclude 'Fee Payment Received' global notifications
    //    - For others: allow all global notifications
    if (isTeacher) {
      // Teachers: see their own + global except fee payments
      query = query.or(
        `user_id.eq.${user.id},and(user_id.is.null,title.neq."Fee Payment Received")`
      );
    } else {
      // Admins / students: see their own + all global
      query = query.or(
        `user_id.eq.${user.id},user_id.is.null`
      );
    }

    // Branch scope: show branch-specific OR NULL (global)
    if (branchId) {
      query = query.or(`branch_id.eq.${branchId},branch_id.is.null`);
    }

    // Financial year scope: show FY-specific OR NULL (global)
    if (financialYearId) {
      query = query.or(`financial_year_id.eq.${financialYearId},financial_year_id.is.null`);
    }

    return query;
  };

  // ── Fetch unread count ──
  const { data: unreadCount = 0 } = useQuery({
    queryKey: ["notification-unread-count", user?.id, branchId, financialYearId, profile?.role],
    queryFn: async () => {
      if (!user?.id || !branchId || !financialYearId) return 0;
      const query = getBaseQuery("*")
        .eq("is_read", false);

      const { count, error } = await query;
      if (error) {
        console.error("Error fetching unread count:", error);
        return 0;
      }
      return count || 0;
    },
    enabled: !!user?.id && !!branchId && !!financialYearId,
    refetchInterval: 30_000,
    staleTime: 10_000,
  });

  // ── Fetch recent notifications (for dropdown) ──
  const { data: recentNotifications = [] } = useQuery({
    queryKey: ["notifications-recent", user?.id, branchId, financialYearId, profile?.role],
    queryFn: async () => {
      if (!user?.id || !branchId || !financialYearId) return [];
      const query = getBaseQuery("*")
        .order("created_at", { ascending: false })
        .limit(5);

      const { data, error } = await query;
      if (error) {
        console.error("Error fetching recent notifications:", error);
        return [];
      }
      return data || [];
    },
    enabled: dropdownOpen && !!user?.id && !!branchId && !!financialYearId,
    staleTime: 10_000,
  });

  // ── Mark all read mutation ──
  const markAllReadMutation = useMutation({
    mutationFn: async () => {
      if (!user?.id || !branchId || !financialYearId) return;
      const query = getBaseQuery("*")
        .update({ is_read: true })
        .eq("is_read", false);

      const { error } = await query;
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("All notifications marked as read");
      queryClient.invalidateQueries({ queryKey: ["notification-unread-count"] });
      queryClient.invalidateQueries({ queryKey: ["notifications-recent"] });
    },
    onError: (err) => toast.error(err.message),
  });

  // ── Mark single read mutation ──
  const markReadMutation = useMutation({
    mutationFn: async (id) => {
      if (!user?.id || !branchId || !financialYearId) return;
      let query = supabase
        .from("notifications")
        .update({ is_read: true })
        .eq("id", id);

      if (branchId) query = query.eq("branch_id", branchId);
      if (financialYearId) query = query.eq("financial_year_id", financialYearId);

      const { error } = await query;
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["notification-unread-count"] });
      queryClient.invalidateQueries({ queryKey: ["notifications-recent"] });
    },
    onError: (err) => toast.error(err.message),
  });

  // ── Close dropdown on outside click ──
  useEffect(() => {
    function handleClickOutside(event) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
        setDropdownOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const handleToggle = () => setDropdownOpen((prev) => !prev);

  return (
    <div className="relative" ref={dropdownRef}>
      <button
        onClick={handleToggle}
        className="relative p-1 rounded-lg hover:bg-primary-bg transition"
        aria-label="Notifications"
      >
        <Bell size={20} className="text-primary-dark" />
        {unreadCount > 0 && (
          <span className="absolute -top-1 -right-1 bg-accent text-white text-[10px] h-5 w-5 rounded-full flex items-center justify-center font-medium">
            {unreadCount > 9 ? "9+" : unreadCount}
          </span>
        )}
      </button>

      {dropdownOpen && (
        <div className="absolute right-0 mt-2 w-80 max-w-[calc(100vw-2rem)] bg-white rounded-xl shadow-xl border border-primary-bg z-50 overflow-hidden">
          <div className="flex items-center justify-between px-4 py-3 border-b border-primary-bg">
            <h4 className="font-semibold text-sm text-primary-dark" style={{ fontFamily: bodyFont }}>
              Notifications
            </h4>
            <button
              onClick={() => markAllReadMutation.mutate()}
              disabled={unreadCount === 0}
              className="text-xs text-primary hover:underline disabled:opacity-50 disabled:cursor-not-allowed"
              style={{ fontFamily: bodyFont }}
            >
              Mark all read
            </button>
          </div>

          <div className="max-h-64 overflow-y-auto">
            {recentNotifications.length === 0 ? (
              <p className="p-4 text-sm text-center text-primary-dark/60" style={{ fontFamily: bodyFont }}>
                No notifications
              </p>
            ) : (
              recentNotifications.map((n) => (
                <div
                  key={n.id}
                  className={`flex items-start gap-3 px-4 py-3 border-b border-primary-bg hover:bg-primary-bg transition ${
                    !n.is_read ? "bg-primary-bg/50" : ""
                  }`}
                >
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-primary-dark" style={{ fontFamily: bodyFont }}>
                      {n.title}
                    </p>
                    <p className="text-xs text-primary-dark/60 mt-1 line-clamp-2" style={{ fontFamily: bodyFont }}>
                      {n.message}
                    </p>
                    <span className="text-xs text-primary-dark/40 mt-1 block" style={{ fontFamily: bodyFont }}>
                      {new Date(n.created_at).toLocaleString()}
                    </span>
                  </div>
                  {!n.is_read && (
                    <button
                      onClick={() => markReadMutation.mutate(n.id)}
                      className="mt-1 text-primary hover:text-primary-light flex-shrink-0"
                      title="Mark as read"
                    >
                      <Check size={16} />
                    </button>
                  )}
                </div>
              ))
            )}
          </div>

          <div className="px-4 py-3 border-t border-primary-bg">
            <Link
              to="/notifications"
              onClick={() => setDropdownOpen(false)}
              className="w-full text-center text-sm text-primary hover:underline font-medium block"
              style={{ fontFamily: bodyFont }}
            >
              View all notifications
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}