// src/pages/EnterResults.jsx
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
import AdminLayout from "../layouts/AdminLayout";
import {
  getExamById,
  getBatchStudents,
  getResultsByExam,
  saveResults,
} from "../services/examService";
import { useOrg } from "../context/OrganizationContext";   // NEW

export default function EnterResults() {
  const { examId } = useParams();
  const navigate = useNavigate();

  // ── Organisation / Branch / Financial Year context ──
  const { branch, selectedFinancialYear } = useOrg();   // NEW
  const ctx = { branchId: branch?.id, financialYearId: selectedFinancialYear?.id };

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
  }, [examId]);

  async function loadData() {
    setLoading(true);
    try {
      const examData = await getExamById(examId);
      if (!examData) {
        toast.error("Exam not found");
        navigate("/results");
        return;
      }
      setExam(examData);

      const batchStudents = await getBatchStudents(examData.batch_id);
      setAllStudents(batchStudents);

      const existingResults = await getResultsByExam(examId);
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
      // Pass context as third argument (branch & financial year)
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
      <AdminLayout>
        <div className="p-8 text-center text-secondary font-montserrat">
          Loading exam details…
        </div>
      </AdminLayout>
    );
  }

  return (
    <AdminLayout>
      <div className="mb-6">
        <button
          onClick={() => navigate("/results")}
          className="flex items-center gap-2 text-secondary hover:text-primary-dark mb-2 font-montserrat text-sm transition"
        >
          <ArrowLeft size={18} />
          Back to Results
        </button>
        <h1 className="text-3xl font-righteous text-primary-dark">Enter Results</h1>
        {exam && (
          <div className="flex flex-wrap gap-2 mt-2 text-sm text-secondary-dark font-montserrat">
            <span className="flex items-center gap-1 bg-primary-bg text-primary px-3 py-1 rounded-full">
              <FileText size={14} /> {exam.exam_name}
            </span>
            <span className="flex items-center gap-1 bg-primary-bg text-primary px-3 py-1 rounded-full">
              <Layers size={14} /> {exam.batches?.batch_name}
            </span>
            {mediumName && (
              <span className="flex items-center gap-1 bg-accent/10 text-accent px-3 py-1 rounded-full text-xs">
                {mediumName}
              </span>
            )}
            <span className="flex items-center gap-1 bg-primary-bg text-primary px-3 py-1 rounded-full">
              <Calendar size={14} /> {exam.exam_date}
            </span>
            <span className="flex items-center gap-1 bg-primary-bg text-primary px-3 py-1 rounded-full">
              Total: {exam.total_marks || "N/A"}
            </span>
          </div>
        )}
      </div>

      <div className="flex flex-wrap items-end gap-3 mb-4">
        <button
          onClick={handleExportCSV}
          className="border border-secondary-light px-4 py-2.5 rounded-lg text-secondary-dark hover:bg-secondary-bg font-montserrat text-sm flex items-center gap-2"
        >
          <Download size={18} /> Export CSV
        </button>
        <button
          onClick={() => fileInputRef.current?.click()}
          className="border border-secondary-light px-4 py-2.5 rounded-lg text-secondary-dark hover:bg-secondary-bg font-montserrat text-sm flex items-center gap-2"
        >
          <Upload size={18} /> Import CSV
        </button>
        <button
          onClick={handleDownloadTemplate}
          className="border border-secondary-light px-4 py-2.5 rounded-lg text-secondary-dark hover:bg-secondary-bg font-montserrat text-sm flex items-center gap-2"
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

      <div className="bg-white rounded-xl shadow-sm overflow-hidden">
        <div className="p-4 border-b border-secondary-light flex justify-between items-center">
          <h2 className="text-lg font-semibold font-righteous text-primary-dark flex items-center gap-2">
            <User size={18} />
            Students ({allStudents.length})
          </h2>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full min-w-[600px]">
            <thead className="bg-slate-50 border-b border-secondary-light">
              <tr>
                <th className="text-left p-3 text-sm font-montserrat text-secondary-dark">
                  <Hash size={14} className="inline mr-1" />
                  Admission No
                </th>
                <th className="text-left p-3 text-sm font-montserrat text-secondary-dark">
                  <User size={14} className="inline mr-1" />
                  Name
                </th>
                <th className="text-left p-3 text-sm font-montserrat text-secondary-dark">
                  Course
                </th>
                <th className="text-center p-3 text-sm font-montserrat text-secondary-dark w-40">
                  Marks Obtained
                </th>
                <th className="text-left p-3 text-sm font-montserrat text-secondary-dark w-48">
                  Remarks
                </th>
              </tr>
            </thead>
            <tbody>
              {allStudents.map((student) => (
                <tr
                  key={student.id}
                  className="border-b border-secondary-light hover:bg-primary-bg transition"
                >
                  <td className="p-3 text-sm">{student.admission_no}</td>
                  <td className="p-3 text-sm font-medium">
                    {student.first_name} {student.last_name}
                  </td>
                  <td className="p-3 text-sm">{courseName}</td>
                  <td className="p-3 text-center">
                    <input
                      type="number"
                      value={marks[student.id] ?? ""}
                      onChange={(e) => handleMarksChange(student.id, e.target.value)}
                      className="border border-secondary-light rounded p-2 w-24 text-center focus:ring-1 focus:ring-primary focus:border-primary outline-none text-sm"
                      placeholder="0"
                    />
                  </td>
                  <td className="p-3">
                    <input
                      type="text"
                      placeholder="Remark..."
                      value={remarks[student.id] || ""}
                      onChange={(e) => handleRemarksChange(student.id, e.target.value)}
                      className="border border-secondary-light rounded p-2 w-full focus:ring-1 focus:ring-primary focus:border-primary outline-none text-sm"
                    />
                  </td>
                </tr>
              ))}
              {allStudents.length === 0 && (
                <tr>
                  <td colSpan={5} className="p-6 text-center text-secondary text-sm">
                    No students enrolled in this batch.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        <div className="p-4 border-t border-secondary-light flex flex-col sm:flex-row justify-end gap-3">
          <button
            onClick={() => navigate("/results")}
            className="w-full sm:w-auto px-5 py-2.5 border border-secondary-light rounded-lg text-secondary-dark hover:bg-secondary-bg font-montserrat text-sm transition"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={saving}
            className="w-full sm:w-auto px-6 py-2.5 bg-primary hover:bg-primary-light text-white rounded-lg font-montserrat text-sm transition disabled:opacity-50 flex items-center justify-center gap-2"
          >
            <Save size={18} />
            {saving ? "Saving..." : "Save Results"}
          </button>
        </div>
      </div>
    </AdminLayout>
  );
}