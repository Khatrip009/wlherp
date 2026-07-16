// src/pages/Subjects.jsx
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
  BookOpen,
  X,
} from "lucide-react";
import Papa from "papaparse";

import {
  getSubjects,
  getCoursesForDropdown,
  createSubject,
  updateSubject,
  deleteSubject,
  getAllSubjectsForExport,
} from "../services/subjectService";
import { useOrg } from "../context/OrganizationContext";   // NEW

export default function Subjects() {
  const queryClient = useQueryClient();

  // ── Organisation / Branch / Financial Year context ──
  const { branch, selectedFinancialYear } = useOrg();
  const branchId = branch?.id;
  const financialYearId = selectedFinancialYear?.id;
  const ctx = { branchId, financialYearId };

  // Search
  const [search, setSearch] = useState("");
  const filters = { search };

  // UI state
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState({ course_id: "", subject_name: "" });
  const fileInputRef = useRef(null);

  // Infinite query for subjects – now scoped with branch & FY
  const {
    data,
    isLoading,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
  } = useInfiniteQuery({
    queryKey: ["subjects", filters, branchId, financialYearId],
    queryFn: ({ pageParam = 0 }) =>
      getSubjects({ pageParam, filters, branchId, financialYearId }),
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

  const subjects = data?.pages.flatMap((page) => page.data) || [];

  // Course dropdown (organisation‑wide, no scoping needed)
  const { data: courses = [] } = useQuery({
    queryKey: ["courses-dropdown"],
    queryFn: getCoursesForDropdown,
    staleTime: 10 * 60 * 1000,
  });

  // Mutations – now pass context where needed
  const createMutation = useMutation({
    mutationFn: (payload) => createSubject(payload, ctx),
    onSuccess: () => {
      toast.success("Subject created");
      queryClient.invalidateQueries({ queryKey: ["subjects"] });
      setShowForm(false);
    },
    onError: () => toast.error("Failed to create subject"),
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, payload }) => updateSubject(id, payload, ctx),
    onSuccess: () => {
      toast.success("Subject updated");
      queryClient.invalidateQueries({ queryKey: ["subjects"] });
      setEditing(null);
    },
    onError: () => toast.error("Failed to update subject"),
  });

  const deleteMutation = useMutation({
    mutationFn: (id) => deleteSubject(id, branchId, financialYearId),   // scoped delete
    onSuccess: () => {
      toast.success("Subject deleted");
      queryClient.invalidateQueries({ queryKey: ["subjects"] });
    },
    onError: () => toast.error("Delete failed"),
  });

  // CSV Import – now passes context to createSubject
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
              course_id: row.course_id ? Number(row.course_id) : null,
              subject_name: row.subject_name,
            };
            await createSubject(payload, ctx);
            successCount++;
          } catch (err) {
            console.error(err);
          }
        }
        toast.success(`${successCount} subjects imported`);
        queryClient.invalidateQueries({ queryKey: ["subjects"] });
      },
      error: () => toast.error("CSV parsing error"),
    });
  }

  // CSV Export – now scoped with branch & FY
  async function handleCSVExport() {
    try {
      const allData = await getAllSubjectsForExport(
        filters,
        branchId,
        financialYearId
      );
      const csv = Papa.unparse(
        allData.map((s) => ({
          course: s.courses?.course_name,
          subject_name: s.subject_name,
        }))
      );
      const blob = new Blob([csv], { type: "text/csv" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "subjects.csv";
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      toast.error("Export failed");
    }
  }

  // Form helpers
  function openCreate() {
    setForm({ course_id: "", subject_name: "" });
    setEditing(null);
    setShowForm(true);
  }

  function openEdit(subject) {
    setForm({
      course_id: subject.course_id,
      subject_name: subject.subject_name,
    });
    setEditing(subject);
    setShowForm(true);
  }

  async function handleSubmit(e) {
    e.preventDefault();
    if (!form.course_id || !form.subject_name.trim()) {
      toast.error("Select a course and enter subject name");
      return;
    }
    if (editing) {
      updateMutation.mutate({ id: editing.id, payload: form });
    } else {
      createMutation.mutate(form);
    }
  }

  // Group subjects by course for display
  const grouped = subjects.reduce((acc, sub) => {
    const courseName = sub.courses?.course_name || "Unknown Course";
    if (!acc[courseName]) acc[courseName] = [];
    acc[courseName].push(sub);
    return acc;
  }, {});

  return (
    < >
      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-6 gap-4">
        <div>
          <h1 className="text-3xl font-righteous text-primary-dark">Subjects</h1>
          <p className="text-sm text-secondary-dark font-montserrat mt-1">
            Manage subjects for each course
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            onClick={openCreate}
            className="bg-primary hover:bg-primary-light text-white px-5 py-2.5 rounded-lg transition font-montserrat text-sm flex items-center gap-2"
          >
            <BookOpen size={18} /> Add Subject
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

      {/* Search */}
      <div className="relative mb-6 max-w-md">
        <Search
          size={18}
          className="absolute left-3 top-1/2 -translate-y-1/2 text-secondary"
        />
        <input
          type="text"
          placeholder="Search by subject or course name..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full border border-secondary-light rounded-lg pl-10 pr-4 py-2.5 text-sm focus:ring-1 focus:ring-primary focus:border-primary outline-none placeholder-secondary-light"
        />
      </div>

      {/* Subjects grouped by course */}
      {isLoading ? (
        <div className="text-center p-6 text-secondary">Loading subjects…</div>
      ) : Object.keys(grouped).length === 0 ? (
        <div className="text-center p-6 text-secondary bg-white rounded-xl shadow-sm">
          <BookOpen size={32} className="mx-auto text-secondary-light mb-2" />
          <span>No subjects found</span>
          <span className="text-xs text-secondary-light block">
            {search ? "Try adjusting your search" : "Add a new subject to get started"}
          </span>
        </div>
      ) : (
        Object.entries(grouped).map(([course, subs]) => (
          <div key={course} className="mb-8">
            <h2 className="text-lg font-righteous text-primary-dark mb-3 border-b border-secondary-light pb-2">
              {course}
            </h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {subs.map((sub) => (
                <div
                  key={sub.id}
                  className="bg-white rounded-xl p-4 shadow-sm border border-secondary-light hover:border-primary transition flex justify-between items-center"
                >
                  <span className="font-medium text-secondary-dark text-sm">
                    {sub.subject_name}
                  </span>
                  <div className="flex gap-2">
                    <button
                      onClick={() => openEdit(sub)}
                      className="text-blue-600 hover:underline"
                      title="Edit"
                    >
                      <Edit3 size={15} />
                    </button>
                    <button
                      onClick={() => {
                        if (!window.confirm("Delete this subject?")) return;
                        deleteMutation.mutate(sub.id);
                      }}
                      className="text-red-600 hover:underline"
                      title="Delete"
                    >
                      <Trash2 size={15} />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        ))
      )}

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

      {/* Subject Form Modal (branded) */}
      {showForm && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl w-full max-w-md shadow-xl">
            <div className="sticky top-0 bg-white border-b border-secondary-light px-6 py-4 flex items-center justify-between rounded-t-xl">
              <div className="flex items-center gap-3">
                <img
                  src="/ShreeVidhyaDark.png"
                  alt="ShreeVidhya Academy"
                  className="h-10 w-auto"
                />
                <h2 className="text-xl font-righteous text-primary-dark">
                  {editing ? "Edit Subject" : "Add Subject"}
                </h2>
              </div>
              <button
                onClick={() => setShowForm(false)}
                className="p-2 hover:bg-secondary-bg rounded-lg"
              >
                <X size={20} className="text-secondary-dark" />
              </button>
            </div>
            <form onSubmit={handleSubmit} className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-montserrat text-secondary-dark mb-1">
                  <BookOpen size={14} className="inline mr-1" /> Course *
                </label>
                <select
                  value={form.course_id}
                  onChange={(e) =>
                    setForm({ ...form, course_id: e.target.value })
                  }
                  className="w-full border border-secondary-light rounded p-2.5 focus:ring-1 focus:ring-primary focus:border-primary outline-none"
                  required
                >
                  <option value="">Select Course</option>
                  {courses.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.course_name}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-montserrat text-secondary-dark mb-1">
                  Subject Name *
                </label>
                <input
                  type="text"
                  placeholder="e.g., Mathematics"
                  value={form.subject_name}
                  onChange={(e) =>
                    setForm({ ...form, subject_name: e.target.value })
                  }
                  className="w-full border border-secondary-light rounded p-2.5 focus:ring-1 focus:ring-primary focus:border-primary outline-none placeholder-secondary-light"
                  required
                />
              </div>
              <div className="flex flex-col sm:flex-row-reverse gap-3 pt-2">
                <button
                  type="submit"
                  className="w-full sm:w-auto bg-primary hover:bg-primary-light text-white px-6 py-2.5 rounded-lg font-montserrat transition"
                >
                  {editing ? "Update" : "Create"}
                </button>
                <button
                  type="button"
                  onClick={() => setShowForm(false)}
                  className="w-full sm:w-auto border border-secondary-light text-secondary-dark hover:bg-secondary-bg px-6 py-2.5 rounded-lg font-montserrat transition"
                >
                  Cancel
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </ >
  );
}