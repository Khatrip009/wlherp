// src/pages/Courses.jsx
import React, { useState, useRef } from "react";
import {
  useInfiniteQuery,
  useMutation,
  useQueryClient,
  useQuery,
} from "@tanstack/react-query";
import toast from "react-hot-toast";
import {
  Search,
  Plus,
  Edit3,
  Trash2,
  Download,
  Upload,
  Layers,
  BookOpen,
  Filter,
} from "lucide-react";
import Papa from "papaparse";
import AdminLayout from "../layouts/AdminLayout";
import CourseForm from "../components/CourseForm";
import CourseLevelForm from "../components/CourseLevelForm";
import { supabase } from "../api/supabase";
import {
  createCourse,
  updateCourse,
  deleteCourse,
  getCourseLevels,
  createCourseLevel,
  updateCourseLevel,
  deleteCourseLevel,
  getAllCoursesForExport,
  getMediumOptions,
} from "../services/courseService";
import { useOrg } from "../context/OrganizationContext";

export default function Courses() {
  const queryClient = useQueryClient();

  // ── Branch & Financial Year context ──
  const { branch, selectedFinancialYear } = useOrg();
  const branchId = branch?.id;
  const financialYearId = selectedFinancialYear?.id;

  const ctx = { branchId, financialYearId };

  // Search & filters
  const [search, setSearch] = useState("");
  const [mediumFilter, setMediumFilter] = useState("");
  const filters = { search, medium_id: mediumFilter };

  // Infinite query – now scoped with branch & FY
  const {
    data,
    isLoading: coursesLoading,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
  } = useInfiniteQuery({
    queryKey: ["courses", filters, branchId, financialYearId],
    queryFn: async ({ pageParam = 0 }) => {
      const from = pageParam * 20;
      const to = from + 19;

      let query = supabase
        .from("courses")
        .select("*, mediums(name)", { count: "exact" })
        .eq("branch_id", branchId)
        .eq("financial_year_id", financialYearId)
        .order("course_name", { ascending: true })
        .range(from, to);

      if (search) {
        query = query.or(`course_name.ilike.%${search}%,description.ilike.%${search}%`);
      }
      if (mediumFilter) {
        query = query.eq("medium_id", mediumFilter);
      }

      const { data, count, error } = await query;
      if (error) throw error;

      const courses = (data || []).map((course) => ({
        ...course,
        medium_name: course.mediums?.name || "",
      }));

      return { data: courses, count };
    },
    getNextPageParam: (lastPage, allPages) => {
      const totalFetched = allPages.reduce((sum, page) => sum + page.data.length, 0);
      if (lastPage.count && totalFetched < lastPage.count) {
        return allPages.length;
      }
      return undefined;
    },
    initialPageParam: 0,
    enabled: !!branchId && !!financialYearId,
    staleTime: 5 * 60 * 1000,
  });

  const courses = data?.pages.flatMap((page) => page.data) || [];

  // Mediums (org‑wide)
  const { data: mediums = [] } = useQuery({
    queryKey: ["mediumsDropdown"],
    queryFn: getMediumOptions,
    staleTime: 10 * 60 * 1000,
  });

  // ── Mutations (already use context) ──
  const createMutation = useMutation({
    mutationFn: (payload) => createCourse(payload, ctx),
    onSuccess: () => {
      toast.success("Course created");
      queryClient.invalidateQueries({ queryKey: ["courses"] });
      setShowForm(false);
    },
    onError: (err) => {
      console.error("Create course error:", err);
      toast.error("Failed to create course");
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, payload }) => updateCourse(id, payload, ctx),
    onSuccess: () => {
      toast.success("Course updated");
      queryClient.invalidateQueries({ queryKey: ["courses"] });
      setEditing(null);
    },
    onError: () => toast.error("Failed to update course"),
  });

  const deleteMutation = useMutation({
    mutationFn: (id) => deleteCourse(id, ctx),
    onSuccess: () => {
      toast.success("Course deleted");
      queryClient.invalidateQueries({ queryKey: ["courses"] });
    },
    onError: () => toast.error("Delete failed"),
  });

  // CSV Import – scoped via context
  async function handleCSVImport(event) {
    const file = event.target.files[0];
    if (!file) return;
    Papa.parse(file, {
      header: true,
      skipEmptyLines: true,
      complete: async (results) => {
        let successCount = 0;
        for (const row of results.data) {
          try {
            const payload = {
              course_name: row.course_name,
              description: row.description || null,
              duration_months: row.duration_months ? Number(row.duration_months) : null,
              status: true,
              medium_id: row.medium_id ? Number(row.medium_id) : null,
            };
            await createCourse(payload, ctx);
            successCount++;
          } catch (err) {
            console.error(err);
          }
        }
        toast.success(`${successCount} courses imported`);
        queryClient.invalidateQueries({ queryKey: ["courses"] });
      },
      error: () => toast.error("CSV parsing error"),
    });
  }

  // CSV Export – now scoped, corrected signature
  async function handleCSVExport() {
    try {
      const allData = await getAllCoursesForExport(
        filters,
        branchId,
        financialYearId
      );
      const csv = Papa.unparse(
        allData.map((c) => ({
          course_name: c.course_name,
          description: c.description,
          duration_months: c.duration_months,
          medium: c.medium_name || "",
          status: c.status,
        }))
      );
      const blob = new Blob([csv], { type: "text/csv" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "courses.csv";
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      toast.error("Export failed");
    }
  }

  // ── Level management (scoped) ──
  const [expandedCourseId, setExpandedCourseId] = useState(null);
  const [levelForm, setLevelForm] = useState(null);
  const [levelsMap, setLevelsMap] = useState({});

  async function loadLevels(courseId) {
    if (!branchId || !financialYearId) return;
    try {
      const levels = await getCourseLevels(courseId, branchId, financialYearId);
      setLevelsMap((prev) => ({ ...prev, [courseId]: levels }));
    } catch {
      toast.error("Failed to load levels");
    }
  }

  function toggleLevels(courseId) {
    if (expandedCourseId === courseId) {
      setExpandedCourseId(null);
    } else {
      setExpandedCourseId(courseId);
      if (!levelsMap[courseId]) loadLevels(courseId);
    }
  }

  const createLevelMutation = useMutation({
    mutationFn: (payload) => createCourseLevel(payload, ctx),
    onSuccess: (data) => {
      toast.success("Level created");
      setLevelForm(null);
      loadLevels(data.course_id);
    },
    onError: () => toast.error("Failed to create level"),
  });

  const updateLevelMutation = useMutation({
    mutationFn: ({ id, payload }) => updateCourseLevel(id, payload, ctx),
    onSuccess: (data) => {
      toast.success("Level updated");
      setLevelForm(null);
      loadLevels(data.course_id);
    },
    onError: () => toast.error("Failed to update level"),
  });

  const deleteLevelMutation = useMutation({
    mutationFn: (id) => deleteCourseLevel(id, branchId, financialYearId),
    onSuccess: () => {
      toast.success("Level deleted");
      if (expandedCourseId) loadLevels(expandedCourseId);
    },
    onError: () => toast.error("Delete failed"),
  });

  // ── UI state ──
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState(null);
  const fileInputRef = useRef(null);

  function handleCreate(payload) {
    createMutation.mutate(payload);
  }

  function handleUpdate(payload) {
    updateMutation.mutate({ id: editing.id, payload });
  }

  function handleDelete(id) {
    if (!window.confirm("Delete Course?")) return;
    deleteMutation.mutate(id);
  }

  return (
    <AdminLayout>
      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-6 gap-4">
        <div>
          <h1 className="text-3xl font-righteous text-primary-dark">Courses</h1>
          <p className="text-sm text-secondary-dark font-montserrat mt-1">
            Manage courses and levels
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            onClick={() => setShowForm(true)}
            className="bg-primary hover:bg-primary-light text-white px-5 py-2.5 rounded-lg transition font-montserrat text-sm flex items-center gap-2"
          >
            <BookOpen size={18} /> Add Course
          </button>
          <button
            onClick={handleCSVExport}
            className="border border-secondary-light px-4 py-2.5 rounded-lg text-secondary-dark hover:bg-secondary-bg font-montserrat text-sm flex items-center gap-2"
          >
            <Download size={18} /> Export
          </button>
          <button
            onClick={() => fileInputRef.current?.click()}
            className="border border-secondary-light px-4 py-2.5 rounded-lg text-secondary-dark hover:bg-secondary-bg font-montserrat text-sm flex items-center gap-2"
          >
            <Upload size={18} /> Import
          </button>
          <input
            type="file"
            ref={fileInputRef}
            className="hidden"
            accept=".csv"
            onChange={handleCSVImport}
          />
        </div>
      </div>

      {/* Search & Medium Filter */}
      <div className="flex flex-col sm:flex-row gap-3 mb-6">
        <div className="relative flex-1">
          <Search
            size={18}
            className="absolute left-3 top-1/2 -translate-y-1/2 text-secondary"
          />
          <input
            type="text"
            placeholder="Search courses..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full border border-secondary-light rounded-lg pl-10 pr-4 py-2.5 text-sm focus:ring-1 focus:ring-primary focus:border-primary outline-none placeholder-secondary-light"
          />
        </div>
        <select
          value={mediumFilter}
          onChange={(e) => setMediumFilter(e.target.value)}
          className="border border-secondary-light rounded-lg p-2.5 text-sm focus:ring-1 focus:ring-primary outline-none"
        >
          <option value="">All Mediums</option>
          {mediums.map((m) => (
            <option key={m.id} value={m.id}>{m.name}</option>
          ))}
        </select>
      </div>

      {/* Courses Table */}
      <div className="bg-white rounded-xl shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[600px]">
            <thead className="bg-slate-100 border-b border-secondary-light">
              <tr>
                <th className="p-3 text-left text-sm font-montserrat text-secondary-dark">Course Name</th>
                <th className="text-left text-sm font-montserrat text-secondary-dark">Medium</th>
                <th className="text-left text-sm font-montserrat text-secondary-dark">Duration</th>
                <th className="text-left text-sm font-montserrat text-secondary-dark">Description</th>
                <th className="text-left text-sm font-montserrat text-secondary-dark">Actions</th>
              </tr>
            </thead>
            <tbody>
              {coursesLoading ? (
                <tr>
                  <td colSpan={5} className="p-6 text-center text-secondary">Loading courses…</td>
                </tr>
              ) : courses.length === 0 ? (
                <tr>
                  <td colSpan={5} className="p-6 text-center text-secondary">
                    <div className="flex flex-col items-center gap-2">
                      <BookOpen size={32} className="text-secondary-light" />
                      <span>No courses found</span>
                      <span className="text-xs text-secondary-light">
                        {search || mediumFilter ? "Try adjusting your filters" : "Add a new course to get started"}
                      </span>
                    </div>
                  </td>
                </tr>
              ) : (
                courses.map((course) => (
                  <React.Fragment key={course.id}>
                    <tr className="border-b border-secondary-light hover:bg-primary-bg transition">
                      <td className="p-3 text-sm font-medium">{course.course_name}</td>
                      <td className="text-sm">{course.medium_name || "-"}</td>
                      <td className="text-sm">{course.duration_months ? `${course.duration_months} Months` : "-"}</td>
                      <td className="text-sm text-secondary-dark">{course.description || "-"}</td>
                      <td className="text-sm">
                        <div className="flex gap-2">
                          <button onClick={() => setEditing(course)} className="text-blue-600 hover:underline">
                            <Edit3 size={15} />
                          </button>
                          <button onClick={() => handleDelete(course.id)} className="text-red-600 hover:underline">
                            <Trash2 size={15} />
                          </button>
                          <button
                            onClick={() => toggleLevels(course.id)}
                            className="text-indigo-600 hover:underline flex items-center gap-1"
                          >
                            <Layers size={15} /> Levels
                          </button>
                        </div>
                      </td>
                    </tr>
                    {/* Level sub-table */}
                    {expandedCourseId === course.id && (
                      <tr className="bg-secondary-bg">
                        <td colSpan={5} className="p-4">
                          <div className="flex justify-between items-center mb-3">
                            <h4 className="font-semibold text-primary-dark font-righteous text-sm">
                              Levels for {course.course_name}
                            </h4>
                            <button
                              onClick={() => setLevelForm({ courseId: course.id, initialData: null })}
                              className="bg-primary hover:bg-primary-light text-white px-3 py-1 rounded text-xs font-montserrat"
                            >
                              + Add Level
                            </button>
                          </div>
                          {!levelsMap[course.id] || levelsMap[course.id].length === 0 ? (
                            <p className="text-sm text-secondary">No levels defined yet.</p>
                          ) : (
                            <div className="overflow-x-auto">
                              <table className="w-full bg-white rounded border border-secondary-light">
                                <thead className="bg-slate-50">
                                  <tr className="text-left text-xs font-montserrat text-secondary-dark">
                                    <th className="p-2">#</th>
                                    <th className="p-2">Name</th>
                                    <th className="p-2">Duration</th>
                                    <th className="p-2">Certificate</th>
                                    <th className="p-2">Actions</th>
                                  </tr>
                                </thead>
                                <tbody>
                                  {levelsMap[course.id].map((level) => (
                                    <tr key={level.id} className="border-t border-secondary-light">
                                      <td className="p-2 text-sm">{level.level_number}</td>
                                      <td className="p-2 text-sm">{level.level_name}</td>
                                      <td className="p-2 text-sm">
                                        {level.duration_months ? `${level.duration_months}mo` : "-"}
                                      </td>
                                      <td className="p-2 text-sm">{level.certificate_eligible ? "Yes" : "No"}</td>
                                      <td className="p-2 text-sm space-x-2">
                                        <button
                                          onClick={() => setLevelForm({ courseId: course.id, initialData: level })}
                                          className="text-blue-600 hover:underline"
                                        >
                                          <Edit3 size={14} />
                                        </button>
                                        <button
                                          onClick={() => deleteLevelMutation.mutate(level.id)}
                                          className="text-red-600 hover:underline"
                                        >
                                          <Trash2 size={14} />
                                        </button>
                                      </td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            </div>
                          )}
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Load More */}
      {hasNextPage && (
        <div className="flex justify-center mt-6">
          <button
            onClick={() => fetchNextPage()}
            disabled={isFetchingNextPage}
            className="bg-primary hover:bg-primary-light text-white px-6 py-2.5 rounded-lg font-montserrat text-sm transition disabled:opacity-60"
          >
            {isFetchingNextPage ? "Loading more…" : "Load More"}
          </button>
        </div>
      )}

      {/* Course Form Modal */}
      {showForm && <CourseForm onSubmit={handleCreate} onClose={() => setShowForm(false)} />}
      {editing && <CourseForm initialData={editing} onSubmit={handleUpdate} onClose={() => setEditing(null)} />}
      {/* Level Form Modal */}
      {levelForm && (
        <CourseLevelForm
          courseId={levelForm.courseId}
          initialData={levelForm.initialData || {}}
          onSubmit={(payload) => {
            if (levelForm.initialData?.id) {
              updateLevelMutation.mutate({ id: levelForm.initialData.id, payload });
            } else {
              createLevelMutation.mutate(payload);
            }
          }}
          onClose={() => setLevelForm(null)}
        />
      )}
    </AdminLayout>
  );
}