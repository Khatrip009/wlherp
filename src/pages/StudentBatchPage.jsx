import { useQuery } from "@tanstack/react-query";
import { supabase } from "../api/supabase";
import { useAuth } from "../context/AuthContext";
import {
  Layers, BookOpen, Clock, Calendar, User, Hash, AlertCircle,
} from "lucide-react";
import AdminLayout from "../layouts/AdminLayout";
import BackButton from "../components/BackButton";

import { useOrg } from "../context/OrganizationContext";   // NEW

export default function StudentBatchPage() {
  const { user } = useAuth();

  // ── Branch & Financial Year context ──
  const { branch, selectedFinancialYear } = useOrg();
  const branchId = branch?.id;
  const financialYearId = selectedFinancialYear?.id;

  const { data, isLoading, error } = useQuery({
    queryKey: ["my-batch-full", user?.id, branchId, financialYearId],
    queryFn: async () => {
      if (!user?.id) return null;

      // 1. Find student ID – scoped to branch & FY
      let studentQuery = supabase
        .from("students")
        .select("id")
        .eq("user_id", user.id);
      if (branchId) studentQuery = studentQuery.eq("branch_id", branchId);
      if (financialYearId) studentQuery = studentQuery.eq("financial_year_id", financialYearId);
      const { data: student, error: studentError } = await studentQuery.maybeSingle();
      if (studentError) throw studentError;
      if (!student?.id) return { studentId: null, batch: null, subjects: [], teachers: [] };

      // 2. Get active batch with all nested data – scoped
      let batchQuery = supabase
        .from("student_batches")
        .select(`
          batch_id,
          enrollment_date,
          batches (
            id, batch_name, start_time, end_time, days, start_date, end_date,
            course_id,
            medium_id,
            mediums ( name ),
            courses ( course_name, subjects ( id, subject_name ) ),
            batch_teachers ( teacher_id, subject_id, teachers ( first_name, last_name ), subjects ( subject_name ) )
          )
        `)
        .eq("student_id", student.id)
        .eq("status", "active");

      if (branchId) batchQuery = batchQuery.eq("branch_id", branchId);
      if (financialYearId) batchQuery = batchQuery.eq("financial_year_id", financialYearId);

      const { data: batchAssignment, error: batchError } = await batchQuery.maybeSingle();
      if (batchError) throw batchError;
      if (!batchAssignment) return { studentId: student.id, batch: null, subjects: [], teachers: [] };

      const batch = batchAssignment.batches;

      const subjects = batch?.courses?.subjects || [];

      const teachers = batch?.batch_teachers?.map((bt) => ({
        teacher_id: bt.teacher_id,
        teacher_name: bt.teachers
          ? `${bt.teachers.first_name} ${bt.teachers.last_name}`
          : "Unknown",
        subject_name: bt.subjects?.subject_name || "General",
      })) || [];

      return {
        studentId: student.id,
        batch: {
          ...batch,
          enrollment_date: batchAssignment.enrollment_date,
          medium_name: batch?.mediums?.name || "",
        },
        subjects,
        teachers,
      };
    },
    enabled: !!user?.id && !!branchId && !!financialYearId,
    staleTime: 5 * 60 * 1000,
  });

  if (isLoading) {
    return (
      <AdminLayout>
      <BackButton to="/student" label="My Dashboard" />
        <div className="p-8 text-center text-secondary">Loading your batch…</div>
      </AdminLayout>
    );
  }

  if (error) {
    return (
      <AdminLayout>
        <div className="p-8 text-center text-red-600">
          <AlertCircle size={32} className="mx-auto mb-2" />
          <p>Failed to load batch data:</p>
          <p className="text-sm mt-1">{error.message}</p>
        </div>
      </AdminLayout>
    );
  }

  if (!data || !data.batch) {
    return (
      <AdminLayout>
        <div className="p-8 text-center text-secondary">
          <BookOpen size={32} className="mx-auto mb-2 text-secondary-light" />
          <p>You are not enrolled in any active batch.</p>
        </div>
      </AdminLayout>
    );
  }

  const { batch, subjects, teachers } = data;

  return (
    <AdminLayout>
      <div className="mb-6">
        <h1 className="text-3xl font-righteous text-primary-dark">My Batch</h1>
        <p className="text-sm text-secondary-dark font-montserrat mt-1">
          Your current batch and subject details
        </p>
      </div>

      {/* Batch Details */}
      <div className="bg-white rounded-xl p-6 shadow-sm border border-secondary-light mb-6">
        <div className="flex flex-wrap items-center gap-2 mb-4">
          <Layers size={20} className="text-primary" />
          <h2 className="text-xl font-righteous text-primary-dark">{batch.batch_name}</h2>
          <span className="bg-primary-bg text-primary px-2 py-0.5 rounded-full text-xs">
            {batch.courses?.course_name}
          </span>
          {batch.medium_name && (
            <span className="bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full text-xs">
              {batch.medium_name}
            </span>
          )}
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm text-secondary-dark">
          <div className="flex items-center gap-2">
            <Clock size={16} className="text-secondary" />
            <span>{batch.start_time} - {batch.end_time}</span>
          </div>
          <div className="flex items-center gap-2">
            <Calendar size={16} className="text-secondary" />
            <span>{batch.days}</span>
          </div>
          <div className="flex items-center gap-2">
            <Hash size={16} className="text-secondary" />
            <span>Enrolled: {batch.enrollment_date}</span>
          </div>
          <div className="flex items-center gap-2">
            <Calendar size={16} className="text-secondary" />
            <span>Period: {batch.start_date} → {batch.end_date}</span>
          </div>
        </div>
      </div>

      {/* Subjects */}
      <div className="bg-white rounded-xl p-6 shadow-sm border border-secondary-light mb-6">
        <h2 className="text-lg font-righteous text-primary-dark mb-3 flex items-center gap-2">
          <BookOpen size={18} /> Subjects
        </h2>
        {subjects.length > 0 ? (
          <div className="flex flex-wrap gap-2">
            {subjects.map((subj) => (
              <span key={subj.id} className="bg-primary-bg text-primary px-3 py-1.5 rounded-full text-sm">
                {subj.subject_name}
              </span>
            ))}
          </div>
        ) : (
          <p className="text-sm text-secondary">No subjects listed for this course.</p>
        )}
      </div>

      {/* Teacher Assignments */}
      <div className="bg-white rounded-xl p-6 shadow-sm border border-secondary-light">
        <h2 className="text-lg font-righteous text-primary-dark mb-3 flex items-center gap-2">
          <User size={18} /> Teacher Assignments
        </h2>
        {teachers.length > 0 ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {teachers.map((t, idx) => (
              <div key={idx} className="flex items-center gap-2 text-sm">
                <User size={16} className="text-primary" />
                <span className="font-medium">{t.teacher_name}</span>
                <span className="text-secondary">-</span>
                <span className="text-secondary">{t.subject_name}</span>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-sm text-secondary">No teacher assignments yet.</p>
        )}
      </div>
    </AdminLayout>
  );
}