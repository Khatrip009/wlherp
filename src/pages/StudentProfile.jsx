// src/pages/StudentProfile.jsx
import { useState } from "react";
import { useParams, Link } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  UserCircle2,
  Phone,
  Mail,
  MapPin,
  School,
  Calendar,
  Hash,
  BookOpen,
  IndianRupee,
  Award,
  ArrowLeft,
  Users,
  FileText,
  TrendingUp,
  Layers,
} from "lucide-react";
import AdminLayout from "../layouts/AdminLayout";
import { useAuth } from "../context/AuthContext";
import { supabase } from "../api/supabase";
import StudentForm from "../components/StudentForm";
import { useOrg } from "../context/OrganizationContext";

const formatCurrency = (amount) => `₹${Number(amount).toLocaleString("en-IN")}`;

export default function StudentProfile() {
  const { id } = useParams();
  const { user } = useAuth();
  const queryClient = useQueryClient();

  // ── Branch & Financial Year context ──
  const { branch, selectedFinancialYear } = useOrg();
  const branchId = branch?.id;
  const financialYearId = selectedFinancialYear?.id;

  // Local state for editing modal
  const [editingStudent, setEditingStudent] = useState(null);

  // Resolve student ID (from URL or from logged-in student)
  const { data: resolvedStudentId, isLoading: resolving } = useQuery({
    queryKey: ["resolve-student-id", id, user?.id, branchId, financialYearId],
    queryFn: async () => {
      if (id) return id;
      if (!user?.id || !branchId || !financialYearId) return null;
      const { data } = await supabase
        .from("students")
        .select("id")
        .eq("user_id", user.id)
        .eq("branch_id", branchId)
        .eq("financial_year_id", financialYearId)
        .single();
      return data?.id || null;
    },
    enabled: (!!user?.id || !!id) && !!branchId && !!financialYearId,
  });

  const targetId = resolvedStudentId;

  // 1. Basic student info – scoped
  const {
    data: student,
    isLoading: studentLoading,
    error: studentError,
  } = useQuery({
    queryKey: ["student", targetId, branchId, financialYearId],
    queryFn: async () => {
      let query = supabase
        .from("students")
        .select("*")
        .eq("id", targetId);

      if (branchId) query = query.eq("branch_id", branchId);
      if (financialYearId) query = query.eq("financial_year_id", financialYearId);

      const { data, error } = await query.single();
      if (error) throw error;
      return data;
    },
    enabled: !!targetId && !!branchId && !!financialYearId,
  });

  // 2. Parents – scoped
  const { data: parents = [] } = useQuery({
    queryKey: ["student-parents", targetId, branchId, financialYearId],
    queryFn: async () => {
      let query = supabase
        .from("student_parents")
        .select("relation, parents(*)")
        .eq("student_id", targetId);

      if (branchId) {
        query = query.eq("branch_id", branchId);
        query = query.eq("parents.branch_id", branchId);
      }
      if (financialYearId) {
        query = query.eq("financial_year_id", financialYearId);
        query = query.eq("parents.financial_year_id", financialYearId);
      }

      const { data, error } = await query;
      if (error) throw error;
      return (data || [])
        .filter((item) => item.parents !== null)
        .map((item) => item.parents);
    },
    enabled: !!targetId && !!branchId && !!financialYearId,
  });

  // 3. Batches – scoped
  const { data: batches = [] } = useQuery({
    queryKey: ["student-batches", targetId, branchId, financialYearId],
    queryFn: async () => {
      let query = supabase
        .from("student_batches")
        .select(`batch_id, enrollment_date, batches(batch_name, course_id, courses(course_name))`)
        .eq("student_id", targetId)
        .eq("status", "active");

      if (branchId) query = query.eq("branch_id", branchId);
      if (financialYearId) query = query.eq("financial_year_id", financialYearId);

      const { data, error } = await query;
      if (error) throw error;
      return data || [];
    },
    enabled: !!targetId && !!branchId && !!financialYearId,
  });

  // 4. Fee summary – scoped
  const { data: feeSummary = { totalFee: 0, totalPaid: 0, pending: 0 } } = useQuery({
    queryKey: ["student-fee-summary", targetId, branchId, financialYearId],
    queryFn: async () => {
      let feesQuery = supabase
        .from("student_fees")
        .select("id, final_fee")
        .eq("student_id", targetId);

      if (branchId) feesQuery = feesQuery.eq("branch_id", branchId);
      if (financialYearId) feesQuery = feesQuery.eq("financial_year_id", financialYearId);

      const { data: fees, error } = await feesQuery;
      if (error) throw error;

      let totalFee = 0, totalPaid = 0;
      for (const fee of fees || []) {
        totalFee += Number(fee.final_fee);

        let paymentsQuery = supabase
          .from("fee_payments")
          .select("amount")
          .eq("student_fee_id", fee.id);

        if (branchId) paymentsQuery = paymentsQuery.eq("branch_id", branchId);
        if (financialYearId) paymentsQuery = paymentsQuery.eq("financial_year_id", financialYearId);

        const { data: payments } = await paymentsQuery;
        totalPaid += payments?.reduce((sum, p) => sum + Number(p.amount), 0) || 0;
      }
      const pending = Math.max(totalFee - totalPaid, 0);
      return { totalFee, totalPaid, pending };
    },
    enabled: !!targetId && !!branchId && !!financialYearId,
  });

  // 5. Attendance – scoped
  const { data: attendanceStats = { percentage: 0, totalSessions: 0, presentCount: 0 } } = useQuery({
    queryKey: ["student-attendance", targetId, branchId, financialYearId],
    queryFn: async () => {
      let batchQuery = supabase
        .from("student_batches")
        .select("batch_id")
        .eq("student_id", targetId)
        .eq("status", "active");

      if (branchId) batchQuery = batchQuery.eq("branch_id", branchId);
      if (financialYearId) batchQuery = batchQuery.eq("financial_year_id", financialYearId);

      const { data: batchRows } = await batchQuery;
      if (!batchRows?.length) return { percentage: 0, totalSessions: 0, presentCount: 0 };

      const batchIds = batchRows.map((r) => r.batch_id);
      let sessionQuery = supabase
        .from("attendance_sessions")
        .select("id")
        .in("batch_id", batchIds);

      if (branchId) sessionQuery = sessionQuery.eq("branch_id", branchId);
      if (financialYearId) sessionQuery = sessionQuery.eq("financial_year_id", financialYearId);

      const { data: sessions } = await sessionQuery;
      if (!sessions?.length) return { percentage: 0, totalSessions: 0, presentCount: 0 };

      const sessionIds = sessions.map((s) => s.id);
      let marksQuery = supabase
        .from("student_attendance")
        .select("status")
        .eq("student_id", targetId)
        .in("session_id", sessionIds);

      if (branchId) marksQuery = marksQuery.eq("branch_id", branchId);
      if (financialYearId) marksQuery = marksQuery.eq("financial_year_id", financialYearId);

      const { data: marks } = await marksQuery;
      const total = sessionIds.length;
      const present = marks?.filter((m) => m.status === "Present").length || 0;
      const percentage = total > 0 ? ((present / total) * 100).toFixed(1) : 0;
      return { percentage, totalSessions: total, presentCount: present };
    },
    enabled: !!targetId && !!branchId && !!financialYearId,
  });

  // 6. Recent results – scoped
  const { data: recentResults = [] } = useQuery({
    queryKey: ["student-results", targetId, branchId, financialYearId],
    queryFn: async () => {
      let query = supabase
        .from("student_results")
        .select(`marks_obtained, remarks, exams(exam_name, exam_date, total_marks)`)
        .eq("student_id", targetId)
        .order("exam_id", { ascending: false })
        .limit(3);

      if (branchId) {
        query = query.eq("branch_id", branchId);
        query = query.eq("exams.branch_id", branchId);
      }
      if (financialYearId) {
        query = query.eq("financial_year_id", financialYearId);
        query = query.eq("exams.financial_year_id", financialYearId);
      }

      const { data } = await query;
      return data || [];
    },
    enabled: !!targetId && !!branchId && !!financialYearId,
  });

  // 7. Progress evaluations – scoped
  const { data: progressEvaluations = [] } = useQuery({
    queryKey: ["student-progress", targetId, branchId, financialYearId],
    queryFn: async () => {
      let query = supabase
        .from("student_progress")
        .select("evaluation_date, performance_score, teacher_remarks")
        .eq("student_id", targetId)
        .order("evaluation_date", { ascending: false })
        .limit(3);

      if (branchId) query = query.eq("branch_id", branchId);
      if (financialYearId) query = query.eq("financial_year_id", financialYearId);

      const { data } = await query;
      return data || [];
    },
    enabled: !!targetId && !!branchId && !!financialYearId,
  });

  // 8. Documents count – scoped
  const { data: documentCount = 0 } = useQuery({
    queryKey: ["student-documents-count", targetId, branchId, financialYearId],
    queryFn: async () => {
      let query = supabase
        .from("student_documents")
        .select("*", { count: "exact", head: true })
        .eq("student_id", targetId);

      if (branchId) query = query.eq("branch_id", branchId);
      if (financialYearId) query = query.eq("financial_year_id", financialYearId);

      const { count } = await query;
      return count || 0;
    },
    enabled: !!targetId && !!branchId && !!financialYearId,
  });

  if (resolving || studentLoading) {
    return (
      <AdminLayout>
        <div className="p-8 text-center text-secondary">Loading student profile…</div>
      </AdminLayout>
    );
  }

  if (studentError || !student) {
    return (
      <AdminLayout>
        <div className="p-8 text-center text-red-500">
          Student not found or an error occurred.
        </div>
      </AdminLayout>
    );
  }

  return (
    <AdminLayout>
      {/* Back button – show only when coming from admin students list */}
      {id && (
        <Link
          to="/students"
          className="inline-flex items-center gap-2 text-secondary hover:text-primary-dark mb-4 font-montserrat text-sm"
        >
          <ArrowLeft size={18} /> Back to Students
        </Link>
      )}

      {/* Header Card */}
      <div className="bg-white rounded-xl shadow-sm p-6 mb-6">
        <div className="flex flex-col sm:flex-row items-start sm:items-center gap-6">
          <div className="w-24 h-24 rounded-full overflow-hidden border-2 border-primary flex items-center justify-center bg-primary-bg flex-shrink-0">
            {student.photo_url ? (
              <img src={student.photo_url} alt="Student" className="w-full h-full object-cover" />
            ) : (
              <UserCircle2 size={64} className="text-primary" />
            )}
          </div>
          <div className="flex-1">
            <h1 className="text-2xl font-bold font-righteous text-primary-dark">
              {student.first_name} {student.last_name}
            </h1>
            <div className="flex flex-wrap gap-2 mt-2">
              {student.admission_no && (
                <span className="inline-flex items-center gap-1 text-sm bg-primary-bg text-primary px-3 py-1 rounded-full">
                  <Hash size={14} /> {student.admission_no}
                </span>
              )}
              <span className="inline-flex items-center gap-1 text-sm bg-accent-bg text-accent-dark px-3 py-1 rounded-full capitalize">
                <BookOpen size={14} /> {student.status || "active"}
              </span>
            </div>
          </div>
          {/* Working Edit button */}
          {id && (
            <button
              onClick={() => setEditingStudent(student)}
              className="text-xs bg-primary text-white px-3 py-1.5 rounded-lg hover:bg-primary-light"
            >
              Edit
            </button>
          )}
        </div>
      </div>

      {/* Main content grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {/* Personal Details */}
        <div className="bg-white rounded-xl p-6 shadow-sm">
          <h2 className="text-lg font-semibold font-righteous text-primary-dark mb-4">Personal Details</h2>
          <div className="space-y-3 text-sm text-secondary-dark">
            {student.gender && <p><strong>Gender:</strong> {student.gender}</p>}
            {student.dob && <p><strong>DOB:</strong> {student.dob}</p>}
            <p className="flex items-center gap-2"><Phone size={14} className="text-primary" /> {student.mobile}</p>
            {student.whatsapp && <p className="flex items-center gap-2"><Phone size={14} className="text-primary" /> {student.whatsapp} (WhatsApp)</p>}
            {student.email && <p className="flex items-center gap-2"><Mail size={14} className="text-primary" /> {student.email}</p>}
            {student.address && (
              <div className="flex items-start gap-2">
                <MapPin size={14} className="text-primary mt-0.5" />
                <span>
                  {student.address}
                  {student.city ? `, ${student.city}` : ""}
                  {student.state ? `, ${student.state}` : ""}
                  {student.pincode ? ` - ${student.pincode}` : ""}
                </span>
              </div>
            )}
            <p className="flex items-center gap-2"><School size={14} className="text-primary" /> {student.school_name || "N/A"}</p>
            {student.board && <p><strong>Board:</strong> {student.board}</p>}
            {student.joining_date && <p><strong>Joining Date:</strong> {student.joining_date}</p>}
          </div>
        </div>

        {/* Parents */}
        <div className="bg-white rounded-xl p-6 shadow-sm">
          <h2 className="text-lg font-semibold font-righteous text-primary-dark mb-4 flex items-center gap-2">
            <Users size={18} /> Parents
          </h2>
          {parents.length === 0 ? (
            <p className="text-sm text-secondary-light">No parent linked</p>
          ) : (
            <ul className="space-y-4">
              {parents.map((p, idx) => (
                <li key={idx} className="border-b pb-2 last:border-0">
                  <p className="font-medium text-sm">
                    {p?.father_name || "-"} / {p?.mother_name || "-"}
                  </p>
                  <div className="text-xs text-secondary mt-1 space-y-1">
                    {p?.mobile && <p className="flex items-center gap-1"><Phone size={12} /> {p.mobile}</p>}
                    {p?.email && <p className="flex items-center gap-1"><Mail size={12} /> {p.email}</p>}
                    {p?.occupation && <p><strong>Occ:</strong> {p.occupation}</p>}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* Academic Overview */}
        <div className="bg-white rounded-xl p-6 shadow-sm">
          <h2 className="text-lg font-semibold font-righteous text-primary-dark mb-4">Academic Overview</h2>
          <div className="space-y-4">
            <div>
              <h3 className="text-sm font-medium text-secondary">Current Batch(es)</h3>
              {batches.length === 0 ? (
                <p className="text-sm text-secondary-light">Not assigned</p>
              ) : (
                <ul className="list-disc list-inside text-sm">
                  {batches.map((b) => (
                    <li key={b.batch_id}>
                      {b.batches?.batch_name} ({b.batches?.courses?.course_name})
                    </li>
                  ))}
                </ul>
              )}
            </div>

            <div>
              <h3 className="text-sm font-medium text-secondary flex items-center gap-1">
                <Calendar size={14} /> Attendance
              </h3>
              <div className="flex items-center gap-2 mt-1">
                <div className="w-full bg-gray-200 rounded-full h-2">
                  <div
                    className="bg-green-500 h-2 rounded-full"
                    style={{ width: `${attendanceStats.percentage}%` }}
                  ></div>
                </div>
                <span className="text-sm font-medium">{attendanceStats.percentage}%</span>
              </div>
              <p className="text-xs text-secondary-light mt-1">
                {attendanceStats.presentCount} present / {attendanceStats.totalSessions} sessions
              </p>
            </div>

            <div>
              <h3 className="text-sm font-medium text-secondary flex items-center gap-1">
                <IndianRupee size={14} /> Fee Summary
              </h3>
              <div className="grid grid-cols-2 gap-2 mt-1 text-sm">
                <div><span className="text-secondary">Total:</span> {formatCurrency(feeSummary.totalFee)}</div>
                <div><span className="text-secondary">Paid:</span> <span className="text-green-600">{formatCurrency(feeSummary.totalPaid)}</span></div>
                <div><span className="text-secondary">Pending:</span> <span className="text-red-600">{formatCurrency(feeSummary.pending)}</span></div>
              </div>
            </div>
          </div>
        </div>

        {/* Recent Results */}
        <div className="bg-white rounded-xl p-6 shadow-sm">
          <h2 className="text-lg font-semibold font-righteous text-primary-dark mb-4 flex items-center gap-1">
            <Award size={18} /> Recent Results
          </h2>
          {recentResults.length === 0 ? (
            <p className="text-sm text-secondary-light">No exam results yet</p>
          ) : (
            <ul className="space-y-3">
              {recentResults.map((r, idx) => (
                <li key={idx} className="border-b pb-2 last:border-0">
                  <p className="font-medium text-sm">{r.exams?.exam_name}</p>
                  <div className="flex justify-between text-sm">
                    <span>Marks: {r.marks_obtained}{r.exams?.total_marks ? `/${r.exams.total_marks}` : ""}</span>
                    <span className="text-secondary-light">{r.exams?.exam_date}</span>
                  </div>
                  {r.remarks && <p className="text-xs text-secondary mt-1">{r.remarks}</p>}
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* Progress Evaluations */}
        <div className="bg-white rounded-xl p-6 shadow-sm">
          <h2 className="text-lg font-semibold font-righteous text-primary-dark mb-4 flex items-center gap-1">
            <TrendingUp size={18} /> Progress
          </h2>
          {progressEvaluations.length === 0 ? (
            <p className="text-sm text-secondary-light">No evaluations yet</p>
          ) : (
            <ul className="space-y-3">
              {progressEvaluations.map((ev, idx) => (
                <li key={idx} className="border-b pb-2 last:border-0">
                  <div className="flex justify-between text-sm">
                    <span className="font-medium">{ev.evaluation_date}</span>
                    <span>Score: {ev.performance_score ?? "-"}</span>
                  </div>
                  {ev.teacher_remarks && <p className="text-xs text-secondary mt-1">{ev.teacher_remarks}</p>}
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* Documents */}
        <div className="bg-white rounded-xl p-6 shadow-sm">
          <h2 className="text-lg font-semibold font-righteous text-primary-dark mb-4 flex items-center gap-1">
            <FileText size={18} /> Documents
          </h2>
          <div className="text-center">
            <p className="text-2xl font-bold text-primary">{documentCount}</p>
            <p className="text-xs text-secondary">uploaded files</p>
            {!id && (
              <Link to="/student-documents" className="text-primary underline text-sm mt-2 inline-block">
                Manage documents
              </Link>
            )}
          </div>
        </div>
      </div>

      {/* StudentForm modal for editing */}
      {editingStudent && (
        <StudentForm
          initialData={editingStudent}
          onSuccess={() => {
            queryClient.invalidateQueries({ queryKey: ["student", targetId] });
            queryClient.invalidateQueries({ queryKey: ["students"] });
            setEditingStudent(null);
          }}
          onClose={() => setEditingStudent(null)}
        />
      )}
    </AdminLayout>
  );
}