// src/pages/StudentResultsPage.jsx
import { useQuery } from "@tanstack/react-query";
import { supabase } from "../api/supabase";
import { useOrg } from "../context/OrganizationContext";
import { Award, Calendar, Layers, BookOpen } from "lucide-react";

export default function StudentResultsPage({ studentId: propStudentId = null, standalone = true }) {
  const { branch, selectedFinancialYear } = useOrg();
  const branchId = branch?.id;
  const financialYearId = selectedFinancialYear?.id;

  const effectiveStudentId = propStudentId;

  const { data: results = [], isLoading } = useQuery({
    queryKey: ["student-results", effectiveStudentId, branchId, financialYearId],
    queryFn: async () => {
      if (!effectiveStudentId || !branchId || !financialYearId) return [];
      let query = supabase
        .from("student_results")
        .select(`
          marks_obtained,
          remarks,
          grade,
          exams (
            exam_name,
            exam_date,
            total_marks,
            batches (
              batch_name,
              courses ( course_name ),
              mediums ( name )
            )
          )
        `)
        .eq("student_id", effectiveStudentId);
      if (branchId) query = query.eq("branch_id", branchId);
      if (financialYearId) query = query.eq("financial_year_id", financialYearId);
      const { data } = await query.order("exam_id", { ascending: false });
      return data || [];
    },
    enabled: !!effectiveStudentId && !!branchId && !!financialYearId,
    staleTime: 2 * 60 * 1000,
  });

  const content = (
    <div>
      {isLoading ? (
        <div className="p-4 text-center text-secondary">Loading results…</div>
      ) : results.length === 0 ? (
        <div className="bg-white rounded-xl p-8 shadow-sm border border-secondary-light text-center">
          <Award size={32} className="text-secondary-light mx-auto mb-2" />
          <p className="text-secondary">No exam results found for this student.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {results.map((res, idx) => {
            const exam = res.exams;
            return (
              <div
                key={idx}
                className="bg-white rounded-xl p-4 shadow-sm border border-secondary-light"
              >
                <div className="flex items-center gap-2 mb-1">
                  <Award size={18} className="text-primary" />
                  <h3 className="font-bold text-primary-dark">{exam?.exam_name}</h3>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 text-sm text-secondary-dark">
                  <div className="flex items-center gap-1">
                    <Layers size={16} /> {exam?.batches?.batch_name}
                  </div>
                  <div className="flex items-center gap-1">
                    <BookOpen size={16} /> {exam?.batches?.courses?.course_name}
                  </div>
                  <div className="flex items-center gap-1">
                    <Calendar size={16} /> {exam?.exam_date}
                  </div>
                </div>
                <div className="flex flex-wrap items-center gap-4 mt-2 text-sm">
                  <span>
                    Marks: <strong>{res.marks_obtained}</strong>
                    {exam?.total_marks && ` / ${exam.total_marks}`}
                  </span>
                  {res.grade && (
                    <span className="bg-primary-bg text-primary px-2 py-0.5 rounded-full text-xs">
                      Grade: {res.grade}
                    </span>
                  )}
                  {res.remarks && (
                    <span className="text-secondary text-xs">Remarks: {res.remarks}</span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );

  if (!standalone) return <div>{content}</div>;
  return (
    <div className="p-6">
      <h1 className="text-3xl font-righteous text-primary-dark mb-4">My Results</h1>
      {content}
    </div>
  );
}