import { useState } from "react";
import toast from "react-hot-toast";
import {
  X,
  Layers,
  FileText,
  Clock,
  Award,
} from "lucide-react";
import { useOrgDarkLogo } from "../hooks/useOrgDarkLogo";
import { useOrg } from "../context/OrganizationContext";

export default function CourseLevelForm({
  courseId,
  onSubmit,
  onClose,
  initialData = {},
}) {
  const darkLogo = useOrgDarkLogo();
  const { branch, selectedFinancialYear } = useOrg();

  const [form, setForm] = useState({
    level_name: initialData.level_name || "",
    level_number: initialData.level_number || "",
    description: initialData.description || "",
    duration_months: initialData.duration_months || "",
    certificate_eligible:
      initialData.certificate_eligible !== undefined
        ? initialData.certificate_eligible
        : true,
  });

  function handleChange(e) {
    const { name, value, type, checked } = e.target;
    setForm((prev) => ({
      ...prev,
      [name]: type === "checkbox" ? checked : value,
    }));
  }

  async function handleSubmit(e) {
    e.preventDefault();
    if (!form.level_name || !form.level_number) {
      toast.error("Level name and number are required");
      return;
    }
    const payload = {
      ...form,
      level_number: Number(form.level_number),
      duration_months: form.duration_months
        ? Number(form.duration_months)
        : null,
      course_id: courseId,
    };

    // Build context for branch & financial year
    const context = {
      branchId: branch?.id,
      financialYearId: selectedFinancialYear?.id,
    };

    await onSubmit(payload, context);
  }

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl w-full max-w-md shadow-xl">
        {/* Header with logo */}
        <div className="sticky top-0 bg-white border-b border-secondary-light px-6 py-4 flex items-center justify-between rounded-t-xl">
          <div className="flex items-center gap-3">
            <img
              src={darkLogo}
              alt="ShreeVidhya Academy"
              className="h-10 w-auto"
            />
            <h2 className="text-xl font-righteous text-primary-dark">
              {initialData.id ? "Edit Level" : "Add Level"}
            </h2>
          </div>
          <button
            onClick={onClose}
            className="p-2 hover:bg-secondary-bg rounded-lg transition"
          >
            <X size={20} className="text-secondary-dark" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-5">
          {/* Level Name */}
          <div>
            <label className="block text-sm font-montserrat text-secondary-dark mb-1">
              <Layers size={14} className="inline mr-1" />
              Level Name *
            </label>
            <input
              name="level_name"
              placeholder="e.g., Level 1"
              value={form.level_name}
              onChange={handleChange}
              className="w-full border border-secondary-light rounded p-2.5 focus:ring-1 focus:ring-primary focus:border-primary outline-none placeholder-secondary-light"
              required
            />
          </div>

          {/* Level Number */}
          <div>
            <label className="block text-sm font-montserrat text-secondary-dark mb-1">
              <Layers size={14} className="inline mr-1" />
              Level Number *
            </label>
            <input
              type="number"
              name="level_number"
              placeholder="e.g., 1"
              value={form.level_number}
              onChange={handleChange}
              className="w-full border border-secondary-light rounded p-2.5 focus:ring-1 focus:ring-primary focus:border-primary outline-none placeholder-secondary-light"
              required
            />
          </div>

          {/* Description */}
          <div>
            <label className="block text-sm font-montserrat text-secondary-dark mb-1">
              <FileText size={14} className="inline mr-1" />
              Description
            </label>
            <input
              name="description"
              placeholder="Optional description"
              value={form.description}
              onChange={handleChange}
              className="w-full border border-secondary-light rounded p-2.5 focus:ring-1 focus:ring-primary focus:border-primary outline-none placeholder-secondary-light"
            />
          </div>

          {/* Duration */}
          <div>
            <label className="block text-sm font-montserrat text-secondary-dark mb-1">
              <Clock size={14} className="inline mr-1" />
              Duration (months)
            </label>
            <input
              type="number"
              name="duration_months"
              placeholder="Optional"
              value={form.duration_months}
              onChange={handleChange}
              className="w-full border border-secondary-light rounded p-2.5 focus:ring-1 focus:ring-primary focus:border-primary outline-none placeholder-secondary-light"
              min="1"
            />
          </div>

          {/* Certificate Eligibility */}
          <label className="flex items-center gap-3 cursor-pointer select-none">
            <input
              type="checkbox"
              name="certificate_eligible"
              checked={form.certificate_eligible}
              onChange={handleChange}
              className="rounded accent-primary h-4 w-4"
            />
            <Award size={18} className="text-primary" />
            <span className="text-sm font-montserrat text-secondary-dark">
              Eligible for certificate
            </span>
          </label>

          {/* Buttons */}
          <div className="flex flex-col sm:flex-row-reverse gap-3 pt-2">
            <button
              type="submit"
              className="w-full sm:w-auto bg-primary hover:bg-primary-light text-white px-6 py-2.5 rounded-lg font-montserrat transition flex items-center justify-center gap-2"
            >
              {initialData.id ? "Update Level" : "Create Level"}
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