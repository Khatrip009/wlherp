import { useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "../api/supabase";
import AdminLayout from "../layouts/AdminLayout";
import BackButton from "../components/BackButton";

import { useAuth } from "../context/AuthContext";
import { useOrg } from "../context/OrganizationContext";   // NEW
import { Clock, AlertCircle } from "lucide-react";

export default function PersonalTimetable() {
  const { user } = useAuth();

  // ── Branch & Financial Year context ──
  const { branch, selectedFinancialYear } = useOrg();   // NEW
  const branchId = branch?.id;
  const financialYearId = selectedFinancialYear?.id;

  const [debug, setDebug] = useState({});

  // Log mount/unmount
  useEffect(() => {
    console.log("PersonalTimetable mounted");
    return () => console.log("PersonalTimetable unmounted");
  }, []);

  // Fetch student ID – scoped to branch & FY
  const {
    data: studentId,
    isLoading: idLoading,
    error: idError,
  } = useQuery({
    queryKey: ["student-id", user?.id, branchId, financialYearId],
    queryFn: async () => {
      try {
        if (!user?.id || !branchId || !financialYearId) return null;
        const { data, error } = await supabase
          .from("students")
          .select("id")
          .eq("user_id", user.id)
          .eq("branch_id", branchId)
          .eq("financial_year_id", financialYearId)
          .maybeSingle();
        if (error) throw error;
        return data?.id ?? null;
      } catch (e) {
        console.error("student-id query error", e);
        throw e;
      }
    },
    enabled: !!user?.id && !!branchId && !!financialYearId,
    staleTime: 5 * 60 * 1000,
  });

  // Fetch active batch IDs – scoped
  const {
    data: batchIds = [],
    isLoading: batchesLoading,
    error: batchesError,
  } = useQuery({
    queryKey: ["student-batch-ids", studentId, branchId, financialYearId],
    queryFn: async () => {
      try {
        if (!studentId || !branchId || !financialYearId) return [];
        const { data, error } = await supabase
          .from("student_batches")
          .select("batch_id")
          .eq("student_id", studentId)
          .eq("status", "active")
          .eq("branch_id", branchId)
          .eq("financial_year_id", financialYearId);
        if (error) throw error;
        return data.map((row) => row.batch_id);
      } catch (e) {
        console.error("batch-ids query error", e);
        throw e;
      }
    },
    enabled: !!studentId && !!branchId && !!financialYearId,
  });

  // Fetch batch details – scoped
  const {
    data: batches = [],
    isLoading: dataLoading,
    error: dataError,
  } = useQuery({
    queryKey: ["student-timetable-batches", batchIds, branchId, financialYearId],
    queryFn: async () => {
      try {
        if (batchIds.length === 0 || !branchId || !financialYearId) return [];
        const { data, error } = await supabase
          .from("batches")
          .select(
            `id, batch_name, start_time, end_time, days, courses(course_name), mediums(name), batch_teachers(teacher_id, subject_id, day, teachers(first_name, last_name), subjects(subject_name))`
          )
          .in("id", batchIds)
          .eq("status", "active")
          .eq("branch_id", branchId)
          .eq("financial_year_id", financialYearId);
        if (error) throw error;
        return data ?? [];
      } catch (e) {
        console.error("batches query error", e);
        throw e;
      }
    },
    enabled: batchIds.length > 0 && !!branchId && !!financialYearId,
  });

  // Capture debug info
  useEffect(() => {
    setDebug({
      user: user?.id,
      studentId,
      batchIds,
      batches: batches?.length,
      idError: idError?.message,
      batchesError: batchesError?.message,
      dataError: dataError?.message,
    });
  }, [user, studentId, batchIds, batches, idError, batchesError, dataError]);

  // Error display
  const allErrors = [idError, batchesError, dataError].filter(Boolean);
  if (allErrors.length > 0) {
    return (
      <AdminLayout>
      <BackButton to="/student" label="My Dashboard" />
        <div className="p-8 text-red-600">
          <AlertCircle size={32} className="mx-auto mb-2" />
          <p>Something went wrong while loading your timetable.</p>
          {allErrors.map((err, i) => (
            <p key={i} className="text-sm mt-1">{err.message}</p>
          ))}
          <pre className="mt-4 bg-gray-100 p-4 rounded text-xs overflow-auto">
            {JSON.stringify(debug, null, 2)}
          </pre>
        </div>
      </AdminLayout>
    );
  }

  if (idLoading || batchesLoading || dataLoading) {
    return (
      <AdminLayout>
        <div className="p-8 text-center">Loading timetable…</div>
      </AdminLayout>
    );
  }

  if (!studentId) {
    return (
      <AdminLayout>
        <div className="p-8 text-center">
          <p>Your account is not linked to a student record in the current branch/financial year.</p>
        </div>
      </AdminLayout>
    );
  }

  if (batchIds.length === 0) {
    return (
      <AdminLayout>
        <div className="p-8 text-center">
          <Clock size={32} className="text-secondary-light mx-auto mb-2" />
          <p>You are not enrolled in any active batch.</p>
        </div>
      </AdminLayout>
    );
  }

  // If no batches data (shouldn't happen if batchIds not empty, but just in case)
  if (batches.length === 0) {
    return (
      <AdminLayout>
        <div className="p-8 text-center">
          <p>No batch details found for your batches.</p>
          <pre className="mt-4 text-xs">{JSON.stringify({ batchIds, batches }, null, 2)}</pre>
        </div>
      </AdminLayout>
    );
  }

  // Helper functions
  const batchOnDay = (batch, day) =>
    batch.days?.split(",").map((d) => d.trim()).includes(day);

  const timeToHour = (timeStr) => {
    if (!timeStr) return null;
    const [h, m] = timeStr.split(":").map(Number);
    return h + m / 60;
  };

  const getBatchesForSlot = (day, hour) => {
    return batches
      .filter((batch) => {
        if (!batchOnDay(batch, day)) return false;
        const start = timeToHour(batch.start_time);
        const end = timeToHour(batch.end_time);
        if (start === null || end === null) return false;
        return hour >= start && hour < end;
      })
      .map((batch) => ({
        ...batch,
        batch_teachers: (batch.batch_teachers || []).filter(
          (bt) => !bt.day || bt.day === day
        ),
      }));
  };

  // Full timetable grid
  return (
    <AdminLayout>
      <div className="mb-6">
        <h1 className="text-3xl font-righteous text-primary-dark">My Timetable</h1>
        <p className="text-sm text-secondary-dark font-montserrat mt-1">
          Your weekly class schedule
        </p>
      </div>
      <div className="overflow-x-auto">
        <div className="min-w-[900px]">
          <div className="grid grid-cols-7 gap-1 mb-1">
            <div className="p-2 font-semibold text-sm bg-slate-100 rounded">Time</div>
            {["Mon","Tue","Wed","Thu","Fri","Sat"].map(day => (
              <div key={day} className="p-2 font-semibold text-sm bg-slate-100 rounded text-center">{day}</div>
            ))}
          </div>
          {Array.from({ length: 14 }, (_, i) => `${i + 7}:00`).map(hourStr => {
            const hour = parseInt(hourStr);
            return (
              <div key={hourStr} className="grid grid-cols-7 gap-1 mb-1">
                <div className="p-2 text-xs font-medium bg-gray-50 rounded flex items-center justify-center">
                  <Clock size={14} className="mr-1" />{hourStr}
                </div>
                {["Mon","Tue","Wed","Thu","Fri","Sat"].map(day => {
                  const slots = getBatchesForSlot(day, hour);
                  return (
                    <div key={day + hourStr} className="p-1 rounded border border-secondary-light min-h-[60px] bg-white">
                      {slots.map(batch => (
                        <div key={batch.id} className="bg-primary-bg text-primary-dark p-2 rounded mb-1 text-xs">
                          <div className="font-semibold">{batch.batch_name}</div>
                          <div className="text-secondary">{batch.courses?.course_name}</div>
                          {batch.mediums?.name && (
                            <div className="text-secondary-dark text-xs mt-0.5">
                              Medium: {batch.mediums.name}
                            </div>
                          )}
                          {batch.batch_teachers.length > 0 && (
                            <div className="mt-1 space-y-0.5">
                              {batch.batch_teachers.map(bt => (
                                <div key={bt.teacher_id + "-" + bt.subject_id} className="flex items-center gap-1">
                                  <span className="text-primary font-medium">
                                    {bt.teachers?.first_name} {bt.teachers?.last_name}
                                  </span>
                                  <span className="text-secondary">-</span>
                                  <span>{bt.subjects?.subject_name}</span>
                                </div>
                              ))}
                            </div>
                          )}
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