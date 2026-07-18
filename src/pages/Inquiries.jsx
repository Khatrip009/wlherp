// src/pages/Inquiries.jsx
import React, { useState, useRef } from "react"; 
import { useNavigate } from "react-router-dom";
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
  Calendar as CalendarIcon,
  ThumbsDown,
  PhoneCall,
  FileText,
} from "lucide-react";
import Papa from "papaparse";
import InquiryForm from "../components/InquiryForm";
import BackButton from "../components/BackButton";
import StudentForm from "../components/StudentForm";
import {
  getInquiries,
  createInquiry,
  updateInquiry,
  deleteInquiry,
  getAllInquiriesForExport,
  getCourseOptions,
  getMediumOptions,
  scheduleDemo,
  rejectInquiry,
} from "../services/inquiryService";
import { useOrg } from "../context/OrganizationContext";

// ── Reject Modal ──
function RejectModal({ inquiry, onConfirm, onClose }) {
  const [reason, setReason] = useState("");
  const handleSubmit = (e) => {
    e.preventDefault();
    if (!reason.trim()) {
      toast.error("Rejection reason is required");
      return;
    }
    onConfirm(inquiry.id, reason);
  };
  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl w-full max-w-md shadow-xl">
        <div className="px-6 py-4 border-b border-secondary-light flex justify-between items-center">
          <h3 className="font-righteous text-lg">Reject Inquiry</h3>
          <button onClick={onClose} className="text-secondary-dark hover:text-primary">
            <X size={20} />
          </button>
        </div>
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          <div>
            <label className="block text-sm font-montserrat text-secondary-dark mb-1">
              Reason for rejection *
            </label>
            <textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              rows={4}
              className="w-full border border-secondary-light rounded p-2.5 focus:ring-1 focus:ring-primary focus:border-primary outline-none placeholder-secondary-light"
              placeholder="Why is this inquiry being rejected?"
              required
            />
          </div>
          <div className="flex gap-3 justify-end">
            <button
              type="button"
              onClick={onClose}
              className="border border-secondary-light text-secondary-dark px-4 py-2 rounded-lg hover:bg-secondary-bg transition"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="bg-red-600 hover:bg-red-700 text-white px-4 py-2 rounded-lg transition"
            >
              Reject
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ── Schedule Demo Modal ──
function ScheduleDemoModal({ inquiry, onConfirm, onClose }) {
  const [datetime, setDatetime] = useState("");
  const handleSubmit = (e) => {
    e.preventDefault();
    if (!datetime) {
      toast.error("Please select a date and time");
      return;
    }
    onConfirm(inquiry.id, new Date(datetime).toISOString());
  };
  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl w-full max-w-md shadow-xl">
        <div className="px-6 py-4 border-b border-secondary-light flex justify-between items-center">
          <h3 className="font-righteous text-lg">Schedule Demo</h3>
          <button onClick={onClose} className="text-secondary-dark hover:text-primary">
            <X size={20} />
          </button>
        </div>
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          <div>
            <label className="block text-sm font-montserrat text-secondary-dark mb-1">
              Demo Date & Time *
            </label>
            <input
              type="datetime-local"
              value={datetime}
              onChange={(e) => setDatetime(e.target.value)}
              className="w-full border border-secondary-light rounded p-2.5 focus:ring-1 focus:ring-primary focus:border-primary outline-none"
              required
            />
          </div>
          <div className="flex gap-3 justify-end">
            <button
              type="button"
              onClick={onClose}
              className="border border-secondary-light text-secondary-dark px-4 py-2 rounded-lg hover:bg-secondary-bg transition"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="bg-primary hover:bg-primary-light text-white px-4 py-2 rounded-lg transition"
            >
              Schedule
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ── Main Page ──
export default function Inquiries() {
  const navigate = useNavigate();
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
  const [showRejectModal, setShowRejectModal] = useState(null);
  const [showScheduleModal, setShowScheduleModal] = useState(null);
  const [showStudentForm, setShowStudentForm] = useState(false);
  const [studentFormInquiryId, setStudentFormInquiryId] = useState(null);
  const fileInputRef = useRef(null);

  // ── Data fetching ──
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

  // Dropdowns
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

  // ── Mutations ──
  const createMutation = useMutation({
    mutationFn: async (payload) => {
      const clean = cleanPayload(payload);
      return createInquiry(clean, { branchId, financialYearId });
    },
    onSuccess: () => {
      toast.success("Inquiry created");
      queryClient.invalidateQueries({ queryKey: ["inquiries"] });
      setShowForm(false);
    },
    onError: (err) => toast.error("Failed to create: " + err.message),
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, payload }) =>
      updateInquiry(id, cleanPayload(payload), { branchId, financialYearId }),
    onSuccess: () => {
      toast.success("Inquiry updated");
      queryClient.invalidateQueries({ queryKey: ["inquiries"] });
      setEditing(null);
    },
    onError: (err) => toast.error("Failed to update: " + err.message),
  });

  const deleteMutation = useMutation({
    mutationFn: (id) => deleteInquiry(id, { branchId, financialYearId }),
    onSuccess: () => {
      toast.success("Inquiry deleted");
      queryClient.invalidateQueries({ queryKey: ["inquiries"] });
    },
    onError: (err) => toast.error("Failed to delete: " + err.message),
  });

  const scheduleMutation = useMutation({
    mutationFn: ({ id, datetime }) => scheduleDemo(id, datetime, { branchId, financialYearId }),
    onSuccess: () => {
      toast.success("Demo scheduled");
      queryClient.invalidateQueries({ queryKey: ["inquiries"] });
      setShowScheduleModal(null);
    },
    onError: (err) => toast.error("Failed to schedule demo: " + err.message),
  });

  const rejectMutation = useMutation({
    mutationFn: ({ id, reason }) => rejectInquiry(id, reason, { branchId, financialYearId }),
    onSuccess: () => {
      toast.success("Inquiry rejected");
      queryClient.invalidateQueries({ queryKey: ["inquiries"] });
      setShowRejectModal(null);
    },
    onError: (err) => toast.error("Failed to reject: " + err.message),
  });

  // ── CSV Import ──
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
            });
            await createInquiry(payload, { branchId, financialYearId });
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

  // ── CSV Export ──
  async function handleCSVExport() {
    try {
      const allData = await getAllInquiriesForExport(allFilters, branchId, financialYearId);
      const csv = Papa.unparse(
        allData.map((inq) => ({
          inquiry_no: inq.inquiry_no,
          student_name: inq.student_name,
          parent_name: inq.parent_name,
          mobile: inq.mobile,
          whatsapp: inq.whatsapp,
          email: inq.email,
          interested_course: courses.find((c) => c.id === inq.interested_course_id)?.course_name,
          medium: inq.medium_name || "",
          source: inq.source,
          status: inq.status,
          followup_date: inq.followup_date,
          demo_scheduled_at: inq.demo_scheduled_at,
          rejection_reason: inq.rejection_reason,
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

  // ── Handlers ──
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

  function handleSchedule(inquiry) {
    if (inquiry.status === "Admitted" || inquiry.status === "Rejected") {
      toast.error("Cannot schedule demo for admitted/rejected inquiry");
      return;
    }
    setShowScheduleModal(inquiry);
  }

  function handleReject(inquiry) {
    if (inquiry.status === "Admitted" || inquiry.status === "Rejected") {
      toast.error("Cannot reject admitted/rejected inquiry");
      return;
    }
    setShowRejectModal(inquiry);
  }

  function getCourseName(courseId) {
    const course = courses.find((c) => c.id === courseId);
    return course ? course.course_name : "—";
  }

  function getStatusBadge(status) {
    const map = {
      "Interested": "bg-blue-100 text-blue-700",
      "Demo Scheduled": "bg-yellow-100 text-yellow-700",
      "Admitted": "bg-green-100 text-green-700",
      "Rejected": "bg-red-100 text-red-700",
    };
    return map[status] || "bg-gray-100 text-gray-700";
  }

  return (
    <div className="p-6 max-w-7xl mx-auto">
      <BackButton to="/admissions-hub" label="Admissions Hub" />
      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-6 gap-4">
        <div>
          <h1 className="text-3xl font-righteous text-primary-dark">Inquiries</h1>
          <p className="text-sm text-secondary-dark font-montserrat mt-1">
            Manage prospective student inquiries
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            onClick={() => setShowForm(true)}
            disabled={!isBranchReady}
            className="bg-primary hover:bg-primary-light text-white px-5 py-2.5 rounded-lg transition font-montserrat text-sm flex items-center gap-2 disabled:opacity-50"
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
          {/* NEW: Pipeline Report button */}
          <button
            onClick={() => navigate("/reports/admission_pipeline")}
            className="border border-secondary-light px-4 py-2.5 rounded-lg text-secondary-dark hover:bg-secondary-bg font-montserrat text-sm flex items-center gap-2"
          >
            <FileText size={18} /> Pipeline Report
          </button>
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
            <label className="text-xs font-montserrat text-secondary-dark">Status</label>
            <select
              value={filters.status}
              onChange={(e) => setFilters((prev) => ({ ...prev, status: e.target.value }))}
              className="w-full border border-secondary-light rounded p-2 text-sm mt-1 focus:ring-1 focus:ring-primary"
            >
              <option value="">All Statuses</option>
              <option>Interested</option>
              <option>Demo Scheduled</option>
              <option>Admitted</option>
              <option>Rejected</option>
            </select>
          </div>
          <div>
            <label className="text-xs font-montserrat text-secondary-dark">Interested Course</label>
            <select
              value={filters.interested_course_id}
              onChange={(e) => setFilters((prev) => ({ ...prev, interested_course_id: e.target.value }))}
              className="w-full border border-secondary-light rounded p-2 text-sm mt-1 focus:ring-1 focus:ring-primary"
            >
              <option value="">All Courses</option>
              {courses.map((c) => (
                <option key={c.id} value={c.id}>{c.course_name}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="text-xs font-montserrat text-secondary-dark">Medium</label>
            <select
              value={filters.medium_id}
              onChange={(e) => setFilters((prev) => ({ ...prev, medium_id: e.target.value }))}
              className="w-full border border-secondary-light rounded p-2 text-sm mt-1 focus:ring-1 focus:ring-primary"
            >
              <option value="">All Mediums</option>
              {mediums.map((m) => (
                <option key={m.id} value={m.id}>{m.name}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="text-xs font-montserrat text-secondary-dark">Source</label>
            <input
              type="text"
              value={filters.source}
              onChange={(e) => setFilters((prev) => ({ ...prev, source: e.target.value }))}
              placeholder="e.g., Walk-in"
              className="w-full border border-secondary-light rounded p-2 text-sm mt-1 focus:ring-1 focus:ring-primary"
            />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="text-xs font-montserrat text-secondary-dark">From Date</label>
              <input
                type="date"
                value={filters.start_date}
                onChange={(e) => setFilters((prev) => ({ ...prev, start_date: e.target.value }))}
                className="w-full border border-secondary-light rounded p-2 text-sm mt-1 focus:ring-1 focus:ring-primary"
              />
            </div>
            <div>
              <label className="text-xs font-montserrat text-secondary-dark">To Date</label>
              <input
                type="date"
                value={filters.end_date}
                onChange={(e) => setFilters((prev) => ({ ...prev, end_date: e.target.value }))}
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
          <table className="w-full min-w-[900px]">
            <thead className="bg-slate-100 border-b border-secondary-light">
              <tr>
                <th className="p-3 text-left text-sm font-montserrat text-secondary-dark">Inquiry No</th>
                <th className="text-left text-sm font-montserrat text-secondary-dark">Student</th>
                <th className="text-left text-sm font-montserrat text-secondary-dark">Parent</th>
                <th className="text-left text-sm font-montserrat text-secondary-dark">Mobile</th>
                <th className="text-left text-sm font-montserrat text-secondary-dark">Course</th>
                <th className="text-left text-sm font-montserrat text-secondary-dark">Status</th>
                <th className="text-left text-sm font-montserrat text-secondary-dark">Actions</th>
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                <tr><td colSpan={7} className="p-6 text-center text-secondary">Loading inquiries…</td></tr>
              ) : inquiries.length === 0 ? (
                <tr>
                  <td colSpan={7} className="p-6 text-center text-secondary">
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
                inquiries.map((inquiry, idx) => (
                  <tr key={`${inquiry.id}-${idx}`} className="border-b border-secondary-light hover:bg-primary-bg transition">
                    <td className="p-3 text-sm font-medium">{inquiry.inquiry_no}</td>
                    <td className="text-sm">{inquiry.student_name}</td>
                    <td className="text-sm">{inquiry.parent_name || "-"}</td>
                    <td className="text-sm">{inquiry.mobile}</td>
                    <td className="text-sm">{getCourseName(inquiry.interested_course_id)}</td>
                    <td className="text-sm">
                      <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${getStatusBadge(inquiry.status)}`}>
                        {inquiry.status}
                      </span>
                      {inquiry.status === "Rejected" && inquiry.rejection_reason && (
                        <span className="block text-xs text-secondary-light mt-1" title={inquiry.rejection_reason}>
                          (reason given)
                        </span>
                      )}
                      {inquiry.demo_scheduled_at && inquiry.status === "Demo Scheduled" && (
                        <span className="block text-xs text-secondary-light mt-1">
                          {new Date(inquiry.demo_scheduled_at).toLocaleString()}
                        </span>
                      )}
                    </td>
                    <td className="text-sm">
                      <div className="flex flex-wrap gap-1">
                        <button
                          onClick={() => setEditing(inquiry)}
                          className="text-blue-600 hover:underline flex items-center gap-1"
                        >
                          <Edit3 size={15} />
                        </button>
                        <button
                          onClick={() => handleSchedule(inquiry)}
                          disabled={inquiry.status === "Admitted" || inquiry.status === "Rejected"}
                          className={`text-amber-600 hover:underline flex items-center gap-1 ${
                            (inquiry.status === "Admitted" || inquiry.status === "Rejected") && "opacity-50 cursor-not-allowed"
                          }`}
                        >
                          <CalendarIcon size={15} />
                        </button>
                        <button
                          onClick={() => {
                            setStudentFormInquiryId(inquiry.id);
                            setShowStudentForm(true);
                          }}
                          disabled={inquiry.status === "Admitted" || inquiry.status === "Rejected"}
                          className={`text-green-600 hover:underline flex items-center gap-1 ${
                            (inquiry.status === "Admitted" || inquiry.status === "Rejected") && "opacity-50 cursor-not-allowed"
                          }`}
                        >
                          <UserPlus size={15} /> Convert
                        </button>
                        <button
                          onClick={() => handleReject(inquiry)}
                          disabled={inquiry.status === "Admitted" || inquiry.status === "Rejected"}
                          className={`text-red-600 hover:underline flex items-center gap-1 ${
                            (inquiry.status === "Admitted" || inquiry.status === "Rejected") && "opacity-50 cursor-not-allowed"
                          }`}
                        >
                          <ThumbsDown size={15} />
                        </button>
                        <button
                          onClick={() => handleDelete(inquiry.id)}
                          className="text-gray-500 hover:underline flex items-center gap-1"
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
      {showForm && <InquiryForm onSubmit={handleCreate} onClose={() => setShowForm(false)} />}
      {editing && <InquiryForm initialData={editing} onSubmit={handleUpdate} onClose={() => setEditing(null)} />}
      {showScheduleModal && (
        <ScheduleDemoModal
          inquiry={showScheduleModal}
          onConfirm={(id, datetime) => scheduleMutation.mutate({ id, datetime })}
          onClose={() => setShowScheduleModal(null)}
        />
      )}
      {showRejectModal && (
        <RejectModal
          inquiry={showRejectModal}
          onConfirm={(id, reason) => rejectMutation.mutate({ id, reason })}
          onClose={() => setShowRejectModal(null)}
        />
      )}
      {showStudentForm && (
        <StudentForm
          inquiryId={studentFormInquiryId}
          onSuccess={() => {
            queryClient.invalidateQueries({ queryKey: ["inquiries"] });
            setShowStudentForm(false);
            setStudentFormInquiryId(null);
          }}
          onClose={() => {
            setShowStudentForm(false);
            setStudentFormInquiryId(null);
          }}
        />
      )}
    </div>
  );
}