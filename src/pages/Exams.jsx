// src/pages/Exams.jsx
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
  Filter,
  Download,
  Upload,
  X,
  Award,
  Calendar,
  Layers,
} from "lucide-react";
import { useNavigate } from "react-router-dom";
import Papa from "papaparse";
import AdminLayout from "../layouts/AdminLayout";
import ExamForm from "../components/ExamForm";
import ConfirmDialog from "../components/ConfirmDialog";
import BackButton from "../components/BackButton";
import {
  getExams,
  createExam,
  updateExam,
  deleteExam,
  getBatchOptions,
  getCourseOptions,
  getMediumOptions,
  getAllExamsForExport,
} from "../services/examService";
import { useAuth } from "../context/AuthContext";
import { useOrg } from "../context/OrganizationContext";   // NEW

export default function Exams() {
  const { profile } = useAuth();
  const navigate = useNavigate();

  const role = (profile?.role || "").toLowerCase().replace(/\s+/g, "_");
  const isAdmin = role === "admin" || role === "super_admin";

  const queryClient = useQueryClient();

  // ── Organisation / Branch / Financial Year context ──
  const { branch, selectedFinancialYear } = useOrg();   // NEW
  const ctx = { branchId: branch?.id, financialYearId: selectedFinancialYear?.id };

  const [search, setSearch] = useState("");
  const [batchFilter, setBatchFilter] = useState("");
  const [courseFilter, setCourseFilter] = useState("");
  const [mediumFilter, setMediumFilter] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [showFilters, setShowFilters] = useState(false);
  const allFilters = {
    search,
    batchId: batchFilter,
    courseId: courseFilter,
    medium_id: mediumFilter,
    startDate,
    endDate,
  };

  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState(null);
  const [confirmDelete, setConfirmDelete] = useState(null);
  const fileInputRef = useRef(null);

  const { data: batches = [] } = useQuery({
    queryKey: ["batches-dropdown"],
    queryFn: getBatchOptions,
    staleTime: 10 * 60 * 1000,
  });
  const { data: courses = [] } = useQuery({
    queryKey: ["courses-dropdown"],
    queryFn: getCourseOptions,
    staleTime: 10 * 60 * 1000,
  });
  const { data: mediums = [] } = useQuery({
    queryKey: ["mediums-dropdown"],
    queryFn: getMediumOptions,
    staleTime: 10 * 60 * 1000,
  });

  const {
    data,
    isLoading,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
  } = useInfiniteQuery({
    queryKey: ["exams", allFilters],
    queryFn: ({ pageParam = 0 }) => getExams({ pageParam, filters: allFilters }),
    getNextPageParam: (lastPage, allPages) => {
      const totalFetched = allPages.reduce((sum, page) => sum + page.data.length, 0);
      if (lastPage.count && totalFetched < lastPage.count) {
        return allPages.length;
      }
      return undefined;
    },
    initialPageParam: 0,
    staleTime: 5 * 60 * 1000,
  });

  const exams = data?.pages.flatMap((page) => page.data) || [];

  // Mutations – now pass context
  const createMutation = useMutation({
    mutationFn: (payload) => createExam(payload, ctx),
    onSuccess: () => {
      toast.success("Exam created");
      queryClient.invalidateQueries({ queryKey: ["exams"] });
      setShowForm(false);
    },
    onError: () => toast.error("Failed to create exam"),
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, payload }) => updateExam(id, payload, ctx),
    onSuccess: () => {
      toast.success("Exam updated");
      queryClient.invalidateQueries({ queryKey: ["exams"] });
      setEditing(null);
    },
    onError: () => toast.error("Failed to update exam"),
  });

  const deleteMutation = useMutation({
    mutationFn: (id) => deleteExam(id, ctx),
    onSuccess: () => {
      toast.success("Exam deleted");
      queryClient.invalidateQueries({ queryKey: ["exams"] });
    },
    onError: () => toast.error("Delete failed"),
  });

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
              exam_name: row.exam_name,
              batch_id: row.batch_id ? Number(row.batch_id) : null,
              exam_date: row.exam_date,
              total_marks: row.total_marks ? Number(row.total_marks) : null,
            };
            await createExam(payload, ctx);   // pass context
            successCount++;
          } catch (err) {
            console.error(err);
          }
        }
        toast.success(`${successCount} exams imported`);
        queryClient.invalidateQueries({ queryKey: ["exams"] });
      },
      error: () => toast.error("CSV parsing error"),
    });
  }

  async function handleCSVExport() {
    try {
      const allData = await getAllExamsForExport(allFilters);
      const csv = Papa.unparse(
        allData.map((e) => ({
          exam_name: e.exam_name,
          batch: e.batches?.batch_name,
          course: e.batches?.courses?.course_name,
          medium: e.medium_name || "",
          exam_date: e.exam_date,
          total_marks: e.total_marks,
        }))
      );
      const blob = new Blob([csv], { type: "text/csv" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "exams.csv";
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      toast.error("Export failed");
    }
  }

  function handleCreate(payload) {
    createMutation.mutate(payload);
  }

  function handleUpdate(payload) {
    updateMutation.mutate({ id: editing.id, payload });
  }

  function handleDelete(id) {
    setConfirmDelete(id);
  }

  return (
    <AdminLayout>
      <BackButton to="/academics-hub" label="Academics Hub" />
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-6 gap-4">
        <div>
          <h1 className="text-3xl font-righteous text-primary-dark">Exams</h1>
          <p className="text-sm text-secondary-dark font-montserrat mt-1">
            Create and manage exams
          </p>
        </div>
        {isAdmin && (
          <div className="flex flex-wrap gap-2">
            <button
              onClick={() => setShowForm(true)}
              className="bg-primary hover:bg-primary-light text-white px-5 py-2.5 rounded-lg transition font-montserrat text-sm flex items-center gap-2"
            >
              <Award size={18} /> Add Exam
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
        )}
      </div>

      <div className="flex flex-col sm:flex-row gap-3 mb-4">
        <div className="relative flex-1">
          <Search
            size={18}
            className="absolute left-3 top-1/2 -translate-y-1/2 text-secondary"
          />
          <input
            type="text"
            placeholder="Search by exam or batch name..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full border border-secondary-light rounded-lg pl-10 pr-4 py-2.5 text-sm focus:ring-1 focus:ring-primary focus:border-primary outline-none placeholder-secondary-light"
          />
        </div>
        <button
          onClick={() => setShowFilters(!showFilters)}
          className="border border-secondary-light px-4 py-2.5 rounded-lg text-secondary-dark hover:bg-secondary-bg font-montserrat text-sm flex items-center gap-2"
        >
          <Filter size={18} /> Filters
          {showFilters && <X size={16} />}
        </button>
      </div>

      {showFilters && (
        <div className="bg-white rounded-xl p-4 shadow-sm mb-4 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4 border border-secondary-light">
          <div>
            <label className="text-xs font-montserrat text-secondary-dark">Batch</label>
            <select
              value={batchFilter}
              onChange={(e) => setBatchFilter(e.target.value)}
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
            <label className="text-xs font-montserrat text-secondary-dark">Course</label>
            <select
              value={courseFilter}
              onChange={(e) => setCourseFilter(e.target.value)}
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
            <label className="text-xs font-montserrat text-secondary-dark">Medium</label>
            <select
              value={mediumFilter}
              onChange={(e) => setMediumFilter(e.target.value)}
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
            <label className="text-xs font-montserrat text-secondary-dark">From Date</label>
            <input
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              className="w-full border border-secondary-light rounded p-2 text-sm mt-1 focus:ring-1 focus:ring-primary"
            />
          </div>
          <div className="flex items-end">
            <button
              onClick={() => {
                setSearch("");
                setBatchFilter("");
                setCourseFilter("");
                setMediumFilter("");
                setStartDate("");
                setEndDate("");
              }}
              className="text-primary text-sm hover:underline"
            >
              Clear Filters
            </button>
          </div>
        </div>
      )}

      <div className="bg-white rounded-xl shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[800px]">
            <thead className="bg-slate-100 border-b border-secondary-light">
              <tr>
                <th className="p-3 text-left text-sm font-montserrat text-secondary-dark">Exam</th>
                <th className="text-left text-sm font-montserrat text-secondary-dark">Batch</th>
                <th className="text-left text-sm font-montserrat text-secondary-dark">Course</th>
                <th className="text-left text-sm font-montserrat text-secondary-dark">Medium</th>
                <th className="text-left text-sm font-montserrat text-secondary-dark">Date</th>
                <th className="text-left text-sm font-montserrat text-secondary-dark">Total Marks</th>
                <th className="text-left text-sm font-montserrat text-secondary-dark">Actions</th>
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                <tr>
                  <td colSpan={7} className="p-6 text-center text-secondary">Loading exams…</td>
                </tr>
              ) : exams.length === 0 ? (
                <tr>
                  <td colSpan={7} className="p-6 text-center text-secondary">
                    <div className="flex flex-col items-center gap-2">
                      <Award size={32} className="text-secondary-light" />
                      <span>No exams found</span>
                      <span className="text-xs text-secondary-light">
                        {search || batchFilter || courseFilter || mediumFilter || startDate || endDate
                          ? "Try adjusting your filters"
                          : "Add a new exam to get started"}
                      </span>
                    </div>
                  </td>
                </tr>
              ) : (
                exams.map((exam) => (
                  <tr
                    key={exam.id}
                    className="border-b border-secondary-light hover:bg-primary-bg transition"
                  >
                    <td className="p-3 text-sm font-medium">{exam.exam_name}</td>
                    <td className="text-sm">{exam.batches?.batch_name}</td>
                    <td className="text-sm">{exam.batches?.courses?.course_name}</td>
                    <td className="text-sm">
                      {exam.medium_name ? (
                        <span className="bg-primary-bg text-primary px-2 py-0.5 rounded-full text-xs">
                          {exam.medium_name}
                        </span>
                      ) : "-"}
                    </td>
                    <td className="text-sm">{exam.exam_date}</td>
                    <td className="text-sm">{exam.total_marks || "-"}</td>
                    <td className="text-sm">
                      <div className="flex gap-2">
                        <button
                          onClick={() => navigate(`/results/enter/${exam.id}`)}
                          className="text-purple-600 hover:underline"
                        >
                          Results
                        </button>
                        {isAdmin && (
                          <>
                            <button
                              onClick={() => setEditing(exam)}
                              className="text-blue-600 hover:underline"
                            >
                              <Edit3 size={15} />
                            </button>
                            <button
                              onClick={() => handleDelete(exam.id)}
                              className="text-red-600 hover:underline"
                            >
                              <Trash2 size={15} />
                            </button>
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

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

      {confirmDelete && (
        <ConfirmDialog
          message="Delete this exam and all its results?"
          onConfirm={() => { deleteMutation.mutate(confirmDelete); setConfirmDelete(null); }}
          onCancel={() => setConfirmDelete(null)}
        />
      )}

      {isAdmin && showForm && (
        <ExamForm
          onSubmit={handleCreate}
          onClose={() => setShowForm(false)}
        />
      )}
      {isAdmin && editing && (
        <ExamForm
          initialData={editing}
          onSubmit={handleUpdate}
          onClose={() => setEditing(null)}
        />
      )}
    </AdminLayout>
  );
}