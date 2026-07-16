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
  Download,
  Upload,
  Printer,
  UserRoundPlus,
  Mail,
  Link as LinkIcon,
  Unlink,
  Filter,
  X,
  CreditCard,
} from "lucide-react";
import Papa from "papaparse";
import TeacherForm from "../components/TeacherForm";
import BackButton from "../components/BackButton";
import {
  getTeachers,
  createTeacher,
  updateTeacher,
  deleteTeacher,
  getAllTeachersForExport,
  getMediumOptions,
  getCourseOptions,
  getCourseLevelOptions,
  getSubjectOptions,
} from "../services/teacherService";
import { generateTeacherResumePdf } from "../utils/teacherResumePdf";
import { generateIdCard } from "../utils/idCardPdf";
import { useOrg } from "../context/OrganizationContext";

export default function Employees() {
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [staffTypeFilter, setStaffTypeFilter] = useState("");
  const [mediumFilter, setMediumFilter] = useState("");
  const [courseFilter, setCourseFilter] = useState("");
  const [courseLevelFilter, setCourseLevelFilter] = useState("");
  const [subjectFilter, setSubjectFilter] = useState("");
  const [showFilters, setShowFilters] = useState(false);

  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState(null);
  const fileInputRef = useRef(null);

  // ── Get org, branch, FY, and theme from context ──
  const { branch, selectedFinancialYear, org, theme } = useOrg();
  const branchId = branch?.id;
  const financialYearId = selectedFinancialYear?.id;
  const ctx = { branchId, financialYearId };

  // Dropdown data for filters (organisation‑wide)
  const { data: mediums = [] } = useQuery({
    queryKey: ["mediums"],
    queryFn: getMediumOptions,
    staleTime: 10 * 60 * 1000,
  });
  const { data: courses = [] } = useQuery({
    queryKey: ["courses"],
    queryFn: getCourseOptions,
    staleTime: 10 * 60 * 1000,
  });
  const { data: courseLevels = [] } = useQuery({
    queryKey: ["courseLevels"],
    queryFn: getCourseLevelOptions,
    staleTime: 10 * 60 * 1000,
  });
  const { data: subjects = [] } = useQuery({
    queryKey: ["subjects"],
    queryFn: getSubjectOptions,
    staleTime: 10 * 60 * 1000,
  });

  const filters = {
    search,
    staff_type: staffTypeFilter,
    medium_id: mediumFilter,
    course_id: courseFilter,
    course_level_id: courseLevelFilter,
    subject_id: subjectFilter,
  };

  const {
    data,
    isLoading,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
  } = useInfiniteQuery({
    queryKey: ["employees", filters, branchId, financialYearId],
    queryFn: ({ pageParam = 0 }) =>
      getTeachers({ pageParam, filters, branchId, financialYearId }),
    getNextPageParam: (lastPage, allPages) => {
      const totalFetched = allPages.reduce(
        (sum, page) => sum + page.data.length,
        0
      );
      if (lastPage.count && totalFetched < lastPage.count) {
        return allPages.length;
      }
      return undefined;
    },
    initialPageParam: 0,
    enabled: !!branchId && !!financialYearId,
    staleTime: 5 * 60 * 1000,
  });

  const employees = data?.pages.flatMap((page) => page.data) || [];

  // Mutations
  const createMutation = useMutation({
    mutationFn: (payload) => createTeacher(payload, ctx),
    onSuccess: () => {
      toast.success("Employee created");
      queryClient.invalidateQueries({ queryKey: ["employees"] });
      setShowForm(false);
    },
    onError: () => toast.error("Failed to create employee"),
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, payload }) => updateTeacher(id, payload, ctx),
    onSuccess: () => {
      toast.success("Employee updated");
      queryClient.invalidateQueries({ queryKey: ["employees"] });
      setEditing(null);
    },
    onError: () => toast.error("Failed to update employee"),
  });

  const deleteMutation = useMutation({
    mutationFn: (id) => deleteTeacher(id, ctx),
    onSuccess: () => {
      toast.success("Employee deleted");
      queryClient.invalidateQueries({ queryKey: ["employees"] });
    },
    onError: () =>
      toast.error("Deletion failed. The employee may be assigned to a batch."),
  });

  // CSV import – already uses ctx
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
              employee_code: row.employee_code || null,
              first_name: row.first_name,
              last_name: row.last_name,
              mobile: row.mobile,
              email: row.email,
              qualification: row.qualification,
              joining_date: row.joining_date || null,
              salary: row.salary ? Number(row.salary) : null,
              status: row.status || "active",
              staff_type: row.staff_type || "teacher",
              department: row.department || "",
              designation: row.designation || "",
              date_of_birth: row.date_of_birth || null,
              gender: row.gender || "",
              emergency_contact: row.emergency_contact || "",
              bank_account_details: row.bank_account_details || null,
              medium_ids: row.medium_id ? [Number(row.medium_id)] : [],
              course_ids: row.course_id ? [Number(row.course_id)] : [],
            };
            await createTeacher(payload, ctx);
            successCount++;
          } catch (err) {
            console.error(err);
          }
        }
        toast.success(`${successCount} employees imported`);
        queryClient.invalidateQueries({ queryKey: ["employees"] });
      },
      error: () => toast.error("CSV parsing error"),
    });
  }

  async function handleCSVExport() {
    try {
      const allData = await getAllTeachersForExport(
        filters,
        branchId,
        financialYearId
      );
      const csv = Papa.unparse(
        allData.map((t) => ({
          employee_code: t.employee_code,
          first_name: t.first_name,
          last_name: t.last_name,
          mobile: t.mobile,
          email: t.email,
          qualification: t.qualification,
          joining_date: t.joining_date,
          salary: t.salary,
          status: t.status,
          staff_type: t.staff_type,
          department: t.department,
          designation: t.designation,
          date_of_birth: t.date_of_birth,
          gender: t.gender,
          emergency_contact: t.emergency_contact,
          bank_account_details:
            typeof t.bank_account_details === "object"
              ? JSON.stringify(t.bank_account_details)
              : t.bank_account_details,
          mediums: (t.mediums || []).join(", "),
          courses: (t.courses || []).join(", "),
          course_levels: (t.course_levels || []).join(", "),
          subjects: (t.subjects || []).join(", "),
        }))
      );
      const blob = new Blob([csv], { type: "text/csv" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "employees.csv";
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      toast.error("Export failed");
    }
  }

  async function handlePrintResume(teacherId) {
    try {
      await generateTeacherResumePdf(teacherId);
    } catch (err) {
      toast.error("Failed to generate resume PDF");
    }
  }

  // ── ID Card: pass org and theme ──────────────────────────
  async function handlePrintIdCard(teacherId) {
    try {
      await generateIdCard({
        type: "teacher",
        id: teacherId,
        org: org,      // pass organisation
        theme: theme,  // pass theme
      });
    } catch (err) {
      toast.error(err.message || "Failed to generate ID Card");
    }
  }

  function handleCreate(payload) {
    createMutation.mutate(payload);
  }

  function handleUpdate(payload) {
    updateMutation.mutate({ id: editing.id, payload });
  }

  function handleDelete(id) {
    if (!window.confirm("Delete this employee?")) return;
    deleteMutation.mutate(id);
  }

  const truncateId = (uuid) =>
    uuid ? `${uuid.substring(0, 8)}...${uuid.substring(uuid.length - 4)}` : null;

  const formatStaffType = (type) => {
    const types = {
      teacher: "Teacher",
      admin: "Administrator",
      accountant: "Accountant",
      librarian: "Librarian",
      support: "Support Staff",
      other: "Other",
    };
    return types[type] || type || "—";
  };

  return (
    <>
      <BackButton to="/hr-hub" label="HR & Staff Hub" />
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-6 gap-4">
        <div>
          <h1 className="text-3xl font-righteous text-primary-dark">Employees</h1>
          <p className="text-sm text-secondary-dark font-montserrat mt-1">
            Manage all staff members
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            onClick={() => setShowForm(true)}
            className="bg-primary hover:bg-primary-light text-white px-5 py-2.5 rounded-lg transition font-montserrat text-sm flex items-center gap-2"
          >
            <UserRoundPlus size={18} /> Add Employee
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

      {/* Search & Filter Toggle */}
      <div className="flex flex-col sm:flex-row gap-3 mb-4">
        <div className="relative flex-1">
          <Search
            size={18}
            className="absolute left-3 top-1/2 -translate-y-1/2 text-secondary"
          />
          <input
            type="text"
            placeholder="Search by name or code..."
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

      {/* Filter Panel */}
      {showFilters && (
        <div className="bg-white rounded-xl p-4 shadow-sm mb-4 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 border border-secondary-light">
          <div>
            <label className="text-xs font-montserrat text-secondary-dark">Staff Type</label>
            <select
              value={staffTypeFilter}
              onChange={(e) => setStaffTypeFilter(e.target.value)}
              className="w-full border border-secondary-light rounded p-2 text-sm mt-1 focus:ring-1 focus:ring-primary"
            >
              <option value="">All Types</option>
              <option value="teacher">Teacher</option>
              <option value="admin">Administrator</option>
              <option value="accountant">Accountant</option>
              <option value="librarian">Librarian</option>
              <option value="support">Support Staff</option>
              <option value="other">Other</option>
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
                <option key={m.id} value={m.id}>{m.name}</option>
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
                <option key={c.id} value={c.id}>{c.course_name}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="text-xs font-montserrat text-secondary-dark">Course Level</label>
            <select
              value={courseLevelFilter}
              onChange={(e) => setCourseLevelFilter(e.target.value)}
              className="w-full border border-secondary-light rounded p-2 text-sm mt-1 focus:ring-1 focus:ring-primary"
            >
              <option value="">All Levels</option>
              {courseLevels.map((cl) => (
                <option key={cl.id} value={cl.id}>{cl.level_name}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="text-xs font-montserrat text-secondary-dark">Subject</label>
            <select
              value={subjectFilter}
              onChange={(e) => setSubjectFilter(e.target.value)}
              className="w-full border border-secondary-light rounded p-2 text-sm mt-1 focus:ring-1 focus:ring-primary"
            >
              <option value="">All Subjects</option>
              {subjects.map((s) => (
                <option key={s.id} value={s.id}>{s.subject_name}</option>
              ))}
            </select>
          </div>
          <div className="flex items-end col-span-full">
            <button
              onClick={() => {
                setSearch("");
                setStaffTypeFilter("");
                setMediumFilter("");
                setCourseFilter("");
                setCourseLevelFilter("");
                setSubjectFilter("");
              }}
              className="text-primary text-sm hover:underline"
            >
              Clear All Filters
            </button>
          </div>
        </div>
      )}

      {/* Table */}
      <div className="bg-white rounded-xl shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[1500px]">
            <thead className="bg-slate-100 border-b border-secondary-light">
              <tr>
                <th className="p-3 text-left text-sm font-montserrat text-secondary-dark">Code</th>
                <th className="text-left text-sm font-montserrat text-secondary-dark">Name</th>
                <th className="text-left text-sm font-montserrat text-secondary-dark">Type</th>
                <th className="text-left text-sm font-montserrat text-secondary-dark">Dept.</th>
                <th className="text-left text-sm font-montserrat text-secondary-dark">Designation</th>
                <th className="text-left text-sm font-montserrat text-secondary-dark">Mobile</th>
                <th className="text-left text-sm font-montserrat text-secondary-dark">Email</th>
                <th className="text-left text-sm font-montserrat text-secondary-dark">Linked Account</th>
                <th className="text-left text-sm font-montserrat text-secondary-dark">Qualification</th>
                <th className="text-left text-sm font-montserrat text-secondary-dark">Medium</th>
                <th className="text-left text-sm font-montserrat text-secondary-dark">Course</th>
                <th className="text-left text-sm font-montserrat text-secondary-dark">Course Levels</th>
                <th className="text-left text-sm font-montserrat text-secondary-dark">Subjects</th>
                <th className="text-left text-sm font-montserrat text-secondary-dark">Salary</th>
                <th className="text-left text-sm font-montserrat text-secondary-dark">Actions</th>
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                <tr>
                  <td colSpan={15} className="p-6 text-center text-secondary">Loading employees…</td>
                </tr>
              ) : employees.length === 0 ? (
                <tr>
                  <td colSpan={15} className="p-6 text-center text-secondary">
                    <div className="flex flex-col items-center gap-2">
                      <Search size={32} className="text-secondary-light" />
                      <span>No employees found</span>
                      <span className="text-xs text-secondary-light">
                        {search || staffTypeFilter || mediumFilter || courseFilter || courseLevelFilter || subjectFilter
                          ? "Try adjusting your filters"
                          : "Add a new employee to get started"}
                      </span>
                    </div>
                  </td>
                </tr>
              ) : (
                employees.map((emp) => (
                  <tr
                    key={emp.id}
                    className="border-b border-secondary-light hover:bg-primary-bg transition"
                  >
                    <td className="p-3 text-sm">{emp.employee_code || "-"}</td>
                    <td className="text-sm font-medium">
                      {emp.first_name} {emp.last_name}
                    </td>
                    <td className="text-sm">{formatStaffType(emp.staff_type)}</td>
                    <td className="text-sm">{emp.department || "—"}</td>
                    <td className="text-sm">{emp.designation || "—"}</td>
                    <td className="text-sm">{emp.mobile || "—"}</td>
                    <td className="text-sm">{emp.email || "—"}</td>
                    <td className="text-sm">
                      {emp.user_id ? (
                        <div className="flex items-center gap-1">
                          <LinkIcon size={14} className="text-green-600" />
                          <span
                            className="text-green-700 cursor-help"
                            title={emp.user_id}
                          >
                            {emp.email || truncateId(emp.user_id)}
                          </span>
                        </div>
                      ) : (
                        <div className="flex items-center gap-1 text-red-500">
                          <Unlink size={14} />
                          <span>Not linked</span>
                        </div>
                      )}
                    </td>
                    <td className="text-sm">{emp.qualification || "—"}</td>
                    <td className="text-sm">
                      {emp.mediums?.length > 0
                        ? emp.mediums.map((m) => m.name).join(", ")
                        : "—"}
                    </td>
                    <td className="text-sm">
                      {emp.courses?.length > 0
                        ? emp.courses.map((c) => c.name).join(", ")
                        : "—"}
                    </td>
                    <td className="text-sm">
                      {emp.course_levels?.length > 0
                        ? emp.course_levels.map((cl) => cl.name).join(", ")
                        : "—"}
                    </td>
                    <td className="text-sm">
                      {emp.subjects?.length > 0
                        ? emp.subjects.map((s) => s.name).join(", ")
                        : "—"}
                    </td>
                    <td className="text-sm">
                      {emp.salary
                        ? `₹${Number(emp.salary).toLocaleString()}`
                        : "—"}
                    </td>
                    <td className="text-sm">
                      <div className="flex gap-2 flex-wrap">
                        <button
                          onClick={() => setEditing(emp)}
                          className="text-blue-600 hover:underline"
                        >
                          Edit
                        </button>
                        <button
                          onClick={() => handleDelete(emp.id)}
                          className="text-red-600 hover:underline"
                        >
                          Delete
                        </button>
                        <button
                          onClick={() => handlePrintResume(emp.id)}
                          className="text-green-600 hover:underline flex items-center gap-1"
                        >
                          <Printer size={14} /> Resume
                        </button>
                        <button
                          onClick={() => handlePrintIdCard(emp.id)}
                          className="text-indigo-600 hover:underline flex items-center gap-1"
                        >
                          <CreditCard size={14} /> ID Card
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

      {showForm && (
        <TeacherForm
          onSubmit={handleCreate}
          onClose={() => setShowForm(false)}
        />
      )}
      {editing && (
        <TeacherForm
          initialData={editing}
          onSubmit={handleUpdate}
          onClose={() => setEditing(null)}
        />
      )}
    </>
  );
}