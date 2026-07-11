// src/components/Sidebar.jsx
import {
  LayoutDashboard, Users, GraduationCap, IndianRupee, Settings,
  ChevronDown, Bell, X, Wallet, Building, Video, FileText,
  PanelLeftOpen, PanelLeftClose, BarChart3, Shield, Layers,
  Calendar, CalendarCheck, BookOpen, Award, ClipboardCheck,
  MessageSquare, Palette,Activity,
} from "lucide-react";
import { NavLink } from "react-router-dom";
import { useState, useEffect } from "react";
import { useAuth } from "../context/AuthContext";
import { useOrg } from "../context/OrganizationContext";
import { supabase } from "../api/supabase";

function normaliseRole(rawRole) {
  return (rawRole || "").toLowerCase().replace(/\s+/g, "_");
}

function SectionLabel({ children }) {
  return (
    <p className="px-4 pt-4 pb-1 text-[10px] font-montserrat font-semibold uppercase tracking-wider text-secondary-light">
      {children}
    </p>
  );
}

function SidebarLink({ to, icon: Icon, children, end }) {
  return (
    <NavLink
      to={to}
      end={end}
      title={children}
      className={({ isActive }) =>
        `flex items-center gap-3 px-4 py-2.5 rounded-lg transition-colors ${
          isActive
            ? "bg-primary-light text-white"
            : "hover:bg-primary-light/50 text-secondary-light hover:text-white"
        }`
      }
    >
      <Icon size={18} className="flex-shrink-0" />
      <span className="truncate">{children}</span>
    </NavLink>
  );
}

function AccordionSection({ icon: Icon, label, open, onClick, collapsed, children }) {
  return (
    <>
      <button
        onClick={onClick}
        title={collapsed ? label : undefined}
        className="w-full flex items-center justify-between gap-3 px-4 py-2.5 rounded-lg hover:bg-primary-light/50 transition-colors text-secondary-light hover:text-white"
      >
        <span className="flex items-center gap-3 truncate">
          <Icon size={18} className="flex-shrink-0" />
          {!collapsed && <span>{label}</span>}
        </span>
        {!collapsed && (
          <ChevronDown size={16} className={`transition-transform ${open ? "rotate-180" : ""}`} />
        )}
      </button>
      {open && !collapsed && <div className="ml-6 space-y-1">{children}</div>}
    </>
  );
}

