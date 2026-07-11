// src/components/CourseForm.jsx
import { useState, useEffect } from "react";
import toast from "react-hot-toast";
import { X, BookOpen, FileText, Clock, Layers } from "lucide-react";
import { supabase } from "../api/supabase";
import { useOrg } from "../context/OrganizationContext";

export default function CourseForm({ onSubmit, onClose, initialData = {} }) {
  const { branch, selectedFinancialYear } = useOrg();

  const [form, setForm] = useState({
    course_name: initialData.course_name || "",
    description: initialData.description || "",
    duration_months: initialData.duration_months || "",
    medium_id: initialData.medium_id || "",
    status: initialData.status !== undefined ? initialData.status : true,
  });

  const [mediums, setMediums] = useState([]);
  const [isContextReady, setIsContextReady] = useState(false);

  useEffect(() => {
    loadMediums();
  }, []);

  useEffect(() => {
    if (branch !== undefined && selectedFinancialYear !== undefined) {
      setIsContextReady(true);
    }
  }, [branch, selectedFinancialYear]);

  async function loadMediums() {
    try {
      const { data } = await supabase.from("mediums").select("id, name").order("name");
      setMediums(data || []);
    } catch (err) {
      toast.error("Failed to load mediums");
    }
  }

  function handleChange(e) {
    const { name, value, type, checked } = e.target;
    setForm((prev) => ({
      ...prev,
      [name]: type === "checkbox" ? checked : value,
    }));
  }

  async function handleSubmit(e) {
    e.preventDefault();

    if (!form.course_name.trim()) {
      toast.error("Course name is required");
      return;
    }

    // ── Context guards ──
    if (!branch?.id) {
      toast.error("No branch selected – please refresh.");
      return;
    }
    if (!selectedFinancialYear?.id) {
      toast.error("No financial year selected.");
      return;
    }

    const context = {
      branchId: branch.id,
      financialYearId: selectedFinancialYear.id,
    };

    const payload = {
      ...form,
      course_name: form.course_name.trim(),
      description: form.description.trim() || null,
      duration_months: form.duration_months ? Number(form.duration_months) : null,
      medium_id: form.medium_id || null,
    };

    await onSubmit(payload, context);
  }

  if (!isContextReady) {
    return (
      <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
        <div className="bg-white rounded-xl p-8 shadow-xl">
          <p className="text-secondary font-montserrat">Loading organisation data…</p>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl w-full max-w-lg shadow-xl max-h-[90vh] overflow-y-auto">
        <div className="sticky top-0 bg-white border-b border-secondary-light px-6 py-4 flex items-center justify-between rounded-t-xl z-10">
          <h2 className="text-xl font-righteous text-primary-dark">
            {initialData.id ? "Edit Course" : "New Course"}
          </h2>
          <button onClick={onClose} className="p-2 hover:bg-secondary-bg rounded-lg transition">
            <X size={20} className="text-secondary-dark" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-5">
          {/* Course Name */}
          <div>
            <label className="block text-sm font-montserrat text-secondary-dark mb-1">
              <BookOpen size={14} className="inline mr-1" /> Course Name *
            </label>
            <input
              name="course_name"
              placeholder="e.g., Abacus, Vedic Math"
              value={form.course_name}
              onChange={handleChange}
              className="w-full border border-secondary-light rounded p-2.5 focus:ring-1 focus:ring-primary focus:border-primary outline-none placeholder-secondary-light"
              required
            />
          </div>

          {/* Description */}
          <div>
            <label className="block text-sm font-montserrat text-secondary-dark mb-1">
              <FileText size={14} className="inline mr-1" /> Description
            </label>
            <textarea
              name="description"
              placeholder="Brief description"
              value={form.description}
              onChange={handleChange}
              rows={3}
              className="w-full border border-secondary-light rounded p-2.5 focus:ring-1 focus:ring-primary focus:border-primary outline-none placeholder-secondary-light resize-none"
            />
          </div>

          {/* Duration & Medium */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-montserrat text-secondary-dark mb-1">
                <Clock size={14} className="inline mr-1" /> Duration (months)
              </label>
              <input
                type="number"
                name="duration_months"
                placeholder="e.g., 12"
                value={form.duration_months}
                onChange={handleChange}
                className="w-full border border-secondary-light rounded p-2.5 focus:ring-1 focus:ring-primary focus:border-primary outline-none"
              />
            </div>
            <div>
              <label className="block text-sm font-montserrat text-secondary-dark mb-1">
                <Layers size={14} className="inline mr-1" /> Medium
              </label>
              <select
                name="medium_id"
                value={form.medium_id}
                onChange={handleChange}
                className="w-full border border-secondary-light rounded p-2.5 focus:ring-1 focus:ring-primary focus:border-primary outline-none"
              >
                <option value="">No Medium</option>
                {mediums.map((m) => (
                  <option key={m.id} value={m.id}>{m.name}</option>
                ))}
              </select>
            </div>
          </div>

          {/* Active status */}
          <div className="flex items-center gap-2">
            <input
              type="checkbox"
              name="status"
              checked={form.status}
              onChange={handleChange}
              className="w-4 h-4"
            />
            <label className="text-sm font-montserrat text-secondary-dark">Active</label>
          </div>

          {/* Buttons */}
          <div className="flex flex-col sm:flex-row-reverse gap-3 pt-2">
            <button
              type="submit"
              className="w-full sm:w-auto bg-primary hover:bg-primary-light text-white px-6 py-2.5 rounded-lg font-montserrat transition"
            >
              {initialData.id ? "Update Course" : "Create Course"}
            </button>
            <button
              type="button"
              onClick={onClose}
              className="w-full sm:w-auto border border-secondary-light text-secondary-dark hover:bg-secondary-bg px-6 py-2.5 rounded-lg font-montserrat transition"
            >
              Cancel
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}