// src/pages/StudentBatches.jsx
import React, { useState, useRef, useMemo, useEffect } from "react";
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
  UserPlus,
  Mail,
} from "lucide-react";
import Papa from "papaparse";

import BackButton from "../components/BackButton";
import { supabase } from "../api/supabase";
import AssignBatchModal from "../components/AssignBatchModal";
import {
  getStudentBatches,
  assignStudentToBatch,
  updateStudentBatch,
  deleteStudentBatch,
  getAllStudentBatchesForExport,
  getActiveBatches,
  getCoursesForFilter,
} from "../services/batchAssignmentService";
import { useOrg } from "../context/OrganizationContext";
import { sendEmail, sendTemplateEmail } from "../services/emailService";

export default function StudentBatches({ studentId: propStudentId = null, standalone = true }) {
  const queryClient = useQueryClient();

  const { branch, selectedFinancialYear, org } = useOrg();
  const branchId = branch?.id;
  const financialYearId = selectedFinancialYear?.id;
  const ctx = { branchId, financialYearId };

  // ---- Filters ----
  const [search, setSearch] = useState("");
  const [filters, setFilters] = useState({
    batch_id: "",
    course_id: "",
    medium_id: "",
    status: "",
    student_id: propStudentId || "",
  });
  const [showFilters, setShowFilters] = useState(false);
  const allFilters = { ...filters, search };

  useEffect(() => {
    setFilters(prev => ({ ...prev, student_id: propStudentId || "" }));
  }, [propStudentId]);

  // ---- Helper: get admin emails ----
  const getAdminEmails = async () => {
    if (!org?.id) return [];
    const { data, error } = await supabase
      .from("profiles")
      .select("email")
      .eq("organization_id", org.id)
      .in("role", ["admin", "super_admin", "organization_admin"])
      .eq("is_active", true);
    if (error) {
      console.error("Failed to fetch admin emails:", error);
      return [];
    }
    return data?.map(p => p.email).filter(Boolean) || [];
  };

  // ---- Send Report Email ----
  const sendReportEmail = async () => {
    if (assignments.length === 0) {
      alert("No assignments to send.");
      return;
    }

    try {
      const adminEmails = await getAdminEmails();
      if (adminEmails.length === 0) {
        alert("No admin emails found.");
        return;
      }

      // Build HTML table rows
      let tableRows = assignments.map((a) => {
        const studentName = a.students ? `${a.students.first_name || ''} ${a.students.last_name || ''}`.trim() : '—';
        const admissionNo = a.students?.admission_no || '—';
        const batchName = a.batches?.batch_name || '—';
        const mediumName = mediumMap[a.batch_id] || '—';
        const courseName = a.batches?.courses?.course_name || '-';
        const enrollmentDate = a.enrollment_date || '—';
        const statusColor = a.status === "active" ? "#2e7d32" : a.status === "completed" ? "#1565C0" : "#757575";
        const statusBg = a.status === "active" ? "#e8f5e9" : a.status === "completed" ? "#e3f2fd" : "#f5f5f5";
        return `
          <tr>
            <td style="padding:4px 8px;border:1px solid #ddd;">${studentName}<br/><span style="font-size:10px;color:#888;">${admissionNo}</span></td>
            <td style="padding:4px 8px;border:1px solid #ddd;">${batchName}</td>
            <td style="padding:4px 8px;border:1px solid #ddd;">${mediumName}</td>
            <td style="padding:4px 8px;border:1px solid #ddd;">${courseName}</td>
            <td style="padding:4px 8px;border:1px solid #ddd;">${enrollmentDate}</td>
            <td style="padding:4px 8px;border:1px solid #ddd;">
              <span style="background:${statusBg};color:${statusColor};padding:2px 8px;border-radius:12px;font-size:10px;font-weight:600;">${a.status}</span>
            </td>
          </tr>
        `;
      }).join('');

      const htmlBody = `
        <div style="font-family:Arial,sans-serif;max-width:800px;margin:0 auto;">
          <h2 style="color:#0D47A1;">Student Batch Assignment Report</h2>
          <p><strong>Branch:</strong> ${branch?.branch_name || 'N/A'}</p>
          <p><strong>Total Assignments:</strong> ${assignments.length}</p>
          <hr />
          <table style="width:100%;border-collapse:collapse;font-size:11px;border:1px solid #ddd;">
            <thead style="background:#e3f2fd;">
              <tr>
                <th style="padding:4px 8px;border:1px solid #ddd;text-align:left;">Student</th>
                <th style="padding:4px 8px;border:1px solid #ddd;text-align:left;">Batch</th>
                <th style="padding:4px 8px;border:1px solid #ddd;text-align:left;">Medium</th>
                <th style="padding:4px 8px;border:1px solid #ddd;text-align:left;">Course</th>
                <th style="padding:4px 8px;border:1px solid #ddd;text-align:left;">Enrollment</th>
                <th style="padding:4px 8px;border:1px solid #ddd;text-align:left;">Status</th>
              </tr>
            </thead>
            <tbody>
              ${tableRows}
            </tbody>
          </table>
          <p style="color:#888;font-size:10px;margin-top:20px;">Computer‑generated report from ${org?.company_name || 'Academy'}</p>
        </div>
      `;

      await sendEmail({
        to: adminEmails,
        subject: `Student Batch Assignments - ${new Date().toLocaleDateString()}`,
        html: htmlBody,
       // from: org?.email || undefined,
      });

      alert("Report sent to admins.");
    } catch (err) {
      console.error("Failed to send report:", err);
      alert("Failed to send report. Check console for details.");
    }
  };

  // ---- Send Batch Change Notification ----
  const sendBatchChangeEmail = async (assignment) => {
    try {
      // 1. Fetch student details
      const studentId = assignment.student_id;
      const { data: student, error: studentError } = await supabase
        .from("students")
        .select("first_name, last_name, email")
        .eq("id", studentId)
        .single();
      if (studentError) throw studentError;

      // 2. Find parent email (fallback to student email)
      let recipientEmail = student.email;
      const { data: parent, error: parentError } = await supabase
        .from("student_parents")
        .select("parents!inner(email, father_name, mother_name)")
        .eq("student_id", studentId)
        .maybeSingle();
      if (!parentError && parent && parent.parents?.email) {
        recipientEmail = parent.parents.email;
      }

      if (!recipientEmail) {
        toast.error("No email found for this student or parent.");
        return;
      }

      // 3. Fetch old and new batch names
      const newBatchId = assignment.batch_id;
      const { data: newBatch, error: batchError } = await supabase
        .from("batches")
        .select("batch_name, course_id, courses(course_name)")
        .eq("id", newBatchId)
        .single();
      if (batchError) throw batchError;

      // For old batch, we may not know if it's a reassignment. We'll set it to "None" for manual resend.
      // But we can try to find an active batch that is not the current one.
      let oldBatchName = "None";
      // Check if this assignment is a replacement of an older one? We don't have context here.
      // We'll keep it simple: old batch is "None" (or we could fetch from assignment history if available).

      const context = {
        academyName: org?.company_name || "Academy",
        student_name: `${student.first_name || ''} ${student.last_name || ''}`.trim(),
        old_batch: oldBatchName,
        new_batch: newBatch.batch_name,
        effective_date: assignment.enrollment_date || new Date().toISOString().split("T")[0],
      };

      await sendTemplateEmail({
        to: recipientEmail,
        organizationId: org?.id,
        slug: "batch_change",
        context,
        branchId,
      });

      toast.success(`Batch change notification sent to ${recipientEmail}`);
    } catch (err) {
      console.error("Send batch change error:", err);
      toast.error("Failed to send notification.");
    }
  };

  // ---- Data fetching (unchanged) ----
  const {
    data,
    isLoading,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
  } = useInfiniteQuery({
    queryKey: ["studentBatches", allFilters, branchId, financialYearId],
    queryFn: ({ pageParam = 0 }) =>
      getStudentBatches({ pageParam, filters: allFilters, branchId, financialYearId }),
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

  const assignments = data?.pages.flatMap((page) => page.data) || [];

  // ---- Dropdowns ----
  const { data: batches = [] } = useQuery({
    queryKey: ["activeBatchesWithMedium", branchId, financialYearId],
    queryFn: () => getActiveBatches(branchId, financialYearId),
    enabled: !!branchId && !!financialYearId,
    staleTime: 10 * 60 * 1000,
  });

  const { data: courses = [] } = useQuery({
    queryKey: ["coursesFilter"],
    queryFn: getCoursesForFilter,
    staleTime: 10 * 60 * 1000,
  });

  const { data: mediums = [] } = useQuery({
    queryKey: ["mediums"],
    queryFn: async () => {
      const { data } = await supabase
        .from("mediums")
        .select("id, name")
        .order("name");
      return data || [];
    },
    staleTime: 10 * 60 * 1000,
  });

  const mediumMap = useMemo(() => {
    const map = {};
    batches.forEach((b) => {
      map[b.id] = b.mediums?.name || "";
    });
    return map;
  }, [batches]);

  // ---- Mutations ----
  const updateMutation = useMutation({
    mutationFn: ({ id, payload }) => updateStudentBatch(id, payload, ctx),
    onSuccess: () => {
      toast.success("Status updated");
      queryClient.invalidateQueries({ queryKey: ["studentBatches"] });
      setEditingId(null);
    },
    onError: () => toast.error("Update failed"),
  });

  const deleteMutation = useMutation({
    mutationFn: (id) => deleteStudentBatch(id, branchId, financialYearId),
    onSuccess: () => {
      toast.success("Assignment removed");
      queryClient.invalidateQueries({ queryKey: ["studentBatches"] });
    },
    onError: () => toast.error("Delete failed"),
  });

  // ---- UI state ----
  const [showModal, setShowModal] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [editStatus, setEditStatus] = useState("");
  const fileInputRef = useRef(null);

  // ---- CSV handlers ----
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
              student_id: row.student_id,
              batch_id: row.batch_id,
              enrollment_date:
                row.enrollment_date || new Date().toISOString().split("T")[0],
              status: row.status || "active",
            };
            await assignStudentToBatch(payload, ctx);
            successCount++;
          } catch (err) {
            console.error(err);
          }
        }
        toast.success(`${successCount} assignments imported`);
        queryClient.invalidateQueries({ queryKey: ["studentBatches"] });
      },
      error: () => toast.error("CSV parsing error"),
    });
  }

  async function handleCSVExport() {
    try {
      const allData = await getAllStudentBatchesForExport(allFilters, branchId, financialYearId);
      const csv = Papa.unparse(
        allData.map((a) => ({
          student: `${a.students?.first_name} ${a.students?.last_name}`,
          admission_no: a.students?.admission_no,
          batch: a.batches?.batch_name,
          medium: mediumMap[a.batch_id] || "",
          course: a.batches?.courses?.course_name,
          enrollment_date: a.enrollment_date,
          status: a.status,
        }))
      );
      const blob = new Blob([csv], { type: "text/csv" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "student_batches.csv";
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      toast.error("Export failed");
    }
  }

  // ---- Handlers ----
  function handleStatusUpdate(id, newStatus) {
    updateMutation.mutate({ id, payload: { status: newStatus } });
  }

  function handleDelete(id) {
    if (!window.confirm("Remove this student from the batch?")) return;
    deleteMutation.mutate(id);
  }

  // ---- Render ----
  const content = (
    <>
      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-6 gap-4">
        <div>
          <h1 className="text-3xl font-righteous text-primary-dark">
            Student Batches
          </h1>
          <p className="text-sm text-secondary-dark font-montserrat mt-1">
            Assign students to batches
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {/* 👇 Send Report button */}
          <button
            onClick={sendReportEmail}
            className="bg-green-600 hover:bg-green-700 text-white px-5 py-2.5 rounded-lg transition font-montserrat text-sm flex items-center gap-2"
          >
            <Mail size={18} /> Send Report
          </button>
          <button
            onClick={() => setShowModal(true)}
            className="bg-primary hover:bg-primary-light text-white px-5 py-2.5 rounded-lg transition font-montserrat text-sm flex items-center gap-2"
          >
            <UserPlus size={18} /> Assign to Batch
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
            placeholder="Search by student name..."
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
        <div className="bg-white rounded-xl p-4 shadow-sm mb-4 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4 border border-secondary-light">
          <div>
            <label className="text-xs font-montserrat text-secondary-dark">
              Batch
            </label>
            <select
              value={filters.batch_id}
              onChange={(e) =>
                setFilters((prev) => ({ ...prev, batch_id: e.target.value }))
              }
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
              Course
            </label>
            <select
              value={filters.course_id}
              onChange={(e) =>
                setFilters((prev) => ({ ...prev, course_id: e.target.value }))
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
              <option value="active">Active</option>
              <option value="completed">Completed</option>
              <option value="dropped">Dropped</option>
            </select>
          </div>
          <div className="flex items-end">
            <button
              onClick={() => {
                setSearch("");
                setFilters({
                  batch_id: "",
                  course_id: "",
                  medium_id: "",
                  status: "",
                  student_id: propStudentId || "",
                });
              }}
              className="text-primary text-sm hover:underline"
            >
              Clear Filters
            </button>
          </div>
        </div>
      )}

      {/* Assignments Table */}
      <div className="bg-white rounded-xl shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[900px]">
            <thead className="bg-slate-100 border-b border-secondary-light">
              <tr>
                <th className="p-3 text-left text-sm font-montserrat text-secondary-dark">
                  Student
                </th>
                <th className="text-left text-sm font-montserrat text-secondary-dark">
                  Batch
                </th>
                <th className="text-left text-sm font-montserrat text-secondary-dark">
                  Medium
                </th>
                <th className="text-left text-sm font-montserrat text-secondary-dark">
                  Course
                </th>
                <th className="text-left text-sm font-montserrat text-secondary-dark">
                  Enrollment Date
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
                  <td colSpan={7} className="p-6 text-center text-secondary">
                    Loading assignments…
                  </td>
                </tr>
              ) : assignments.length === 0 ? (
                <tr>
                  <td colSpan={7} className="p-6 text-center text-secondary">
                    <div className="flex flex-col items-center gap-2">
                      <UserPlus size={32} className="text-secondary-light" />
                      <span>No assignments found</span>
                      <span className="text-xs text-secondary-light">
                        {search || Object.values(filters).some(Boolean)
                          ? "Try adjusting your filters"
                          : "Assign a student to a batch to get started"}
                      </span>
                    </div>
                  </td>
                </tr>
              ) : (
                assignments.map((assignment) => (
                  <tr
                    key={assignment.id}
                    className="border-b border-secondary-light hover:bg-primary-bg transition"
                  >
                    <td className="p-3 text-sm">
                      <div className="font-medium">
                        {assignment.students?.first_name}{" "}
                        {assignment.students?.last_name}
                      </div>
                      <div className="text-xs text-secondary-light">
                        {assignment.students?.admission_no}
                      </div>
                    </td>
                    <td className="text-sm">
                      {assignment.batches?.batch_name}
                    </td>
                    <td className="text-sm">
                      {mediumMap[assignment.batch_id] || "—"}
                    </td>
                    <td className="text-sm">
                      {assignment.batches?.courses?.course_name || "-"}
                    </td>
                    <td className="text-sm">{assignment.enrollment_date}</td>
                    <td className="text-sm">
                      {editingId === assignment.id ? (
                        <select
                          value={editStatus}
                          onChange={(e) => setEditStatus(e.target.value)}
                          className="border border-secondary-light rounded p-1 text-sm"
                        >
                          <option value="active">Active</option>
                          <option value="completed">Completed</option>
                          <option value="dropped">Dropped</option>
                        </select>
                      ) : (
                        <span
                          className={`px-2 py-1 rounded-full text-xs font-medium ${
                            assignment.status === "active"
                              ? "bg-green-100 text-green-700"
                              : assignment.status === "completed"
                              ? "bg-blue-100 text-blue-700"
                              : "bg-gray-100 text-gray-700"
                          }`}
                        >
                          {assignment.status}
                        </span>
                      )}
                    </td>
                    <td className="text-sm">
                      {editingId === assignment.id ? (
                        <div className="flex gap-2">
                          <button
                            onClick={() =>
                              handleStatusUpdate(assignment.id, editStatus)
                            }
                            className="bg-primary hover:bg-primary-light text-white px-3 py-1 rounded text-sm"
                          >
                            Save
                          </button>
                          <button
                            onClick={() => setEditingId(null)}
                            className="border border-secondary-light text-secondary-dark px-3 py-1 rounded text-sm"
                          >
                            Cancel
                          </button>
                        </div>
                      ) : (
                        <div className="flex gap-2">
                          {/* 👇 Resend Batch Change Email */}
                          <button
                            onClick={() => sendBatchChangeEmail(assignment)}
                            className="text-blue-600 hover:underline"
                            title="Resend batch change notification"
                          >
                            <Mail size={15} />
                          </button>
                          <button
                            onClick={() => {
                              setEditingId(assignment.id);
                              setEditStatus(assignment.status);
                            }}
                            className="text-blue-600 hover:underline"
                          >
                            <Edit3 size={15} />
                          </button>
                          <button
                            onClick={() => handleDelete(assignment.id)}
                            className="text-red-600 hover:underline"
                          >
                            <Trash2 size={15} />
                          </button>
                        </div>
                      )}
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

      {/* Assign Batch Modal */}
      {showModal && (
        <AssignBatchModal
          onSubmit={() => {
            queryClient.invalidateQueries({ queryKey: ["studentBatches"] });
            setShowModal(false);
          }}
          onClose={() => setShowModal(false)}
        />
      )}
    </>
  );

  if (!standalone) {
    return <div>{content}</div>;
  }

  return (
    <>
      <BackButton to="/admissions-hub" label="Admissions" />
      {content}
    </>
  );
}