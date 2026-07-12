// src/pages/StudentResultsPage.jsx
import { useQuery } from "@tanstack/react-query";
import { Award } from "lucide-react";
import AdminLayout from "../layouts/AdminLayout";
import BackButton from "../components/BackButton";

import { useStudentId } from "../hooks/useStudentId";
import { supabase } from "../api/supabase";
import { useOrg } from "../context/OrganizationContext";   // NEW

export default function StudentResultsPage() {
  const { studentId, isLoading: idLoading } = useStudentId();

  // ── Branch & Financial Year context ──
  const { branch, selectedFinancialYear } = useOrg();
  const branchId = branch?.id;
  const financialYearId = selectedFinancialYear?.id;

  const { data: results = [], isLoading } = useQuery({
    queryKey: ["student-results-list", studentId, branchId, financialYearId],
    queryFn: async () => {
      if (!studentId || !branchId || !financialYearId) return [];

      let query = supabase
        .from("student_results")
        .select(`marks_obtained, remarks, exams(exam_name, total_marks, exam_date, subjects(subject_name))`)
        .eq("student_id", studentId)
        .order("exam_id", { ascending: false });

      // Scope the results themselves
      if (branchId) query = query.eq("branch_id", branchId);
      if (financialYearId) query = query.eq("financial_year_id", financialYearId);

      // Also scope the nested exams table (via foreign table filter)
      if (branchId) query = query.eq("exams.branch_id", branchId);
      if (financialYearId) query = query.eq("exams.financial_year_id", financialYearId);

      const { data } = await query;
      return data || [];
    },
    enabled: !!studentId && !!branchId && !!financialYearId,
    staleTime: 2 * 60 * 1000,
  });

  if (idLoading || isLoading) {
    return <AdminLayout>
      <BackButton to="/student" label="My Dashboard" /><div className="p-8 text-center">Loading...</div></AdminLayout>;
  }

  return (
    <AdminLayout>
      <h1 className="text-3xl font-righteous text-primary-dark mb-6">My Results</h1>
      {results.length === 0 ? (
        <p className="text-secondary">No exam results yet.</p>
      ) : (
        <div className="space-y-4">
          {results.map((r, idx) => (
            <div key={idx} className="bg-white rounded-xl p-4 shadow-sm border border-secondary-light">
              <div className="flex justify-between items-center">
                <div>
                  <p className="font-semibold">{r.exams?.exam_name}</p>
                  <p className="text-sm text-secondary">{r.exams?.subjects?.subject_name} – {r.exams?.exam_date}</p>
                </div>
                <div className="text-right">
                  <p className="text-lg font-bold">{r.marks_obtained}/{r.exams?.total_marks}</p>
                  <p className="text-xs text-secondary">{r.remarks || ""}</p>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </AdminLayout>
  );
}