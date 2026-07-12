import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { BookOpen, Calendar, Upload, FileText, Layers } from "lucide-react";
import toast from "react-hot-toast";
import AdminLayout from "../layouts/AdminLayout";
import BackButton from "../components/BackButton";

import { useStudentId } from "../hooks/useStudentId";
import { supabase } from "../api/supabase";
import { submitHomework } from "../services/homeworkService";
import { useOrg } from "../context/OrganizationContext";   // NEW

const MAX_FILE_SIZE = 1 * 1024 * 1024; // 1 MB

export default function StudentHomeworkPage() {
  const { studentId, isLoading: idLoading } = useStudentId();
  const queryClient = useQueryClient();

  // ── Branch & Financial Year context ──
  const { branch, selectedFinancialYear } = useOrg();   // NEW
  const branchId = branch?.id;
  const financialYearId = selectedFinancialYear?.id;
  const ctx = { branchId, financialYearId };

  const [uploadingFor, setUploadingFor] = useState(null);
  const [selectedFile, setSelectedFile] = useState(null);
  const [filePreviewUrl, setFilePreviewUrl] = useState(null);
  const [submissionRemarks, setSubmissionRemarks] = useState("");

  // Fetch homework assignments – scoped to branch & FY
  const { data: homeworks = [], isLoading } = useQuery({
    queryKey: ["student-homeworks-list", studentId, branchId, financialYearId],
    queryFn: async () => {
      if (!studentId || !branchId || !financialYearId) return [];

      // Get active batch IDs for the student (scoped)
      const { data: batchRows } = await supabase
        .from("student_batches")
        .select("batch_id")
        .eq("student_id", studentId)
        .eq("status", "active")
        .eq("branch_id", branchId)
        .eq("financial_year_id", financialYearId);

      const batchIds = batchRows?.map((b) => b.batch_id) || [];
      if (!batchIds.length) return [];

      // Fetch homeworks for those batches (scoped)
      const { data } = await supabase
        .from("homework")
        .select(`*, subjects(subject_name), batches(batch_name, mediums(name))`)
        .in("batch_id", batchIds)
        .eq("branch_id", branchId)
        .eq("financial_year_id", financialYearId)
        .order("due_date", { ascending: true });

      return data || [];
    },
    enabled: !!studentId && !!branchId && !!financialYearId,
    staleTime: 2 * 60 * 1000,
  });

  // Fetch existing submissions for this student – scoped
  const { data: submissions = [], isLoading: submissionsLoading } = useQuery({
    queryKey: ["student-submissions", studentId, branchId, financialYearId],
    queryFn: async () => {
      if (!studentId || !branchId || !financialYearId) return [];
      const { data } = await supabase
        .from("homework_submissions")
        .select("*")
        .eq("student_id", studentId)
        .eq("branch_id", branchId)
        .eq("financial_year_id", financialYearId);
      return data || [];
    },
    enabled: !!studentId && !!branchId && !!financialYearId,
    staleTime: 2 * 60 * 1000,
  });

  // Map submissions by homework_id
  const submissionMap = {};
  submissions.forEach((s) => {
    if (!submissionMap[s.homework_id]) {
      submissionMap[s.homework_id] = [];
    }
    submissionMap[s.homework_id].push(s);
  });

  // Upload mutation – uses context already
  const uploadMutation = useMutation({
    mutationFn: ({ homeworkId, file, remarks }) =>
      submitHomework({ homeworkId, studentId, file, remarks }, ctx),
    onSuccess: () => {
      toast.success("Homework submitted successfully!");
      queryClient.invalidateQueries({ queryKey: ["student-submissions"] });
      setSelectedFile(null);
      setFilePreviewUrl(null);
      setUploadingFor(null);
      setSubmissionRemarks("");
    },
    onError: (err) => {
      toast.error(err.message || "Upload failed");
      setUploadingFor(null);
    },
  });

  const handleFileChange = (e, homeworkId) => {
    const file = e.target.files[0];
    if (!file) return;

    if (file.size > MAX_FILE_SIZE) {
      toast.error("File size must be less than 1 MB");
      e.target.value = "";
      return;
    }

    setSelectedFile(file);
    setUploadingFor(homeworkId);

    // Generate preview URL for images
    if (file.type.startsWith("image/")) {
      const url = URL.createObjectURL(file);
      setFilePreviewUrl(url);
    } else {
      setFilePreviewUrl(null);
    }
  };

  const handleUpload = (homeworkId) => {
    if (!selectedFile) {
      toast.error("Please select a file");
      return;
    }
    uploadMutation.mutate({
      homeworkId,
      file: selectedFile,
      remarks: submissionRemarks,
    });
  };

  // Clean up preview URL when component unmounts or file changes
  const resetUpload = () => {
    setSelectedFile(null);
    setFilePreviewUrl(null);
    setUploadingFor(null);
    setSubmissionRemarks("");
  };

  if (idLoading || isLoading || submissionsLoading) {
    return (
      <AdminLayout>
      <BackButton to="/student" label="My Dashboard" />
        <div className="p-8 text-center">Loading homework…</div>
      </AdminLayout>
    );
  }

  return (
    <AdminLayout>
      <h1 className="text-3xl font-righteous text-primary-dark mb-6">
        My Homework
      </h1>

      {homeworks.length === 0 ? (
        <p className="text-secondary">No homework assigned.</p>
      ) : (
        <div className="space-y-4">
          {homeworks.map((hw) => {
            const submissionsForHw = submissionMap[hw.id] || [];
            const alreadySubmitted = submissionsForHw.length > 0;
            const isUploading = uploadingFor === hw.id;

            return (
              <div
                key={hw.id}
                className="bg-white rounded-xl p-4 shadow-sm border border-secondary-light"
              >
                <h3 className="font-semibold">{hw.title}</h3>
                <p className="text-sm text-secondary mt-1">{hw.description}</p>
                <div className="flex flex-wrap gap-4 mt-2 text-xs text-secondary-dark">
                  <span className="flex items-center gap-1">
                    <BookOpen size={14} /> {hw.subjects?.subject_name}
                  </span>
                  <span className="flex items-center gap-1">
                    <Calendar size={14} /> Assigned: {hw.assigned_date}
                  </span>
                  <span className="flex items-center gap-1">
                    <Calendar size={14} /> Due: {hw.due_date}
                  </span>
                  {hw.batches?.batch_name && (
                    <span className="flex items-center gap-1">
                      <Layers size={14} /> {hw.batches.batch_name}
                    </span>
                  )}
                  {hw.batches?.mediums?.name && (
                    <span className="flex items-center gap-1 bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full">
                      {hw.batches.mediums.name}
                    </span>
                  )}
                </div>

                {/* Teacher's attachment */}
                {hw.attachment_url && (
                  <a
                    href={hw.attachment_url}
                    target="_blank"
                    className="text-primary text-sm mt-2 inline-block"
                  >
                    View attachment →
                  </a>
                )}

                {/* Submission section */}
                <div className="mt-4 border-t pt-3">
                  {alreadySubmitted ? (
                    <div className="space-y-2">
                      <div className="flex items-center gap-2 text-sm text-green-700">
                        <FileText size={16} />
                        <span>Submitted ({submissionsForHw.length} file(s))</span>
                        <div className="flex gap-2 ml-2">
                          {submissionsForHw.map((sub) => (
                            <a
                              key={sub.id}
                              href={sub.submission_file}
                              target="_blank"
                              className="text-primary underline text-xs"
                            >
                              View
                            </a>
                          ))}
                        </div>
                      </div>
                      {/* Teacher's feedback / marks */}
                      {submissionsForHw.some(
                        (s) => s.marks !== null || s.remarks
                      ) && (
                        <div className="text-xs text-secondary">
                          {submissionsForHw[0].marks !== null && (
                            <span className="mr-3">
                              Marks: {submissionsForHw[0].marks}
                            </span>
                          )}
                          {submissionsForHw[0].remarks && (
                            <span>Remarks: {submissionsForHw[0].remarks}</span>
                          )}
                        </div>
                      )}
                    </div>
                  ) : (
                    <div>
                      <p className="text-sm text-secondary mb-2">
                        No submission yet. Upload your homework (max 1 MB).
                      </p>
                      <div className="space-y-3">
                        <div className="flex items-center gap-2">
                          <input
                            type="file"
                            id={`file-${hw.id}`}
                            className="hidden"
                            accept=".pdf,.doc,.docx,.jpg,.jpeg,.png,.zip"
                            onChange={(e) => handleFileChange(e, hw.id)}
                            disabled={uploadMutation.isLoading}
                          />
                          <label
                            htmlFor={`file-${hw.id}`}
                            className="cursor-pointer bg-primary-bg text-primary px-3 py-1.5 rounded-lg text-sm flex items-center gap-1 hover:bg-primary-light/20 transition"
                          >
                            <Upload size={14} /> Choose File
                          </label>
                          {selectedFile && uploadingFor === hw.id && (
                            <span className="text-xs text-secondary truncate max-w-[150px]">
                              {selectedFile.name}
                            </span>
                          )}
                          {uploadingFor === hw.id && (
                            <button
                              onClick={() => resetUpload()}
                              className="text-xs text-secondary hover:text-red-500"
                            >
                              Clear
                            </button>
                          )}
                        </div>

                        {/* Image preview */}
                        {filePreviewUrl && uploadingFor === hw.id && (
                          <div className="w-32 h-32 rounded border overflow-hidden">
                            <img
                              src={filePreviewUrl}
                              alt="Preview"
                              className="w-full h-full object-cover"
                            />
                          </div>
                        )}

                        {/* Remarks input */}
                        <div>
                          <textarea
                            placeholder="Any remarks (optional)"
                            value={
                              uploadingFor === hw.id ? submissionRemarks : ""
                            }
                            onChange={(e) => setSubmissionRemarks(e.target.value)}
                            rows={2}
                            className="w-full border border-secondary-light rounded p-2 text-sm focus:ring-1 focus:ring-primary outline-none resize-none"
                          />
                        </div>

                        {selectedFile && uploadingFor === hw.id && (
                          <button
                            onClick={() => handleUpload(hw.id)}
                            disabled={uploadMutation.isLoading}
                            className="bg-primary hover:bg-primary-light text-white px-4 py-2 rounded-lg text-sm"
                          >
                            {uploadMutation.isLoading
                              ? "Uploading…"
                              : "Submit Homework"}
                          </button>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </AdminLayout>
  );
}