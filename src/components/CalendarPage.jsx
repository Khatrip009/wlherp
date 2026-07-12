import { useState, useEffect } from "react";
import FullCalendar from "@fullcalendar/react";
import dayGridPlugin from "@fullcalendar/daygrid";
import timeGridPlugin from "@fullcalendar/timegrid";
import interactionPlugin from "@fullcalendar/interaction";
import { supabase } from "../api/supabase";
import AdminLayout from "../layouts/AdminLayout";
import { useQuery } from "@tanstack/react-query";
import toast from "react-hot-toast";
import { Layers } from "lucide-react";
import { useOrg } from "../context/OrganizationContext";

export default function CalendarPage() {
  const { branch, selectedFinancialYear } = useOrg();
  const branchId = branch?.id;
  const financialYearId = selectedFinancialYear?.id;

  const [events, setEvents] = useState([]);
  const [selectedMediumId, setSelectedMediumId] = useState("");

  // Fetch mediums for filter dropdown (org‑wide, unchanged)
  const { data: mediums = [] } = useQuery({
    queryKey: ["calendar-mediums"],
    queryFn: async () => {
      const { data } = await supabase.from("mediums").select("id, name").order("name");
      return data || [];
    },
  });

  // Fetch batches with course, teacher, and medium info – NOW SCOPED
  const { data: batches, isLoading } = useQuery({
    queryKey: ["calendar-batches", selectedMediumId, branchId, financialYearId],
    queryFn: async () => {
      let query = supabase
        .from("batches")
        .select(`
          *,
          course:courses(id, course_name),
          medium:mediums(id, name),
          batch_teachers(teacher:teachers(id, first_name, last_name))
        `)
        .eq("status", "active")
        .eq("branch_id", branchId)
        .eq("financial_year_id", financialYearId);

      if (selectedMediumId) {
        query = query.eq("medium_id", selectedMediumId);
      }

      const { data, error } = await query;
      if (error) throw error;
      return data;
    },
    enabled: !!branchId && !!financialYearId,
  });

  // Convert batches to FullCalendar events (handling repeat days)
  useEffect(() => {
    if (!batches) return;

    const calendarEvents = [];

    batches.forEach((batch) => {
      const { id, batch_name, start_date, end_date, days, start_time, end_time, course, medium } = batch;
      if (!start_date || !end_date || !days) return;

      const daysOfWeek = days.split(",").map((day) => {
        const dayMap = {
          Sunday: 0, Monday: 1, Tuesday: 2, Wednesday: 3,
          Thursday: 4, Friday: 5, Saturday: 6,
        };
        return dayMap[day.trim()];
      }).filter(d => d !== undefined);

      if (daysOfWeek.length === 0) return;

      const start = new Date(start_date);
      const end = new Date(end_date);
      const current = new Date(start);

      while (current <= end) {
        const dayOfWeek = current.getDay();
        if (daysOfWeek.includes(dayOfWeek)) {
          const eventStart = new Date(current);
          const [startHour, startMinute] = start_time.split(":");
          eventStart.setHours(parseInt(startHour), parseInt(startMinute), 0);

          const eventEnd = new Date(current);
          const [endHour, endMinute] = end_time.split(":");
          eventEnd.setHours(parseInt(endHour), parseInt(endMinute), 0);

          const teachers = batch.batch_teachers?.map(bt => 
            `${bt.teacher.first_name} ${bt.teacher.last_name}`
          ).join(", ") || "No teacher";

          calendarEvents.push({
            id: `${id}-${current.toISOString().split("T")[0]}`,
            title: `${batch_name} (${course?.course_name || "No course"})`,
            start: eventStart.toISOString(),
            end: eventEnd.toISOString(),
            extendedProps: {
              batch_id: id,
              teachers,
              start_time,
              end_time,
              days,
              medium_name: medium?.name || "",
            },
          });
        }
        current.setDate(current.getDate() + 1);
      }
    });

    setEvents(calendarEvents);
  }, [batches]);

  const handleEventClick = (info) => {
    const { title, extendedProps } = info.event;
    toast(
      <div>
        <strong>{title}</strong><br />
        Teachers: {extendedProps.teachers}<br />
        Time: {extendedProps.start_time} - {extendedProps.end_time}<br />
        Days: {extendedProps.days}<br />
        {extendedProps.medium_name && <span>Medium: {extendedProps.medium_name}</span>}
      </div>,
      { duration: 5000 }
    );
  };

  return (
    <AdminLayout>
      <div className="p-4 bg-white rounded-xl shadow-sm">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-4 gap-4">
          <h1 className="text-2xl font-righteous text-primary-dark">Class Calendar</h1>
          {/* Medium Filter */}
          <div className="flex items-center gap-2">
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
        </div>

        {isLoading ? (
          <div className="text-center py-10">Loading calendar...</div>
        ) : (
          <FullCalendar
            plugins={[dayGridPlugin, timeGridPlugin, interactionPlugin]}
            initialView="dayGridMonth"
            headerToolbar={{
              left: "prev,next today",
              center: "title",
              right: "dayGridMonth,timeGridWeek,timeGridDay",
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
          />
        )}
      </div>
    </AdminLayout>
  );
}