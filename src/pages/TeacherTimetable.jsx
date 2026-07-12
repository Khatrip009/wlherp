// src/pages/TeacherTimetable.jsx
import { useQuery } from "@tanstack/react-query";
import { supabase } from "../api/supabase";
import AdminLayout from "../layouts/AdminLayout";
import BackButton from "../components/BackButton";

import { useAuth } from "../context/AuthContext";
import { Clock } from "lucide-react";
import { useOrg } from "../context/OrganizationContext";

const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const TIME_SLOTS = Array.from({ length: 14 }, (_, i) => `${i + 7}:00`);

export default function TeacherTimetable() {
  const { user } = useAuth();

  // ── Branch & Financial Year context ──
  const { branch, selectedFinancialYear } = useOrg();
  const branchId = branch?.id;
  const financialYearId = selectedFinancialYear?.id;

  // 1. Fetch teacher ID – scoped to current branch & FY
  const { data: teacherId, isLoading: idLoading } = useQuery({
    queryKey: ["teacher-id", user?.id, branchId, financialYearId],
    queryFn: async () => {
      if (!user?.id || !branchId || !financialYearId) return null;
      const { data, error } = await supabase
        .from("teachers")
        .select("id")
        .eq("user_id", user.id)
        .eq("branch_id", branchId)
        .eq("financial_year_id", financialYearId)
        .maybeSingle();
      if (error) throw error;
      return data?.id || null;
    },
    enabled: !!user?.id && !!branchId && !!financialYearId,
    staleTime: 5 * 60 * 1000,
  });

  // 2. Fetch batch IDs assigned to this teacher – scoped
  const { data: assignedBatchIds = [], isLoading: idsLoading } = useQuery({
    queryKey: ["teacher-batch-ids", teacherId, branchId, financialYearId],
    queryFn: async () => {
      if (!teacherId || !branchId || !financialYearId) return [];
      let query = supabase
        .from("batch_teachers")
        .select("batch_id")
        .eq("teacher_id", teacherId);

      if (branchId) query = query.eq("branch_id", branchId);
      if (financialYearId) query = query.eq("financial_year_id", financialYearId);

      const { data, error } = await query;
      if (error) throw error;
      // Unique batch IDs
      return [...new Set(data.map((row) => row.batch_id))];
    },
    enabled: !!teacherId && !!branchId && !!financialYearId,
    staleTime: 5 * 60 * 1000,
  });

  // 3. Fetch full batch data – scoped
  const { data: batches = [], isLoading: batchesLoading } = useQuery({
    queryKey: ["teacher-batches-timetable", assignedBatchIds, branchId, financialYearId],
    queryFn: async () => {
      if (assignedBatchIds.length === 0 || !branchId || !financialYearId) return [];
      const { data, error } = await supabase
        .from("batches")
        .select(`
          *,
          courses ( course_name ),
          mediums ( name ),
          batch_teachers ( teacher_id, subject_id, day, subjects ( subject_name ) )
        `)
        .in("id", assignedBatchIds)
        .eq("status", "active")
        .eq("branch_id", branchId)
        .eq("financial_year_id", financialYearId)
        .order("batch_name");
      if (error) throw error;
      return data || [];
    },
    enabled: assignedBatchIds.length > 0 && !!branchId && !!financialYearId,
    staleTime: 5 * 60 * 1000,
  });

  const batchOnDay = (batch, day) =>
    batch.days?.split(",").map((d) => d.trim()).includes(day);

  const timeToHour = (timeStr) => {
    if (!timeStr) return null;
    const [h, m] = timeStr.split(":").map(Number);
    return h + m / 60;
  };

  // Only show batches where the teacher is assigned, filter assignments by day
  const getBatchesForSlot = (day, hour) => {
    return batches
      .filter((batch) => {
        if (!batchOnDay(batch, day)) return false;
        const start = timeToHour(batch.start_time);
        const end = timeToHour(batch.end_time);
        if (start === null || end === null) return false;
        return hour >= start && hour < end;
      })
      .map((batch) => {
        // Keep only this teacher's assignments for the day
        const filteredTeachers = (batch.batch_teachers || []).filter(
          (bt) => bt.teacher_id === teacherId && (!bt.day || bt.day === day)
        );
        return { ...batch, batch_teachers: filteredTeachers };
      });
  };

  if (idLoading || idsLoading || batchesLoading) {
    return (
      <AdminLayout>
      <BackButton to="/teacher" label="My Dashboard" />
        <div className="p-8 text-center">Loading your timetable…</div>
      </AdminLayout>
    );
  }

  return (
    <AdminLayout>
      <div className="mb-6">
        <h1 className="text-3xl font-righteous text-primary-dark">My Timetable</h1>
        <p className="text-sm text-secondary-dark font-montserrat mt-1">
          Your weekly teaching schedule
        </p>
      </div>

      <div className="overflow-x-auto">
        <div className="min-w-[900px]">
          <div className="grid grid-cols-7 gap-1 mb-1">
            <div className="p-2 font-semibold text-sm text-secondary-dark bg-slate-100 rounded">
              Time
            </div>
            {DAYS.map((day) => (
              <div
                key={day}
                className="p-2 font-semibold text-sm text-secondary-dark bg-slate-100 rounded text-center"
              >
                {day}
              </div>
            ))}
          </div>

          {TIME_SLOTS.map((hourStr) => {
            const hour = parseInt(hourStr);
            return (
              <div key={hourStr} className="grid grid-cols-7 gap-1 mb-1">
                <div className="p-2 text-xs font-medium text-secondary bg-gray-50 rounded flex items-center justify-center">
                  <Clock size={14} className="mr-1" />
                  {hourStr}
                </div>
                {DAYS.map((day) => {
                  const batchesInSlot = getBatchesForSlot(day, hour);
                  return (
                    <div
                      key={`${day}-${hourStr}`}
                      className="p-1 rounded border border-secondary-light min-h-[60px] bg-white hover:shadow-sm transition"
                    >
                      {batchesInSlot.map((batch) => (
                        <div
                          key={batch.id}
                          className="bg-primary-bg text-primary-dark p-2 rounded mb-1 text-xs"
                        >
                          <div className="font-semibold">{batch.batch_name}</div>
                          <div className="text-secondary">
                            {batch.courses?.course_name}
                          </div>
                          {batch.mediums?.name && (
                            <div className="text-secondary-dark text-xs">
                              Medium: {batch.mediums.name}
                            </div>
                          )}
                          <div className="mt-1 space-y-0.5">
                            {batch.batch_teachers.map((bt) => (
                              <div key={bt.subject_id} className="text-secondary">
                                {bt.subjects?.subject_name}
                              </div>
                            ))}
                          </div>
                        </div>
                      ))}
                    </div>
                  );
                })}
              </div>
            );
          })}
        </div>
      </div>
    </AdminLayout>
  );
}