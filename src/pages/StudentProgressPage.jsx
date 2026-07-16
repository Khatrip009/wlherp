// src/pages/StudentProgressPage.jsx
import { useQuery } from "@tanstack/react-query";
import { supabase } from "../api/supabase";
import { useOrg } from "../context/OrganizationContext";
import { TrendingUp, Calendar, Layers, User } from "lucide-react";

export default function StudentProgressPage({ studentId: propStudentId = null, standalone = true }) {
  const { branch, selectedFinancialYear } = useOrg();
  const branchId = branch?.id;
  const financialYearId = selectedFinancialYear?.id;

  const effectiveStudentId = propStudentId;

  const { data: evaluations = [], isLoading } = useQuery({
    queryKey: ["student-progress", effectiveStudentId, branchId, financialYearId],
    queryFn: async () => {
      if (!effectiveStudentId || !branchId || !financialYearId) return [];
      let query = supabase
        .from("student_progress")
        .select(`
          evaluation_date,
          attendance_percentage,
          performance_score,
          teacher_remarks,
          batches ( batch_name, courses ( course_name ) )
        `)
        .eq("student_id", effectiveStudentId);
      if (branchId) query = query.eq("branch_id", branchId);
      if (financialYearId) query = query.eq("financial_year_id", financialYearId);
      const { data } = await query.order("evaluation_date", { ascending: false });
      return data || [];
    },
    enabled: !!effectiveStudentId && !!branchId && !!financialYearId,
    staleTime: 2 * 60 * 1000,
  });

  const content = (
    <div>
      {isLoading ? (
        <div className="p-4 text-center text-secondary">Loading progress…</div>
      ) : evaluations.length === 0 ? (
        <div className="bg-white rounded-xl p-8 shadow-sm border border-secondary-light text-center">
          <TrendingUp size={32} className="text-secondary-light mx-auto mb-2" />
          <p className="text-secondary">No progress evaluations found.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {evaluations.map((evalItem, idx) => (
            <div
              key={idx}
              className="bg-white rounded-xl p-4 shadow-sm border border-secondary-light"
            >
              <div className="flex items-center gap-2 mb-1">
                <TrendingUp size={18} className="text-primary" />
                <span className="font-bold text-primary-dark">
                  {evalItem.batches?.batch_name}
                </span>
                {evalItem.batches?.courses?.course_name && (
                  <span className="text-sm text-secondary-dark">
                    ({evalItem.batches.courses.course_name})
                  </span>
                )}
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 text-sm">
                <div className="flex items-center gap-1">
                  <Calendar size={16} className="text-secondary" />
                  <span>{evalItem.evaluation_date}</span>
                </div>
                {evalItem.attendance_percentage !== null && (
                  <div className="flex items-center gap-1">
                    <User size={16} className="text-secondary" />
                    <span>Attendance: {evalItem.attendance_percentage}%</span>
                  </div>
                )}
                {evalItem.performance_score !== null && (
                  <div className="flex items-center gap-1">
                    <TrendingUp size={16} className="text-secondary" />
                    <span>Score: {evalItem.performance_score}</span>
                  </div>
                )}
              </div>
              {evalItem.teacher_remarks && (
                <div className="mt-2 text-sm text-secondary-dark border-t pt-2">
                  Remarks: {evalItem.teacher_remarks}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );

  if (!standalone) return <div>{content}</div>;
  return (
    <div className="p-6">
      <h1 className="text-3xl font-righteous text-primary-dark mb-4">My Progress</h1>
      {content}
    </div>
  );
}