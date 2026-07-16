// src/pages/Dashboard.jsx
import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  Users,
  BookOpen,
  GraduationCap,
  CalendarCheck,
  IndianRupee,
  Clock,
  TrendingUp,
  AlertCircle,
  UserPlus,
  PhoneCall,
  PlusCircle,
  Receipt,
  FileText,
  Package,
  AlertTriangle,
  CheckCircle,
} from "lucide-react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  LineChart,
  Line,
  Legend,
} from "recharts";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { useTheme } from "../context/ThemeContext";
import { supabase } from "../api/supabase";

// ─── Reusable Stat Card ─────────────────────────────────────────────
const StatCard = ({ icon: Icon, title, value, subtext, color, linkTo, onClick }) => {
  const content = (
    <div className="bg-white dark:bg-gray-800 rounded-xl p-5 shadow-sm border border-gray-200 dark:border-gray-700 hover:border-primary dark:hover:border-primary transition-all cursor-pointer">
      <div className="flex items-start justify-between">
        <div>
          <p className="text-sm font-medium text-gray-600 dark:text-gray-400" style={{ fontFamily: "var(--font-body)" }}>
            {title}
          </p>
          <h3 className="text-2xl font-bold mt-1" style={{ fontFamily: "var(--font-heading)", color: "var(--color-primary)" }}>
            {value}
          </h3>
          {subtext && <p className="text-xs text-gray-500 dark:text-gray-400 mt-1" style={{ fontFamily: "var(--font-body)" }}>{subtext}</p>}
        </div>
        <div className={`p-3 rounded-xl ${color}`}>
          <Icon size={22} className="text-white" />
        </div>
      </div>
    </div>
  );
  if (linkTo) return <Link to={linkTo}>{content}</Link>;
  return <div onClick={onClick}>{content}</div>;
};

// ─── Quick Action Button ────────────────────────────────────────────
const QuickAction = ({ icon: Icon, label, onClick }) => (
  <button
    onClick={onClick}
    className="flex flex-col items-center justify-center gap-2 p-4 bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 hover:border-primary dark:hover:border-primary hover:shadow-md transition-all w-full"
  >
    <div className="p-3 rounded-full" style={{ backgroundColor: "var(--color-primary-light)" }}>
      <Icon size={20} style={{ color: "var(--color-primary)" }} />
    </div>
    <span className="text-xs font-medium text-gray-700 dark:text-gray-300" style={{ fontFamily: "var(--font-body)" }}>
      {label}
    </span>
  </button>
);

