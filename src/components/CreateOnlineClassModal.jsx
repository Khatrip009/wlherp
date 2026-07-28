import React, { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "../api/supabase";
import { useOrg } from "../context/OrganizationContext";
import { useTheme } from "../context/ThemeContext"; // ✅ dynamic theme
import toast from "react-hot-toast";
import { X, Loader } from "lucide-react";

export default function CreateOnlineClassModal({ isOpen, onClose, onSuccess, initialData = null }) {
  const queryClient = useQueryClient();
  const { branch, selectedFinancialYear } = useOrg();
  const theme = useTheme();                                   // ✅ theme hook
  const branchId = branch?.id;
  const financialYearId = selectedFinancialYear?.id;

  const headingFont = theme?.font_heading || "Righteous";
  const bodyFont = theme?.font_body || "Montserrat";

  const isEditing = !!initialData?.id;

  const [form, setForm] = useState({
    title: "",
    description: "",
    teacher_id: "",
    batch_id: "",
    start_time: "",
    duration_minutes: 30,
    status: "scheduled",
  });

  // ── Reset form when modal opens ──
  useEffect(() => {
    if (isOpen) {
      if (initialData) {
        setForm({
          title: initialData.title || "",
          description: initialData.description || "",
          teacher_id: initialData.teacher_id || "",
          batch_id: initialData.batch_id || "",
          start_time: initialData.start_time || "",
          duration_minutes: initialData.duration_minutes || 30,
          status: initialData.status || "scheduled",
        });
      } else {
        setForm({
          title: "",
          description: "",
          teacher_id: "",
          batch_id: "",
          start_time: "",
          duration_minutes: 30,
          status: "scheduled",
        });
      }
    }
  }, [isOpen, initialData]);

  // ── Fetch teachers – scoped ──────────────────────────────
  const { data: teachers = [], isLoading: teachersLoading } = useQuery({
    queryKey: ["teachers-for-modal", branchId, financialYearId],
    queryFn: async () => {
      if (!branchId || !financialYearId) return [];
      const { data, error } = await supabase
        .from("teachers")
        .select("id, first_name, last_name, employee_code")
        .eq("branch_id", branchId)
        .eq("financial_year_id", financialYearId)
        .order("first_name");
      if (error) throw error;
      return data || [];
    },
    enabled: !!branchId && !!financialYearId,
    staleTime: 5 * 60 * 1000,
  });

  // ── Fetch batches – scoped ────────────────────────────────
  const { data: batches = [], isLoading: batchesLoading } = useQuery({
    queryKey: ["batches-for-modal", branchId, financialYearId],
    queryFn: async () => {
      if (!branchId || !financialYearId) return [];
      const { data, error } = await supabase
        .from("batches")
        .select("id, batch_name")
        .eq("status", "active")
        .eq("branch_id", branchId)
        .eq("financial_year_id", financialYearId)
        .order("batch_name");
      if (error) throw error;
      return data || [];
    },
    enabled: !!branchId && !!financialYearId,
    staleTime: 5 * 60 * 1000,
  });

  // ── Mutation for create/update (scoped) ──────────────────
  const mutation = useMutation({
    mutationFn: async (payload) => {
      const { id, ...data } = payload;
      const dbPayload = {
        ...data,
        branch_id: branchId,
        financial_year_id: financialYearId,
        // Generate a room name from title + timestamp
        room_name: data.title
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, "-")
          .slice(0, 30) + "-" + Date.now().toString(36),
      };

      if (isEditing) {
        const { error } = await supabase
          .from("online_classes")
          .update(dbPayload)
          .eq("id", id)
          .eq("branch_id", branchId)
          .eq("financial_year_id", financialYearId);
        if (error) throw error;
        return { id };
      } else {
        const { data: newClass, error } = await supabase
          .from("online_classes")
          .insert(dbPayload)
          .select()
          .single();
        if (error) throw error;
        return newClass;
      }
    },
    onSuccess: () => {
      toast.success(isEditing ? "Class updated" : "Class created");
      queryClient.invalidateQueries({ queryKey: ["online-classes"] });
      onSuccess?.();
      onClose();
    },
    onError: (err) => {
      console.error(err);
      toast.error(err.message || "Failed to save class");
    },
  });

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!form.title || !form.teacher_id || !form.batch_id || !form.start_time) {
      toast.error("Please fill in all required fields");
      return;
    }
    const payload = {
      ...form,
      id: initialData?.id || undefined,
    };
    mutation.mutate(payload);
  };

  const handleChange = (e) => {
    setForm({ ...form, [e.target.name]: e.target.value });
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40">
      <div className="bg-white rounded-xl w-full max-w-lg max-h-[90vh] overflow-y-auto shadow-xl border border-primary-bg">
        <div className="sticky top-0 bg-white border-b border-primary-bg px-6 py-4 flex items-center justify-between rounded-t-xl">
          <h2 className="text-xl font-bold text-primary" style={{ fontFamily: headingFont }}>
            {isEditing ? "Edit Online Class" : "Create Online Class"}
          </h2>
          <button
            onClick={onClose}
            className="p-2 hover:bg-primary-bg rounded-lg transition"
          >
            <X size={20} className="text-primary-dark" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          {/* Title */}
          <div>
            <label className="block text-sm text-primary-dark mb-1" style={{ fontFamily: bodyFont }}>
              Title *
            </label>
            <input
              type="text"
              name="title"
              value={form.title}
              onChange={handleChange}
              className="w-full border border-primary-bg rounded p-2.5 focus:ring-1 focus:ring-primary outline-none bg-white text-primary-dark placeholder-primary-dark/40"
              placeholder="e.g., Algebra Basics"
              required
              style={{ fontFamily: bodyFont }}
            />
          </div>

          {/* Description */}
          <div>
            <label className="block text-sm text-primary-dark mb-1" style={{ fontFamily: bodyFont }}>
              Description
            </label>
            <textarea
              name="description"
              value={form.description}
              onChange={handleChange}
              rows={2}
              className="w-full border border-primary-bg rounded p-2.5 focus:ring-1 focus:ring-primary outline-none bg-white text-primary-dark placeholder-primary-dark/40"
              placeholder="Optional description"
              style={{ fontFamily: bodyFont }}
            />
          </div>

          {/* Teacher */}
          <div>
            <label className="block text-sm text-primary-dark mb-1" style={{ fontFamily: bodyFont }}>
              Teacher *
            </label>
            {teachersLoading ? (
              <div className="flex items-center gap-2 text-primary-dark/60">
                <Loader size={16} className="animate-spin" />
                Loading teachers...
              </div>
            ) : (
              <select
                name="teacher_id"
                value={form.teacher_id}
                onChange={handleChange}
                className="w-full border border-primary-bg rounded p-2.5 focus:ring-1 focus:ring-primary outline-none bg-white text-primary-dark"
                required
              >
                <option value="">Select Teacher</option>
                {teachers.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.first_name} {t.last_name} ({t.employee_code || "N/A"})
                  </option>
                ))}
              </select>
            )}
            {!teachersLoading && teachers.length === 0 && (
              <p className="text-xs text-accent-dark mt-1" style={{ fontFamily: bodyFont }}>
                No teachers found for this branch.
              </p>
            )}
          </div>

          {/* Batch */}
          <div>
            <label className="block text-sm text-primary-dark mb-1" style={{ fontFamily: bodyFont }}>
              Batch *
            </label>
            {batchesLoading ? (
              <div className="flex items-center gap-2 text-primary-dark/60">
                <Loader size={16} className="animate-spin" />
                Loading batches...
              </div>
            ) : (
              <select
                name="batch_id"
                value={form.batch_id}
                onChange={handleChange}
                className="w-full border border-primary-bg rounded p-2.5 focus:ring-1 focus:ring-primary outline-none bg-white text-primary-dark"
                required
              >
                <option value="">Select Batch</option>
                {batches.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.batch_name}
                  </option>
                ))}
              </select>
            )}
            {!batchesLoading && batches.length === 0 && (
              <p className="text-xs text-accent-dark mt-1" style={{ fontFamily: bodyFont }}>
                No active batches found.
              </p>
            )}
          </div>

          {/* Start Time */}
          <div>
            <label className="block text-sm text-primary-dark mb-1" style={{ fontFamily: bodyFont }}>
              Start Time *
            </label>
            <input
              type="datetime-local"
              name="start_time"
              value={form.start_time}
              onChange={handleChange}
              className="w-full border border-primary-bg rounded p-2.5 focus:ring-1 focus:ring-primary outline-none bg-white text-primary-dark"
              required
            />
          </div>

          {/* Duration */}
          <div>
            <label className="block text-sm text-primary-dark mb-1" style={{ fontFamily: bodyFont }}>
              Duration (minutes) *
            </label>
            <input
              type="number"
              name="duration_minutes"
              value={form.duration_minutes}
              onChange={handleChange}
              className="w-full border border-primary-bg rounded p-2.5 focus:ring-1 focus:ring-primary outline-none bg-white text-primary-dark"
              min="5"
              max="240"
              required
            />
          </div>

          {/* Status (only for editing) */}
          {isEditing && (
            <div>
              <label className="block text-sm text-primary-dark mb-1" style={{ fontFamily: bodyFont }}>
                Status
              </label>
              <select
                name="status"
                value={form.status}
                onChange={handleChange}
                className="w-full border border-primary-bg rounded p-2.5 focus:ring-1 focus:ring-primary outline-none bg-white text-primary-dark"
              >
                <option value="scheduled">Scheduled</option>
                <option value="live">Live</option>
                <option value="ended">Ended</option>
              </select>
            </div>
          )}

          {/* Buttons */}
          <div className="flex flex-col sm:flex-row-reverse gap-3 pt-2 border-t border-primary-bg">
            <button
              type="submit"
              disabled={mutation.isPending}
              className="w-full sm:w-auto bg-primary hover:bg-primary-light text-white px-6 py-2.5 rounded-lg transition disabled:opacity-50 flex items-center justify-center gap-2"
              style={{ fontFamily: bodyFont }}
            >
              {mutation.isPending ? (
                <>
                  <Loader size={16} className="animate-spin" />
                  {isEditing ? "Updating..." : "Creating..."}
                </>
              ) : (
                isEditing ? "Update Class" : "Create Class"
              )}
            </button>
            <button
              type="button"
              onClick={onClose}
              className="w-full sm:w-auto border border-primary-bg text-primary-dark hover:bg-primary-bg px-6 py-2.5 rounded-lg transition"
              style={{ fontFamily: bodyFont }}
            >
              Cancel
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}