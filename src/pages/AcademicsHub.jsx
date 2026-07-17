import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import {
  Layers,
  BookOpen,
  ClipboardList,
  Calendar,
  FileText,
  CheckSquare,
  Users,
  GraduationCap,
  BookMarked,
  Plus,
  ChevronRight,
  Video,
  Clock,
} from "lucide-react";
import { supabase } from "../api/supabase";
import { useOrg } from "../context/OrganizationContext";

export default function AcademicsHub() {
  const { branch, selectedFinancialYear, theme } = useOrg();
  const branchId = branch?.id;
  const financialYearId = selectedFinancialYear?.id;

  const primaryColor = theme?.primary_color || "#0D47A1";
  const headingFont = theme?.font_heading || "Righteous";
  const bodyFont = theme?.font_body || "Montserrat";

  // ─── 1. Active batches ──────────────────────────────────
  const { data: batchesCount = 0, isLoading: batchesLoading } = useQuery({
    queryKey: ["active-batches-count", branchId, financialYearId],
    queryFn: async () => {
      let query = supabase
        .from("batches")
        .select("id", { count: "exact", head: true })
        .eq("status", "active");
      if (branchId) query = query.eq("branch_id", branchId);
      if (financialYearId) query = query.eq("financial_year_id", financialYearId);
      const { count } = await query;
      return count || 0;
    },
    enabled: !!branchId && !!financialYearId,
    staleTime: 5 * 60 * 1000,
  });

  // ─── 2. Upcoming exams (next 5) ────────────────────────
  const { data: upcomingExams = [], isLoading: examsLoading } = useQuery({
    queryKey: ["upcoming-exams", branchId, financialYearId],
    queryFn: async () => {
      let query = supabase
        .from("exams")
        .select(`
          id, exam_name, exam_date,
          batches(batch_name)
        `)
        .gte("exam_date", new Date().toISOString().split("T")[0])
        .order("exam_date", { ascending: true })
        .limit(5);
      if (branchId) query = query.eq("branch_id", branchId);
      if (financialYearId) query = query.eq("financial_year_id", financialYearId);
      const { data } = await query;
      return data || [];
    },
    enabled: !!branchId && !!financialYearId,
    staleTime: 2 * 60 * 1000,
  });

  // ─── 3. Recent homework ─────────────────────────────────
  const { data: recentHomework = [], isLoading: homeworkLoading } = useQuery({
    queryKey: ["recent-homework", branchId, financialYearId],
    queryFn: async () => {
      let query = supabase
        .from("homework")
        .select(`
          id, title, assigned_date, due_date,
          batches(batch_name)
        `)
        .order("assigned_date", { ascending: false })
        .limit(5);
      if (branchId) query = query.eq("branch_id", branchId);
      if (financialYearId) query = query.eq("financial_year_id", financialYearId);
      const { data } = await query;
      return data || [];
    },
    enabled: !!branchId && !!financialYearId,
    staleTime: 2 * 60 * 1000,
  });

  // ─── 4. Total subjects ──────────────────────────────────
  const { data: subjectsCount = 0, isLoading: subjectsLoading } = useQuery({
    queryKey: ["subjects-count", branchId, financialYearId],
    queryFn: async () => {
      let query = supabase
        .from("subjects")
        .select("id", { count: "exact", head: true });
      if (branchId) query = query.eq("branch_id", branchId);
      if (financialYearId) query = query.eq("financial_year_id", financialYearId);
      const { count } = await query;
      return count || 0;
    },
    enabled: !!branchId && !!financialYearId,
    staleTime: 5 * 60 * 1000,
  });

  // ─── 5. Total exams ─────────────────────────────────────
  const { data: examsCount = 0, isLoading: examsCountLoading } = useQuery({
    queryKey: ["exams-count", branchId, financialYearId],
    queryFn: async () => {
      let query = supabase
        .from("exams")
        .select("id", { count: "exact", head: true });
      if (branchId) query = query.eq("branch_id", branchId);
      if (financialYearId) query = query.eq("financial_year_id", financialYearId);
      const { count } = await query;
      return count || 0;
    },
    enabled: !!branchId && !!financialYearId,
    staleTime: 5 * 60 * 1000,
  });

  // ─── 6. Total homework ──────────────────────────────────
  const { data: homeworkCount = 0, isLoading: homeworkCountLoading } = useQuery({
    queryKey: ["homework-count", branchId, financialYearId],
    queryFn: async () => {
      let query = supabase
        .from("homework")
        .select("id", { count: "exact", head: true });
      if (branchId) query = query.eq("branch_id", branchId);
      if (financialYearId) query = query.eq("financial_year_id", financialYearId);
      const { count } = await query;
      return count || 0;
    },
    enabled: !!branchId && !!financialYearId,
    staleTime: 5 * 60 * 1000,
  });

  // ─── Quick Actions (now includes Timetable & Online Classes) ──
  const quickActions = [
    {
      title: "Batches",
      icon: Layers,
      link: "/batches",
      color: "bg-blue-100 text-blue-700",
    },
    {
      title: "Subjects",
      icon: BookOpen,
      link: "/subjects",
      color: "bg-green-100 text-green-700",
    },
    {
      title: "Exams",
      icon: ClipboardList,
      link: "/exams",
      color: "bg-purple-100 text-purple-700",
    },
    {
      title: "Results",
      icon: GraduationCap,
      link: "/results",
      color: "bg-indigo-100 text-indigo-700",
    },
    {
      title: "Homework",
      icon: FileText,
      link: "/homework",
      color: "bg-orange-100 text-orange-700",
    },
    {
      title: "Attendance",
      icon: CheckSquare,
      link: "/attendance",
      color: "bg-pink-100 text-pink-700",
    },
    {
      title: "Attendance Reports",
      icon: Calendar,
      link: "/attendance/reports",
      color: "bg-cyan-100 text-cyan-700",
    },
    {
      title: "Courses & Levels",
      icon: BookMarked,
      link: "/courses",
      color: "bg-yellow-100 text-yellow-700",
    },
    // ─── NEW: Timetable ─────────────────────────────────
    {
      title: "Timetable",
      icon: Clock,
      link: "/timetable",
      color: "bg-rose-100 text-rose-700",
    },
    // ─── NEW: Online Classes ────────────────────────────
    {
      title: "Online Classes",
      icon: Video,
      link: "/online-classes",
      color: "bg-violet-100 text-violet-700",
    },
  ];

  // ─── Stats Cards ────────────────────────────────────────
  const stats = [
    {
      label: "Active Batches",
      value: batchesLoading ? "..." : batchesCount,
      icon: Layers,
      color: primaryColor,
    },
    {
      label: "Subjects",
      value: subjectsLoading ? "..." : subjectsCount,
      icon: BookOpen,
      color: primaryColor,
    },
    {
      label: "Total Exams",
      value: examsCountLoading ? "..." : examsCount,
      icon: ClipboardList,
      color: primaryColor,
    },
    {
      label: "Homework",
      value: homeworkCountLoading ? "..." : homeworkCount,
      icon: FileText,
      color: primaryColor,
    },
  ];

  return (
    <>
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between mb-6">
        <div>
          <h1
            className="text-3xl"
            style={{ fontFamily: headingFont, color: primaryColor }}
          >
            Academics Management
          </h1>
          <p
            className="text-sm text-secondary-dark mt-1"
            style={{ fontFamily: bodyFont }}
          >
            Manage all academic activities from one dashboard
          </p>
        </div>
        <div className="flex gap-2 mt-2 sm:mt-0">
          <Link
            to="/batches/new"
            className="bg-primary hover:bg-primary-light text-white px-5 py-2.5 rounded-lg transition flex items-center gap-2 text-sm"
            style={{ fontFamily: bodyFont }}
          >
            <Plus size={18} /> New Batch
          </Link>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        {stats.map((stat, idx) => (
          <div
            key={idx}
            className="bg-white rounded-xl shadow-sm p-5 border border-secondary-light"
          >
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs text-secondary-light" style={{ fontFamily: bodyFont }}>
                  {stat.label}
                </p>
                <p
                  className="text-2xl font-bold mt-1"
                  style={{ fontFamily: headingFont, color: stat.color }}
                >
                  {stat.value}
                </p>
              </div>
              <stat.icon size={32} className="text-primary opacity-60" />
            </div>
          </div>
        ))}
      </div>

      {/* Quick Actions Grid */}
      <div className="mb-6">
        <h2
          className="text-lg font-semibold mb-3"
          style={{ fontFamily: headingFont, color: primaryColor }}
        >
          Quick Actions
        </h2>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6 gap-3">
          {quickActions.map((action) => (
            <Link
              key={action.title}
              to={action.link}
              className="bg-white rounded-xl shadow-sm border border-secondary-light p-4 hover:shadow-md transition hover:border-primary group"
            >
              <div className="flex flex-col items-center text-center">
                <div
                  className={`p-3 rounded-full ${action.color} mb-2 group-hover:scale-105 transition`}
                >
                  <action.icon size={20} />
                </div>
                <span
                  className="text-sm font-medium text-secondary-dark"
                  style={{ fontFamily: bodyFont }}
                >
                  {action.title}
                </span>
              </div>
            </Link>
          ))}
        </div>
      </div>

      {/* Two-column: Upcoming Exams + Recent Homework */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Upcoming Exams */}
        <div className="bg-white rounded-xl shadow-sm border border-secondary-light overflow-hidden">
          <div className="px-5 py-3 border-b border-secondary-light flex items-center justify-between">
            <h3
              className="font-semibold"
              style={{ fontFamily: headingFont, color: primaryColor }}
            >
              Upcoming Exams
            </h3>
            <Link
              to="/exams"
              className="text-sm text-primary hover:underline flex items-center gap-1"
            >
              View All <ChevronRight size={16} />
            </Link>
          </div>
          <div className="p-3 max-h-72 overflow-y-auto">
            {examsLoading ? (
              <div className="text-center py-4 text-secondary">Loading...</div>
            ) : upcomingExams.length === 0 ? (
              <div className="text-center py-4 text-secondary">No upcoming exams.</div>
            ) : (
              <div className="space-y-3">
                {upcomingExams.map((exam) => (
                  <div
                    key={exam.id}
                    className="flex items-center justify-between p-2 bg-gray-50 rounded-lg"
                  >
                    <div className="flex-1">
                      <p className="text-sm font-medium">{exam.exam_name}</p>
                      <p className="text-xs text-secondary">
                        {exam.batches?.batch_name || "No batch"}
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="text-sm font-semibold text-primary">
                        {exam.exam_date}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Recent Homework */}
        <div className="bg-white rounded-xl shadow-sm border border-secondary-light overflow-hidden">
          <div className="px-5 py-3 border-b border-secondary-light flex items-center justify-between">
            <h3
              className="font-semibold"
              style={{ fontFamily: headingFont, color: primaryColor }}
            >
              Recent Homework
            </h3>
            <Link
              to="/homework"
              className="text-sm text-primary hover:underline flex items-center gap-1"
            >
              View All <ChevronRight size={16} />
            </Link>
          </div>
          <div className="p-3 max-h-72 overflow-y-auto">
            {homeworkLoading ? (
              <div className="text-center py-4 text-secondary">Loading...</div>
            ) : recentHomework.length === 0 ? (
              <div className="text-center py-4 text-secondary">No homework assigned.</div>
            ) : (
              <div className="space-y-3">
                {recentHomework.map((hw) => (
                  <div
                    key={hw.id}
                    className="flex items-center justify-between p-2 bg-gray-50 rounded-lg"
                  >
                    <div className="flex-1">
                      <p className="text-sm font-medium">{hw.title}</p>
                      <p className="text-xs text-secondary">
                        {hw.batches?.batch_name || "No batch"}
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="text-xs text-secondary">Due: {hw.due_date}</p>
                      <p className="text-xs text-secondary">Assigned: {hw.assigned_date}</p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </>
  );
}