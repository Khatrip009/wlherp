import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "../api/supabase";
import AdminLayout from "../layouts/AdminLayout";
import BackButton from "../components/BackButton";

import { useAuth } from "../context/AuthContext";
import { ExternalLink, BookOpen, Search, Filter } from "lucide-react";
import { useOrg } from "../context/OrganizationContext";   // NEW

export default function StudentLearningResources() {
  const { user } = useAuth();
  // Context import for consistency (page is read‑only)
  useOrg();

  // Filter states
  const [searchChapter, setSearchChapter] = useState("");
  const [filterSubject, setFilterSubject] = useState("");
  const [filterBoard, setFilterBoard] = useState("");
  const [filterType, setFilterType] = useState("");
  const [filterMedium, setFilterMedium] = useState("");
  const [showFilters, setShowFilters] = useState(false);

  // 1. Get student ID
  const { data: studentId } = useQuery({
    queryKey: ["student-id", user?.id],
    queryFn: async () => {
      const { data } = await supabase
        .from("students")
        .select("id")
        .eq("user_id", user.id)
        .maybeSingle();
      return data?.id || null;
    },
    enabled: !!user?.id,
  });

  // 2. Get active batch IDs
  const { data: batchIds = [] } = useQuery({
    queryKey: ["student-batch-ids", studentId],
    queryFn: async () => {
      if (!studentId) return [];
      const { data } = await supabase
        .from("student_batches")
        .select("batch_id")
        .eq("student_id", studentId)
        .eq("status", "active");
      return data.map((row) => row.batch_id);
    },
    enabled: !!studentId,
  });

  // 3. Fetch all mediums for filter dropdown
  const { data: mediums = [] } = useQuery({
    queryKey: ["mediums-list"],
    queryFn: async () => {
      const { data } = await supabase
        .from("mediums")
        .select("id, name")
        .order("name");
      return data || [];
    },
  });

  // 4. Fetch resources for those batches – now includes medium name
  const { data: allResources = [], isLoading } = useQuery({
    queryKey: ["student-learning-resources", batchIds],
    queryFn: async () => {
      if (batchIds.length === 0) return [];

      // Get subjects from those batches
      const { data: batchSubjects } = await supabase
        .from("batches")
        .select("course_id, courses(subjects(id))")
        .in("id", batchIds);

      const subjectIds = [];
      batchSubjects?.forEach((batch) => {
        batch.courses?.subjects?.forEach((subj) => subjectIds.push(subj.id));
      });

      // Build the OR condition safely
      let orCondition = "";
      if (batchIds.length > 0)
        orCondition += `batch_id.in.(${batchIds.join(",")})`;
      if (subjectIds.length > 0) {
        if (orCondition) orCondition += ",";
        orCondition += `subject_id.in.(${subjectIds.join(",")})`;
      }

      if (!orCondition) return [];

      const { data } = await supabase
        .from("learning_resources")
        .select(
          "*, subjects(subject_name, courses(course_name)), batches(batch_name), mediums(name)"
        )
        .or(orCondition)
        .order("created_at", { ascending: false });

      return data || [];
    },
    enabled: batchIds.length > 0,
  });

  // Extract unique filter options from the fetched resources
  const uniqueSubjects = allResources
    .filter((r) => r.subjects)
    .reduce((acc, r) => {
      if (!acc.some((s) => s.id === r.subjects.id)) {
        acc.push({
          id: r.subjects.id,
          name: r.subjects.subject_name,
          course: r.subjects.courses?.course_name,
        });
      }
      return acc;
    }, []);

  const uniqueBoards = [...new Set(allResources.map((r) => r.board).filter(Boolean))];
  const uniqueTypes = [...new Set(allResources.map((r) => r.resource_type).filter(Boolean))];

  // Apply client‑side filters
  const resources = allResources.filter((r) => {
    if (searchChapter) {
      const chapterStr = r.chapter_title?.toLowerCase() || "";
      const chapterNo = r.chapter_no?.toString() || "";
      const term = searchChapter.toLowerCase();
      if (!chapterStr.includes(term) && !chapterNo.includes(term)) return false;
    }
    if (filterSubject && r.subject_id !== parseInt(filterSubject)) return false;
    if (filterBoard && r.board !== filterBoard) return false;
    if (filterType && r.resource_type !== filterType) return false;
    if (filterMedium && r.medium_id !== parseInt(filterMedium)) return false;
    return true;
  });

  return (
    <AdminLayout>
      <BackButton to="/student" label="My Dashboard" />
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-6 gap-4">
        <div>
          <h1 className="text-3xl font-righteous text-primary-dark">
            Learning Resources
          </h1>
          <p className="text-sm text-secondary-dark font-montserrat mt-1">
            Textbooks, assignments, and past papers for your courses
          </p>
        </div>
        <button
          onClick={() => setShowFilters(!showFilters)}
          className="border border-secondary-light px-4 py-2.5 rounded-lg text-secondary-dark hover:bg-secondary-bg text-sm flex items-center gap-2"
        >
          <Filter size={18} /> Filters {showFilters && <span>–</span>}
        </button>
      </div>

      {/* Filters */}
      <div className={`mb-6 space-y-3 ${showFilters ? "block" : "hidden"}`}>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
          <div className="relative">
            <Search
              size={16}
              className="absolute left-3 top-1/2 -translate-y-1/2 text-secondary"
            />
            <input
              type="text"
              placeholder="Search by chapter..."
              value={searchChapter}
              onChange={(e) => setSearchChapter(e.target.value)}
              className="w-full border border-secondary-light rounded-lg pl-10 pr-4 py-2.5 text-sm focus:ring-1 focus:ring-primary outline-none"
            />
          </div>
          <select
            value={filterSubject}
            onChange={(e) => setFilterSubject(e.target.value)}
            className="border border-secondary-light rounded-lg p-2.5 text-sm focus:ring-1 focus:ring-primary outline-none"
          >
            <option value="">All Subjects</option>
            {uniqueSubjects.map((subj) => (
              <option key={subj.id} value={subj.id}>
                {subj.name} {subj.course ? `(${subj.course})` : ""}
              </option>
            ))}
          </select>
          <select
            value={filterBoard}
            onChange={(e) => setFilterBoard(e.target.value)}
            className="border border-secondary-light rounded-lg p-2.5 text-sm focus:ring-1 focus:ring-primary outline-none"
          >
            <option value="">All Boards</option>
            {uniqueBoards.map((board) => (
              <option key={board} value={board}>
                {board}
              </option>
            ))}
          </select>
          <select
            value={filterType}
            onChange={(e) => setFilterType(e.target.value)}
            className="border border-secondary-light rounded-lg p-2.5 text-sm focus:ring-1 focus:ring-primary outline-none"
          >
            <option value="">All Types</option>
            {uniqueTypes.map((type) => (
              <option key={type} value={type}>
                {type
                  .replace("_", " ")
                  .replace(/\b\w/g, (l) => l.toUpperCase())}
              </option>
            ))}
          </select>
          {/* NEW: Medium filter */}
          <select
            value={filterMedium}
            onChange={(e) => setFilterMedium(e.target.value)}
            className="border border-secondary-light rounded-lg p-2.5 text-sm focus:ring-1 focus:ring-primary outline-none"
          >
            <option value="">All Mediums</option>
            {mediums.map((m) => (
              <option key={m.id} value={m.id}>
                {m.name}
              </option>
            ))}
          </select>
        </div>
      </div>

      {isLoading ? (
        <div className="p-8 text-center">Loading resources…</div>
      ) : resources.length === 0 ? (
        <div className="bg-white rounded-xl p-8 shadow-sm border border-secondary-light text-center">
          <BookOpen size={32} className="text-secondary-light mx-auto mb-2" />
          <p className="text-secondary">
            {allResources.length === 0
              ? "No learning resources available for your batches yet."
              : "No resources match your filters."}
          </p>
        </div>
      ) : (
        <div className="bg-white rounded-xl shadow-sm overflow-x-auto">
          <table className="w-full min-w-[600px]">
            <thead className="bg-slate-100">
              <tr>
                <th className="p-3 text-left text-sm font-montserrat">Subject</th>
                <th className="p-3 text-left text-sm font-montserrat">Chapter</th>
                <th className="p-3 text-left text-sm font-montserrat">Type</th>
                <th className="p-3 text-left text-sm font-montserrat">Medium / Board</th>
                <th className="p-3 text-left text-sm font-montserrat">Action</th>
              </tr>
            </thead>
            <tbody>
              {resources.map((r) => (
                <tr key={r.id} className="border-b hover:bg-gray-50">
                  <td className="p-3 text-sm">
                    {r.subjects?.subject_name}{" "}
                    {r.subjects?.courses?.course_name &&
                      `(${r.subjects.courses.course_name})`}
                  </td>
                  <td className="p-3 text-sm">
                    {r.chapter_no
                      ? `Ch ${r.chapter_no}: ${r.chapter_title || ""}`
                      : r.chapter_title || "—"}
                  </td>
                  <td className="p-3 text-sm capitalize">
                    {r.resource_type?.replace(/_/g, " ")}
                  </td>
                  <td className="p-3 text-sm">
                    {r.mediums?.name || r.medium || "—"} – {r.board}
                  </td>
                  <td className="p-3 text-sm">
                    <a
                      href={r.resource_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-primary hover:underline inline-flex items-center gap-1"
                    >
                      <ExternalLink size={16} /> Open
                    </a>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </AdminLayout>
  );
}