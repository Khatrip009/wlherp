// src/pages/StudentHomeworkPage.jsx
import { useQuery } from "@tanstack/react-query";
import { supabase } from "../api/supabase";
import { useOrg } from "../context/OrganizationContext";
import { BookOpen, Calendar, Layers, FileText } from "lucide-react";

export default function StudentHomeworkPage({ studentId: propStudentId = null, standalone = true }) {
  const { branch, selectedFinancialYear } = useOrg();
  const branchId = branch?.id;
  const financialYearId = selectedFinancialYear?.id;

  const effectiveStudentId = propStudentId;

  // 1. Get active batch IDs
  const { data: batchIds = [], isLoading: batchesLoading } = useQuery({
    queryKey: ["student-batch-ids-homework", effectiveStudentId, branchId, financialYearId],
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

  // 2. Get homework for those batches
  const { data: homeworks = [], isLoading: homeworkLoading } = useQuery({
    queryKey: ["student-homework", batchIds, branchId, financialYearId],
    queryFn: async () => {
      if (batchIds.length === 0 || !branchId || !financialYearId) return [];
      let query = supabase
        .from("homework")
        .select(`*, subjects(subject_name), batches(batch_name, mediums(name))`)
        .in("batch_id", batchIds);
      if (branchId) query = query.eq("branch_id", branchId);
      if (financialYearId) query = query.eq("financial_year_id", financialYearId);
      const { data } = await query.order("due_date", { ascending: true });
      return data || [];
    },
    enabled: batchIds.length > 0 && !!branchId && !!financialYearId,
    staleTime: 2 * 60 * 1000,
  });

  // 3. Get student's submissions
  const { data: submissions = [] } = useQuery({
    queryKey: ["student-submissions-homework", effectiveStudentId, branchId, financialYearId],
    queryFn: async () => {
      if (!effectiveStudentId || !branchId || !financialYearId) return [];
      let query = supabase
        .from("homework_submissions")
        .select("*")
        .eq("student_id", effectiveStudentId);
      if (branchId) query = query.eq("branch_id", branchId);
      if (financialYearId) query = query.eq("financial_year_id", financialYearId);
      const { data } = await query;
      return data || [];
    },
    enabled: !!effectiveStudentId && !!branchId && !!financialYearId,
    staleTime: 2 * 60 * 1000,
  });

  const submissionMap = {};
  submissions.forEach((sub) => {
    if (!submissionMap[sub.homework_id]) submissionMap[sub.homework_id] = [];
    submissionMap[sub.homework_id].push(sub);
  });

  const isLoading = batchesLoading || homeworkLoading;

  const content = (
    <div>
      {isLoading ? (
        <div className="p-4 text-center text-secondary">Loading homework…</div>
      ) : homeworks.length === 0 ? (
        <div className="bg-white rounded-xl p-8 shadow-sm border border-secondary-light text-center">
          <BookOpen size={32} className="text-secondary-light mx-auto mb-2" />
          <p className="text-secondary">No homework assigned to this student.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {homeworks.map((hw) => {
            const subs = submissionMap[hw.id] || [];
            const submitted = subs.length > 0;
            return (
              <div
                key={hw.id}
                className="bg-white rounded-xl p-4 shadow-sm border border-secondary-light"
              >
                <div className="flex items-center gap-2 mb-1">
                  <BookOpen size={18} className="text-primary" />
                  <h3 className="font-bold text-primary-dark">{hw.title}</h3>
                </div>
                <p className="text-sm text-secondary mt-1">{hw.description}</p>
                <div className="flex flex-wrap gap-4 mt-2 text-xs text-secondary-dark">
                  <span className="flex items-center gap-1">
                    <Layers size={14} /> {hw.subjects?.subject_name}
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
                    <span className="bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full">
                      {hw.batches.mediums.name}
                    </span>
                  )}
                </div>
                <div className="mt-2 text-sm">
                  {submitted ? (
                    <span className="text-green-600 flex items-center gap-1">
                      <FileText size={14} /> Submitted ({subs.length} file(s))
                    </span>
                  ) : (
                    <span className="text-amber-600">Not submitted</span>
                  )}
                  {subs.some((s) => s.marks !== null || s.remarks) && (
                    <div className="text-xs text-secondary mt-1">
                      {subs[0].marks !== null && <span>Marks: {subs[0].marks}</span>}
                      {subs[0].remarks && <span className="ml-2">Remarks: {subs[0].remarks}</span>}
                    </div>
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
      <h1 className="text-3xl font-righteous text-primary-dark mb-4">My Homework</h1>
      {content}
    </div>
  );
}