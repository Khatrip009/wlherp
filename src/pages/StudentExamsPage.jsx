// src/pages/StudentExamsPage.jsx
import { useQuery } from "@tanstack/react-query";
import { supabase } from "../api/supabase";
import { useOrg } from "../context/OrganizationContext";
import { Award, Calendar, Layers, BookOpen } from "lucide-react";

export default function StudentExamsPage({ studentId: propStudentId = null, standalone = true }) {
  const { branch, selectedFinancialYear } = useOrg();
  const branchId = branch?.id;
  const financialYearId = selectedFinancialYear?.id;

  const effectiveStudentId = propStudentId;

  // 1. Get active batch IDs for the student
  const { data: batchIds = [], isLoading: batchesLoading } = useQuery({
    queryKey: ["student-batch-ids-exams", effectiveStudentId, branchId, financialYearId],
    queryFn: async () => {
      if (!effectiveStudentId || !branchId || !financialYearId) return [];
      let query = supabase
        .from("student_batches")
        .select("batch_id")
        .eq("student_id", effectiveStudentId)
        .eq("status", "active");
      if (branchId) query = query.eq("branch_id", branchId);
      if (financialYearId) query = query.eq("financial_year_id", financialYearId);
      const { data } = await query;
      return data.map((row) => row.batch_id);
    },
    enabled: !!effectiveStudentId && !!branchId && !!financialYearId,
    staleTime: 5 * 60 * 1000,
  });

  // 2. Get all exams for those batches (both upcoming and past)
  const today = new Date().toISOString().split("T")[0];
  const { data: exams = [], isLoading: examsLoading } = useQuery({
    queryKey: ["student-exams", batchIds, branchId, financialYearId],
    queryFn: async () => {
      if (batchIds.length === 0 || !branchId || !financialYearId) return [];
      let query = supabase
        .from("exams")
        .select(`*, batches(batch_name, courses(course_name), mediums(name))`)
        .in("batch_id", batchIds);
      if (branchId) query = query.eq("branch_id", branchId);
      if (financialYearId) query = query.eq("financial_year_id", financialYearId);
      const { data } = await query.order("exam_date", { ascending: true });
      return data || [];
    },
    enabled: batchIds.length > 0 && !!branchId && !!financialYearId,
    staleTime: 2 * 60 * 1000,
  });

  const isLoading = batchesLoading || examsLoading;

  const content = (
    <div>
      {isLoading ? (
        <div className="p-4 text-center text-secondary">Loading exams…</div>
      ) : exams.length === 0 ? (
        <div className="bg-white rounded-xl p-8 shadow-sm border border-secondary-light text-center">
          <Award size={32} className="text-secondary-light mx-auto mb-2" />
          <p className="text-secondary">No exams found for this student.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {exams.map((exam) => (
            <div
              key={exam.id}
              className="bg-white rounded-xl p-4 shadow-sm border border-secondary-light"
            >
              <div className="flex items-center gap-2 mb-1">
                <Award size={18} className="text-primary" />
                <h3 className="font-bold text-primary-dark">{exam.exam_name}</h3>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 text-sm text-secondary-dark">
                <div className="flex items-center gap-1">
                  <Layers size={16} /> {exam.batches?.batch_name}
                </div>
                <div className="flex items-center gap-1">
                  <BookOpen size={16} /> {exam.batches?.courses?.course_name}
                </div>
                <div className="flex items-center gap-1">
                  <Calendar size={16} /> {exam.exam_date}
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-3 mt-2 text-xs text-secondary-dark">
                <span>Total Marks: {exam.total_marks || "N/A"}</span>
                {exam.batches?.mediums?.name && (
                  <span className="bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full">
                    {exam.batches.mediums.name}
                  </span>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );

  if (!standalone) return <div>{content}</div>;
  return (
    <div className="p-6">
      <h1 className="text-3xl font-righteous text-primary-dark mb-4">My Exams</h1>
      {content}
    </div>
  );
}