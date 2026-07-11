// src/pages/Students.jsx
import { useState, useRef } from "react";
import { useInfiniteQuery, useMutation, useQueryClient, useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import toast from "react-hot-toast";
import { Search, Plus, Edit3, Trash2, Download, Upload, X } from "lucide-react";
import Papa from "papaparse";
import AdminLayout from "../layouts/AdminLayout";
import ConfirmDialog from "../components/ConfirmDialog";
import BackButton from "../components/BackButton";
import StudentForm from "../components/StudentForm";
import { getStudents, createStudent, updateStudent, deleteStudent, getMediumOptions } from "../services/studentService";
import { useOrg } from "../context/OrganizationContext";   // NEW

export default function Students() {
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [filterMedium, setFilterMedium] = useState("");
  const [showModal, setShowModal] = useState(false);
  const [editingStudent, setEditingStudent] = useState(null);
  const [confirmDelete, setConfirmDelete] = useState(null);
  const fileInputRef = useRef(null);

  // ── Organisation / Branch / Financial Year context ──
  const { branch, selectedFinancialYear } = useOrg();
  const ctx = { branchId: branch?.id, financialYearId: selectedFinancialYear?.id };

  const { data: mediums = [] } = useQuery({
    queryKey: ["mediums-dropdown"],
    queryFn: getMediumOptions,
  });

  const {
    data,
    isLoading,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
  } = useInfiniteQuery({
    queryKey: ["students", search, filterMedium],
    queryFn: ({ pageParam = 0 }) =>
      getStudents({ pageParam, filters: { search, medium_id: filterMedium } }),
    getNextPageParam: (lastPage, allPages) => {
      const totalFetched = allPages.reduce((sum, page) => sum + page.data.length, 0);
      if (lastPage.count && totalFetched < lastPage.count) return allPages.length;
      return undefined;
    },
    initialPageParam: 0,
    staleTime: 2 * 60 * 1000,
  });

  const students = data?.pages.flatMap((page) => page.data) || [];

  // Mutations – now pass context
  const deleteMutation = useMutation({
    mutationFn: (id) => deleteStudent(id, ctx),
    onSuccess: () => {
      toast.success("Student deleted");
      queryClient.invalidateQueries(["students"]);
    },
    onError: (err) => toast.error(err.message),
  });

  const createMutation = useMutation({
    mutationFn: (payload) => createStudent(payload, ctx),
    onSuccess: () => {
      toast.success("Student added");
      queryClient.invalidateQueries(["students"]);
      setShowModal(false);
      setEditingStudent(null);
    },
    onError: (err) => toast.error(err.message || "Failed to add student"),
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, payload }) => updateStudent(id, payload, ctx),
    onSuccess: () => {
      toast.success("Student updated");
      queryClient.invalidateQueries(["students"]);
      setShowModal(false);
      setEditingStudent(null);
    },
    onError: (err) => toast.error(err.message || "Failed to update student"),
  });

  // CSV import – now passes context to createStudent
  const handleImport = (event) => {
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
              first_name: row.first_name,
              last_name: row.last_name,
              email: row.email,
              mobile: row.mobile,
              admission_no: row.admission_no,
              dob: row.date_of_birth || row.dob || null,
              gender: row.gender,
              address: row.address,
              standard: row.standard,
              medium_id: row.medium_id || null,
              status: row.status || "Active",
            };
            await createStudent(payload, ctx);
            successCount++;
          } catch (err) {
            console.error(err);
          }
        }
        toast.success(`${successCount} students imported`);
        queryClient.invalidateQueries(["students"]);
      },
      error: () => toast.error("CSV parsing error"),
    });
  };

  // Submit handler for StudentForm (create or update)
  const handleFormSubmit = async (payload, formContext) => {
    if (editingStudent) {
      await updateMutation.mutateAsync({ id: editingStudent.id, payload });
    } else {
      await createMutation.mutateAsync(payload);
    }
  };

  return (
    <AdminLayout>
      <BackButton to="/admissions-hub" label="Admissions Hub" />
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-6 gap-4">
        <h1 className="text-3xl font-righteous text-primary-dark">Students</h1>
        <div className="flex flex-wrap gap-2">
          <button
            onClick={() => { setEditingStudent(null); setShowModal(true); }}
            className="bg-primary text-white px-4 py-2 rounded-lg text-sm flex items-center gap-2"
          >
            <Plus size={16} /> Add Student
          </button>
          <button
            onClick={() => toast("Export functionality coming soon")}
            className="border px-4 py-2 rounded-lg text-sm flex items-center gap-2"
          >
            <Download size={16} /> Export
          </button>
          <button
            onClick={() => fileInputRef.current?.click()}
            className="border px-4 py-2 rounded-lg text-sm flex items-center gap-2"
          >
            <Upload size={16} /> Import
          </button>
          <input
            type="file"
            ref={fileInputRef}
            className="hidden"
            accept=".csv"
            onChange={handleImport}
          />
        </div>
      </div>

      {/* Search & Filters */}
      <div className="flex flex-col sm:flex-row gap-3 mb-4">
        <div className="relative flex-1">
          <Search size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-secondary" />
          <input
            type="text"
            placeholder="Search by name, admission no..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-10 pr-4 py-2.5 border rounded-lg text-sm"
          />
        </div>
        <select
          value={filterMedium}
          onChange={(e) => setFilterMedium(e.target.value)}
          className="border rounded-lg px-4 py-2.5 text-sm"
        >
          <option value="">All Mediums</option>
          {mediums.map((m) => (
            <option key={m.id} value={m.id}>{m.name}</option>
          ))}
        </select>
      </div>

      {/* Table */}
      <div className="bg-white rounded-xl shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[700px]">
            <thead className="bg-slate-100">
              <tr>
                <th className="p-3 text-left text-sm">Admission No</th>
                <th className="p-3 text-left text-sm">Name</th>
                <th className="p-3 text-left text-sm">Medium</th>
                <th className="p-3 text-left text-sm">Mobile</th>
                <th className="p-3 text-left text-sm">Status</th>
                <th className="p-3 text-left text-sm">Actions</th>
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                <tr><td colSpan={6} className="p-6 text-center text-secondary">Loading…</td></tr>
              ) : students.length === 0 ? (
                <tr><td colSpan={6} className="p-6 text-center text-secondary">No students found.</td></tr>
              ) : (
                students.map((student) => (
                  <tr key={student.id} className="border-t hover:bg-gray-50 transition">
                    <td className="p-3 text-sm">{student.admission_no || "—"}</td>
                    <td className="p-3 text-sm font-medium">
                      <Link to={`/students/${student.id}`} className="hover:text-primary">
                        {student.first_name} {student.last_name}
                      </Link>
                    </td>
                    <td className="p-3 text-sm">{student.medium_name || "—"}</td>
                    <td className="p-3 text-sm">{student.mobile || "—"}</td>
                    <td className="p-3 text-sm">
                      <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                        student.status === "Active" ? "bg-green-100 text-green-700" :
                        student.status === "Inactive" ? "bg-red-100 text-red-700" :
                        "bg-gray-100 text-gray-700"
                      }`}>{student.status || "Active"}</span>
                    </td>
                    <td className="p-3 text-sm">
                      <div className="flex gap-2">
                        <button
                          onClick={() => { setEditingStudent(student); setShowModal(true); }}
                          className="text-blue-600 hover:underline"
                        >
                          <Edit3 size={15} />
                        </button>
                        <button
                          onClick={() => setConfirmDelete(student.id)}
                          className="text-red-600 hover:underline"
                        >
                          <Trash2 size={15} />
                        </button>
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
        <div className="flex justify-center mt-4">
          <button
            onClick={() => fetchNextPage()}
            className="bg-primary text-white px-4 py-2 rounded-lg text-sm"
          >
            {isFetchingNextPage ? "Loading…" : "Load More"}
          </button>
        </div>
      )}

      {/* Student Form Modal (Add / Edit) */}
      {showModal && (
        <StudentForm
          initialData={editingStudent || {}}
          onSubmit={handleFormSubmit}   // now we pass onSubmit
          onSuccess={() => {
            queryClient.invalidateQueries(["students"]);
            setShowModal(false);
            setEditingStudent(null);
          }}
          onClose={() => {
            setShowModal(false);
            setEditingStudent(null);
          }}
        />
      )}

      {confirmDelete && (
        <ConfirmDialog
          message="Are you sure you want to delete this student?"
          onConfirm={() => { deleteMutation.mutate(confirmDelete); setConfirmDelete(null); }}
          onCancel={() => setConfirmDelete(null)}
        />
      )}
    </AdminLayout>
  );
}