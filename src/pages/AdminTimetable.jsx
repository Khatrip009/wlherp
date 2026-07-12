import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "../api/supabase";
import AdminLayout from "../layouts/AdminLayout";
import BatchForm from "../components/BatchForm";
import { updateBatch } from "../services/batchService";
import { useOrg } from "../context/OrganizationContext";
import toast from "react-hot-toast";
import { Clock, Layers } from "lucide-react";

const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const TIME_SLOTS = Array.from({ length: 14 }, (_, i) => `${i + 7}:00`); // 7 AM to 8 PM

export default function AdminTimetable() {
  const queryClient = useQueryClient();
  const [editingBatch, setEditingBatch] = useState(null);
  const [selectedMediumId, setSelectedMediumId] = useState("");

  // ── Organization & Financial Year context ──
  const { branch, selectedFinancialYear } = useOrg();
  const branchId = branch?.id;
  const financialYearId = selectedFinancialYear?.id;

  // Fetch mediums for filter dropdown (org‑wide)
  const { data: mediums = [] } = useQuery({
    queryKey: ["timetable-mediums"],
    queryFn: async () => {
      const { data } = await supabase.from("mediums").select("id, name").order("name");
      return data || [];
    },
    staleTime: 10 * 60 * 1000,
  });

  // Fetch all active batches – NOW SCOPED by branch & FY
  const { data: batches = [], isLoading } = useQuery({
    queryKey: ["timetable-batches", selectedMediumId, branchId, financialYearId],
    queryFn: async () => {
      let query = supabase
        .from("batches")
        .select(`
          *,
          courses ( course_name ),
          mediums ( name ),
          batch_teachers ( teacher_id, subject_id, day, teachers ( first_name, last_name ), subjects ( subject_name ) )
        `)
        .eq("status", "active")
        .eq("branch_id", branchId)
        .eq("financial_year_id", financialYearId)
        .order("batch_name");

      if (selectedMediumId) {
        query = query.eq("medium_id", selectedMediumId);
      }

      const { data, error } = await query;
      if (error) throw error;
      return data || [];
    },
    enabled: !!branchId && !!financialYearId,
    staleTime: 5 * 60 * 1000,
  });

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
      .map((batch) => {
        const filteredTeachers = (batch.batch_teachers || []).filter(
          (bt) => bt.day === day
        );
        return { ...batch, batch_teachers: filteredTeachers };
      });
  };

  const handleBatchUpdate = async (payload) => {
    try {
      const context = {
        branchId: branchId,
        financialYearId: financialYearId,
      };
      await updateBatch(editingBatch.id, payload, context);
      toast.success("Batch updated");
      queryClient.invalidateQueries({ queryKey: ["timetable-batches"] });
      setEditingBatch(null);
    } catch (err) {
      toast.error(err.message);
    }
  };

  if (isLoading) {
    return (
      <AdminLayout>
        <div className="p-8 text-center">Loading timetable…</div>
      </AdminLayout>
    );
  }

  return (
    <AdminLayout>
      <div className="mb-6">
        <h1 className="text-3xl font-righteous text-primary-dark">
          Master Timetable
        </h1>
        <p className="text-sm text-secondary-dark font-montserrat mt-1">
          Weekly class schedule – click any batch to edit its timing.
        </p>
        <p className="text-xs text-secondary mt-1">
          Only teacher‑subject pairs with a specific day assigned are shown.
        </p>
      </div>

      {/* Medium Filter */}
      <div className="flex items-center gap-2 mb-4">
        <Layers size={18} className="text-secondary" />
        <select
          value={selectedMediumId}
          onChange={(e) => setSelectedMediumId(e.target.value)}
          className="border border-secondary-light rounded-lg p-2.5 text-sm focus:ring-1 focus:ring-primary outline-none"
        >
          <option value="">All Mediums</option>
          {mediums.map((m) => (
            <option key={m.id} value={m.id}>
              {m.name}
            </option>
          ))}
        </select>
      </div>

      <div className="overflow-x-auto">
        <div className="min-w-[900px]">
          {/* Header: day names */}
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

          {/* Time rows */}
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
                          className="bg-primary-bg text-primary-dark p-2 rounded mb-1 text-xs cursor-pointer hover:bg-primary-light/20 transition"
                          onClick={() => setEditingBatch(batch)}
                          title="Click to edit batch timing"
                        >
                          <div className="font-semibold">{batch.batch_name}</div>
                          <div className="text-secondary">
                            {batch.courses?.course_name}
                            {batch.mediums?.name ? ` (${batch.mediums.name})` : ""}
                          </div>
                          {batch.batch_teachers.length > 0 ? (
                            <div className="mt-1 space-y-0.5">
                              {batch.batch_teachers.map((bt) => (
                                <div
                                  key={bt.teacher_id + "-" + bt.subject_id}
                                  className="flex items-center gap-1"
                                >
                                  <span className="text-primary font-medium">
                                    {bt.teachers?.first_name}{" "}
                                    {bt.teachers?.last_name}
                                  </span>
                                  <span className="text-secondary">-</span>
                                  <span>{bt.subjects?.subject_name}</span>
                                </div>
                              ))}
                            </div>
                          ) : (
                            <div className="text-xs text-secondary italic mt-1">
                              No teacher assigned for this day
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

      {editingBatch && (
        <BatchForm
          initialData={editingBatch}
          onSubmit={handleBatchUpdate}
          onClose={() => setEditingBatch(null)}
        />
      )}
    </AdminLayout>
  );
}