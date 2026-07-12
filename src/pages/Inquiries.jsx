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
  Edit3,
  Trash2,
  UserPlus,
  Filter,
  Download,
  Upload,
  X,
  PhoneCall,
} from "lucide-react";
import Papa from "papaparse";
import AdminLayout from "../layouts/AdminLayout";
import InquiryForm from "../components/InquiryForm";
import BackButton from "../components/BackButton";
import { convertInquiryToStudent } from "../services/admissionService";
import {
  getInquiries,
  createInquiry,
  updateInquiry,
  deleteInquiry,
  getAllInquiriesForExport,
  getCourseOptions,
  getMediumOptions,
} from "../services/inquiryService";
import { useOrg } from "../context/OrganizationContext";

export default function Inquiries() {
  const queryClient = useQueryClient();
  const { branch, selectedFinancialYear } = useOrg();
  const branchId = branch?.id;
  const financialYearId = selectedFinancialYear?.id;
  const isBranchReady = !!branchId && !!financialYearId;

  // Filters
  const [search, setSearch] = useState("");
  const [filters, setFilters] = useState({
    status: "",
    interested_course_id: "",
    medium_id: "",
    source: "",
    start_date: "",
    end_date: "",
  });
  const [showFilters, setShowFilters] = useState(false);
  const allFilters = { ...filters, search };

  // UI state
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState(null);
  const fileInputRef = useRef(null);

  // Paginated data – scoped to branch & FY
  const {
    data,
    isLoading,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
  } = useInfiniteQuery({
    queryKey: ["inquiries", allFilters, branchId, financialYearId],
    queryFn: ({ pageParam = 0 }) =>
      getInquiries({
        pageParam,
        filters: allFilters,
        branchId,
        financialYearId,
      }),
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
    staleTime: 2 * 60 * 1000,
    enabled: isBranchReady,
  });

  const inquiries = data?.pages.flatMap((page) => page.data) || [];

  // Dropdowns for filters (organisation‑wide, no scoping needed)
  const { data: courses = [] } = useQuery({
    queryKey: ["coursesDropdown"],
    queryFn: getCourseOptions,
    staleTime: 10 * 60 * 1000,
  });

  const { data: mediums = [] } = useQuery({
    queryKey: ["mediumsDropdown"],
    queryFn: getMediumOptions,
    staleTime: 10 * 60 * 1000,
  });

  // ── Helpers ──
  const cleanNullable = (value) => (value === "" ? null : value);
  const cleanPayload = (payload) => ({
    ...payload,
    inquiry_no: payload.inquiry_no || "INQ-" + Date.now(),
    followup_date: cleanNullable(payload.followup_date),
    interested_course_id: cleanNullable(payload.interested_course_id),
    medium_id: cleanNullable(payload.medium_id),
  });

  // ────────── Mutations ──────────
  const createMutation = useMutation({
    mutationFn: async (payload) => {
      const clean = cleanPayload(payload);
      return createInquiry(clean, {
        branchId,
        financialYearId,
      });
    },
    onSuccess: () => {
      toast.success("Inquiry created");
      queryClient.invalidateQueries({ queryKey: ["inquiries"] });
      setShowForm(false);
    },
    onError: (err) => {
      console.error("Create inquiry error:", err);
      toast.error("Failed to create inquiry: " + err.message);
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, payload }) =>
      updateInquiry(id, cleanPayload(payload), {
        branchId,
        financialYearId,
      }),
    onSuccess: () => {
      toast.success("Inquiry updated");
      queryClient.invalidateQueries({ queryKey: ["inquiries"] });
      setEditing(null);
    },
    onError: (err) => toast.error("Failed to update inquiry: " + err.message),
  });

  const deleteMutation = useMutation({
    mutationFn: (id) =>
      deleteInquiry(id, {
        branchId,
        financialYearId,
      }),
    onSuccess: () => {
      toast.success("Inquiry deleted");
      queryClient.invalidateQueries({ queryKey: ["inquiries"] });
    },
    onError: (err) => toast.error("Failed to delete inquiry: " + err.message),
  });

  const convertMutation = useMutation({
    mutationFn: (inquiry) =>
      convertInquiryToStudent(inquiry, {
        branchId,
        financialYearId,
      }),
    onSuccess: (result) => {
      if (result.success) {
        toast.success("Admission created successfully");
        queryClient.invalidateQueries({ queryKey: ["inquiries"] });
        queryClient.invalidateQueries({ queryKey: ["students"] });
      } else {
        toast.error("Conversion failed");
      }
    },
    onError: (err) => toast.error("Conversion error: " + err.message),
  });

  // CSV Import (with context)
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
            const payload = cleanPayload({
              student_name: row.student_name,
              parent_name: row.parent_name,
              mobile: row.mobile,
              whatsapp: row.whatsapp,
              email: row.email,
              interested_course_id: row.interested_course_id || "",
              medium_id: row.medium_id || "",
              source: row.source || "",
              remarks: row.remarks || "",
              followup_date: row.followup_date || "",
              status: row.status || "New",
            });
            await createInquiry(payload, {
              branchId,
              financialYearId,
            });
            successCount++;
          } catch (err) {
            console.error("CSV import error:", err);
          }
        }
        toast.success(`${successCount} inquiries imported`);
        queryClient.invalidateQueries({ queryKey: ["inquiries"] });
      },
      error: () => toast.error("CSV parsing error"),
    });
  }

  // CSV Export (with branch/FY scope)
  async function handleCSVExport() {
    try {
      const allData = await getAllInquiriesForExport(
        allFilters,
        branchId,
        financialYearId
      );
      const csv = Papa.unparse(
        allData.map((inq) => ({
          inquiry_no: inq.inquiry_no,
          student_name: inq.student_name,
          parent_name: inq.parent_name,
          mobile: inq.mobile,
          whatsapp: inq.whatsapp,
          email: inq.email,
          interested_course: courses.find(
            (c) => c.id === inq.interested_course_id
          )?.course_name,
          medium: inq.medium_name || "",
          source: inq.source,
          status: inq.status,
          followup_date: inq.followup_date,
          remarks: inq.remarks,
          created_at: inq.created_at,
        }))
      );
      const blob = new Blob([csv], { type: "text/csv" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "inquiries.csv";
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      toast.error("Export failed");
    }
  }

  // Handlers
  function handleCreate(payload) {
    createMutation.mutate(payload);
  }

  function handleUpdate(payload) {
    updateMutation.mutate({ id: editing.id, payload });
  }

  function handleDelete(id) {
    if (!window.confirm("Delete Inquiry?")) return;
    deleteMutation.mutate(id);
  }

  function handleConvert(inquiry) {
    if (inquiry.status === "Joined") {
      toast.error("This inquiry is already converted");
      return;
    }
    if (!window.confirm("Convert this inquiry into admission?")) return;
    convertMutation.mutate(inquiry);
  }

  function getCourseName(courseId) {
    const course = courses.find((c) => c.id === courseId);
    return course ? course.course_name : "—";
  }

  return (
    <AdminLayout>
      <BackButton to="/admissions-hub" label="Admissions Hub" />
      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-6 gap-4">
        <div>
          <h1 className="text-3xl font-righteous text-primary-dark">
            Inquiries
          </h1>
          <p className="text-sm text-secondary-dark font-montserrat mt-1">
            Manage prospective student inquiries
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            onClick={() => setShowForm(true)}
            disabled={!isBranchReady}
            className="bg-primary hover:bg-primary-light text-white px-5 py-2.5 rounded-lg transition font-montserrat text-sm flex items-center gap-2 disabled:opacity-50"
            title={!isBranchReady ? "Loading branch data…" : ""}
          >
            <PhoneCall size={18} /> New Inquiry
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
            placeholder="Search by student, parent, mobile, or inquiry no..."
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

      {/* Advanced Filters Panel */}
      {showFilters && (
        <div className="bg-white rounded-xl p-4 shadow-sm mb-4 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 border border-secondary-light">
          <div>
            <label className="text-xs font-montserrat text-secondary-dark">
              Status
            </label>
            <select
              value={filters.status}
              onChange={(e) =>
                setFilters((prev) => ({ ...prev, status: e.target.value }))
              }
              className="w-full border border-secondary-light rounded p-2 text-sm mt-1 focus:ring-1 focus:ring-primary"
            >
              <option value="">All Statuses</option>
              <option>New</option>
              <option>Contacted</option>
              <option>Demo Scheduled</option>
              <option>Interested</option>
              <option>Joined</option>
              <option>Closed</option>
            </select>
          </div>

          <div>
            <label className="text-xs font-montserrat text-secondary-dark">
              Interested Course
            </label>
            <select
              value={filters.interested_course_id}
              onChange={(e) =>
                setFilters((prev) => ({
                  ...prev,
                  interested_course_id: e.target.value,
                }))
              }
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
              Medium
            </label>
            <select
              value={filters.medium_id}
              onChange={(e) =>
                setFilters((prev) => ({ ...prev, medium_id: e.target.value }))
              }
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
              Source
            </label>
            <input
              type="text"
              value={filters.source}
              onChange={(e) =>
                setFilters((prev) => ({ ...prev, source: e.target.value }))
              }
              placeholder="e.g., Walk-in, Online"
              className="w-full border border-secondary-light rounded p-2 text-sm mt-1 focus:ring-1 focus:ring-primary"
            />
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="text-xs font-montserrat text-secondary-dark">
                From Date
              </label>
              <input
                type="date"
                value={filters.start_date}
                onChange={(e) =>
                  setFilters((prev) => ({
                    ...prev,
                    start_date: e.target.value,
                  }))
                }
                className="w-full border border-secondary-light rounded p-2 text-sm mt-1 focus:ring-1 focus:ring-primary"
              />
            </div>
            <div>
              <label className="text-xs font-montserrat text-secondary-dark">
                To Date
              </label>
              <input
                type="date"
                value={filters.end_date}
                onChange={(e) =>
                  setFilters((prev) => ({
                    ...prev,
                    end_date: e.target.value,
                  }))
                }
                className="w-full border border-secondary-light rounded p-2 text-sm mt-1 focus:ring-1 focus:ring-primary"
              />
            </div>
          </div>

          <div className="flex items-end">
            <button
              onClick={() => {
                setSearch("");
                setFilters({
                  status: "",
                  interested_course_id: "",
                  medium_id: "",
                  source: "",
                  start_date: "",
                  end_date: "",
                });
              }}
              className="text-primary text-sm hover:underline"
            >
              Clear Filters
            </button>
          </div>
        </div>
      )}

      {/* Table */}
      <div className="bg-white rounded-xl shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[800px]">
            <thead className="bg-slate-100 border-b border-secondary-light">
              <tr>
                <th className="p-3 text-left text-sm font-montserrat text-secondary-dark">
                  Inquiry No
                </th>
                <th className="text-left text-sm font-montserrat text-secondary-dark">
                  Student
                </th>
                <th className="text-left text-sm font-montserrat text-secondary-dark">
                  Parent
                </th>
                <th className="text-left text-sm font-montserrat text-secondary-dark">
                  Mobile
                </th>
                <th className="text-left text-sm font-montserrat text-secondary-dark">
                  Course
                </th>
                <th className="text-left text-sm font-montserrat text-secondary-dark">
                  Medium
                </th>
                <th className="text-left text-sm font-montserrat text-secondary-dark">
                  Status
                </th>
                <th className="text-left text-sm font-montserrat text-secondary-dark">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                <tr>
                  <td colSpan={8} className="p-6 text-center text-secondary">
                    Loading inquiries…
                  </td>
                </tr>
              ) : inquiries.length === 0 ? (
                <tr>
                  <td colSpan={8} className="p-6 text-center text-secondary">
                    <div className="flex flex-col items-center gap-2">
                      <PhoneCall size={32} className="text-secondary-light" />
                      <span>No inquiries found</span>
                      <span className="text-xs text-secondary-light">
                        {search || Object.values(filters).some(Boolean)
                          ? "Try adjusting your filters"
                          : "Add a new inquiry to get started"}
                      </span>
                    </div>
                  </td>
                </tr>
              ) : (
                inquiries.map((inquiry) => (
                  <tr
                    key={inquiry.id}
                    className="border-b border-secondary-light hover:bg-primary-bg transition"
                  >
                    <td className="p-3 text-sm font-medium">
                      {inquiry.inquiry_no}
                    </td>
                    <td className="text-sm">{inquiry.student_name}</td>
                    <td className="text-sm">{inquiry.parent_name || "-"}</td>
                    <td className="text-sm">{inquiry.mobile}</td>
                    <td className="text-sm">
                      {getCourseName(inquiry.interested_course_id)}
                    </td>
                    <td className="text-sm">
                      {inquiry.medium_name || "—"}
                    </td>
                    <td className="text-sm">
                      <span
                        className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                          inquiry.status === "New"
                            ? "bg-blue-100 text-blue-700"
                            : inquiry.status === "Contacted"
                            ? "bg-yellow-100 text-yellow-700"
                            : inquiry.status === "Interested"
                            ? "bg-orange-100 text-orange-700"
                            : inquiry.status === "Joined"
                            ? "bg-green-100 text-green-700"
                            : "bg-gray-100 text-gray-700"
                        }`}
                      >
                        {inquiry.status}
                      </span>
                    </td>
                    <td className="text-sm">
                      <div className="flex gap-2">
                        <button
                          onClick={() => setEditing(inquiry)}
                          className="text-blue-600 hover:underline flex items-center gap-1"
                        >
                          <Edit3 size={15} />
                        </button>
                        <button
                          onClick={() => handleConvert(inquiry)}
                          className="text-green-600 hover:underline flex items-center gap-1"
                        >
                          <UserPlus size={15} /> Convert
                        </button>
                        <button
                          onClick={() => handleDelete(inquiry.id)}
                          className="text-red-600 hover:underline flex items-center gap-1"
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

      {/* Modals */}
      {showForm && (
        <InquiryForm
          onSubmit={handleCreate}
          onClose={() => setShowForm(false)}
        />
      )}
      {editing && (
        <InquiryForm
          initialData={editing}
          onSubmit={handleUpdate}
          onClose={() => setEditing(null)}
        />
      )}
    </AdminLayout>
  );
} 