import React, { useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { Calendar as CalendarIcon, Loader2 } from "lucide-react";
import FullCalendar from "@fullcalendar/react";
import timeGridPlugin from "@fullcalendar/timegrid";
import interactionPlugin from "@fullcalendar/interaction";
import dayGridPlugin from "@fullcalendar/daygrid";
import toast from "react-hot-toast";
import AdminLayout from "../layouts/AdminLayout";
import { supabase } from "../api/supabase";
import { useAuth } from "../context/AuthContext";

export default function TeacherTimetable() {
  const { profile } = useAuth();
  const [events, setEvents] = useState([]);

  // 1. Get teacher ID linked to this auth user
  const { data: teacherRecord, isLoading: teacherLoading } = useQuery({
    queryKey: ["teacher-record", profile?.id],
    queryFn: async () => {
      if (!profile?.id) return null;
      const { data, error } = await supabase
        .from("teachers")
        .select("id")
        .eq("user_id", profile.id)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
    enabled: !!profile?.id,
  });

  const actualTeacherId = teacherRecord?.id;

  // 2. Fetch batch‑teacher assignments with batch details (now includes medium)
  const {
    data: batchAssignments = [],
    isLoading: batchesLoading,
    error,
  } = useQuery({
    queryKey: ["teacher-batch-assignments", actualTeacherId],
    queryFn: async () => {
      if (!actualTeacherId) return [];
      const { data, error } = await supabase
        .from("batch_teachers")
        .select(`
          batch_id,
          batches (
            id,
            batch_name,
            start_date,
            end_date,
            days,
            start_time,
            end_time,
            courses ( course_name ),
            mediums ( name )
          )
        `)
        .eq("teacher_id", actualTeacherId);
      if (error) throw error;
      return data.filter((item) => item.batches !== null);
    },
    enabled: !!actualTeacherId,
  });

  // 3. Convert assignments to FullCalendar events
  useEffect(() => {
    if (!batchAssignments.length) {
      setEvents([]);
      return;
    }

    const calendarEvents = [];
    const today = new Date();
    const futureLimit = new Date();
    futureLimit.setDate(today.getDate() + 56); // 8 weeks ahead

    batchAssignments.forEach(({ batches: batch }) => {
      if (!batch || !batch.start_date || !batch.end_date || !batch.days) return;

      const startDateObj = new Date(batch.start_date);
      const endDateObj = new Date(batch.end_date);
      const effectiveEnd = endDateObj > futureLimit ? futureLimit : endDateObj;

      const dayMap = {
        sunday: 0, monday: 1, tuesday: 2, wednesday: 3,
        thursday: 4, friday: 5, saturday: 6,
      };
      const daysOfWeek = batch.days
        .split(",")
        .map((day) => dayMap[day.trim().toLowerCase()])
        .filter((d) => d !== undefined);

      if (daysOfWeek.length === 0) return;

      const current = new Date(startDateObj);
      while (current <= effectiveEnd) {
        if (daysOfWeek.includes(current.getDay())) {
          const eventStart = new Date(current);
          const [startHour, startMinute] = batch.start_time.split(":");
          eventStart.setHours(parseInt(startHour), parseInt(startMinute), 0);

          const eventEnd = new Date(current);
          const [endHour, endMinute] = batch.end_time.split(":");
          eventEnd.setHours(parseInt(endHour), parseInt(endMinute), 0);

          calendarEvents.push({
            id: `${batch.id}-${current.toISOString().split("T")[0]}`,
            title: `${batch.batch_name} (${batch.courses?.course_name || "No course"})${batch.mediums?.name ? ` - ${batch.mediums.name}` : ""}`,
            start: eventStart.toISOString(),
            end: eventEnd.toISOString(),
            extendedProps: {
              batch_id: batch.id,
              start_time: batch.start_time,
              end_time: batch.end_time,
              days: batch.days,
              medium_name: batch.mediums?.name || "",
            },
          });
        }
        current.setDate(current.getDate() + 1);
      }
    });

    setEvents(calendarEvents);
  }, [batchAssignments]);

  const handleEventClick = (info) => {
    const { title, extendedProps } = info.event;
    toast(
      <div className="text-sm">
        <strong>{title}</strong><br />
        ⏰ Time: {extendedProps.start_time} – {extendedProps.end_time}<br />
        📅 Days: {extendedProps.days}
        {extendedProps.medium_name && <><br />📚 Medium: {extendedProps.medium_name}</>}
      </div>,
      { duration: 5000 }
    );
  };

  const isLoading = teacherLoading || batchesLoading;

  if (error) {
    toast.error("Failed to load timetable");
  }

  return (
    <AdminLayout>
      <div className="mb-6">
        <h1 className="text-3xl font-righteous text-primary-dark">My Weekly Timetable</h1>
        <p className="text-sm text-secondary-dark font-montserrat mt-1">
          Your class schedule for the upcoming weeks
        </p>
      </div>

      <div className="bg-white rounded-xl shadow-sm overflow-hidden p-4 border border-secondary-light">
        {isLoading ? (
          <div className="flex flex-col items-center justify-center py-12">
            <Loader2 size={40} className="text-primary animate-spin mb-3" />
            <p className="text-secondary-dark">Loading your timetable…</p>
          </div>
        ) : events.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 text-secondary">
            <CalendarIcon size={48} className="text-secondary-light mb-3" />
            <p className="text-lg font-medium">No classes scheduled yet</p>
            <p className="text-sm">You are not assigned to any active batches.</p>
          </div>
        ) : (
          <FullCalendar
            plugins={[timeGridPlugin, interactionPlugin, dayGridPlugin]}
            initialView="timeGridWeek"
            headerToolbar={{
              left: "prev,next today",
              center: "title",
              right: "timeGridWeek,timeGridDay",
            }}
            events={events}
            eventClick={handleEventClick}
            height="auto"
            slotMinTime="08:00:00"
            slotMaxTime="20:00:00"
            allDaySlot={false}
            nowIndicator={true}
            editable={false}
            selectable={false}
            weekends={true}
            firstDay={1} // Monday
            eventTimeFormat={{
              hour: "2-digit",
              minute: "2-digit",
              hour12: true,
            }}
          />
        )}
      </div>
    </AdminLayout>
  );
}