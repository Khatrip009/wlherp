// src/components/Header.jsx
import { useState, useRef, useEffect } from "react";
import {
  Bell, LogOut, UserCircle2, Check, Menu, Download,
  Sliders,
} from "lucide-react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { supabase } from "../api/supabase";
import { useAuth } from "../context/AuthContext";
import { useOrg } from "../context/OrganizationContext";
import GlobalSearch from "./GlobalSearch";
import { useInstallPrompt } from "../hooks/useInstallPrompt";
import toast from "react-hot-toast";

export default function Header({ onMenuClick }) {
  const { profile } = useAuth();
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

  const [settingsPanelOpen, setSettingsPanelOpen] = useState(false);
  const settingsPanelRef = useRef(null);

  const { isInstallable, promptInstall } = useInstallPrompt();

  const role = (profile?.role || "").toLowerCase().replace(/\s+/g, "_");
  const isStudent = role === "student";
  const showBranchFY = !isStudent && (branches.length > 1 || financialYears.length > 0);

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

  // Close settings panel on outside click
  useEffect(() => {
    function handleClickOutside(event) {
      if (
        settingsPanelRef.current &&
        !settingsPanelRef.current.contains(event.target)
      ) {
        setSettingsPanelOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  async function handleLogout() {
    await supabase.auth.signOut();
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

  // ── Handler for branch selection: updates context and invalidates queries ──
  const handleBranchChange = (e) => {
    const selected = branches.find((b) => b.id == e.target.value);
    if (selected) {
      setBranch(selected);
      // Invalidate all data queries so they refetch with the new branch
      queryClient.invalidateQueries();
    }
  };

  // ── Handler for financial year selection ──
  const handleFinancialYearChange = (e) => {
    const fyId = Number(e.target.value);
    if (fyId) {
      switchFinancialYear(fyId);
      // Invalidate all data queries so they refetch with the new FY
      queryClient.invalidateQueries();
    }
  };

  return (
    <header className="bg-white border-b border-secondary-light px-4 lg:px-6 py-3 lg:py-4 flex items-center justify-between">
      {/* ── Left section ── */}
      <div className="flex items-center gap-3">
        <button
          onClick={onMenuClick}
          className="lg:hidden p-2 -ml-2 rounded-lg hover:bg-secondary-bg"
          aria-label="Open menu"
        >
          <Menu size={22} className="text-secondary-dark" />
        </button>

        <div className="hidden sm:block">
          <p className="text-sm text-secondary-dark font-montserrat whitespace-nowrap">
            {today.toLocaleDateString("en-IN", {
              weekday: "long",
              year: "numeric",
              month: "long",
              day: "numeric",
            })}
          </p>
        </div>

        {/* ── Branch / FY selector button ── */}
        {showBranchFY && (
          <div className="relative" ref={settingsPanelRef}>
            <button
              onClick={() => setSettingsPanelOpen(!settingsPanelOpen)}
              className="p-2 rounded-lg hover:bg-secondary-bg transition"
              title="Branch & Financial Year"
            >
              <Sliders size={18} className="text-secondary-dark" />
            </button>

            {settingsPanelOpen && (
              <div className="absolute top-full mt-2 left-0 bg-white rounded-xl shadow-xl border border-secondary-light z-50 p-4 w-56 space-y-3">
                {/* Branch selector */}
                {branches.length > 1 && (
                  <div>
                    <label className="text-xs font-medium text-secondary-dark mb-1 block">
                      Branch
                    </label>
                    <select
                      value={branch?.id || ""}
                      onChange={handleBranchChange}
                      className="w-full border border-secondary-light rounded p-1.5 text-sm focus:ring-1 focus:ring-primary"
                    >
                      {branches.map((b) => (
                        <option key={b.id} value={b.id}>
                          {b.branch_name}
                        </option>
                      ))}
                    </select>
                  </div>
                )}

                {/* Financial Year selector */}
                {financialYears.length > 0 && (
                  <div>
                    <label className="text-xs font-medium text-secondary-dark mb-1 block">
                      Financial Year
                    </label>
                    {selectedFinancialYear ? (
                      <select
                        value={selectedFinancialYear.id}
                        onChange={handleFinancialYearChange}
                        className="w-full border border-secondary-light rounded p-1.5 text-sm focus:ring-1 focus:ring-primary"
                      >
                        {financialYears.map((fy) => (
                          <option key={fy.id} value={fy.id}>
                            {fy.name}
                          </option>
                        ))}
                      </select>
                    ) : (
                      <select
                        onChange={(e) => {
                          const id = Number(e.target.value);
                          if (id) {
                            switchFinancialYear(id);
                            queryClient.invalidateQueries();
                          }
                        }}
                        className="w-full border border-secondary-light rounded p-1.5 text-sm focus:ring-1 focus:ring-primary"
                        defaultValue=""
                      >
                        <option value="" disabled>
                          Select FY
                        </option>
                        {financialYears.map((fy) => (
                          <option key={fy.id} value={fy.id}>
                            {fy.name}
                          </option>
                        ))}
                      </select>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>
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
            <Bell size={22} className="text-secondary-dark hover:text-primary transition" />
            {unreadCount > 0 && (
              <span className="absolute -top-1 -right-1 bg-accent text-white text-[10px] h-5 w-5 rounded-full flex items-center justify-center font-medium">
                {unreadCount > 9 ? "9+" : unreadCount}
              </span>
            )}
          </button>
          {dropdownOpen && (
            <div className="absolute right-0 mt-2 w-80 max-w-[calc(100vw-2rem)] bg-white rounded-xl shadow-xl border border-secondary-light z-50 overflow-hidden">
              <div className="flex items-center justify-between px-4 py-3 border-b border-secondary-light">
                <h4 className="font-semibold text-sm text-secondary-dark">Notifications</h4>
                <button
                  onClick={() => markAllReadMutation.mutate()}
                  className="text-xs text-primary hover:underline"
                >
                  Mark all read
                </button>
              </div>
              <div className="max-h-64 overflow-y-auto">
                {recentNotifications.length === 0 ? (
                  <p className="p-4 text-sm text-center text-secondary">No notifications</p>
                ) : (
                  recentNotifications.map((n) => (
                    <div
                      key={n.id}
                      className={`flex items-start gap-3 px-4 py-3 border-b border-secondary-light hover:bg-gray-50 ${
                        !n.is_read ? "bg-blue-50/50" : ""
                      }`}
                    >
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-secondary-dark">{n.title}</p>
                        <p className="text-xs text-secondary mt-1 truncate">{n.message}</p>
                        <span className="text-xs text-secondary-light mt-1 block">
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
              <div className="px-4 py-3 border-t border-secondary-light">
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
              className="w-10 h-10 rounded-full object-cover border border-secondary-light"
            />
          ) : (
            <UserCircle2 size={38} className="text-primary flex-shrink-0" />
          )}
          <div className="hidden sm:block">
            <h3 className="font-semibold text-secondary-dark font-montserrat text-sm lg:text-base">
              {profile?.full_name || "User"}
            </h3>
            <p className="text-xs text-secondary">{profile?.role || "Admin"}</p>
          </div>
        </div>

        {/* Install App button */}
        <button
          onClick={handleInstallClick}
          className="flex items-center gap-1 bg-primary hover:bg-primary-light text-white px-3 py-2 rounded-lg transition font-montserrat text-sm"
          title="Install App"
        >
          <Download size={16} />
          <span className="hidden sm:inline">Install</span>
        </button>

        {/* Logout button */}
        <button
          onClick={handleLogout}
          className="flex items-center gap-1 sm:gap-2 bg-accent hover:bg-accent-light text-white px-2 sm:px-4 py-2 rounded-lg transition font-montserrat text-sm"
          title="Logout"
        >
          <LogOut size={16} />
          <span className="hidden sm:inline">Logout</span>
        </button>
      </div>
    </header>
  );
}