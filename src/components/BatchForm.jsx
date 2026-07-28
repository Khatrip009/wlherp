// src/components/BatchForm.jsx
import { useState, useEffect } from "react";
import toast from "react-hot-toast";
import {
  X, Users, BookOpen, Calendar, Layers, Plus, Trash2,
} from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { getTeacherOptions, getMediumOptions } from "../services/batchService";
import { supabase } from "../api/supabase";
import { useAuth } from "../context/AuthContext";
import { useOrg } from "../context/OrganizationContext";

export default function BatchForm({ onSubmit, onClose, initialData = {} }) {
  const { profile } = useAuth();
  const { org, branch, selectedFinancialYear } = useOrg();

  const darkLogo = org?.logo_dark_url || "/ShreeVidhyaDark.png";
  const orgName = org?.company_name || "Academy";
  const organizationId = org?.id;

  const isAdmin = profile?.role === "admin" || profile?.role === "super_admin";

  const branchId = branch?.id;
  const financialYearId = selectedFinancialYear?.id;

  // ---- Basic batch fields ----
  const [form, setForm] = useState({
    course_id: initialData.course_id || "",
    batch_name: initialData.batch_name || "",
    start_date: initialData.start_date || "",
    end_date: initialData.end_date || "",
    days: initialData.days || "",
    start_time: initialData.start_time || "",
    end_time: initialData.end_time || "",
    capacity: initialData.capacity || "",
    status: initialData.status || "active",
    medium_id: initialData.medium_id || "",
  });

  // ---- Teacher-Subject-Day assignments ----
  const [assignments, setAssignments] = useState([]);

  const DAY_OPTIONS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

  // ✅ Fetch courses directly, filtering out soft‑deleted ones
  const { data: courses = [] } = useQuery({
    queryKey: ["courses-dropdown", organizationId],
    queryFn: async () => {
      if (!organizationId) return [];
      const { data, error } = await supabase
        .from("courses")
        .select("id, course_name")
        .eq("organization_id", organizationId)
        .is("deleted_at", null)              // exclude soft‑deleted courses
        .order("course_name", { ascending: true });
      if (error) throw error;
      return data || [];
    },
    enabled: !!organizationId,
    staleTime: 10 * 60 * 1000,
  });

  // Teachers – scoped by branch & FY (unchanged)
  const { data: teachers = [] } = useQuery({
    queryKey: ["teachers-dropdown", branchId, financialYearId],
    queryFn: () => getTeacherOptions(branchId, financialYearId),
    enabled: !!branchId && !!financialYearId,
    staleTime: 10 * 60 * 1000,
  });

  // Mediums – organisation‑wide (unchanged)
  const { data: mediums = [] } = useQuery({
    queryKey: ["mediums-dropdown"],
    queryFn: getMediumOptions,
    staleTime: 10 * 60 * 1000,
  });

  // Subjects for selected course – already scoped by branch & FY
  const [subjects, setSubjects] = useState([]);
  const [loadingSubjects, setLoadingSubjects] = useState(false);

  useEffect(() => {
    if (!form.course_id || !branchId || !financialYearId) {
      setSubjects([]);
      return;
    }
    setLoadingSubjects(true);
    supabase
      .from("subjects")
      .select("id, subject_name")
      .eq("course_id", form.course_id)
      .eq("branch_id", branchId)
      .eq("financial_year_id", financialYearId)
      .order("subject_name")
      .then(({ data, error }) => {
        if (error) {
          toast.error("Failed to load subjects");
          setSubjects([]);
        } else {
          setSubjects(data || []);
        }
      })
      .finally(() => setLoadingSubjects(false));
  }, [form.course_id, branchId, financialYearId]);

  // Load existing assignments when editing – scoped
  useEffect(() => {
    if (initialData.id && branchId && financialYearId) {
      supabase
        .from("batch_teachers")
        .select("id, teacher_id, subject_id, day")
        .eq("batch_id", initialData.id)
        .eq("branch_id", branchId)
        .eq("financial_year_id", financialYearId)
        .then(({ data }) => {
          if (data) {
            setAssignments(
              data.map((row) => ({
                id: row.id,
                teacher_id: row.teacher_id,
                subject_id: row.subject_id,
                day: row.day || "",
              }))
            );
          }
        });
    }
  }, [initialData.id, branchId, financialYearId]);

  // ---- Handlers ----
  function handleChange(e) {
    const { name, value } = e.target;
    setForm((prev) => ({ ...prev, [name]: value }));
  }

  function addAssignment() {
    setAssignments((prev) => [
      ...prev,
      { teacher_id: "", subject_id: "", day: "" },
    ]);
  }

  function updateAssignment(index, field, value) {
    setAssignments((prev) => {
      const updated = [...prev];
      updated[index] = { ...updated[index], [field]: value };
      return updated;
    });
  }

  function removeAssignment(index) {
    setAssignments((prev) => prev.filter((_, i) => i !== index));
  }

  async function handleSubmit(e) {
    e.preventDefault();
    if (!form.batch_name || !form.course_id) {
      toast.error("Batch name and course are required");
      return;
    }

    const payload = {
      ...form,
      capacity: form.capacity ? Number(form.capacity) : null,
      medium_id: form.medium_id || null,
      teacher_subjects: assignments.map((a) => ({
        teacher_id: a.teacher_id || null,
        subject_id: a.subject_id || null,
        day: a.day || null,
      })),
    };

    const context = {
      branchId: branch?.id,
      financialYearId: selectedFinancialYear?.id,
    };

    try {
      await onSubmit(payload, context);
      toast.success("Batch saved successfully");
      onClose();
    } catch (err) {
      toast.error(err.message || "Failed to save batch");
    }
  }

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <div className="bg-white dark:bg-accent rounded-xl w-full max-w-3xl max-h-[90vh] overflow-y-auto shadow-xl border border-gray-200 dark:border-gray-700">
        {/* Header */}
        <div className="sticky top-0 bg-white dark:bg-accent border-b border-gray-200 dark:border-gray-700 px-6 py-4 flex items-center justify-between rounded-t-xl z-10">
          <div className="flex items-center gap-3">
            <img src={darkLogo} alt={orgName} className="h-10 w-auto" />
            <h2 className="text-xl font-heading text-primary">
              {initialData.id ? "Edit Batch" : "New Batch"}
            </h2>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition">
            <X size={20} className="text-gray-600 dark:text-gray-400" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-5">
          {/* Course, Batch Name, Medium */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-5">
            <div>
              <label className="block text-sm font-body text-gray-700 dark:text-gray-300 mb-1">
                <BookOpen size={14} className="inline mr-1" />
                Course *
              </label>
              <select
                name="course_id"
                value={form.course_id}
                onChange={handleChange}
                required
                className="w-full border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 rounded p-2.5 focus:ring-2 focus:ring-primary outline-none"
              >
                <option value="">Select Course</option>
                {courses.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.course_name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-body text-gray-700 dark:text-gray-300 mb-1">
                <Layers size={14} className="inline mr-1" />
                Batch Name *
              </label>
              <input
                name="batch_name"
                value={form.batch_name}
                onChange={handleChange}
                placeholder="e.g., Morning Batch"
                required
                className="w-full border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 rounded p-2.5 focus:ring-2 focus:ring-primary outline-none placeholder-gray-400 dark:placeholder-gray-500"
              />
            </div>
            <div>
              <label className="block text-sm font-body text-gray-700 dark:text-gray-300 mb-1">
                <Layers size={14} className="inline mr-1" />
                Medium *
              </label>
              <select
                name="medium_id"
                value={form.medium_id}
                onChange={handleChange}
                required
                className="w-full border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 rounded p-2.5 focus:ring-2 focus:ring-primary outline-none"
              >
                <option value="">Select Medium</option>
                {mediums.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.name}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Dates */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
            <div>
              <label className="block text-sm font-body text-gray-700 dark:text-gray-300 mb-1">
                <Calendar size={14} className="inline mr-1" />
                Start Date
              </label>
              <input
                type="date"
                name="start_date"
                value={form.start_date}
                onChange={handleChange}
                className="w-full border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 rounded p-2.5 focus:ring-2 focus:ring-primary outline-none"
              />
            </div>
            <div>
              <label className="block text-sm font-body text-gray-700 dark:text-gray-300 mb-1">
                <Calendar size={14} className="inline mr-1" />
                End Date
              </label>
              <input
                type="date"
                name="end_date"
                value={form.end_date}
                onChange={handleChange}
                className="w-full border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 rounded p-2.5 focus:ring-2 focus:ring-primary outline-none"
              />
            </div>
          </div>

          {/* Days & Time */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-5">
            <div>
              <label className="block text-sm font-body text-gray-700 dark:text-gray-300 mb-1">
                Days (comma separated)
              </label>
              <input
                name="days"
                value={form.days}
                onChange={handleChange}
                placeholder="Mon,Wed,Fri"
                className="w-full border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 rounded p-2.5 focus:ring-2 focus:ring-primary outline-none placeholder-gray-400 dark:placeholder-gray-500"
              />
            </div>
            <div>
              <label className="block text-sm font-body text-gray-700 dark:text-gray-300 mb-1">
                Start Time
              </label>
              <input
                type="time"
                name="start_time"
                value={form.start_time}
                onChange={handleChange}
                className="w-full border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 rounded p-2.5 focus:ring-2 focus:ring-primary outline-none"
              />
            </div>
            <div>
              <label className="block text-sm font-body text-gray-700 dark:text-gray-300 mb-1">
                End Time
              </label>
              <input
                type="time"
                name="end_time"
                value={form.end_time}
                onChange={handleChange}
                className="w-full border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 rounded p-2.5 focus:ring-2 focus:ring-primary outline-none"
              />
            </div>
          </div>

          {/* Capacity & Status */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
            <div>
              <label className="block text-sm font-body text-gray-700 dark:text-gray-300 mb-1">
                <Users size={14} className="inline mr-1" />
                Capacity
              </label>
              <input
                type="number"
                name="capacity"
                value={form.capacity}
                onChange={handleChange}
                min={1}
                className="w-full border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 rounded p-2.5 focus:ring-2 focus:ring-primary outline-none"
              />
            </div>
            <div>
              <label className="block text-sm font-body text-gray-700 dark:text-gray-300 mb-1">
                Status
              </label>
              <select
                name="status"
                value={form.status}
                onChange={handleChange}
                className="w-full border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 rounded p-2.5 focus:ring-2 focus:ring-primary outline-none"
              >
                <option value="active">Active</option>
                <option value="inactive">Inactive</option>
              </select>
            </div>
          </div>

          {/* Teacher Assignments */}
          <div className="border-t border-gray-200 dark:border-gray-700 pt-5">
            <h3 className="text-lg font-heading text-primary mb-3 flex items-center gap-2">
              <Users size={18} /> Teacher Assignments (Day‑wise)
            </h3>
            {loadingSubjects && <p className="text-sm text-gray-500 dark:text-gray-400">Loading subjects…</p>}
            {!loadingSubjects && form.course_id && subjects.length === 0 && (
              <p className="text-sm text-yellow-600 dark:text-yellow-400">
                No subjects found for this course. Please add subjects first.
              </p>
            )}

            {assignments.map((a, idx) => (
              <div key={idx} className="flex flex-wrap items-end gap-3 mb-3 p-3 bg-gray-50 dark:bg-gray-700 rounded-lg">
                <div className="flex-1 min-w-[120px]">
                  <label className="block text-xs font-body text-gray-700 dark:text-gray-300 mb-1">
                    Teacher
                  </label>
                  <select
                    value={a.teacher_id}
                    onChange={(e) => updateAssignment(idx, "teacher_id", e.target.value ? Number(e.target.value) : "")}
                    className="w-full border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 rounded p-2 text-sm focus:ring-2 focus:ring-primary outline-none"
                  >
                    <option value="">Select</option>
                    {teachers.map((t) => (
                      <option key={t.id} value={t.id}>
                        {t.first_name} {t.last_name}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="flex-1 min-w-[120px]">
                  <label className="block text-xs font-body text-gray-700 dark:text-gray-300 mb-1">
                    Subject
                  </label>
                  <select
                    value={a.subject_id}
                    onChange={(e) => updateAssignment(idx, "subject_id", e.target.value ? Number(e.target.value) : "")}
                    className="w-full border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 rounded p-2 text-sm focus:ring-2 focus:ring-primary outline-none"
                    disabled={!form.course_id || subjects.length === 0}
                  >
                    <option value="">Select</option>
                    {subjects.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.subject_name}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="w-24 min-w-[80px]">
                  <label className="block text-xs font-body text-gray-700 dark:text-gray-300 mb-1">
                    Day
                  </label>
                  <select
                    value={a.day || ""}
                    onChange={(e) => updateAssignment(idx, "day", e.target.value)}
                    className="w-full border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 rounded p-2 text-sm focus:ring-2 focus:ring-primary outline-none"
                  >
                    <option value="">-</option>
                    {DAY_OPTIONS.map((d) => (
                      <option key={d} value={d}>{d}</option>
                    ))}
                  </select>
                </div>
                <button
                  type="button"
                  onClick={() => removeAssignment(idx)}
                  className="text-accent-dark hover:text-accent-light p-2"
                >
                  <Trash2 size={16} />
                </button>
              </div>
            ))}

            <button
              type="button"
              onClick={addAssignment}
              className="text-primary hover:underline text-sm flex items-center gap-1 mt-2"
            >
              <Plus size={16} /> Add Teacher Assignment
            </button>
          </div>

          {/* Buttons */}
          <div className="flex flex-col sm:flex-row-reverse gap-3 pt-2">
            <button
              type="submit"
              className="w-full sm:w-auto bg-primary hover:bg-primary-light text-white px-6 py-2.5 rounded-lg font-body transition flex items-center justify-center gap-2"
            >
              {initialData.id ? "Update Batch" : "Create Batch"}
            </button>
            <button
              type="button"
              onClick={onClose}
              className="w-full sm:w-auto border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-700 px-6 py-2.5 rounded-lg font-body transition"
            >
              Cancel
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}