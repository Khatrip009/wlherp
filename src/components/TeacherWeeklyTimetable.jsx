import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import {
  Users,
  UserCheck,
  UserX,
  Clock,
  Calendar,
  CreditCard,
  FileText,
  BarChart2,
  Settings,
  UserPlus,
  ChevronRight,
  Check,
  X,
  AlertCircle,
} from "lucide-react";
import toast from "react-hot-toast";
import AdminLayout from "../layouts/AdminLayout";
import TeacherForm from "../components/TeacherForm";
import { getActiveTeachers, createTeacher } from "../services/teacherService";
import { getSalaryPayments } from "../services/salaryService";
import { getLeaves, updateLeaveStatus } from "../services/leaveService";
import { supabase } from "../api/supabase";
import { useOrg } from "../context/OrganizationContext";
import { useTheme } from "../context/ThemeContext";               // ✅ dynamic theme

export default function HRHub() {
  const queryClient = useQueryClient();
  const { branch, selectedFinancialYear } = useOrg();
  const theme = useTheme();
  const branchId = branch?.id;
  const financialYearId = selectedFinancialYear?.id;
  const ctx = { branchId, financialYearId };

  const headingFont = theme?.font_heading || "Righteous";
  const bodyFont = theme?.font_body || "Montserrat";

  const [showAddEmployee, setShowAddEmployee] = useState(false);
  const [isCreating, setIsCreating] = useState(false);

  // ─── 1. Active teachers (total count) ───────────────────
  const { data: teachers = [], isLoading: teachersLoading } = useQuery({
    queryKey: ["active-teachers-count", branchId, financialYearId],
    queryFn: () => getActiveTeachers(branchId, financialYearId),
    enabled: !!branchId && !!financialYearId,
    staleTime: 5 * 60 * 1000,
  });

  // ─── 2. Today's attendance ──────────────────────────────
  const today = new Date().toISOString().split("T")[0];
  const { data: attendanceToday = [], isLoading: attendanceLoading } = useQuery({
    queryKey: ["teacher-attendance-today", today, branchId, financialYearId],
    queryFn: async () => {
      if (!branchId || !financialYearId) return [];
      let query = supabase
        .from("teacher_attendance")
        .select("status")
        .eq("attendance_date", today);
      if (branchId) query = query.eq("branch_id", branchId);
      if (financialYearId) query = query.eq("financial_year_id", financialYearId);
      const { data } = await query;
      return data || [];
    },
    enabled: !!branchId && !!financialYearId,
    staleTime: 2 * 60 * 1000,
  });

  const presentToday = attendanceToday.filter((a) => a.status === "present").length;
  const onLeaveToday = attendanceToday.filter((a) => a.status === "leave").length;
  const absentToday = attendanceToday.filter((a) => a.status === "absent").length;
  const halfDayToday = attendanceToday.filter((a) => a.status === "half_day").length;

  // ─── 3. Pending leave requests ──────────────────────────
  const { data: pendingLeaves = [], isLoading: leavesLoading } = useQuery({
    queryKey: ["pending-leaves", branchId, financialYearId],
    queryFn: () =>
      getLeaves({
        pageParam: 0,
        filters: { status: "Pending" },
        branchId,
        financialYearId,
      }).then((res) => res.data || []),
    enabled: !!branchId && !!financialYearId,
    staleTime: 2 * 60 * 1000,
  });

  // ─── 4. Recent salary payments ──────────────────────────
  const { data: recentPayments = [], isLoading: paymentsLoading } = useQuery({
    queryKey: ["recent-salary-payments", branchId, financialYearId],
    queryFn: () =>
      getSalaryPayments({}, branchId, financialYearId).then((data) =>
        data.slice(0, 5)
      ),
    enabled: !!branchId && !!financialYearId,
    staleTime: 5 * 60 * 1000,
  });

  // ─── 5. Update leave status mutation ────────────────────
  const updateLeaveMutation = useMutation({
    mutationFn: ({ id, status, adminRemarks }) =>
      updateLeaveStatus(id, status, adminRemarks, ctx),
    onSuccess: () => {
      toast.success("Leave updated");
      queryClient.invalidateQueries({ queryKey: ["pending-leaves"] });
      queryClient.invalidateQueries({ queryKey: ["leaves"] });
    },
    onError: (err) => toast.error(err.message || "Update failed"),
  });

  // ─── 6. Create teacher mutation ──────────────────────────
  const createTeacherMutation = useMutation({
    mutationFn: (payload) => createTeacher(payload, ctx),
    onSuccess: () => {
      toast.success("Employee created successfully");
      queryClient.invalidateQueries({ queryKey: ["active-teachers-count"] });
      queryClient.invalidateQueries({ queryKey: ["employees"] });
      setShowAddEmployee(false);
      setIsCreating(false);
    },
    onError: (err) => toast.error(err.message || "Failed to create employee"),
  });

  // ─── Quick action cards (colours replaced with theme classes) ──
  const quickActions = [
    {
      title: "Employees",
      icon: Users,
      link: "/employees",
    },
    {
      title: "Attendance",
      icon: Clock,
      link: "/teacher-attendance",
    },
    {
      title: "Leave Management",
      icon: Calendar,
      link: "/leave-management",
    },
    {
      title: "Salary Setup",
      icon: Settings,
      link: "/salary-setup",
    },
    {
      title: "Salary Payments",
      icon: CreditCard,
      link: "/salary-payments",
    },
    {
      title: "Salary Report",
      icon: BarChart2,
      link: "/salary-report",
    },
  ];

  // ─── Helper: format currency ─────────────────────────────
  const formatCurrency = (amount) =>
    `₹ ${Number(amount).toLocaleString("en-IN")}`;

  // ─── Handler for TeacherForm submission ──────────────────
  const handleTeacherSubmit = (payload, context) => {
    setIsCreating(true);
    createTeacherMutation.mutate(payload);
  };

  return (
    <AdminLayout>
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between mb-6">
        <div>
          <h1
            className="text-3xl text-primary"
            style={{ fontFamily: headingFont }}
          >
            HR Management
          </h1>
          <p
            className="text-sm text-primary-dark mt-1"
            style={{ fontFamily: bodyFont }}
          >
            Dashboard for all HR activities
          </p>
        </div>
        <div className="flex gap-2 mt-2 sm:mt-0">
          <button
            onClick={() => setShowAddEmployee(true)}
            className="bg-primary hover:bg-primary-light text-white px-5 py-2.5 rounded-lg transition flex items-center gap-2 text-sm"
            style={{ fontFamily: bodyFont }}
          >
            <UserPlus size={18} /> Add Employee
          </button>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <div className="bg-white rounded-xl shadow-sm p-5 border border-primary-bg">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs text-primary-dark" style={{ fontFamily: bodyFont }}>
                Total Employees
              </p>
              <p className="text-2xl font-bold mt-1 text-primary" style={{ fontFamily: headingFont }}>
                {teachersLoading ? "..." : teachers.length}
              </p>
            </div>
            <Users size={32} className="text-primary/60" />
          </div>
        </div>
        <div className="bg-white rounded-xl shadow-sm p-5 border border-primary-bg">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs text-primary-dark" style={{ fontFamily: bodyFont }}>
                Present Today
              </p>
              <p className="text-2xl font-bold mt-1 text-primary">
                {attendanceLoading ? "..." : presentToday}
              </p>
            </div>
            <UserCheck size={32} className="text-primary/60" />
          </div>
        </div>
        <div className="bg-white rounded-xl shadow-sm p-5 border border-primary-bg">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs text-primary-dark" style={{ fontFamily: bodyFont }}>
                On Leave Today
              </p>
              <p className="text-2xl font-bold mt-1 text-accent">
                {attendanceLoading ? "..." : onLeaveToday}
              </p>
            </div>
            <UserX size={32} className="text-accent/60" />
          </div>
        </div>
        <div className="bg-white rounded-xl shadow-sm p-5 border border-primary-bg">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs text-primary-dark" style={{ fontFamily: bodyFont }}>
                Pending Leaves
              </p>
              <p className="text-2xl font-bold mt-1 text-accent-dark">
                {leavesLoading ? "..." : pendingLeaves.length}
              </p>
            </div>
            <AlertCircle size={32} className="text-accent-dark/60" />
          </div>
        </div>
      </div>

      {/* Quick Actions Grid */}
      <div className="mb-6">
        <h2
          className="text-lg font-semibold mb-3 text-primary"
          style={{ fontFamily: headingFont }}
        >
          Quick Actions
        </h2>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
          {quickActions.map((action) => (
            <Link
              key={action.title}
              to={action.link}
              className="bg-white rounded-xl shadow-sm border border-primary-bg p-4 hover:shadow-md transition hover:border-primary group"
            >
              <div className="flex flex-col items-center text-center">
                <div className="p-3 rounded-full bg-primary-bg text-primary mb-2 group-hover:scale-105 transition">
                  <action.icon size={20} />
                </div>
                <span
                  className="text-sm font-medium text-primary-dark"
                  style={{ fontFamily: bodyFont }}
                >
                  {action.title}
                </span>
              </div>
            </Link>
          ))}
        </div>
      </div>

      {/* Two-column: Recent Leaves + Recent Payments */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Recent Leave Requests */}
        <div className="bg-white rounded-xl shadow-sm border border-primary-bg overflow-hidden">
          <div className="px-5 py-3 border-b border-primary-bg flex items-center justify-between">
            <h3
              className="font-semibold text-primary"
              style={{ fontFamily: headingFont }}
            >
              Recent Leave Requests
            </h3>
            <Link
              to="/leave-management"
              className="text-sm text-primary hover:underline flex items-center gap-1"
            >
              View All <ChevronRight size={16} />
            </Link>
          </div>
          <div className="p-3 max-h-72 overflow-y-auto">
            {leavesLoading ? (
              <div className="text-center py-4 text-primary-dark/60" style={{ fontFamily: bodyFont }}>Loading...</div>
            ) : pendingLeaves.length === 0 ? (
              <div className="text-center py-4 text-primary-dark/60" style={{ fontFamily: bodyFont }}>No pending requests.</div>
            ) : (
              <div className="space-y-3">
                {pendingLeaves.slice(0, 5).map((leave) => (
                  <div
                    key={leave.id}
                    className="flex items-center justify-between p-2 bg-primary-bg rounded-lg"
                  >
                    <div className="flex-1">
                      <p className="text-sm font-medium text-primary-dark" style={{ fontFamily: bodyFont }}>
                        {leave.teachers?.first_name} {leave.teachers?.last_name}
                      </p>
                      <p className="text-xs text-primary-dark/60" style={{ fontFamily: bodyFont }}>
                        {leave.start_date} → {leave.end_date}
                      </p>
                      <p className="text-xs text-primary-dark/60 truncate max-w-[150px]" style={{ fontFamily: bodyFont }}>
                        {leave.reason || "No reason"}
                      </p>
                    </div>
                    <div className="flex gap-1">
                      <button
                        onClick={() =>
                          updateLeaveMutation.mutate({
                            id: leave.id,
                            status: "Approved",
                          })
                        }
                        className="p-1.5 bg-primary-bg text-primary-dark rounded hover:bg-primary/10 transition"
                        title="Approve"
                      >
                        <Check size={16} />
                      </button>
                      <button
                        onClick={() => {
                          const remark = prompt("Rejection reason (optional):");
                          updateLeaveMutation.mutate({
                            id: leave.id,
                            status: "Rejected",
                            adminRemarks: remark || "",
                          });
                        }}
                        className="p-1.5 bg-accent-bg text-accent-dark rounded hover:bg-accent/10 transition"
                        title="Reject"
                      >
                        <X size={16} />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Recent Salary Payments */}
        <div className="bg-white rounded-xl shadow-sm border border-primary-bg overflow-hidden">
          <div className="px-5 py-3 border-b border-primary-bg flex items-center justify-between">
            <h3
              className="font-semibold text-primary"
              style={{ fontFamily: headingFont }}
            >
              Recent Salary Payments
            </h3>
            <Link
              to="/salary-payments"
              className="text-sm text-primary hover:underline flex items-center gap-1"
            >
              View All <ChevronRight size={16} />
            </Link>
          </div>
          <div className="p-3 max-h-72 overflow-y-auto">
            {paymentsLoading ? (
              <div className="text-center py-4 text-primary-dark/60" style={{ fontFamily: bodyFont }}>Loading...</div>
            ) : recentPayments.length === 0 ? (
              <div className="text-center py-4 text-primary-dark/60" style={{ fontFamily: bodyFont }}>No payments yet.</div>
            ) : (
              <div className="space-y-3">
                {recentPayments.map((payment) => (
                  <div
                    key={payment.id}
                    className="flex items-center justify-between p-2 bg-primary-bg rounded-lg"
                  >
                    <div className="flex-1">
                      <p className="text-sm font-medium text-primary-dark" style={{ fontFamily: bodyFont }}>
                        {payment.teachers?.first_name} {payment.teachers?.last_name}
                      </p>
                      <p className="text-xs text-primary-dark/60" style={{ fontFamily: bodyFont }}>
                        {payment.payment_date}
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="text-sm font-semibold text-primary">
                        {formatCurrency(payment.net_amount)}
                      </p>
                      <p className="text-xs text-primary-dark/60" style={{ fontFamily: bodyFont }}>
                        Gross: {formatCurrency(payment.amount)}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Add Employee Modal */}
      {showAddEmployee && (
        <TeacherForm
          onSubmit={handleTeacherSubmit}
          onClose={() => {
            if (!isCreating) setShowAddEmployee(false);
          }}
        />
      )}
    </AdminLayout>
  );
}