import { useQuery } from "@tanstack/react-query";
import { supabase } from "../api/supabase";
import AdminLayout from "../layouts/AdminLayout";
import BackButton from "../components/BackButton";

import { useAuth } from "../context/AuthContext";
import { Award, Calendar, Layers, BookOpen } from "lucide-react";

export default function StudentExamsPage() {
  const { user } = useAuth();

  // 1. Get student ID
  const { data: studentId, isLoading: idLoading } = useQuery({
    queryKey: ["student-id", user?.id],
    queryFn: async () => {
      if (!user?.id) return null;
      const { data } = await supabase
        .from("students")
        .select("id")
        .eq("user_id", user.id)
        .maybeSingle();
      return data?.id || null;
    },
    enabled: !!user?.id,
  });

  // 2. Get active batch IDs
  const { data: batchIds = [], isLoading: batchesLoading } = useQuery({
    queryKey: ["student-batch-ids", studentId],
    queryFn: async () => {
      if (!studentId) return [];
      const { data } = await supabase
        .from("student_batches")
        .select("batch_id")
        .eq("student_id", studentId)
        .eq("status", "active");
      return data.map((row) => row.batch_id);
    },
    enabled: !!studentId,
  });

  // 3. Get upcoming exams for those batches – now includes medium
  const today = new Date().toISOString().split("T")[0];
  const { data: exams = [], isLoading: examsLoading } = useQuery({
    queryKey: ["student-exams", batchIds],
    queryFn: async () => {
      if (batchIds.length === 0) return [];
      const { data } = await supabase
        .from("exams")
        .select(`*, batches(batch_name, courses(course_name), mediums(name))`)
        .in("batch_id", batchIds)
        .gte("exam_date", today)
        .order("exam_date", { ascending: true });
      return data || [];
    },
    enabled: batchIds.length > 0,
  });

  if (idLoading || batchesLoading || examsLoading) {
    return <AdminLayout>
      <BackButton to="/student" label="My Dashboard" /><div className="p-8 text-center">Loading exams…</div></AdminLayout>;
  }

  return (
    <AdminLayout>
      <div className="mb-6">
        <h1 className="text-3xl font-righteous text-primary-dark">My Exams</h1>
        <p className="text-sm text-secondary-dark font-montserrat mt-1">
          Upcoming exams for your batches
        </p>
      </div>

      {exams.length === 0 ? (
        <div className="bg-white rounded-xl p-8 shadow-sm border border-secondary-light text-center">
          <Award size={32} className="text-secondary-light mx-auto mb-2" />
          <p className="text-secondary">No upcoming exams.</p>
        </div>
      ) : (
        <div className="space-y-4">
          {exams.map((exam) => (
            <div
              key={exam.id}
              className="bg-white rounded-xl p-5 shadow-sm border border-secondary-light"
            >
              <div className="flex items-center gap-2 mb-2">
                <Award size={18} className="text-primary" />
                <h2 className="font-bold text-lg text-primary-dark">{exam.exam_name}</h2>
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
    </AdminLayout>
  );
}