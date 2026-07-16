import { useState, useEffect, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  getTeachersForSalary,
  getExistingSalaryPayments,
  generateTeacherSalary,
} from "../services/salaryService";
import toast from "react-hot-toast";
import {
  Calendar,
  TrendingUp,
  Loader,
  CheckSquare,
  Square,
  ChevronDown,
  ChevronUp,
} from "lucide-react";
import { supabase } from "../api/supabase";
import { useOrg } from "../context/OrganizationContext";

export default function GenerateSalaries() {
  const qc = useQueryClient();
  const [month, setMonth] = useState(new Date().getMonth() + 1);
  const [year, setYear] = useState(new Date().getFullYear());
  const [selectedTeachers, setSelectedTeachers] = useState([]);
  const [selectAll, setSelectAll] = useState(false);
  const [expandedTeacher, setExpandedTeacher] = useState(null);
  const [generating, setGenerating] = useState(false);
  const [results, setResults] = useState(null);

  const { branch, selectedFinancialYear } = useOrg();
  const branchId = branch?.id;
  const financialYearId = selectedFinancialYear?.id;
  const ctx = { branchId, financialYearId };

  // Fetch all active teachers with salary settings – scoped
  const { data: teachers = [], isLoading: loadingTeachers } = useQuery({
    queryKey: ["teachers-for-salary", branchId, financialYearId],
    queryFn: () => getTeachersForSalary(branchId, financialYearId),
    enabled: !!branchId && !!financialYearId,
    staleTime: 5 * 60 * 1000,
  });

  // Fetch existing payments for the selected month – scoped
  const { data: existingPayments = [] } = useQuery({
    queryKey: ["existing-salary-payments", month, year, branchId, financialYearId],
    queryFn: () => getExistingSalaryPayments(month, year, branchId, financialYearId),
    enabled: month > 0 && year > 0 && !!branchId && !!financialYearId,
  });

  // Lecture counts for the month – scoped
  const startDate = `${year}-${String(month).padStart(2, "0")}-01`;
  const endDate = `${year}-${String(month).padStart(2, "0")}-${new Date(year, month, 0).getDate()}`;

  const { data: lectureCounts = {} } = useQuery({
    queryKey: ["teacher-lecture-counts", startDate, endDate, branchId, financialYearId],
    queryFn: async () => {
      let query = supabase
        .from("attendance_sessions")
        .select("teacher_id")
        .gte("attendance_date", startDate)
        .lte("attendance_date", endDate)
        .not("teacher_id", "is", null);

      if (branchId) query = query.eq("branch_id", branchId);
      if (financialYearId) query = query.eq("financial_year_id", financialYearId);

      const { data } = await query;
      const counts = {};
      (data || []).forEach((s) => {
        counts[s.teacher_id] = (counts[s.teacher_id] || 0) + 1;
      });
      return counts;
    },
    enabled: month > 0 && year > 0 && !!branchId && !!financialYearId,
  });

  // Map teacher ID to paid status
  const paidStatus = useMemo(() => {
    const map = {};
    existingPayments.forEach((p) => {
      map[p.teacher_id] = true;
    });
    return map;
  }, [existingPayments]);

  // Compute gross, TDS, net for each teacher
  const teacherCalculations = useMemo(() => {
    return teachers.map((t) => {
      let gross = 0;
      let lectureCount = 0;

      if (t.salary_type === "fixed") {
        gross = t.monthly_salary || 0;
      } else if (t.salary_type === "lecture_based") {
        lectureCount = lectureCounts[t.id] || 0;
        gross = (t.per_lecture_rate || 0) * lectureCount;
      }

      const tdsPercent = t.tds_percentage || 10;
      const tdsAmount = (gross * tdsPercent) / 100;
      const net = gross - tdsAmount;
      return { ...t, estimatedGross: gross, tdsPercent, tdsAmount, net, lectureCount };
    });
  }, [teachers, lectureCounts]);

  const isAlreadyPaid = (teacherId) => !!paidStatus[teacherId];

  const toggleSelect = (teacherId) => {
    setSelectedTeachers((prev) =>
      prev.includes(teacherId)
        ? prev.filter((id) => id !== teacherId)
        : [...prev, teacherId]
    );
  };

  const toggleSelectAll = () => {
    if (selectAll) {
      setSelectedTeachers([]);
    } else {
      const allIds = teachers.map((t) => t.id);
      setSelectedTeachers(allIds);
    }
    setSelectAll(!selectAll);
  };

  useEffect(() => {
    setSelectedTeachers([]);
    setSelectAll(false);
  }, [teachers]);

  // Generate mutation
  const generateMutation = useMutation({
    mutationFn: async () => {
      setGenerating(true);
      const results = [];
      for (const teacherId of selectedTeachers) {
        try {
          const calc = teacherCalculations.find((tc) => tc.id === teacherId);
          const grossAmount = calc?.estimatedGross || 0;
          const result = await generateTeacherSalary(teacherId, month, year, grossAmount, ctx);
          results.push(result);
        } catch (err) {
          console.error(`Failed for teacher ${teacherId}:`, err);
          results.push({ teacher_id: teacherId, error: err.message });
        }
      }
      return results;
    },
    onSuccess: (data) => {
      setResults(data);
      const successCount = data.filter((r) => !r.error).length;
      toast.success(`Generated ${successCount} salary entries`);
      qc.invalidateQueries(["existing-salary-payments"]);
      qc.invalidateQueries(["salary-payments"]);
      setGenerating(false);
    },
    onError: (err) => {
      toast.error(err.message || "Generation failed");
      setGenerating(false);
    },
  });

  const handleGenerate = () => {
    if (selectedTeachers.length === 0) {
      toast.error("Please select at least one teacher");
      return;
    }
    if (!window.confirm(`Generate salaries for ${selectedTeachers.length} teacher(s)?`)) return;
    generateMutation.mutate();
  };

  const toggleExpand = (teacherId) => {
    setExpandedTeacher(expandedTeacher === teacherId ? null : teacherId);
  };

  const selectedCount = selectedTeachers.length;
  const totalCount = teachers.length;

  return (
    <div className="space-y-6 px-4 sm:px-6 lg:px-0">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1
            className="text-2xl sm:text-3xl font-bold"
            style={{ fontFamily: "var(--font-heading)", color: "var(--color-primary)" }}
          >
            Generate Salaries
          </h1>
          <p
            className="text-sm text-gray-600 dark:text-gray-400 mt-1"
            style={{ fontFamily: "var(--font-body)" }}
          >
            Select teachers and generate salary for the chosen month
          </p>
        </div>
        <div className="flex items-center gap-3 mt-2 sm:mt-0">
          <div className="flex items-center gap-2">
            <Calendar className="text-gray-500 dark:text-gray-400 w-4 h-4" />
            <select
              value={month}
              onChange={(e) => setMonth(Number(e.target.value))}
              className="border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 rounded-lg p-2 text-sm"
            >
              {Array.from({ length: 12 }, (_, i) => i + 1).map((m) => (
                <option key={m} value={m}>
                  {new Date(0, m - 1).toLocaleString("default", { month: "long" })}
                </option>
              ))}
            </select>
            <input
              type="number"
              min="2020"
              max="2030"
              value={year}
              onChange={(e) => setYear(Number(e.target.value))}
              className="border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 rounded-lg p-2 text-sm w-24"
            />
          </div>
          <button
            onClick={handleGenerate}
            disabled={generating || selectedCount === 0}
            className="bg-primary hover:bg-primary-light text-white px-6 py-2 rounded-lg font-medium transition disabled:opacity-50 flex items-center gap-2"
            style={{ fontFamily: "var(--font-body)" }}
          >
            {generating ? (
              <>
                <Loader className="w-4 h-4 animate-spin" />
                Generating...
              </>
            ) : (
              <>
                <TrendingUp className="w-4 h-4" />
                Generate ({selectedCount})
              </>
            )}
          </button>
        </div>
      </div>

      {/* Teacher Table */}
      <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[700px]">
            <thead className="bg-gray-50 dark:bg-gray-700">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                  <button
                    onClick={toggleSelectAll}
                    className="flex items-center gap-1 hover:text-primary dark:hover:text-primary-light transition"
                  >
                    {selectAll ? (
                      <CheckSquare className="w-4 h-4 text-primary" />
                    ) : (
                      <Square className="w-4 h-4 text-gray-400 dark:text-gray-500" />
                    )}
                  </button>
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                  Teacher
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                  Type
                </th>
                <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                  Rate
                </th>
                <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                  Lectures
                </th>
                <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                  Est. Gross
                </th>
                <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                  TDS %
                </th>
                <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                  Status
                </th>
                <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                  Details
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
              {loadingTeachers ? (
                <tr>
                  <td colSpan={9} className="text-center py-8 text-gray-500 dark:text-gray-400">
                    Loading teachers...
                  </td>
                </tr>
              ) : teachers.length === 0 ? (
                <tr>
                  <td colSpan={9} className="text-center py-8 text-gray-500 dark:text-gray-400">
                    No active teachers found.
                  </td>
                </tr>
              ) : (
                teachers.map((t) => {
                  const paid = isAlreadyPaid(t.id);
                  const selected = selectedTeachers.includes(t.id);
                  const calc = teacherCalculations.find((tc) => tc.id === t.id);
                  const isExpanded = expandedTeacher === t.id;

                  return (
                    <tr
                      key={t.id}
                      className="hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
                    >
                      <td className="px-4 py-3">
                        <button
                          onClick={() => toggleSelect(t.id)}
                          className="flex items-center"
                          disabled={paid}
                        >
                          {paid ? (
                            <CheckSquare className="w-4 h-4 text-green-500" />
                          ) : selected ? (
                            <CheckSquare className="w-4 h-4 text-primary" />
                          ) : (
                            <Square className="w-4 h-4 text-gray-400 dark:text-gray-500" />
                          )}
                        </button>
                      </td>
                      <td className="px-4 py-3 text-sm font-medium text-gray-800 dark:text-gray-100">
                        {t.first_name} {t.last_name}
                      </td>
                      <td className="px-4 py-3 text-sm">
                        <span
                          className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                            t.salary_type === "fixed"
                              ? "bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-200"
                              : "bg-purple-100 text-purple-700 dark:bg-purple-900 dark:text-purple-200"
                          }`}
                        >
                          {t.salary_type === "fixed" ? "Fixed" : "Lecture"}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right text-sm text-gray-700 dark:text-gray-200">
                        {t.salary_type === "fixed"
                          ? `₹ ${t.monthly_salary?.toLocaleString("en-IN")}`
                          : `₹ ${t.per_lecture_rate?.toLocaleString("en-IN")} / lecture`}
                      </td>
                      <td className="px-4 py-3 text-right text-sm text-gray-700 dark:text-gray-200">
                        {t.salary_type === "lecture_based" ? calc?.lectureCount || 0 : "—"}
                      </td>
                      <td className="px-4 py-3 text-right text-sm text-gray-700 dark:text-gray-200">
                        {calc?.estimatedGross
                          ? `₹ ${calc.estimatedGross.toLocaleString("en-IN")}`
                          : "—"}
                      </td>
                      <td className="px-4 py-3 text-right text-sm text-gray-700 dark:text-gray-200">
                        {t.tds_percentage || 10}%
                      </td>
                      <td className="px-4 py-3 text-center text-sm">
                        {paid ? (
                          <span className="px-2 py-0.5 rounded-full text-xs bg-green-100 dark:bg-green-900 text-green-700 dark:text-green-200">
                            Paid
                          </span>
                        ) : (
                          <span className="px-2 py-0.5 rounded-full text-xs bg-yellow-100 dark:bg-yellow-900 text-yellow-700 dark:text-yellow-200">
                            Pending
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-center text-sm">
                        <button
                          onClick={() => toggleExpand(t.id)}
                          className="text-gray-400 dark:text-gray-500 hover:text-primary dark:hover:text-primary-light transition"
                        >
                          {isExpanded ? (
                            <ChevronUp className="w-4 h-4" />
                          ) : (
                            <ChevronDown className="w-4 h-4" />
                          )}
                        </button>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {/* Summary Footer */}
        <div className="px-4 py-3 border-t border-gray-200 dark:border-gray-700 flex flex-col sm:flex-row justify-between items-start sm:items-center text-sm">
          <span className="text-gray-600 dark:text-gray-400">
            {selectedCount} of {totalCount} teachers selected
          </span>
          <div className="flex gap-4 text-xs mt-1 sm:mt-0">
            <span className="text-green-600 dark:text-green-400">
              {teachers.filter((t) => isAlreadyPaid(t.id)).length} paid this month
            </span>
            <span className="text-yellow-600 dark:text-yellow-400">
              {teachers.filter((t) => !isAlreadyPaid(t.id)).length} pending
            </span>
          </div>
        </div>
      </div>

      {/* Results summary */}
      {results && (
        <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm p-4 border border-gray-200 dark:border-gray-700">
          <h3 className="font-medium mb-2" style={{ color: "var(--color-primary)" }}>
            Generation Results
          </h3>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-sm text-gray-700 dark:text-gray-200">
            <div>Total: {results.length}</div>
            <div className="text-green-600 dark:text-green-400">
              Success: {results.filter((r) => !r.error).length}
            </div>
            <div className="text-red-600 dark:text-red-400">
              Failed: {results.filter((r) => r.error).length}
            </div>
            <div>
              Total Amount: ₹{" "}
              {results
                .filter((r) => !r.error)
                .reduce((sum, r) => sum + (r.amount || 0), 0)
                .toLocaleString("en-IN")}
            </div>
          </div>
          {results.some((r) => r.error) && (
            <div className="mt-2 text-xs text-red-600 dark:text-red-400">
              {results
                .filter((r) => r.error)
                .map((r) => (
                  <div key={r.teacher_id}>
                    Teacher ID {r.teacher_id}: {r.error}
                  </div>
                ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}