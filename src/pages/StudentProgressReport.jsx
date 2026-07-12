import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import toast from "react-hot-toast";
import {
  Search,
  TrendingUp,
  Download,
  Filter,
  X,
  Layers,
  BookOpen,
  GraduationCap,
  Users,
} from "lucide-react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from "recharts";
import AdminLayout from "../layouts/AdminLayout";
import { supabase } from "../api/supabase";
import { getStudentProgress } from "../services/examService";
import { generateProgressPdf } from "../utils/progressPdf";
import { useOrg } from "../context/OrganizationContext";   // NEW

export default function StudentProgressReport() {
  const [search, setSearch] = useState("");
  const [selectedStudent, setSelectedStudent] = useState(null);
  const [showFilters, setShowFilters] = useState(false);
  const [filters, setFilters] = useState({
    batch_id: "",
    course_id: "",
    medium_id: "",
    status: "",
  });

  // ── Branch & Financial Year context ──
  const { branch, selectedFinancialYear } = useOrg();   // NEW
  const branchId = branch?.id;
  const financialYearId = selectedFinancialYear?.id;

  // Dropdowns – scoped where applicable
  const { data: batches = [] } = useQuery({
    queryKey: ["batches-dropdown", branchId, financialYearId],
    queryFn: async () => {
      let query = supabase
        .from("batches")
        .select("id, batch_name")
        .eq("status", "active")
        .order("batch_name");

      if (branchId) query = query.eq("branch_id", branchId);
      if (financialYearId) query = query.eq("financial_year_id", financialYearId);

      const { data } = await query;
      return data || [];
    },
    enabled: !!branchId && !!financialYearId,
    staleTime: 10 * 60 * 1000,
  });

  const { data: courses = [] } = useQuery({
    queryKey: ["courses-dropdown"],
    queryFn: async () => {
      const { data } = await supabase
        .from("courses")
        .select("id, course_name")
        .eq("status", true)
        .order("course_name");
      return data || [];
    },
    staleTime: 10 * 60 * 1000,
  });

  const { data: mediums = [] } = useQuery({
    queryKey: ["mediums-dropdown"],
    queryFn: async () => {
      const { data } = await supabase
        .from("mediums")
        .select("id, name")
        .order("name");
      return data || [];
    },
    staleTime: 10 * 60 * 1000,
  });

  // Fetch students with all filters – scoped to branch & FY
  const { data: students = [] } = useQuery({
    queryKey: ["students-filtered", { search, ...filters }, branchId, financialYearId],
    queryFn: async () => {
      let query = supabase
        .from("students")
        .select("id, first_name, last_name, admission_no, photo_url, status")
        .order("first_name");

      // Scope students table
      if (branchId) query = query.eq("branch_id", branchId);
      if (financialYearId) query = query.eq("financial_year_id", financialYearId);

      if (search) {
        query = query.or(
          `first_name.ilike.%${search}%,last_name.ilike.%${search}%,admission_no.ilike.%${search}%`
        );
      }

      if (filters.status) {
        query = query.eq("status", filters.status);
      }

      if (filters.medium_id) {
        query = query.eq("medium_id", filters.medium_id);
      }

      // Batch filter (via student_batches – scoped)
      if (filters.batch_id) {
        let sbQuery = supabase
          .from("student_batches")
          .select("student_id")
          .eq("batch_id", filters.batch_id)
          .eq("status", "active");

        if (branchId) sbQuery = sbQuery.eq("branch_id", branchId);
        if (financialYearId) sbQuery = sbQuery.eq("financial_year_id", financialYearId);

        const { data: batchStudents } = await sbQuery;
        const ids = batchStudents?.map((bs) => bs.student_id) || [];
        if (ids.length > 0) {
          query = query.in("id", ids);
        } else {
          return [];
        }
      }

      // Course filter (via batches -> student_batches – all scoped)
      if (filters.course_id) {
        // Get batch IDs for course
        let courseBatchesQuery = supabase
          .from("batches")
          .select("id")
          .eq("course_id", filters.course_id);

        if (branchId) courseBatchesQuery = courseBatchesQuery.eq("branch_id", branchId);
        if (financialYearId) courseBatchesQuery = courseBatchesQuery.eq("financial_year_id", financialYearId);

        const { data: courseBatches } = await courseBatchesQuery;
        const batchIds = courseBatches?.map((b) => b.id) || [];
        if (batchIds.length === 0) return [];

        // Get student IDs in those batches
        let courseStudentsQuery = supabase
          .from("student_batches")
          .select("student_id")
          .in("batch_id", batchIds)
          .eq("status", "active");

        if (branchId) courseStudentsQuery = courseStudentsQuery.eq("branch_id", branchId);
        if (financialYearId) courseStudentsQuery = courseStudentsQuery.eq("financial_year_id", financialYearId);

        const { data: courseStudents } = await courseStudentsQuery;
        const ids = courseStudents?.map((cs) => cs.student_id) || [];
        if (ids.length > 0) {
          // If batch filter also active, intersect IDs
          if (filters.batch_id) {
            // Re-fetch batch IDs (already scoped)
            let batchIntersectQuery = supabase
              .from("student_batches")
              .select("student_id")
              .eq("batch_id", filters.batch_id)
              .eq("status", "active");

            if (branchId) batchIntersectQuery = batchIntersectQuery.eq("branch_id", branchId);
            if (financialYearId) batchIntersectQuery = batchIntersectQuery.eq("financial_year_id", financialYearId);

            const { data: batchIdsForIntersect } = await batchIntersectQuery;
            const existingIds = batchIdsForIntersect?.map((bs) => bs.student_id) || [];
            const intersection = existingIds.filter((id) => ids.includes(id));
            if (intersection.length > 0) {
              query = query.in("id", intersection);
            } else {
              return [];
            }
          } else {
            query = query.in("id", ids);
          }
        } else {
          return [];
        }
      }

      const { data, error } = await query.limit(100);
      if (error) throw error;
      return data || [];
    },
    enabled: !!branchId && !!financialYearId,
    staleTime: 2 * 60 * 1000,
  });

  // Fetch progress for selected student – scoped
  const { data: progressData = [], isLoading } = useQuery({
    queryKey: ["student-progress", selectedStudent?.id, branchId, financialYearId],
    queryFn: () => getStudentProgress(selectedStudent.id, branchId, financialYearId),
    enabled: !!selectedStudent && !!branchId && !!financialYearId,
  });

  // Convert data for Recharts (last 5 exams per subject)
  const chartData = {};
  progressData.forEach((subject) => {
    const sorted = subject.exams.slice(-5);
    const series = sorted.map((e) => ({
      exam: e.exam_name,
      score: e.total_marks ? ((e.marks_obtained / e.total_marks) * 100).toFixed(1) : 0,
    }));
    chartData[subject.subject_name] = series;
  });

  async function handleExportPdf() {
    if (!selectedStudent) return;
    try {
      await generateProgressPdf(selectedStudent, progressData);
    } catch (err) {
      toast.error("Failed to generate PDF");
    }
  }

  const clearFilters = () => {
    setFilters({ batch_id: "", course_id: "", medium_id: "", status: "" });
    setSearch("");
  };

  return (
    <AdminLayout>
      <div className="mb-6">
        <h1 className="text-3xl font-righteous text-primary-dark">
          Student Progress Report
        </h1>
        <p className="text-sm text-secondary-dark font-montserrat mt-1">
          Subject‑wise exam performance & trends
        </p>
      </div>

      {/* Search & Filters Toggle */}
      <div className="flex flex-col sm:flex-row gap-3 mb-4">
        <div className="relative flex-1">
          <Search size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-secondary" />
          <input
            type="text"
            placeholder="Search by name, admission no..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full border border-secondary-light rounded-lg pl-10 pr-4 py-2.5 text-sm focus:ring-1 focus:ring-primary focus:border-primary outline-none"
          />
        </div>
        <button
          onClick={() => setShowFilters(!showFilters)}
          className="border border-secondary-light px-4 py-2.5 rounded-lg text-secondary-dark hover:bg-secondary-bg font-montserrat text-sm flex items-center gap-2 self-start"
        >
          <Filter size={18} /> Filters
          {showFilters && <X size={16} />}
        </button>
      </div>

      {/* Advanced Filters Panel */}
      {showFilters && (
        <div className="bg-white rounded-xl p-4 shadow-sm mb-4 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4 border border-secondary-light">
          <div>
            <label className="text-xs font-montserrat text-secondary-dark">
              <Layers size={14} className="inline mr-1" /> Batch
            </label>
            <select
              value={filters.batch_id}
              onChange={(e) => setFilters({ ...filters, batch_id: e.target.value })}
              className="w-full border border-secondary-light rounded p-2 text-sm mt-1 focus:ring-1 focus:ring-primary"
            >
              <option value="">All Batches</option>
              {batches.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.batch_name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="text-xs font-montserrat text-secondary-dark">
              <BookOpen size={14} className="inline mr-1" /> Course
            </label>
            <select
              value={filters.course_id}
              onChange={(e) => setFilters({ ...filters, course_id: e.target.value })}
              className="w-full border border-secondary-light rounded p-2 text-sm mt-1 focus:ring-1 focus:ring-primary"
            >
              <option value="">All Courses</option>
              {courses.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.course_name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="text-xs font-montserrat text-secondary-dark">
              <GraduationCap size={14} className="inline mr-1" /> Medium
            </label>
            <select
              value={filters.medium_id}
              onChange={(e) => setFilters({ ...filters, medium_id: e.target.value })}
              className="w-full border border-secondary-light rounded p-2 text-sm mt-1 focus:ring-1 focus:ring-primary"
            >
              <option value="">All Mediums</option>
              {mediums.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="text-xs font-montserrat text-secondary-dark">
              <Users size={14} className="inline mr-1" /> Status
            </label>
            <select
              value={filters.status}
              onChange={(e) => setFilters({ ...filters, status: e.target.value })}
              className="w-full border border-secondary-light rounded p-2 text-sm mt-1 focus:ring-1 focus:ring-primary"
            >
              <option value="">All Statuses</option>
              <option value="active">Active</option>
              <option value="inactive">Inactive</option>
              <option value="graduated">Graduated</option>
            </select>
          </div>
          <div className="flex items-end">
            <button
              onClick={clearFilters}
              className="text-primary text-sm hover:underline"
            >
              Clear Filters
            </button>
          </div>
        </div>
      )}

      {/* Student Search Dropdown */}
      {search && (
        <div className="relative mb-6 max-w-md">
          <div className="absolute z-10 w-full bg-white border border-secondary-light rounded-lg mt-1 max-h-48 overflow-y-auto shadow-lg">
            {students.length === 0 ? (
              <p className="px-4 py-2 text-sm text-secondary">No students match</p>
            ) : (
              students.map((s) => (
                <button
                  key={s.id}
                  onClick={() => {
                    setSelectedStudent(s);
                    setSearch("");
                  }}
                  className="w-full text-left px-4 py-2 text-sm hover:bg-primary-bg flex items-center gap-3"
                >
                  {s.photo_url && (
                    <img
                      src={s.photo_url}
                      alt=""
                      className="w-8 h-8 rounded-full object-cover border"
                    />
                  )}
                  <span>
                    {s.first_name} {s.last_name} ({s.admission_no})
                  </span>
                </button>
              ))
            )}
          </div>
        </div>
      )}

      {/* Selected student info */}
      {selectedStudent && (
        <div className="bg-white rounded-xl p-4 shadow-sm mb-6 flex items-center gap-4">
          {selectedStudent.photo_url && (
            <img
              src={selectedStudent.photo_url}
              alt=""
              className="w-12 h-12 rounded-full object-cover border"
            />
          )}
          <div>
            <h2 className="font-righteous text-primary-dark text-lg">
              {selectedStudent.first_name} {selectedStudent.last_name}
            </h2>
            <p className="text-sm text-secondary">{selectedStudent.admission_no}</p>
          </div>
          <button
            onClick={handleExportPdf}
            className="ml-auto bg-primary text-white px-4 py-2 rounded-lg text-sm flex items-center gap-2"
          >
            <Download size={16} /> Export PDF
          </button>
        </div>
      )}

      {/* Charts */}
      {isLoading ? (
        <div className="text-center p-6 text-secondary">Loading progress…</div>
      ) : selectedStudent && progressData.length === 0 ? (
        <div className="text-center p-6 text-secondary">No exam data found for this student.</div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {Object.entries(chartData).map(([subject, data]) => (
            <div key={subject} className="bg-white rounded-xl shadow-sm p-4">
              <h3 className="font-righteous text-primary-dark text-lg mb-2">{subject}</h3>
              <ResponsiveContainer width="100%" height={250}>
                <BarChart data={data}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="exam" fontSize={12} />
                  <YAxis domain={[0, 100]} fontSize={12} />
                  <Tooltip />
                  <Bar dataKey="score" fill="#0D47A1" name="Score %" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          ))}
        </div>
      )}
    </AdminLayout>
  );
}