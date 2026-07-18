// src/pages/StudentDocuments.jsx
import React, { useState, useRef, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import toast from "react-hot-toast";
import {
  Search,
  Upload,
  Trash2,
  FileText,
  User,
  Layers,
  School,
  Filter,
  X,
  Download,
  Eye,
} from "lucide-react";

import BackButton from "../components/BackButton";

import { supabase } from "../api/supabase";
import {
  getStudentDocuments,
  uploadStudentDocument,
  deleteStudentDocument,
} from "../services/documentService";
import { useOrg } from "../context/OrganizationContext";

export default function StudentDocuments({ studentId: propStudentId = null, standalone = true }) {
  const queryClient = useQueryClient();

  // ── Organization, Branch & Financial Year context ──
  const { branch, selectedFinancialYear } = useOrg();
  const branchId = branch?.id;
  const financialYearId = selectedFinancialYear?.id;
  const ctx = { branchId, financialYearId };

  // ── Use propStudentId if provided ──
  const [selectedStudentId, setSelectedStudentId] = useState(propStudentId);
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef(null);
  const [docType, setDocType] = useState("ID Proof");

  // Auto-select when prop changes
  useEffect(() => {
    if (propStudentId) {
      setSelectedStudentId(propStudentId);
    }
  }, [propStudentId]);

  // ── Filters for students (only used when no propStudentId) ──
  const [search, setSearch] = useState("");
  const [filterCourse, setFilterCourse] = useState("");
  const [filterBatch, setFilterBatch] = useState("");
  const [filterMedium, setFilterMedium] = useState("");
  const [filterStandard, setFilterStandard] = useState("");
  const [filterStatus, setFilterStatus] = useState("");
  const [showFilters, setShowFilters] = useState(false);

  // Fetch courses for filter – organisation‑wide
  const { data: courses = [] } = useQuery({
    queryKey: ["courses-dropdown"],
    queryFn: async () => {
      const { data } = await supabase.from("courses").select("id, course_name").eq("status", true);
      return data || [];
    },
    staleTime: 10 * 60 * 1000,
  });

  // Fetch batches for filter – scoped
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

  // Fetch mediums for filter – organisation‑wide
  const { data: mediums = [] } = useQuery({
    queryKey: ["mediums-dropdown"],
    queryFn: async () => {
      const { data } = await supabase.from("mediums").select("id, name").order("name");
      return data || [];
    },
    staleTime: 10 * 60 * 1000,
  });

  // Fetch students with filters – only needed when propStudentId is not provided
  const { data: students = [], isLoading: studentsLoading } = useQuery({
    queryKey: ["students-filtered", { search, course: filterCourse, batch: filterBatch, medium: filterMedium, standard: filterStandard, status: filterStatus }, branchId, financialYearId],
    queryFn: async () => {
      let query = supabase
        .from("students")
        .select("id, first_name, last_name, admission_no, standard, photo_url, status, medium_id")
        .order("first_name");

      if (branchId) query = query.eq("branch_id", branchId);
      if (financialYearId) query = query.eq("financial_year_id", financialYearId);

      if (search) {
        query = query.or(`first_name.ilike.%${search}%,last_name.ilike.%${search}%,admission_no.ilike.%${search}%`);
      }
      if (filterStandard) query = query.eq("standard", filterStandard);
      if (filterMedium) query = query.eq("medium_id", filterMedium);
      if (filterStatus) query = query.eq("status", filterStatus);

      // Course and batch filters
      if (filterCourse || filterBatch) {
        let studentIds = new Set();
        if (filterCourse) {
          let courseBatchesQuery = supabase
            .from("batches")
            .select("id")
            .eq("course_id", filterCourse);
          if (branchId) courseBatchesQuery = courseBatchesQuery.eq("branch_id", branchId);
          if (financialYearId) courseBatchesQuery = courseBatchesQuery.eq("financial_year_id", financialYearId);
          const { data: courseBatches } = await courseBatchesQuery;
          const batchIds = courseBatches?.map((b) => b.id) || [];
          if (batchIds.length > 0) {
            let batchStudentsQuery = supabase
              .from("student_batches")
              .select("student_id")
              .in("batch_id", batchIds)
              .eq("status", "active");
            if (branchId) batchStudentsQuery = batchStudentsQuery.eq("branch_id", branchId);
            if (financialYearId) batchStudentsQuery = batchStudentsQuery.eq("financial_year_id", financialYearId);
            const { data: batchStudents } = await batchStudentsQuery;
            batchStudents?.forEach((bs) => studentIds.add(bs.student_id));
          }
        }
        if (filterBatch) {
          let batchStudentsQuery = supabase
            .from("student_batches")
            .select("student_id")
            .eq("batch_id", filterBatch)
            .eq("status", "active");
          if (branchId) batchStudentsQuery = batchStudentsQuery.eq("branch_id", branchId);
          if (financialYearId) batchStudentsQuery = batchStudentsQuery.eq("financial_year_id", financialYearId);
          const { data: batchStudents } = await batchStudentsQuery;
          batchStudents?.forEach((bs) => studentIds.add(bs.student_id));
        }
        const ids = Array.from(studentIds);
        if (ids.length > 0) query = query.in("id", ids);
        else return [];
      }

      const { data, error } = await query.limit(200);
      if (error) throw error;
      return data || [];
    },
    enabled: !!branchId && !!financialYearId && !propStudentId, // only run when no propStudentId
    staleTime: 2 * 60 * 1000,
  });

  // Fetch documents for selected student – scoped
  const {
    data: documents = [],
    isLoading: docsLoading,
  } = useQuery({
    queryKey: ["student-documents", selectedStudentId, branchId, financialYearId],
    queryFn: () => getStudentDocuments(selectedStudentId, branchId, financialYearId),
    enabled: !!selectedStudentId && !!branchId && !!financialYearId,
    staleTime: 2 * 60 * 1000,
  });

  // ── Mutations ──
  const uploadMutation = useMutation({
    mutationFn: async (file) => {
      await uploadStudentDocument(selectedStudentId, file, docType, ctx);
    },
    onSuccess: () => {
      toast.success("Document uploaded");
      queryClient.invalidateQueries({ queryKey: ["student-documents", selectedStudentId] });
    },
    onError: (err) => toast.error(err.message || "Upload failed"),
    onSettled: () => setUploading(false),
  });

  const deleteMutation = useMutation({
    mutationFn: async (doc) => {
      const url = new URL(doc.file_path);
      const pathParts = url.pathname.split("/ShreeVidhya_Academy/");
      const filePath = pathParts[1] || doc.file_path;
      await deleteStudentDocument(doc.id, filePath, branchId, financialYearId);
    },
    onSuccess: () => {
      toast.success("Document deleted");
      queryClient.invalidateQueries({ queryKey: ["student-documents", selectedStudentId] });
    },
    onError: () => toast.error("Delete failed"),
  });

  function handleUpload(file) {
    if (!selectedStudentId) return;
    setUploading(true);
    uploadMutation.mutate(file);
  }

  const selectedStudent = propStudentId
    ? null // we don't have the full student object when standalone=false, but we don't need it
    : students.find((s) => s.id == selectedStudentId);

  // ── Content ──
  const content = (
    <>
      {/* Header – only show if standalone */}
      {standalone && (
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-6 gap-4">
          <div>
            <h1 className="text-3xl font-righteous text-primary-dark">Student Documents</h1>
            <p className="text-sm text-secondary-dark font-montserrat mt-1">
              Upload and manage student files
            </p>
          </div>
        </div>
      )}

      {/* Search & Filters – only if standalone and no propStudentId */}
      {standalone && !propStudentId && (
        <>
          <div className="flex flex-col sm:flex-row gap-3 mb-4">
            <div className="relative flex-1">
              <Search size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-secondary" />
              <input
                type="text"
                placeholder="Search by name or admission no..."
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
              {/* ... same as before ... */}
              <div>
                <label className="text-xs font-montserrat text-secondary-dark">Course</label>
                <select
                  value={filterCourse}
                  onChange={(e) => setFilterCourse(e.target.value)}
                  className="w-full border border-secondary-light rounded p-2 text-sm mt-1 focus:ring-1 focus:ring-primary"
                >
                  <option value="">All Courses</option>
                  {courses.map((c) => (
                    <option key={c.id} value={c.id}>{c.course_name}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="text-xs font-montserrat text-secondary-dark">Batch</label>
                <select
                  value={filterBatch}
                  onChange={(e) => setFilterBatch(e.target.value)}
                  className="w-full border border-secondary-light rounded p-2 text-sm mt-1 focus:ring-1 focus:ring-primary"
                >
                  <option value="">All Batches</option>
                  {batches.map((b) => (
                    <option key={b.id} value={b.id}>{b.batch_name}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="text-xs font-montserrat text-secondary-dark">Medium</label>
                <select
                  value={filterMedium}
                  onChange={(e) => setFilterMedium(e.target.value)}
                  className="w-full border border-secondary-light rounded p-2 text-sm mt-1 focus:ring-1 focus:ring-primary"
                >
                  <option value="">All Mediums</option>
                  {mediums.map((m) => (
                    <option key={m.id} value={m.id}>{m.name}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="text-xs font-montserrat text-secondary-dark">Standard</label>
                <input
                  type="text"
                  value={filterStandard}
                  onChange={(e) => setFilterStandard(e.target.value)}
                  placeholder="e.g., 10"
                  className="w-full border border-secondary-light rounded p-2 text-sm mt-1 focus:ring-1 focus:ring-primary"
                />
              </div>
              <div>
                <label className="text-xs font-montserrat text-secondary-dark">Status</label>
                <select
                  value={filterStatus}
                  onChange={(e) => setFilterStatus(e.target.value)}
                  className="w-full border border-secondary-light rounded p-2 text-sm mt-1 focus:ring-1 focus:ring-primary"
                >
                  <option value="">All Statuses</option>
                  <option value="active">Active</option>
                  <option value="inactive">Inactive</option>
                  <option value="graduated">Graduated</option>
                </select>
              </div>
              <div className="flex items-end col-span-full lg:col-span-1">
                <button
                  onClick={() => {
                    setSearch("");
                    setFilterCourse("");
                    setFilterBatch("");
                    setFilterMedium("");
                    setFilterStandard("");
                    setFilterStatus("");
                  }}
                  className="text-primary text-sm hover:underline"
                >
                  Clear Filters
                </button>
              </div>
            </div>
          )}
        </>
      )}

      {/* Student Picker – only when standalone and no propStudentId */}
      {standalone && !propStudentId && (
        <div className="mb-6 max-w-2xl">
          <label className="block text-sm font-montserrat text-secondary-dark mb-1">
            <User size={14} className="inline mr-1" /> Select Student
          </label>
          <select
            value={selectedStudentId || ""}
            onChange={(e) => setSelectedStudentId(e.target.value || null)}
            className="w-full border border-secondary-light rounded-lg p-2.5 text-sm focus:ring-1 focus:ring-primary focus:border-primary outline-none"
          >
            <option value="">Choose a student…</option>
            {students.map((s) => (
              <option key={s.id} value={s.id}>
                {s.first_name} {s.last_name} ({s.admission_no}) - Std {s.standard} ({s.status})
              </option>
            ))}
          </select>
          {students.length === 0 && !studentsLoading && (
            <p className="text-xs text-secondary-light mt-1">No students match the filters</p>
          )}
        </div>
      )}

      {selectedStudentId && (
        <>
          {/* Upload Section */}
          <div className="bg-white rounded-xl p-6 shadow-sm mb-8 border border-secondary-light">
            <h2 className="text-lg font-semibold font-righteous text-primary-dark mb-4">
              Upload New Document
            </h2>
            <div className="flex flex-col sm:flex-row gap-4 items-end">
              <div className="flex-1">
                <label className="block text-sm font-montserrat text-secondary-dark mb-1">Document Type</label>
                <select
                  value={docType}
                  onChange={(e) => setDocType(e.target.value)}
                  className="w-full border border-secondary-light rounded p-2.5 text-sm focus:ring-1 focus:ring-primary"
                >
                  <option>ID Proof</option>
                  <option>Previous Marksheet</option>
                  <option>Photo</option>
                  <option>Transfer Certificate</option>
                  <option>Other</option>
                </select>
              </div>
              <div>
                <input
                  ref={fileInputRef}
                  type="file"
                  className="hidden"
                  onChange={(e) => {
                    const file = e.target.files[0];
                    if (file) handleUpload(file);
                  }}
                />
                <button
                  onClick={() => fileInputRef.current?.click()}
                  disabled={uploading}
                  className="bg-primary hover:bg-primary-light text-white px-5 py-2.5 rounded-lg flex items-center gap-2 font-montserrat text-sm disabled:opacity-50"
                >
                  <Upload size={18} />
                  {uploading ? "Uploading..." : "Choose & Upload"}
                </button>
              </div>
            </div>
          </div>

          {/* Documents List */}
          <div className="bg-white rounded-xl shadow-sm overflow-hidden border border-secondary-light">
            <h2 className="text-lg font-semibold font-righteous text-primary-dark p-4 border-b border-secondary-light">
              Documents for {selectedStudent ? `${selectedStudent.first_name} ${selectedStudent.last_name}` : `Student ${selectedStudentId}`}
            </h2>
            {docsLoading ? (
              <p className="p-4 text-center text-secondary">Loading documents…</p>
            ) : documents.length === 0 ? (
              <div className="p-8 text-center text-secondary">
                <FileText size={32} className="mx-auto text-secondary-light mb-2" />
                <p>No documents uploaded yet.</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[600px]">
                  <thead className="bg-slate-50 border-b border-secondary-light">
                    <tr>
                      <th className="text-left p-3 text-sm font-montserrat text-secondary-dark">Type</th>
                      <th className="text-left p-3 text-sm font-montserrat text-secondary-dark">File Name</th>
                      <th className="text-left p-3 text-sm font-montserrat text-secondary-dark">Uploaded At</th>
                      <th className="text-left p-3 text-sm font-montserrat text-secondary-dark">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {documents.map((doc) => (
                      <tr key={doc.id} className="border-b border-secondary-light hover:bg-primary-bg transition">
                        <td className="p-3 text-sm">{doc.document_type}</td>
                        <td className="p-3 text-sm">{doc.file_name}</td>
                        <td className="p-3 text-sm">
                          {new Date(doc.uploaded_at).toLocaleDateString()}
                        </td>
                        <td className="p-3 text-sm">
                          <div className="flex gap-2">
                            <a
                              href={doc.file_path}
                              target="_blank"
                              rel="noreferrer"
                              className="text-primary hover:underline flex items-center gap-1"
                            >
                              <Eye size={16} /> View
                            </a>
                            <button
                              onClick={() => {
                                if (!window.confirm("Delete this document?")) return;
                                deleteMutation.mutate(doc);
                              }}
                              className="text-red-600 hover:underline flex items-center gap-1"
                            >
                              <Trash2 size={16} /> Delete
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </>
      )}
    </>
  );

  if (!standalone) {
    return <div>{content}</div>;
  }

  return (
    
      <BackButton to="/admissions-hub" label="Admissions" />
     
  );
}