import { useEffect, useState, useRef } from "react";
import { useParams, useNavigate } from "react-router-dom";
import toast from "react-hot-toast";
import {
  ArrowLeft,
  Save,
  User,
  Hash,
  Calendar,
  Layers,
  FileText,
  Download,
  Upload,
  FileDown,
} from "lucide-react";
import Papa from "papaparse";

import {
  getExamById,
  getBatchStudents,
  getResultsByExam,
  saveResults,
} from "../services/examService";
import { useOrg } from "../context/OrganizationContext";

export default function EnterResults() {
  const { examId } = useParams();
  const navigate = useNavigate();

  const { branch, selectedFinancialYear } = useOrg();
  const ctx = { branchId: branch?.id, financialYearId: selectedFinancialYear?.id };
  const branchId = ctx.branchId;
  const financialYearId = ctx.financialYearId;

  useEffect(() => {
    if (!examId || examId === "undefined") {
      navigate("/results", { replace: true });
    }
  }, [examId, navigate]);

  const [exam, setExam] = useState(null);
  const [allStudents, setAllStudents] = useState([]);
  const [marks, setMarks] = useState({});
  const [remarks, setRemarks] = useState({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const fileInputRef = useRef(null);

  const courseName = exam?.batches?.courses?.course_name || "—";
  const mediumName = exam?.batches?.mediums?.name || "";

  useEffect(() => {
    if (examId && examId !== "undefined") {
      loadData();
    }
  }, [examId, branchId, financialYearId]);

  async function loadData() {
    setLoading(true);
    try {
      const examData = await getExamById(examId, branchId, financialYearId);
      if (!examData) {
        toast.error("Exam not found");
        navigate("/results");
        return;
      }
      setExam(examData);

      const batchStudents = await getBatchStudents(examData.batch_id, branchId, financialYearId);
      setAllStudents(batchStudents);

      const existingResults = await getResultsByExam(examId, branchId, financialYearId);
      const initialMarks = {};
      const initialRemarks = {};
      existingResults.forEach((r) => {
        initialMarks[r.student_id] = r.marks_obtained;
        initialRemarks[r.student_id] = r.remarks || "";
      });
      setMarks(initialMarks);
      setRemarks(initialRemarks);
    } catch (err) {
      toast.error("Failed to load exam data");
    } finally {
      setLoading(false);
    }
  }

  function handleMarksChange(studentId, value) {
    setMarks((prev) => ({ ...prev, [studentId]: value }));
  }

  function handleRemarksChange(studentId, value) {
    setRemarks((prev) => ({ ...prev, [studentId]: value }));
  }

  function handleExportCSV() {
    const data = allStudents.map((s) => ({
      admission_no: s.admission_no,
      first_name: s.first_name,
      last_name: s.last_name,
      course: courseName,
      medium: mediumName,
      marks_obtained: marks[s.id] ?? "",
      remarks: remarks[s.id] ?? "",
    }));

    const csv = Papa.unparse(data);
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `results_${exam?.exam_name || examId}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  function handleDownloadTemplate() {
    const data = allStudents.map((s) => ({
      admission_no: s.admission_no,
      first_name: s.first_name,
      last_name: s.last_name,
      course: courseName,
      medium: mediumName,
      marks_obtained: "",
      remarks: "",
    }));

    const csv = Papa.unparse(data);
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "results_template.csv";
    a.click();
    URL.revokeObjectURL(url);
  }

  function handleCSVImport(event) {
    const file = event.target.files[0];
    if (!file) return;

    Papa.parse(file, {
      header: true,
      skipEmptyLines: true,
      complete: (results) => {
        const newMarks = { ...marks };
        const newRemarks = { ...remarks };
        let importedCount = 0;

        results.data.forEach((row) => {
          const student = allStudents.find(
            (s) => s.admission_no?.toString() === row.admission_no?.toString()
          );
          if (student) {
            if (row.marks_obtained !== undefined && row.marks_obtained !== "") {
              newMarks[student.id] = row.marks_obtained;
              importedCount++;
            }
            if (row.remarks !== undefined) {
              newRemarks[student.id] = row.remarks || "";
            }
          }
        });

        setMarks(newMarks);
        setRemarks(newRemarks);
        toast.success(`Imported marks for ${importedCount} student(s). Review and save.`);
      },
      error: () => toast.error("Failed to parse CSV file"),
    });

    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  async function handleSave() {
    const resultsPayload = allStudents.map((student) => ({
      student_id: student.id,
      marks_obtained: marks[student.id] !== undefined ? Number(marks[student.id]) : 0,
      remarks: remarks[student.id] || "",
    }));

    setSaving(true);
    try {
      await saveResults(examId, resultsPayload, ctx);
      toast.success("Results saved");
      navigate("/results");
    } catch (err) {
      toast.error("Failed to save results");
    } finally {
      setSaving(false);
    }
  }

  if (!examId || examId === "undefined") return null;

  if (loading) {
    return (
      <div className="p-8 text-center text-gray-500 dark:text-gray-400" style={{ fontFamily: "var(--font-body)" }}>
        Loading exam details…
      </div>
    );
  }

  return (
    <div className="space-y-6 px-4 sm:px-6 lg:px-0">
      {/* Header */}
      <div>
        <button
          onClick={() => navigate("/results")}
          className="flex items-center gap-2 text-gray-600 dark:text-gray-400 hover:text-primary dark:hover:text-primary-light mb-2 text-sm transition-colors"
          style={{ fontFamily: "var(--font-body)" }}
        >
          <ArrowLeft size={18} />
          Back to Results
        </button>
        <h1
          className="text-2xl sm:text-3xl font-bold"
          style={{ fontFamily: "var(--font-heading)", color: "var(--color-primary)" }}
        >
          Enter Results
        </h1>
        {exam && (
          <div className="flex flex-wrap gap-2 mt-2 text-sm">
            <span
              className="flex items-center gap-1 px-3 py-1 rounded-full"
              style={{
                backgroundColor: "var(--color-primary-light)",
                color: "var(--color-primary)",
              }}
            >
              <FileText size={14} /> {exam.exam_name}
            </span>
            <span
              className="flex items-center gap-1 px-3 py-1 rounded-full"
              style={{
                backgroundColor: "var(--color-primary-light)",
                color: "var(--color-primary)",
              }}
            >
              <Layers size={14} /> {exam.batches?.batch_name}
            </span>
            {mediumName && (
              <span
                className="flex items-center gap-1 px-3 py-1 rounded-full text-xs"
                style={{
                  backgroundColor: "var(--color-accent-light)",
                  color: "var(--color-accent)",
                }}
              >
                {mediumName}
              </span>
            )}
            <span
              className="flex items-center gap-1 px-3 py-1 rounded-full"
              style={{
                backgroundColor: "var(--color-primary-light)",
                color: "var(--color-primary)",
              }}
            >
              <Calendar size={14} /> {exam.exam_date}
            </span>
            <span
              className="flex items-center gap-1 px-3 py-1 rounded-full"
              style={{
                backgroundColor: "var(--color-primary-light)",
                color: "var(--color-primary)",
              }}
            >
              Total: {exam.total_marks || "N/A"}
            </span>
          </div>
        )}
      </div>

      {/* Actions */}
      <div className="flex flex-wrap items-end gap-3">
        <button
          onClick={handleExportCSV}
          className="inline-flex items-center gap-2 px-4 py-2.5 border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-200 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors text-sm"
          style={{ fontFamily: "var(--font-body)" }}
        >
          <Download size={18} /> Export CSV
        </button>
        <button
          onClick={() => fileInputRef.current?.click()}
          className="inline-flex items-center gap-2 px-4 py-2.5 border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-200 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors text-sm"
          style={{ fontFamily: "var(--font-body)" }}
        >
          <Upload size={18} /> Import CSV
        </button>
        <button
          onClick={handleDownloadTemplate}
          className="inline-flex items-center gap-2 px-4 py-2.5 border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-200 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors text-sm"
          style={{ fontFamily: "var(--font-body)" }}
        >
          <FileDown size={18} /> Template
        </button>
        <input
          type="file"
          ref={fileInputRef}
          className="hidden"
          accept=".csv"
          onChange={handleCSVImport}
        />
      </div>

      {/* Students Table */}
      <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 overflow-hidden">
        <div className="p-4 border-b border-gray-200 dark:border-gray-700 flex justify-between items-center">
          <h2
            className="text-lg font-semibold flex items-center gap-2"
            style={{ fontFamily: "var(--font-heading)", color: "var(--color-primary)" }}
          >
            <User size={18} />
            Students ({allStudents.length})
          </h2>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full min-w-[600px]">
            <thead className="bg-gray-50 dark:bg-gray-700 border-b border-gray-200 dark:border-gray-600">
              <tr>
                <th className="text-left p-3 text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                  <Hash size={14} className="inline mr-1" />
                  Admission No
                </th>
                <th className="text-left p-3 text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                  <User size={14} className="inline mr-1" />
                  Name
                </th>
                <th className="text-left p-3 text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                  Course
                </th>
                <th className="text-center p-3 text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider w-40">
                  Marks Obtained
                </th>
                <th className="text-left p-3 text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider w-48">
                  Remarks
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
              {allStudents.map((student) => (
                <tr
                  key={student.id}
                  className="hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
                >
                  <td className="p-3 text-sm text-gray-700 dark:text-gray-200">
                    {student.admission_no}
                  </td>
                  <td className="p-3 text-sm font-medium text-gray-800 dark:text-gray-100">
                    {student.first_name} {student.last_name}
                  </td>
                  <td className="p-3 text-sm text-gray-700 dark:text-gray-200">
                    {courseName}
                  </td>
                  <td className="p-3 text-center">
                    <input
                      type="number"
                      value={marks[student.id] ?? ""}
                      onChange={(e) => handleMarksChange(student.id, e.target.value)}
                      className="border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 rounded p-2 w-24 text-center focus:ring-2 focus:ring-[var(--color-primary)] outline-none text-sm"
                      placeholder="0"
                    />
                  </td>
                  <td className="p-3">
                    <input
                      type="text"
                      placeholder="Remark..."
                      value={remarks[student.id] || ""}
                      onChange={(e) => handleRemarksChange(student.id, e.target.value)}
                      className="border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 rounded p-2 w-full focus:ring-2 focus:ring-[var(--color-primary)] outline-none text-sm"
                    />
                  </td>
                </tr>
              ))}
              {allStudents.length === 0 && (
                <tr>
                  <td colSpan={5} className="p-6 text-center text-gray-500 dark:text-gray-400 text-sm">
                    No students enrolled in this batch.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        <div className="p-4 border-t border-gray-200 dark:border-gray-700 flex flex-col sm:flex-row justify-end gap-3">
          <button
            onClick={() => navigate("/results")}
            className="w-full sm:w-auto px-5 py-2.5 border border-gray-300 dark:border-gray-600 rounded-lg text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors text-sm"
            style={{ fontFamily: "var(--font-body)" }}
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={saving}
            className="w-full sm:w-auto px-6 py-2.5 bg-primary hover:bg-primary-light text-white rounded-lg transition-colors text-sm font-medium disabled:opacity-50 flex items-center justify-center gap-2"
            style={{ fontFamily: "var(--font-body)" }}
          >
            <Save size={18} />
            {saving ? "Saving..." : "Save Results"}
          </button>
        </div>
      </div>
    </div>
  );
}