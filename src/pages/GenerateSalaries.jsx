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

  // ── Organisation / Branch / Financial Year context ──
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

  // ---------- NEW: Fetch lecture counts for the month – scoped ----------
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

  // Compute gross, TDS, net for each teacher (with lecture counts)
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

  // Check if a teacher is already paid for the selected month
  const isAlreadyPaid = (teacherId) => {
    return !!paidStatus[teacherId];
  };

  // Handle selection
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

  // Reset selection when teachers change
  useEffect(() => {
    setSelectedTeachers([]);
    setSelectAll(false);
  }, [teachers]);

  // Generate mutation – now passes context (branch & financial year)
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
    if (
      !window.confirm(
        `Generate salaries for ${selectedTeachers.length} teacher(s)?`
      )
    )
      return;
    generateMutation.mutate();
  };

  const toggleExpand = (teacherId) => {
    setExpandedTeacher(expandedTeacher === teacherId ? null : teacherId);
  };

  const selectedCount = selectedTeachers.length;
  const totalCount = teachers.length;

  return (
    <>
      <div className="flex flex-col sm:flex-row sm:items-center justify-between mb-6">
        <div>
          <h1 className="text-3xl font-righteous text-primary-dark">
            Generate Salaries
          </h1>
          <p className="text-secondary-dark text-sm mt-1">
            Select teachers and generate salary for the chosen month
          </p>
        </div>
        <div className="flex items-center gap-3 mt-2 sm:mt-0">
          <div className="flex items-center gap-2">
            <Calendar className="text-secondary-light w-4 h-4" />
            <select
              value={month}
              onChange={(e) => setMonth(Number(e.target.value))}
              className="border rounded-lg p-2 text-sm focus:ring-1 focus:ring-primary"
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
              className="border rounded-lg p-2 text-sm w-24 focus:ring-1 focus:ring-primary"
            />
          </div>
          <button
            onClick={handleGenerate}
            disabled={generating || selectedCount === 0}
            className="bg-primary hover:bg-primary-light text-white px-6 py-2 rounded-lg font-medium transition disabled:opacity-50 flex items-center gap-2"
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

      {/* Teacher Table (unchanged) */}
      <div className="bg-white rounded-xl shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-slate-50 border-b">
              <tr>
                <th className="px-4 py-3 text-left text-sm font-medium text-secondary-dark">
                  <button
                    onClick={toggleSelectAll}
                    className="flex items-center gap-1 hover:text-primary transition"
                  >
                    {selectAll ? (
                      <CheckSquare className="w-4 h-4 text-primary" />
                    ) : (
                      <Square className="w-4 h-4 text-secondary-light" />
                    )}
                  </button>
                </th>
                <th className="px-4 py-3 text-left text-sm font-medium text-secondary-dark">
                  Teacher
                </th>
                <th className="px-4 py-3 text-left text-sm font-medium text-secondary-dark">
                  Type
                </th>
                <th className="px-4 py-3 text-right text-sm font-medium text-secondary-dark">
                  Rate
                </th>
                <th className="px-4 py-3 text-right text-sm font-medium text-secondary-dark">
                  Lectures
                </th>
                <th className="px-4 py-3 text-right text-sm font-medium text-secondary-dark">
                  Est. Gross
                </th>
                <th className="px-4 py-3 text-right text-sm font-medium text-secondary-dark">
                  TDS %
                </th>
                <th className="px-4 py-3 text-center text-sm font-medium text-secondary-dark">
                  Status
                </th>
                <th className="px-4 py-3 text-center text-sm font-medium text-secondary-dark">
                  Details
                </th>
              </tr>
            </thead>
            <tbody>
              {loadingTeachers ? (
                <tr>
                  <td colSpan={9} className="text-center py-8 text-secondary">
                    Loading teachers...
                  </td>
                </tr>
              ) : teachers.length === 0 ? (
                <tr>
                  <td colSpan={9} className="text-center py-8 text-secondary">
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
                      className="border-t hover:bg-gray-50 transition"
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
                            <Square className="w-4 h-4 text-secondary-light" />
                          )}
                        </button>
                      </td>
                      <td className="px-4 py-3 text-sm font-medium">
                        {t.first_name} {t.last_name}
                      </td>
                      <td className="px-4 py-3 text-sm">
                        <span
                          className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                            t.salary_type === "fixed"
                              ? "bg-blue-100 text-blue-700"
                              : "bg-purple-100 text-purple-700"
                          }`}
                        >
                          {t.salary_type === "fixed" ? "Fixed" : "Lecture"}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right text-sm">
                        {t.salary_type === "fixed"
                          ? `₹ ${t.monthly_salary?.toLocaleString("en-IN")}`
                          : `₹ ${t.per_lecture_rate?.toLocaleString("en-IN")} / lecture`}
                      </td>
                      <td className="px-4 py-3 text-right text-sm">
                        {t.salary_type === "lecture_based" ? calc?.lectureCount || 0 : "—"}
                      </td>
                      <td className="px-4 py-3 text-right text-sm">
                        {calc?.estimatedGross
                          ? `₹ ${calc.estimatedGross.toLocaleString("en-IN")}`
                          : "—"}
                      </td>
                      <td className="px-4 py-3 text-right text-sm">
                        {t.tds_percentage || 10}%
                      </td>
                      <td className="px-4 py-3 text-center text-sm">
                        {paid ? (
                          <span className="px-2 py-0.5 rounded-full text-xs bg-green-100 text-green-700">
                            Paid
                          </span>
                        ) : (
                          <span className="px-2 py-0.5 rounded-full text-xs bg-yellow-100 text-yellow-700">
                            Pending
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-center text-sm">
                        <button
                          onClick={() => toggleExpand(t.id)}
                          className="text-secondary-light hover:text-primary transition"
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
        <div className="px-4 py-3 border-t flex flex-col sm:flex-row justify-between items-start sm:items-center text-sm">
          <span className="text-secondary-dark">
            {selectedCount} of {totalCount} teachers selected
          </span>
          <div className="flex gap-4 text-xs">
            <span className="text-green-600">
              {teachers.filter((t) => isAlreadyPaid(t.id)).length} paid this
              month
            </span>
            <span className="text-yellow-600">
              {teachers.filter((t) => !isAlreadyPaid(t.id)).length} pending
            </span>
          </div>
        </div>
      </div>

      {/* Results summary */}
      {results && (
        <div className="mt-6 bg-white rounded-xl shadow-sm p-4 border">
          <h3 className="font-medium text-primary-dark mb-2">
            Generation Results
          </h3>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-sm">
            <div>Total: {results.length}</div>
            <div className="text-green-600">
              Success: {results.filter((r) => !r.error).length}
            </div>
            <div className="text-red-600">
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
            <div className="mt-2 text-xs text-red-600">
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
    </>
  );
}