export default function Sidebar({ onClose, collapsed, onToggleCollapse }) {
  const { profile } = useAuth();
  const orgContext = useOrg();
  const [org, setOrg] = useState(orgContext?.org || null);

  // Financial year from context
  const {
    financialYears,
    selectedFinancialYear,
    switchFinancialYear,
  } = orgContext || {};

  const [academicOpen, setAcademicOpen] = useState(false);

  // Fallback org loading (if context not available)
  useEffect(() => {
    if (!org && profile?.id) {
      const loadOrg = async () => {
        const { data: profileData } = await supabase
          .from("profiles")
          .select("organization_id")
          .eq("id", profile.id)
          .single();
        if (profileData?.organization_id) {
          const { data: orgData } = await supabase
            .from("organization")
            .select("*")
            .eq("id", profileData.organization_id)
            .single();
          if (orgData) setOrg(orgData);
        }
      };
      loadOrg();
    }
  }, [org, profile?.id]);

  useEffect(() => {
    if (orgContext?.org) setOrg(orgContext.org);
  }, [orgContext?.org]);

  if (!profile) {
    return (
      <aside
        className="bg-primary text-white h-screen border-r border-primary-dark flex flex-col transition-all duration-300"
        style={{ width: collapsed ? 64 : 288 }}
      >
        <div className="flex items-center justify-center h-full">
          <p className="text-sm text-secondary-light">Loading…</p>
        </div>
      </aside>
    );
  }

  const role = normaliseRole(profile.role);

  // ── Student ──
  const studentLinks = (
    <>
      <SidebarLink to="/student" end icon={LayoutDashboard}>Dashboard</SidebarLink>
      {!collapsed && <SectionLabel>My Space</SectionLabel>}
      <SidebarLink to="/student/profile" icon={BookOpen}>My Profile</SidebarLink>
      <SidebarLink to="/student/batch" icon={Layers}>Batch & Course</SidebarLink>
      <SidebarLink to="/student/attendance" icon={CalendarCheck}>Attendance</SidebarLink>
      <SidebarLink to="/student/fees" icon={IndianRupee}>Fees</SidebarLink>
      <SidebarLink to="/student/homework" icon={FileText}>Homework</SidebarLink>
      <SidebarLink to="/student/exams" icon={ClipboardCheck}>Exams</SidebarLink>
      <SidebarLink to="/student/results" icon={BarChart3}>Results</SidebarLink>
      <SidebarLink to="/student/certificates" icon={Award}>Certificates</SidebarLink>
      <SidebarLink to="/student/timetable" icon={Calendar}>Timetable</SidebarLink>
      <SidebarLink to="/student/resources" icon={BookOpen}>Learning Resources</SidebarLink>
      <SidebarLink to="/online-classes" icon={Video}>Online Classes</SidebarLink>
      <div className="border-t border-primary-dark my-2" />
      <SidebarLink to="/student/notifications" icon={Bell}>Notifications</SidebarLink>
      <SidebarLink to="/settings" icon={Settings}>Settings</SidebarLink>
    </>
  );

  // ── Teacher ──
  const teacherLinks = (
    <>
      <SidebarLink to="/teacher" end icon={LayoutDashboard}>Dashboard</SidebarLink>
      <AccordionSection
        icon={GraduationCap} label="Academics"
        open={academicOpen} onClick={() => setAcademicOpen(!academicOpen)}
        collapsed={collapsed}
      >
        <SidebarLink to="/attendance" icon={CalendarCheck}>Attendance</SidebarLink>
        <SidebarLink to="/homework" icon={FileText}>Homework</SidebarLink>
        <SidebarLink to="/exams" icon={ClipboardCheck}>Exams</SidebarLink>
        <SidebarLink to="/results" icon={BarChart3}>Results</SidebarLink>
        <SidebarLink to="/teacher/resources" icon={BookOpen}>Learning Resources</SidebarLink>
        <SidebarLink to="/online-classes" icon={Video}>Online Classes</SidebarLink>
        <SidebarLink to="/teacher-attendance" icon={CalendarCheck}>My Attendance</SidebarLink>
        <SidebarLink to="/teacher-lecture-report" icon={Calendar}>My Lectures</SidebarLink>
        <SidebarLink to="/teacher-lecture-count" icon={Calendar}>My Lecture Count</SidebarLink>
      </AccordionSection>
      <SidebarLink to="/teacher/salary" icon={Wallet}>My Salary</SidebarLink>
      <SidebarLink to="/teacher/leaves" icon={Calendar}>My Leaves</SidebarLink>
      <SidebarLink to="/teacher/profile" icon={BookOpen}>My Profile</SidebarLink>
      <SidebarLink to="/teacher/timetable" icon={Calendar}>My Timetable</SidebarLink>
      <SidebarLink to="/teacher-daily-attendance-report" icon={Calendar}>My Attendance Log</SidebarLink>
      <div className="border-t border-primary-dark my-2" />
      <SidebarLink to="/notifications" icon={Bell}>Notifications</SidebarLink>
      <SidebarLink to="/settings" icon={Settings}>Settings</SidebarLink>
    </>
  );

  // ── Admin / Super Admin / Organization Admin ──
  const adminLinks = (
    <>
      <SidebarLink to="/" end icon={LayoutDashboard}>Dashboard</SidebarLink>

      {!collapsed && <SectionLabel>Modules</SectionLabel>}
      <SidebarLink to="/admissions-hub" icon={Users}>Admissions</SidebarLink>
      <SidebarLink to="/academics-hub" icon={GraduationCap}>Academics</SidebarLink>
      <SidebarLink to="/accounting" icon={IndianRupee}>Finance & Accounting</SidebarLink>
      <SidebarLink to="/hr-hub" icon={Shield}>HR & Staff</SidebarLink>
      <SidebarLink to="/communication-hub" icon={MessageSquare}>Communication</SidebarLink>

      {!collapsed && <SectionLabel>Quick Access</SectionLabel>}
      <SidebarLink to="/students" icon={Users}>Students</SidebarLink>
      <SidebarLink to="/fees" icon={IndianRupee}>Student Fees</SidebarLink>
      <SidebarLink to="/attendance" icon={CalendarCheck}>Attendance</SidebarLink>
      <SidebarLink to="/invoices" icon={FileText}>Invoices</SidebarLink>
      <SidebarLink to="/reports" icon={BarChart3}>Reports</SidebarLink>
      <SidebarLink to="/certificates" icon={Award}>Certificates</SidebarLink>
      <SidebarLink to="/teacher-attendance-report" icon={FileText}>Teacher Attendance Report</SidebarLink>
      <SidebarLink to="/teacher-daily-attendance-report" icon={Calendar}>Daily Teacher Attendance</SidebarLink>
      <SidebarLink to="/teacher-lecture-report" icon={Calendar}>Teacher Lecture Report</SidebarLink>
      <SidebarLink to="/teacher-lecture-count" icon={Calendar}>Teacher Lecture Count</SidebarLink>

      {!collapsed && <SectionLabel>System</SectionLabel>}
      <SidebarLink to="/branches" icon={Building}>Branches</SidebarLink>
      <SidebarLink to="/settings-hub" icon={Settings}>Settings</SidebarLink>
      <SidebarLink to="/activity-logs" icon={Activity}>Activity Logs</SidebarLink>
      
    </>
  );

  // ── Financial Year selector (bottom) ──
  const isAdminOrStaff = ["admin", "super_admin", "organization_admin", "branch_admin", "teacher"].includes(role);
  const showFYSelector = isAdminOrStaff && financialYears && financialYears.length > 0;

  return (
    <aside
      className="bg-primary text-white h-screen border-r border-primary-dark flex flex-col overflow-y-auto sidebar-scroll transition-all duration-300"
      style={{ width: collapsed ? 64 : 288 }}
    >
      {/* Top bar */}
      <div className="flex items-center justify-between p-2">
        <button
          onClick={onToggleCollapse}
          className="hidden lg:block text-white/80 hover:text-white p-1 rounded hover:bg-primary-light"
          title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
        >
          {collapsed ? <PanelLeftOpen size={20} /> : <PanelLeftClose size={20} />}
        </button>
        <button onClick={onClose} className="lg:hidden text-white/80 hover:text-white p-1 ml-auto">
          <X size={24} />
        </button>
      </div>

      {/* Logo */}
      <div className="flex justify-center border-b border-primary-dark py-4">
        <img
          src={org?.logo_light_url || "/ShreeVidhyalight.png"}
          alt={org?.company_name || "Academy"}
          style={{ height: collapsed ? 32 : 64, width: "auto", transition: "height 0.3s" }}
        />
      </div>

      {/* Navigation */}
      <nav className="flex-1 px-2 py-4 space-y-1 overflow-y-auto">
        {role === "student" && studentLinks}
        {role === "teacher" && teacherLinks}
        {(role === "admin" || role === "super_admin" || role === "organization_admin") && adminLinks}
      </nav>

      {/* Financial Year Selector */}
      {showFYSelector && (
        <div className="px-3 py-3 border-t border-primary-dark">
          {collapsed ? (
            <div className="flex justify-center" title={selectedFinancialYear?.name || "Select FY"}>
              <Calendar size={20} className="text-white/70" />
            </div>
          ) : (
            <div className="flex items-center gap-2 text-sm">
              <Calendar size={16} className="text-white/60" />
              <select
                value={selectedFinancialYear?.id || ""}
                onChange={(e) => {
                  const id = Number(e.target.value);
                  if (id && switchFinancialYear) switchFinancialYear(id);
                }}
                className="bg-primary-light text-white border border-primary-dark rounded px-2 py-1 text-xs w-full focus:outline-none"
              >
                {!selectedFinancialYear && (
                  <option value="" disabled>Select FY</option>
                )}
                {financialYears.map((fy) => (
                  <option key={fy.id} value={fy.id}>
                    {fy.name}
                  </option>
                ))}
              </select>
            </div>
          )}
        </div>
      )}
    </aside>
  );
}