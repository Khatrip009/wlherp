// src/pages/AcademicsHub.jsx
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
import { useTheme } from "../context/ThemeContext"; // ✅ keep import, theme is set by context

export default function AcademicsHub() {
  const { branch, selectedFinancialYear } = useOrg();
  const theme = useTheme(); // ✅ still trigger context, but we'll use CSS classes
  const branchId = branch?.id;
  const financialYearId = selectedFinancialYear?.id;

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

  // ─── Quick Actions ──────────────────────────────────────
  const quickActions = [
    { title: "Batches", icon: Layers, link: "/batches" },
    { title: "Subjects", icon: BookOpen, link: "/subjects" },
    { title: "Exams", icon: ClipboardList, link: "/exams" },
    { title: "Results", icon: GraduationCap, link: "/results" },
    { title: "Homework", icon: FileText, link: "/homework" },
    { title: "Attendance", icon: CheckSquare, link: "/attendance" },
    { title: "Attendance Reports", icon: Calendar, link: "/attendance/reports" },
    { title: "Courses & Levels", icon: BookMarked, link: "/courses" },
    { title: "Timetable", icon: Clock, link: "/timetable" },
    { title: "Online Classes", icon: Video, link: "/online-classes" },
  ];

  // ─── Stats Cards ────────────────────────────────────────
  const stats = [
    { label: "Active Batches", value: batchesLoading ? "..." : batchesCount, icon: Layers },
    { label: "Subjects", value: subjectsLoading ? "..." : subjectsCount, icon: BookOpen },
    { label: "Total Exams", value: examsCountLoading ? "..." : examsCount, icon: ClipboardList },
    { label: "Homework", value: homeworkCountLoading ? "..." : homeworkCount, icon: FileText },
  ];

  return (
    <div className="space-y-6 px-4 sm:px-6 lg:px-0">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between mb-6">
        <div>
          <h1 className="text-3xl font-heading text-primary">
            Academics Management
          </h1>
          <p className="text-sm text-gray-600 dark:text-gray-400 mt-1 font-body">
            Manage all academic activities from one dashboard
          </p>
        </div>
        <div className="flex gap-2 mt-2 sm:mt-0">
          <Link
            to="/batches/new"
            className="bg-primary hover:bg-primary-light text-white px-5 py-2.5 rounded-lg transition flex items-center gap-2 text-sm font-body"
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
            className="bg-white dark:bg-accent rounded-xl shadow-sm p-5 border border-gray-200 dark:border-gray-700"
          >
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs text-gray-500 dark:text-gray-400 font-body">
                  {stat.label}
                </p>
                <p className="text-2xl font-bold mt-1 font-heading text-primary">
                  {stat.value}
                </p>
              </div>
              <stat.icon size={32} className="text-primary/60" />
            </div>
          </div>
        ))}
      </div>

      {/* Quick Actions Grid */}
      <div className="mb-6">
        <h2 className="text-lg font-semibold mb-3 font-heading text-primary">
          Quick Actions
        </h2>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6 gap-3">
          {quickActions.map((action) => (
            <Link
              key={action.title}
              to={action.link}
              className="bg-white dark:bg-accent rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 p-4 hover:shadow-md transition hover:border-primary dark:hover:border-primary group"
            >
              <div className="flex flex-col items-center text-center">
                <div className="p-3 rounded-full bg-primary/10 text-primary mb-2 group-hover:scale-105 transition">
                  <action.icon size={20} />
                </div>
                <span className="text-sm font-medium text-gray-700 dark:text-gray-300 font-body">
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
        <div className="bg-white dark:bg-accent rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 overflow-hidden">
          <div className="px-5 py-3 border-b border-gray-200 dark:border-gray-700 flex items-center justify-between">
            <h3 className="font-semibold font-heading text-primary">
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
              <div className="text-center py-4 text-gray-500 dark:text-gray-400">Loading...</div>
            ) : upcomingExams.length === 0 ? (
              <div className="text-center py-4 text-gray-500 dark:text-gray-400">No upcoming exams.</div>
            ) : (
              <div className="space-y-3">
                {upcomingExams.map((exam) => (
                  <div
                    key={exam.id}
                    className="flex items-center justify-between p-2 bg-gray-50 dark:bg-gray-700 rounded-lg"
                  >
                    <div className="flex-1">
                      <p className="text-sm font-medium text-gray-800 dark:text-gray-100">{exam.exam_name}</p>
                      <p className="text-xs text-gray-500 dark:text-gray-400">
                        {exam.batches?.batch_name || "No batch"}
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="text-sm font-semibold font-heading text-primary">
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
        <div className="bg-white dark:bg-accent rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 overflow-hidden">
          <div className="px-5 py-3 border-b border-gray-200 dark:border-gray-700 flex items-center justify-between">
            <h3 className="font-semibold font-heading text-primary">
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
              <div className="text-center py-4 text-gray-500 dark:text-gray-400">Loading...</div>
            ) : recentHomework.length === 0 ? (
              <div className="text-center py-4 text-gray-500 dark:text-gray-400">No homework assigned.</div>
            ) : (
              <div className="space-y-3">
                {recentHomework.map((hw) => (
                  <div
                    key={hw.id}
                    className="flex items-center justify-between p-2 bg-gray-50 dark:bg-gray-700 rounded-lg"
                  >
                    <div className="flex-1">
                      <p className="text-sm font-medium text-gray-800 dark:text-gray-100">{hw.title}</p>
                      <p className="text-xs text-gray-500 dark:text-gray-400">
                        {hw.batches?.batch_name || "No batch"}
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="text-xs text-gray-500 dark:text-gray-400">Due: {hw.due_date}</p>
                      <p className="text-xs text-gray-500 dark:text-gray-400">Assigned: {hw.assigned_date}</p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}