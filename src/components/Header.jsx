import { useState, useRef, useEffect } from "react";
import {
  Bell, LogOut, UserCircle2, Check, Menu, Download,
} from "lucide-react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { supabase } from "../api/supabase";
import { useAuth } from "../context/AuthContext";
import { useOrg } from "../context/OrganizationContext";
import { useTheme } from "../context/ThemeContext"; // ✅ dynamic theme
import GlobalSearch from "./GlobalSearch";
import { useInstallPrompt } from "../hooks/useInstallPrompt";
import toast from "react-hot-toast";

export default function Header({ onMenuClick }) {
  const { profile, signOut } = useAuth();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const dropdownRef = useRef(null);
  const [dropdownOpen, setDropdownOpen] = useState(false);

  // ── Organization, Branch & Financial Year Context ──
  const {
    org,
    branch,
    setBranch,
    branches,
    financialYears,
    selectedFinancialYear,
    switchFinancialYear,
  } = useOrg();

  // Theme
  const theme = useTheme();
  const headingFont = theme?.font_heading || "Righteous";
  const bodyFont = theme?.font_body || "Montserrat";

  const { isInstallable, promptInstall } = useInstallPrompt();

  const role = (profile?.role || "").toLowerCase().replace(/\s+/g, "_");
  const isStudent = role === "student";

  // Fetch student photo (if student)
  const { data: student } = useQuery({
    queryKey: ["header-student-photo", profile?.id],
    queryFn: async () => {
      const { data } = await supabase
        .from("students")
        .select("photo_url")
        .eq("user_id", profile.id)
        .single();
      return data;
    },
    enabled: !!profile && isStudent,
  });

  // Unread notifications count
  const { data: unreadCount = 0 } = useQuery({
    queryKey: ["notification-unread-count", profile?.id],
    queryFn: async () => {
      if (!profile?.id) return 0;
      const { count, error } = await supabase
        .from("notifications")
        .select("*", { count: "exact", head: false })
        .eq("user_id", profile.id)
        .eq("is_read", false);
      return error ? 0 : count || 0;
    },
    refetchInterval: 30_000,
    enabled: !!profile?.id,
  });

  // Recent notifications
  const { data: recentNotifications = [] } = useQuery({
    queryKey: ["notifications-recent", profile?.id],
    queryFn: async () => {
      if (!profile?.id) return [];
      const { data, error } = await supabase
        .from("notifications")
        .select("*")
        .eq("user_id", profile.id)
        .order("created_at", { ascending: false })
        .limit(5);
      return error ? [] : data;
    },
    enabled: dropdownOpen && !!profile?.id,
  });

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
      queryClient.invalidateQueries({ queryKey: ["notification-unread-count", profile?.id] });
      queryClient.invalidateQueries({ queryKey: ["notifications-recent", profile?.id] });
    },
  });

  const markReadMutation = useMutation({
    mutationFn: async (id) => {
      const { error } = await supabase
        .from("notifications")
        .update({ is_read: true })
        .eq("id", id)
        .eq("user_id", profile.id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["notification-unread-count", profile?.id] });
      queryClient.invalidateQueries({ queryKey: ["notifications-recent", profile?.id] });
    },
  });

  // Close dropdown on outside click
  useEffect(() => {
    function handleClickOutside(event) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
        setDropdownOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // ── Use context signOut ──
  async function handleLogout() {
    await signOut();
    navigate("/login", { replace: true });
  }

  const today = new Date();
  const avatarUrl = profile?.avatar_url;
  const studentPhotoUrl = student?.photo_url;
  const userAvatar = avatarUrl || studentPhotoUrl || null;

  const handleInstallClick = () => {
    if (isInstallable) {
      promptInstall();
    } else {
      toast(
        "To install the app, open the browser menu (⋮) and tap 'Install' or 'Add to Home screen'.",
        { duration: 5000 }
      );
    }
  };

  // ── Branch / FY change handlers ──
  const handleBranchChange = (e) => {
    const selected = branches.find((b) => b.id == e.target.value);
    if (selected) {
      setBranch(selected);
      queryClient.invalidateQueries();
    }
  };

  const handleFinancialYearChange = (e) => {
    const fyId = Number(e.target.value);
    if (fyId) {
      switchFinancialYear(fyId);
      queryClient.invalidateQueries();
    }
  };

  return (
    <header className="bg-white border-b border-primary-bg px-4 lg:px-6 py-3 lg:py-4 flex items-center justify-between">
      {/* ── Left section ── */}
      <div className="flex items-center gap-3 flex-wrap">
        <button
          onClick={onMenuClick}
          className="lg:hidden p-2 -ml-2 rounded-lg hover:bg-primary-bg"
          aria-label="Open menu"
        >
          <Menu size={22} className="text-primary-dark" />
        </button>

        <div className="hidden sm:block">
          <p className="text-sm text-primary-dark" style={{ fontFamily: bodyFont }}>
            {today.toLocaleDateString("en-IN", {
              weekday: "long",
              year: "numeric",
              month: "long",
              day: "numeric",
            })}
          </p>
        </div>

        {/* ─── Branch selector ─────────────────────────────── */}
        {!isStudent && (
          <select
            value={branch?.id || ""}
            onChange={handleBranchChange}
            className="border border-primary-bg bg-white text-primary-dark rounded px-2 py-1.5 text-sm focus:ring-1 focus:ring-primary focus:border-primary outline-none"
            style={{ fontFamily: bodyFont }}
          >
            {branches.length === 0 ? (
              <option value="" disabled>Loading branches...</option>
            ) : (
              branches.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.branch_name}
                </option>
              ))
            )}
          </select>
        )}

        {/* ─── Financial Year selector ────────────────────── */}
        {!isStudent && (
          <select
            value={selectedFinancialYear?.id || ""}
            onChange={handleFinancialYearChange}
            className="border border-primary-bg bg-white text-primary-dark rounded px-2 py-1.5 text-sm focus:ring-1 focus:ring-primary focus:border-primary outline-none"
            style={{ fontFamily: bodyFont }}
          >
            {financialYears.length === 0 ? (
              <option value="" disabled>Loading FY...</option>
            ) : selectedFinancialYear ? (
              financialYears.map((fy) => (
                <option key={fy.id} value={fy.id}>
                  {fy.name}
                </option>
              ))
            ) : (
              <>
                <option value="" disabled>Select FY</option>
                {financialYears.map((fy) => (
                  <option key={fy.id} value={fy.id}>
                    {fy.name}
                  </option>
                ))}
              </>
            )}
          </select>
        )}
      </div>

      {/* Center Search */}
      <GlobalSearch />

      {/* Right Side */}
      <div className="flex items-center gap-3 sm:gap-4 lg:gap-6">
        {/* Notification Bell */}
        <div className="relative" ref={dropdownRef}>
          <button
            onClick={() => setDropdownOpen(!dropdownOpen)}
            className="relative p-1"
          >
            <Bell size={22} className="text-primary-dark hover:text-primary transition" />
            {unreadCount > 0 && (
              <span className="absolute -top-1 -right-1 bg-accent text-white text-[10px] h-5 w-5 rounded-full flex items-center justify-center font-medium">
                {unreadCount > 9 ? "9+" : unreadCount}
              </span>
            )}
          </button>
          {dropdownOpen && (
            <div className="absolute right-0 mt-2 w-80 max-w-[calc(100vw-2rem)] bg-white rounded-xl shadow-xl border border-primary-bg z-50 overflow-hidden">
              <div className="flex items-center justify-between px-4 py-3 border-b border-primary-bg">
                <h4 className="font-semibold text-sm text-primary-dark" style={{ fontFamily: headingFont }}>Notifications</h4>
                <button
                  onClick={() => markAllReadMutation.mutate()}
                  className="text-xs text-primary hover:underline"
                >
                  Mark all read
                </button>
              </div>
              <div className="max-h-64 overflow-y-auto">
                {recentNotifications.length === 0 ? (
                  <p className="p-4 text-sm text-center text-primary-dark/60">No notifications</p>
                ) : (
                  recentNotifications.map((n) => (
                    <div
                      key={n.id}
                      className={`flex items-start gap-3 px-4 py-3 border-b border-primary-bg hover:bg-primary-bg ${
                        !n.is_read ? "bg-primary/5" : ""
                      }`}
                    >
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-primary-dark" style={{ fontFamily: headingFont }}>{n.title}</p>
                        <p className="text-xs text-primary-dark/60 mt-1 truncate">{n.message}</p>
                        <span className="text-xs text-primary-dark/40 mt-1 block">
                          {new Date(n.created_at).toLocaleString()}
                        </span>
                      </div>
                      {!n.is_read && (
                        <button
                          onClick={() => markReadMutation.mutate(n.id)}
                          className="text-primary hover:text-primary-light mt-1 flex-shrink-0"
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
                <button
                  onClick={() => {
                    setDropdownOpen(false);
                    navigate("/notifications");
                  }}
                  className="w-full text-center text-sm text-primary hover:underline font-medium"
                >
                  View all notifications
                </button>
              </div>
            </div>
          )}
        </div>

        {/* User avatar and info */}
        <div className="flex items-center gap-2 lg:gap-3">
          {userAvatar ? (
            <img
              src={userAvatar}
              alt="User avatar"
              className="w-10 h-10 rounded-full object-cover border border-primary-bg"
            />
          ) : (
            <UserCircle2 size={38} className="text-primary flex-shrink-0" />
          )}
          <div className="hidden sm:block">
            <h3 className="font-semibold text-primary-dark text-sm lg:text-base" style={{ fontFamily: headingFont }}>
              {profile?.full_name || "User"}
            </h3>
            <p className="text-xs text-primary-dark/60" style={{ fontFamily: bodyFont }}>{profile?.role || "Admin"}</p>
          </div>
        </div>

        {/* Install App button */}
        <button
          onClick={handleInstallClick}
          className="flex items-center gap-1 bg-primary hover:bg-primary-light text-white px-3 py-2 rounded-lg transition text-sm"
          style={{ fontFamily: bodyFont }}
          title="Install App"
        >
          <Download size={16} />
          <span className="hidden sm:inline">Install</span>
        </button>

        {/* Logout button */}
        <button
          onClick={handleLogout}
          className="flex items-center gap-1 sm:gap-2 bg-accent hover:bg-accent-dark text-white px-2 sm:px-4 py-2 rounded-lg transition text-sm"
          style={{ fontFamily: bodyFont }}
          title="Logout"
        >
          <LogOut size={16} />
          <span className="hidden sm:inline">Logout</span>
        </button>
      </div>
    </header>
  );
}