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
      <div className="space-y-6 px-4 sm:px-6 lg:px-0">
        <div className="p-8 text-center text-gray-500 dark:text-gray-400">Loading results…</div>
      </div>
    );
  }

  if (examError || !exam) {
    return (
      <div className="space-y-6 px-4 sm:px-6 lg:px-0">
        <div className="p-8 text-center text-accent-dark">
          {examError?.message || "Exam not found."}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6 px-4 sm:px-6 lg:px-0">
      <div className="mb-6">
        <button
          onClick={() => navigate("/results")}
          className="flex items-center gap-2 text-gray-600 dark:text-gray-400 hover:text-primary-dark mb-2 font-body text-sm"
        >
          <ArrowLeft size={18} />
          Back to Results
        </button>
        <h1 className="text-3xl font-heading text-primary-dark">Exam Results</h1>
        <div className="flex flex-wrap gap-2 mt-2 text-sm text-gray-600 dark:text-gray-400 font-body">
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
          <Search size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 dark:text-gray-500" />
          <input
            type="text"
            placeholder="Search by name or admission no..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 rounded-lg pl-10 pr-4 py-2.5 text-sm focus:ring-2 focus:ring-primary focus:border-primary outline-none placeholder-gray-400 dark:placeholder-gray-500"
          />
        </div>
        <button
          onClick={handleExportCSV}
          className="border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-700 dark:text-gray-200 px-4 py-2.5 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 text-sm flex items-center gap-2"
        >
          <Download size={18} /> Export CSV
        </button>
      </div>

      <div className="bg-white dark:bg-accent rounded-xl shadow-sm overflow-hidden border border-gray-200 dark:border-gray-700">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[600px]">
            <thead className="bg-gray-50 dark:bg-gray-700 border-b border-gray-200 dark:border-gray-600">
              <tr>
                <th className="p-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                  <Hash size={14} className="inline mr-1" />Admission No
                </th>
                <th className="p-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                  <User size={14} className="inline mr-1" />Student
                </th>
                <th className="p-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Course</th>
                <th className="p-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                  <Award size={14} className="inline mr-1" />Marks
                </th>
                <th className="p-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Remarks</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={5} className="p-6 text-center text-gray-500 dark:text-gray-400">
                    {results.length === 0 ? "No results entered yet" : "No students match your filters"}
                  </td>
                </tr>
              ) : (
                filtered.map((r) => (
                  <tr key={r.id} className="hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors">
                    <td className="p-3 text-sm text-gray-700 dark:text-gray-200">{r.students?.admission_no}</td>
                    <td className="p-3 text-sm font-medium text-gray-800 dark:text-gray-100">
                      {r.students?.first_name} {r.students?.last_name}
                    </td>
                    <td className="p-3 text-sm text-gray-700 dark:text-gray-200">{courseName}</td>
                    <td className="p-3 text-sm text-gray-700 dark:text-gray-200">
                      {r.marks_obtained}
                      {exam.total_marks ? ` / ${exam.total_marks}` : ""}
                    </td>
                    <td className="p-3 text-sm text-gray-700 dark:text-gray-200">{r.remarks || "-"}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}