// ─── Reusable Table ─────────────────────────────────────────────────
const RecentTable = ({ title, columns, data, emptyMessage }) => (
  <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 overflow-hidden">
    <h3 className="text-lg font-semibold p-4 border-b border-gray-200 dark:border-gray-700" style={{ fontFamily: "var(--font-heading)", color: "var(--color-primary)" }}>
      {title}
    </h3>
    {data.length === 0 ? (
      <p className="p-4 text-sm text-gray-500 dark:text-gray-400" style={{ fontFamily: "var(--font-body)" }}>{emptyMessage}</p>
    ) : (
      <div className="overflow-x-auto">
        <table className="w-full min-w-[400px]">
          <thead className="bg-gray-50 dark:bg-gray-700">
            <tr>
              {columns.map((col) => (
                <th key={col} className="text-left p-3 text-sm font-medium text-gray-500 dark:text-gray-400 uppercase" style={{ fontFamily: "var(--font-body)" }}>
                  {col}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
            {data.map((row, idx) => (
              <tr key={idx} className="hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors">
                {row.map((cell, i) => (
                  <td key={i} className="p-3 text-sm text-gray-700 dark:text-gray-300" style={{ fontFamily: "var(--font-body)" }}>
                    {cell}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    )}
  </div>
);

// ─── Colors ─────────────────────────────────────────────────────────
const COLORS = ["#0D47A1", "#FF1070", "#00C49F", "#FFBB28", "#0088FE", "#FF8042", "#AF19FF"];

// ─── Dashboard Component ────────────────────────────────────────────
export default function Dashboard() {
  const { profile } = useAuth();
  const navigate = useNavigate();
  const { theme } = useTheme();

  // Theme colors (for charts, dynamic)
  const primaryColor = theme?.primary_color || "#0D47A1";
  const accentColor = theme?.accent_color || "#FF1070";

  const { data: rawStats, isLoading, isError } = useQuery({
    queryKey: ["dashboardStats"],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("get_dashboard_stats");
      if (error) throw error;
      return data;
    },
    staleTime: 60 * 1000,
    refetchOnWindowFocus: false,
  });

  const s = rawStats || {};
  const safeFeeStatus = Array.isArray(s.feeStatusData)
    ? { paid: 0, pending: 0 }
    : s.feeStatusData || { paid: 0, pending: 0 };

  const stats = {
    totalStudents: s.totalStudents ?? 0,
    activeBatches: s.activeBatches ?? 0,
    todayAttendance: s.todayAttendance ?? { present: 0, total: 0 },
    monthlyFeeCollection: s.monthlyFeeCollection ?? 0,
    pendingFees: s.pendingFees ?? 0,
    totalTeachers: s.totalTeachers ?? 0,
    activeCourses: s.activeCourses ?? 0,
    totalParents: s.totalParents ?? 0,
    newInquiriesThisMonth: s.newInquiriesThisMonth ?? 0,
    recentInquiries: s.recentInquiries || [],
    recentPayments: s.recentPayments || [],
    upcomingExams: s.upcomingExams || [],
    monthlyFeeData: s.monthlyFeeData || [],
    batchStudentData: s.batchStudentData || [],
    inquiryTrendData: s.inquiryTrendData || [],
    feeStatusData: safeFeeStatus,
    attendanceTrend: s.attendanceTrend || [],
    courseWiseStudents: s.courseWiseStudents || [],
    lowStockItems: s.lowStockItems || [],
    pendingInvoicesCount: s.pendingInvoicesCount ?? 0,
    pendingInvoicesAmount: s.pendingInvoicesAmount ?? 0,
    todayIncome: s.todayIncome ?? 0,
  };

  if (isLoading) {
    return (
      <div className="p-8 text-center">
        <div className="inline-block h-8 w-8 animate-spin rounded-full border-4 border-solid border-primary border-r-transparent" />
        <p className="mt-4 text-gray-500 dark:text-gray-400" style={{ fontFamily: "var(--font-body)" }}>Loading dashboard…</p>
      </div>
    );
  }

  if (isError) {
    return (
      <div className="p-8 text-center text-red-600 dark:text-red-400">
        Failed to load dashboard data. Please try again later.
      </div>
    );
  }

  const feeStatusPie = [
    { name: "Paid", value: stats.feeStatusData.paid || 0 },
    { name: "Pending", value: stats.feeStatusData.pending || 0 },
  ];

  return (
    <div className="space-y-8 px-4 sm:px-6 lg:px-0">
      {/* Welcome & Quick Actions */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold" style={{ fontFamily: "var(--font-heading)", color: "var(--color-primary)" }}>
            Welcome, {profile?.full_name || "Admin"}!
          </h1>
          <p className="text-sm text-gray-600 dark:text-gray-400 mt-1" style={{ fontFamily: "var(--font-body)" }}>
            Here's your academy at a glance.
          </p>
        </div>
        <div className="grid grid-cols-3 sm:grid-cols-6 gap-2">
          <QuickAction icon={PhoneCall} label="New Inquiry" onClick={() => navigate("/inquiries?new=true")} />
          <QuickAction icon={UserPlus} label="Add Student" onClick={() => navigate("/students?new=true")} />
          <QuickAction icon={Receipt} label="Record Payment" onClick={() => navigate("/fees?action=collect")} />
          <QuickAction icon={PlusCircle} label="New Exam" onClick={() => navigate("/exams?new=true")} />
          <QuickAction icon={CalendarCheck} label="New Session" onClick={() => navigate("/attendance?new=true")} />
          <QuickAction icon={FileText} label="New Homework" onClick={() => navigate("/homework?new=true")} />
        </div>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
        <StatCard icon={Users} title="Total Students" value={stats.totalStudents} subtext="Active enrollments" color="bg-blue-500" />
        <StatCard icon={BookOpen} title="Active Batches" value={stats.activeBatches} subtext="Currently running" color="bg-emerald-500" />
        <StatCard icon={GraduationCap} title="Teachers" value={stats.totalTeachers} color="bg-purple-500" />
        <StatCard icon={Users} title="Parents" value={stats.totalParents} color="bg-cyan-500" />

        <StatCard
          icon={CalendarCheck}
          title="Today's Attendance"
          value={stats.todayAttendance.total > 0 ? `${Math.round((stats.todayAttendance.present / stats.todayAttendance.total) * 100)}%` : "N/A"}
          subtext={stats.todayAttendance.total > 0 ? `${stats.todayAttendance.present} / ${stats.todayAttendance.total} marked` : "No session today"}
          color="bg-orange-500"
        />
        <StatCard icon={IndianRupee} title="Monthly Collection" value={`₹${stats.monthlyFeeCollection.toLocaleString()}`} subtext="This month" color="bg-green-600" />
        <StatCard icon={AlertCircle} title="Pending Fees" value={`₹${stats.pendingFees.toLocaleString()}`} subtext="All time" color="bg-red-500" />
        <StatCard icon={TrendingUp} title="Active Courses" value={stats.activeCourses} color="bg-teal-500" />

        <StatCard icon={Clock} title="Upcoming Exams" value={stats.upcomingExams.length} subtext="Next few days" color="bg-indigo-500" />
        <StatCard icon={PhoneCall} title="New Inquiries (Month)" value={stats.newInquiriesThisMonth} subtext="This month" color="bg-pink-500" />

        <StatCard icon={Package} title="Low Stock Items" value={stats.lowStockItems.length} subtext={stats.lowStockItems.length > 0 ? "Need reorder" : "All stocked"} color="bg-yellow-500" />
        <StatCard icon={Receipt} title="Pending Invoices" value={`₹${stats.pendingInvoicesAmount.toLocaleString()}`} subtext={`${stats.pendingInvoicesCount} invoice${stats.pendingInvoicesCount !== 1 ? 's' : ''} pending`} color="bg-rose-500" />
        <StatCard icon={CheckCircle} title="Today's Income" value={`₹${stats.todayIncome.toLocaleString()}`} subtext="Collected today" color="bg-emerald-600" />
      </div>

      {/* Low Stock Alert */}
      {stats.lowStockItems.length > 0 && (
        <div className="p-4 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-xl">
          <div className="flex items-center gap-2 text-amber-700 dark:text-amber-300">
            <AlertTriangle size={18} />
            <h3 className="font-semibold" style={{ fontFamily: "var(--font-heading)" }}>Low Stock Alert</h3>
          </div>
          <div className="flex flex-wrap gap-2 mt-2">
            {stats.lowStockItems.map((item) => (
              <span key={item.id} className="px-3 py-1 bg-amber-100 dark:bg-amber-800 text-amber-800 dark:text-amber-200 rounded-full text-xs font-medium">
                {item.item_name}: {item.current_stock} (Min: {item.reorder_level})
              </span>
            ))}
          </div>
          <button
            onClick={() => navigate("/inventory-items")}
            className="mt-2 text-sm text-amber-700 dark:text-amber-300 underline"
            style={{ fontFamily: "var(--font-body)" }}
          >
            View all inventory
          </button>
        </div>
      )}

      {/* Charts Section */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Monthly Fee Collection */}
        <div className="bg-white dark:bg-gray-800 rounded-xl p-5 shadow-sm border border-gray-200 dark:border-gray-700">
          <h3 className="text-lg font-semibold mb-4" style={{ fontFamily: "var(--font-heading)", color: "var(--color-primary)" }}>
            Monthly Fee Collection (Last 6 Months)
          </h3>
          {stats.monthlyFeeData.length === 0 ? (
            <p className="text-sm text-gray-500 dark:text-gray-400 text-center py-12">No data available.</p>
          ) : (
            <ResponsiveContainer width="100%" height={250}>
              <BarChart data={stats.monthlyFeeData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#ccc" />
                <XAxis dataKey="month" fontSize={12} />
                <YAxis fontSize={12} />
                <Tooltip formatter={(value) => `₹${value.toLocaleString()}`} />
                <Bar dataKey="collection" fill={primaryColor} radius={[4, 4, 0, 0]} name="Collection" />
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>

        {/* Students per Batch */}
        <div className="bg-white dark:bg-gray-800 rounded-xl p-5 shadow-sm border border-gray-200 dark:border-gray-700">
          <h3 className="text-lg font-semibold mb-4" style={{ fontFamily: "var(--font-heading)", color: "var(--color-primary)" }}>
            Students per Batch
          </h3>
          {stats.batchStudentData.length === 0 ? (
            <p className="text-sm text-gray-500 dark:text-gray-400 text-center py-12">No batch data available.</p>
          ) : (
            <ResponsiveContainer width="100%" height={250}>
              <PieChart>
                <Pie data={stats.batchStudentData} dataKey="students" nameKey="name" cx="50%" cy="50%" outerRadius={80} label={({ name, students }) => `${name}: ${students}`}>
                  {stats.batchStudentData.map((_, idx) => (
                    <Cell key={idx} fill={COLORS[idx % COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip />
                <Legend />
              </PieChart>
            </ResponsiveContainer>
          )}
        </div>

        {/* Attendance Trend */}
        <div className="bg-white dark:bg-gray-800 rounded-xl p-5 shadow-sm border border-gray-200 dark:border-gray-700">
          <h3 className="text-lg font-semibold mb-4" style={{ fontFamily: "var(--font-heading)", color: "var(--color-primary)" }}>
            Attendance Trend (Last 7 Days)
          </h3>
          {stats.attendanceTrend.length === 0 ? (
            <p className="text-sm text-gray-500 dark:text-gray-400 text-center py-12">No attendance data available.</p>
          ) : (
            <ResponsiveContainer width="100%" height={250}>
              <LineChart data={stats.attendanceTrend}>
                <CartesianGrid strokeDasharray="3 3" stroke="#ccc" />
                <XAxis dataKey="day" fontSize={12} />
                <YAxis domain={[0, 100]} fontSize={12} />
                <Tooltip formatter={(value) => `${value}%`} />
                <Line type="monotone" dataKey="percentage" stroke={primaryColor} strokeWidth={2} name="Attendance %" dot={{ r: 4 }} />
              </LineChart>
            </ResponsiveContainer>
          )}
        </div>

        {/* Fee Status Pie */}
        <div className="bg-white dark:bg-gray-800 rounded-xl p-5 shadow-sm border border-gray-200 dark:border-gray-700">
          <h3 className="text-lg font-semibold mb-4" style={{ fontFamily: "var(--font-heading)", color: "var(--color-primary)" }}>
            Fee Status (Overall)
          </h3>
          {feeStatusPie.reduce((sum, item) => sum + item.value, 0) === 0 ? (
            <p className="text-sm text-gray-500 dark:text-gray-400 text-center py-12">No fee data available.</p>
          ) : (
            <ResponsiveContainer width="100%" height={250}>
              <PieChart>
                <Pie data={feeStatusPie} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={80} label={({ name, value }) => `${name}: ₹${value.toLocaleString()}`}>
                  <Cell fill="#16a34a" />
                  <Cell fill="#dc2626" />
                </Pie>
                <Tooltip formatter={(value) => `₹${value.toLocaleString()}`} />
                <Legend />
              </PieChart>
            </ResponsiveContainer>
          )}
        </div>

        {/* Course-wise Students */}
        <div className="bg-white dark:bg-gray-800 rounded-xl p-5 shadow-sm border border-gray-200 dark:border-gray-700">
          <h3 className="text-lg font-semibold mb-4" style={{ fontFamily: "var(--font-heading)", color: "var(--color-primary)" }}>
            Students per Course
          </h3>
          {stats.courseWiseStudents.length === 0 ? (
            <p className="text-sm text-gray-500 dark:text-gray-400 text-center py-12">No course data available.</p>
          ) : (
            <ResponsiveContainer width="100%" height={250}>
              <PieChart>
                <Pie data={stats.courseWiseStudents} dataKey="students" nameKey="name" cx="50%" cy="50%" innerRadius={50} outerRadius={80} label={({ name, students }) => `${name}: ${students}`}>
                  {stats.courseWiseStudents.map((_, idx) => (
                    <Cell key={idx} fill={COLORS[idx % COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip />
                <Legend />
              </PieChart>
            </ResponsiveContainer>
          )}
        </div>

        {/* Inquiry Trend */}
        <div className="bg-white dark:bg-gray-800 rounded-xl p-5 shadow-sm border border-gray-200 dark:border-gray-700">
          <h3 className="text-lg font-semibold mb-4" style={{ fontFamily: "var(--font-heading)", color: "var(--color-primary)" }}>
            Inquiry Trend (Last 6 Months)
          </h3>
          {stats.inquiryTrendData.length === 0 ? (
            <p className="text-sm text-gray-500 dark:text-gray-400 text-center py-12">No inquiry data available.</p>
          ) : (
            <ResponsiveContainer width="100%" height={250}>
              <LineChart data={stats.inquiryTrendData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#ccc" />
                <XAxis dataKey="month" fontSize={12} />
                <YAxis fontSize={12} />
                <Tooltip />
                <Line type="monotone" dataKey="inquiries" stroke={accentColor} strokeWidth={2} name="Inquiries" />
              </LineChart>
            </ResponsiveContainer>
          )}
        </div>
      </div>

      {/* Recent Activity Tables */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <RecentTable
          title="Recent Inquiries"
          columns={["Inquiry No", "Student", "Mobile", "Status"]}
          data={stats.recentInquiries.map((inq) => [
            inq.inquiry_no,
            inq.student_name,
            inq.mobile,
            <span key={inq.inquiry_no} className={`px-2 py-1 rounded-full text-xs font-medium ${
              inq.status === "New" ? "bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-200" :
              inq.status === "Joined" ? "bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-200" :
              "bg-gray-100 text-gray-700 dark:bg-gray-700 dark:text-gray-300"
            }`}>{inq.status}</span>,
          ])}
          emptyMessage="No recent inquiries"
        />
        <RecentTable
          title="Recent Payments"
          columns={["Date", "Student", "Amount", "Mode"]}
          data={stats.recentPayments.map((pay) => [
            pay.payment_date,
            pay.student_fees?.student ? `${pay.student_fees.student.first_name} ${pay.student_fees.student.last_name}` : "N/A",
            `₹${Number(pay.amount).toLocaleString()}`,
            pay.payment_mode,
          ])}
          emptyMessage="No recent payments"
        />
        <RecentTable
          title="Upcoming Exams"
          columns={["Exam", "Batch", "Date"]}
          data={stats.upcomingExams.map((exam) => [
            exam.exam_name,
            exam.batches?.batch_name || "-",
            exam.exam_date,
          ])}
          emptyMessage="No upcoming exams"
        />
      </div>
    </div>
  );
}