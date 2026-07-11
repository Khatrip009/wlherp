import AdminLayout from "../layouts/AdminLayout";
import HubCard from "../components/HubCard";
import {
  Users, CalendarClock, Wallet, Settings, TrendingUp,
  CalendarCheck, FileText, UserCog, BarChart3,
} from "lucide-react";

const groups = [
  {
    label: "Staff Management",
    items: [
      { to: "/teachers", icon: Users, label: "Teachers", desc: "Manage teacher profiles and assignments" },
      { to: "/user-management", icon: UserCog, label: "User Management", desc: "Manage system login accounts" },
      { to: "/teacher-attendance", icon: CalendarCheck, label: "Teacher Attendance", desc: "Mark and track teacher attendance" },
      { to: "/leave-management", icon: CalendarClock, label: "Leave Management", desc: "Approve or decline leave requests" },
    ],
  },
  {
    label: "Salary & Payroll",
    items: [
      { to: "/salary-setup", icon: Settings, label: "Salary Setup", desc: "Configure salary types, rates and TDS" },
      { to: "/generate-salaries", icon: TrendingUp, label: "Generate Salaries", desc: "Bulk generate salary for a month" },
      { to: "/salary-payments", icon: Wallet, label: "Salary Payments", desc: "Process and record salary payments" },
    ],
  },
  {
    label: "Reports",
    items: [
      { to: "/reports/teacher_salary", icon: BarChart3, label: "Salary Report", desc: "Monthly salary summary per teacher" },
      { to: "/reports/teacher_workload", icon: BarChart3, label: "Teacher Workload", desc: "Batches, courses and subjects per teacher" },
      { to: "/reports/teacher_leave_summary", icon: FileText, label: "Leave Summary", desc: "Leave requests with status and days" },
    ],
  },
];

export default function HRHub() {
  return (
    <AdminLayout>
      <div className="mb-6">
        <h1 className="text-3xl font-righteous text-primary-dark">HR & Staff Hub</h1>
        <p className="text-sm text-secondary-dark mt-1">Teachers, attendance, leaves, salary and payroll</p>
      </div>
      <div className="space-y-8">
        {groups.map((g) => (
          <div key={g.label}>
            <h2 className="text-sm font-semibold uppercase tracking-wider text-secondary-light border-b pb-2 mb-4">{g.label}</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
              {g.items.map((m) => <HubCard key={m.to} {...m} />)}
            </div>
          </div>
        ))}
      </div>
    </AdminLayout>
  );
}
