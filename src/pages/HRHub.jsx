// src/pages/HRHub.jsx
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
  Settings,
  UserPlus,
  ChevronRight,
  Check,
  X,
  AlertCircle,
  TrendingUp,
  ListChecks, BarChart2,
} from "lucide-react";
import toast from "react-hot-toast";
import TeacherForm from "../components/TeacherForm";
import { getActiveTeachers, createTeacher } from "../services/teacherService";
import { getSalaryPayments } from "../services/salaryService";
import { getLeaves, updateLeaveStatus } from "../services/leaveService";
import { supabase } from "../api/supabase";
import { useOrg } from "../context/OrganizationContext";

export default function HRHub() {
  const queryClient = useQueryClient();
  const { branch, selectedFinancialYear } = useOrg();
  const branchId = branch?.id;
  const financialYearId = selectedFinancialYear?.id;
  const ctx = { branchId, financialYearId };

  const [showAddEmployee, setShowAddEmployee] = useState(false);

  // ─── 1. Active teachers ─────────────────────────────────
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
    },
    onError: (err) => toast.error(err.message || "Failed to create employee"),
  });

  // ─── Quick action cards ─────────────────────────────────
  const quickActions = [
    {
      title: "Employees",
      icon: Users,
      link: "/teachers",
      color: "bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-200",
    },
    {
      title: "Attendance",
      icon: Clock,
      link: "/teacher-attendance",
      color: "bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-200",
    },
    {
      title: "Attendance History",
      icon: ListChecks,
      link: "/teacher-daily-attendance-report",
      color: "bg-cyan-100 text-cyan-700 dark:bg-cyan-900 dark:text-cyan-200",
    },
    {
      title: "Leave Management",
      icon: Calendar,
      link: "/leave-management",
      color: "bg-purple-100 text-purple-700 dark:bg-purple-900 dark:text-purple-200",
    },
    {
      title: "Salary Setup",
      icon: Settings,
      link: "/salary-setup",
      color: "bg-orange-100 text-orange-700 dark:bg-orange-900 dark:text-orange-200",
    },
    {
      title: "Generate Salaries",
      icon: TrendingUp,
      link: "/generate-salaries",
      color: "bg-indigo-100 text-indigo-700 dark:bg-indigo-900 dark:text-indigo-200",
    },
    {
      title: "Salary Payments",
      icon: CreditCard,
      link: "/salary-payments",
      color: "bg-rose-100 text-rose-700 dark:bg-rose-900 dark:text-rose-200",
    },
    {
      title: "Salary Report",
      icon: BarChart2,
      link: "/salary-report",
      color: "bg-pink-100 text-pink-700 dark:bg-pink-900 dark:text-pink-200",
    },
  ];

  const handleTeacherSubmit = (payload, context) => {
    createTeacherMutation.mutate(payload);
  };

  const statCards = [
    { label: "Total Employees", value: teachersLoading ? "..." : teachers.length, icon: Users },
    { label: "Present Today", value: attendanceLoading ? "..." : presentToday, icon: UserCheck },
    { label: "On Leave Today", value: attendanceLoading ? "..." : onLeaveToday, icon: UserX },
    { label: "Pending Leaves", value: leavesLoading ? "..." : pendingLeaves.length, icon: AlertCircle },
  ];

  return (
    <div className="space-y-6 px-4 sm:px-6 lg:px-0">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1
            className="text-2xl sm:text-3xl font-bold"
            style={{ fontFamily: "var(--font-heading)", color: "var(--color-primary)" }}
          >
            HR Management
          </h1>
          <p
            className="text-sm text-gray-600 dark:text-gray-400 mt-1"
            style={{ fontFamily: "var(--font-body)" }}
          >
            Complete employee management dashboard
          </p>
        </div>
        <button
          onClick={() => setShowAddEmployee(true)}
          className="inline-flex items-center gap-2 px-4 py-2.5 bg-primary hover:bg-primary-light text-white rounded-lg transition-colors text-sm font-medium"
          style={{ fontFamily: "var(--font-body)" }}
        >
          <UserPlus size={18} /> Add Employee
        </button>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {statCards.map((card, idx) => (
          <div
            key={idx}
            className="bg-white dark:bg-gray-800 rounded-xl shadow-sm p-5 border border-gray-200 dark:border-gray-700"
          >
            <div className="flex items-center justify-between">
              <div>
                <p
                  className="text-xs text-gray-500 dark:text-gray-400"
                  style={{ fontFamily: "var(--font-body)" }}
                >
                  {card.label}
                </p>
                <p
                  className="text-2xl font-bold mt-1"
                  style={{ fontFamily: "var(--font-heading)", color: "var(--color-primary)" }}
                >
                  {card.value}
                </p>
              </div>
              <card.icon size={32} className="text-primary opacity-60" />
            </div>
          </div>
        ))}
      </div>

      {/* Quick Actions Grid */}
      <div>
        <h2
          className="text-lg font-semibold mb-3"
          style={{ fontFamily: "var(--font-heading)", color: "var(--color-primary)" }}
        >
          Quick Actions
        </h2>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6 gap-3">
          {quickActions.map((action) => (
            <Link
              key={action.title}
              to={action.link}
              className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 p-4 hover:shadow-md transition-all hover:border-primary dark:hover:border-primary group"
            >
              <div className="flex flex-col items-center text-center">
                <div
                  className={`p-3 rounded-full ${action.color} mb-2 group-hover:scale-105 transition-transform`}
                >
                  <action.icon size={20} />
                </div>
                <span
                  className="text-sm font-medium text-gray-700 dark:text-gray-300"
                  style={{ fontFamily: "var(--font-body)" }}
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
        <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 overflow-hidden">
          <div className="px-5 py-3 border-b border-gray-200 dark:border-gray-700 flex items-center justify-between">
            <h3
              className="font-semibold"
              style={{ fontFamily: "var(--font-heading)", color: "var(--color-primary)" }}
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
              <div className="text-center py-4 text-gray-500 dark:text-gray-400">
                Loading...
              </div>
            ) : pendingLeaves.length === 0 ? (
              <div className="text-center py-4 text-gray-500 dark:text-gray-400">
                No pending requests.
              </div>
            ) : (
              <div className="space-y-3">
                {pendingLeaves.slice(0, 5).map((leave) => (
                  <div
                    key={leave.id}
                    className="flex items-center justify-between p-2 bg-gray-50 dark:bg-gray-700 rounded-lg"
                  >
                    <div className="flex-1">
                      <p className="text-sm font-medium text-gray-800 dark:text-gray-100">
                        {leave.teachers?.first_name} {leave.teachers?.last_name}
                      </p>
                      <p className="text-xs text-gray-500 dark:text-gray-400">
                        {leave.start_date} → {leave.end_date}
                      </p>
                      <p className="text-xs text-gray-500 dark:text-gray-400 truncate max-w-[150px]">
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
                        className="p-1.5 bg-green-100 dark:bg-green-900 text-green-700 dark:text-green-200 rounded hover:bg-green-200 dark:hover:bg-green-800 transition"
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
                        className="p-1.5 bg-red-100 dark:bg-red-900 text-red-700 dark:text-red-200 rounded hover:bg-red-200 dark:hover:bg-red-800 transition"
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
        <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 overflow-hidden">
          <div className="px-5 py-3 border-b border-gray-200 dark:border-gray-700 flex items-center justify-between">
            <h3
              className="font-semibold"
              style={{ fontFamily: "var(--font-heading)", color: "var(--color-primary)" }}
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
              <div className="text-center py-4 text-gray-500 dark:text-gray-400">
                Loading...
              </div>
            ) : recentPayments.length === 0 ? (
              <div className="text-center py-4 text-gray-500 dark:text-gray-400">
                No payments yet.
              </div>
            ) : (
              <div className="space-y-3">
                {recentPayments.map((payment) => (
                  <div
                    key={payment.id}
                    className="flex items-center justify-between p-2 bg-gray-50 dark:bg-gray-700 rounded-lg"
                  >
                    <div className="flex-1">
                      <p className="text-sm font-medium text-gray-800 dark:text-gray-100">
                        {payment.teachers?.first_name} {payment.teachers?.last_name}
                      </p>
                      <p className="text-xs text-gray-500 dark:text-gray-400">
                        {payment.payment_date}
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="text-sm font-semibold text-green-700 dark:text-green-400">
                        ₹ {Number(payment.net_amount).toLocaleString("en-IN")}
                      </p>
                      <p className="text-xs text-gray-500 dark:text-gray-400">
                        Gross: ₹ {Number(payment.amount).toLocaleString("en-IN")}
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
            if (!createTeacherMutation.isPending) setShowAddEmployee(false);
          }}
        />
      )}
    </div>
  );
}