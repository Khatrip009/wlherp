// src/pages/ViewResults.jsx
import { useState } from "react";
import { Navigate, useParams, useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import {
  ArrowLeft, Award, Calendar, Layers, FileText,
  User, Hash, Search, Download,
} from "lucide-react";
import Papa from "papaparse";

import { getExamById, getResultsByExam } from "../services/examService";
import { useOrg } from "../context/OrganizationContext";

export default function ViewResults() {
  const { examId } = useParams();
  const navigate = useNavigate();
  const [search, setSearch] = useState("");
  const hasValidExamId = !!examId && examId !== "undefined";

  // ── Branch & Financial Year context ──
  const { branch, selectedFinancialYear } = useOrg();
  const branchId = branch?.id;
  const financialYearId = selectedFinancialYear?.id;

  const {
    data: exam,
    isLoading: examLoading,
    error: examError,
  } = useQuery({
    queryKey: ["exam", examId, branchId, financialYearId],
    queryFn: () => getExamById(examId, branchId, financialYearId),
    enabled: hasValidExamId && !!branchId && !!financialYearId,
  });

  const { data: results = [], isLoading: resultsLoading } = useQuery({
    queryKey: ["results", examId, branchId, financialYearId],
    queryFn: () => getResultsByExam(examId, branchId, financialYearId),
    enabled: hasValidExamId && !!branchId && !!financialYearId,
  });

  const courseName = exam?.batches?.courses?.course_name || "-";

  let filtered = results;
  if (search) {
    const term = search.toLowerCase();
    filtered = filtered.filter(
      (r) =>
        r.students?.first_name?.toLowerCase().includes(term) ||
        r.students?.last_name?.toLowerCase().includes(term) ||
        r.students?.admission_no?.toLowerCase().includes(term)
    );
  }

  function handleExportCSV() {
    if (filtered.length === 0) return;
    const data = filtered.map((r) => ({
      admission_no: r.students?.admission_no,
      first_name: r.students?.first_name,
      last_name: r.students?.last_name,
      course: courseName,
      marks_obtained: r.marks_obtained,
      remarks: r.remarks || "",
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

  if (!hasValidExamId) {
    return <Navigate to="/results" replace />;
  }

  if (examLoading || resultsLoading) {
    return (
      <>
        <div className="p-8 text-center">Loading results…</div>
      </>
    );
  }

  if (examError || !exam) {
    return (
      <>
        <div className="p-8 text-center text-red-500">
          {examError?.message || "Exam not found."}
        </div>
      </>
    );
  }

  return (
    <>
      <div className="mb-6">
        <button
          onClick={() => navigate("/results")}
          className="flex items-center gap-2 text-secondary hover:text-primary-dark mb-2 font-montserrat text-sm"
        >
          <ArrowLeft size={18} />
          Back to Results
        </button>
        <h1 className="text-3xl font-righteous text-primary-dark">Exam Results</h1>
        <div className="flex flex-wrap gap-2 mt-2 text-sm text-secondary-dark font-montserrat">
          <span className="bg-primary-bg text-primary px-3 py-1 rounded-full">
            <FileText size={14} className="inline mr-1" />{exam.exam_name}
          </span>
          <span className="bg-primary-bg text-primary px-3 py-1 rounded-full">
            <Layers size={14} className="inline mr-1" />{exam.batches?.batch_name}
          </span>
          <span className="bg-primary-bg text-primary px-3 py-1 rounded-full">
            <Calendar size={14} className="inline mr-1" />{exam.exam_date}
          </span>
          <span className="bg-primary-bg text-primary px-3 py-1 rounded-full">
            Total Marks: {exam.total_marks || "N/A"}
          </span>
        </div>
      </div>

      <div className="flex flex-wrap items-end gap-3 mb-4">
        <div className="relative flex-1 max-w-md">
          <Search size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-secondary" />
          <input
            type="text"
            placeholder="Search by name or admission no..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full border border-secondary-light rounded-lg pl-10 pr-4 py-2.5 text-sm focus:ring-1 focus:ring-primary focus:border-primary outline-none"
          />
        </div>
        <button
          onClick={handleExportCSV}
          className="border border-secondary-light px-4 py-2.5 rounded-lg text-secondary-dark hover:bg-secondary-bg text-sm flex items-center gap-2"
        >
          <Download size={18} /> Export CSV
        </button>
      </div>

      <div className="bg-white rounded-xl shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[600px]">
            <thead className="bg-slate-100 border-b border-secondary-light">
              <tr>
                <th className="p-3 text-left text-sm font-montserrat text-secondary-dark">
                  <Hash size={14} className="inline mr-1" />Admission No
                </th>
                <th className="text-left text-sm font-montserrat text-secondary-dark">
                  <User size={14} className="inline mr-1" />Student
                </th>
                <th className="text-left text-sm font-montserrat text-secondary-dark">Course</th>
                <th className="text-left text-sm font-montserrat text-secondary-dark">
                  <Award size={14} className="inline mr-1" />Marks
                </th>
                <th className="text-left text-sm font-montserrat text-secondary-dark">Remarks</th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={5} className="p-6 text-center text-secondary">
                    {results.length === 0 ? "No results entered yet" : "No students match your filters"}
                  </td>
                </tr>
              ) : (
                filtered.map((r) => (
                  <tr key={r.id} className="border-b border-secondary-light hover:bg-primary-bg transition">
                    <td className="p-3 text-sm">{r.students?.admission_no}</td>
                    <td className="text-sm font-medium">
                      {r.students?.first_name} {r.students?.last_name}
                    </td>
                    <td className="text-sm">{courseName}</td>
                    <td className="text-sm">
                      {r.marks_obtained}
                      {exam.total_marks ? ` / ${exam.total_marks}` : ""}
                    </td>
                    <td className="text-sm">{r.remarks || "-"}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}