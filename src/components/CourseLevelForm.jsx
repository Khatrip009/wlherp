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
import { useTheme } from "../context/ThemeContext";

export default function CourseLevelForm({
  courseId,
  onSubmit,
  onClose,
  initialData = {},
}) {
  const darkLogo = useOrgDarkLogo();
  const { branch, selectedFinancialYear } = useOrg();
  const theme = useTheme();

  const headingFont = theme?.font_heading || "Righteous";
  const bodyFont = theme?.font_body || "Montserrat";

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
      <div className="bg-white rounded-xl w-full max-w-md shadow-xl border border-primary-bg">
        {/* Header with logo */}
        <div className="sticky top-0 bg-white border-b border-primary-bg px-6 py-4 flex items-center justify-between rounded-t-xl">
          <div className="flex items-center gap-3">
            <img
              src={darkLogo}
              alt="ShreeVidhya Academy"
              className="h-10 w-auto"
            />
            <h2
              className="text-xl font-bold text-primary"
              style={{ fontFamily: headingFont }}
            >
              {initialData.id ? "Edit Level" : "Add Level"}
            </h2>
          </div>
          <button
            onClick={onClose}
            className="p-2 hover:bg-primary-bg rounded-lg transition"
          >
            <X size={20} className="text-primary-dark" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-5">
          {/* Level Name */}
          <div>
            <label
              className="block text-sm text-primary-dark mb-1"
              style={{ fontFamily: bodyFont }}
            >
              <Layers size={14} className="inline mr-1" />
              Level Name *
            </label>
            <input
              name="level_name"
              placeholder="e.g., Level 1"
              value={form.level_name}
              onChange={handleChange}
              className="w-full border border-primary-bg bg-white text-primary-dark rounded p-2.5 focus:ring-1 focus:ring-primary focus:border-primary outline-none placeholder-primary-dark/40"
              style={{ fontFamily: bodyFont }}
              required
            />
          </div>

          {/* Level Number */}
          <div>
            <label
              className="block text-sm text-primary-dark mb-1"
              style={{ fontFamily: bodyFont }}
            >
              <Layers size={14} className="inline mr-1" />
              Level Number *
            </label>
            <input
              type="number"
              name="level_number"
              placeholder="e.g., 1"
              value={form.level_number}
              onChange={handleChange}
              className="w-full border border-primary-bg bg-white text-primary-dark rounded p-2.5 focus:ring-1 focus:ring-primary focus:border-primary outline-none placeholder-primary-dark/40"
              style={{ fontFamily: bodyFont }}
              required
            />
          </div>

          {/* Description */}
          <div>
            <label
              className="block text-sm text-primary-dark mb-1"
              style={{ fontFamily: bodyFont }}
            >
              <FileText size={14} className="inline mr-1" />
              Description
            </label>
            <input
              name="description"
              placeholder="Optional description"
              value={form.description}
              onChange={handleChange}
              className="w-full border border-primary-bg bg-white text-primary-dark rounded p-2.5 focus:ring-1 focus:ring-primary focus:border-primary outline-none placeholder-primary-dark/40"
              style={{ fontFamily: bodyFont }}
            />
          </div>

          {/* Duration */}
          <div>
            <label
              className="block text-sm text-primary-dark mb-1"
              style={{ fontFamily: bodyFont }}
            >
              <Clock size={14} className="inline mr-1" />
              Duration (months)
            </label>
            <input
              type="number"
              name="duration_months"
              placeholder="Optional"
              value={form.duration_months}
              onChange={handleChange}
              className="w-full border border-primary-bg bg-white text-primary-dark rounded p-2.5 focus:ring-1 focus:ring-primary focus:border-primary outline-none placeholder-primary-dark/40"
              style={{ fontFamily: bodyFont }}
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
              className="rounded text-primary focus:ring-primary h-4 w-4"
            />
            <Award size={18} className="text-primary" />
            <span
              className="text-sm text-primary-dark"
              style={{ fontFamily: bodyFont }}
            >
              Eligible for certificate
            </span>
          </label>

          {/* Buttons */}
          <div className="flex flex-col sm:flex-row-reverse gap-3 pt-2">
            <button
              type="submit"
              className="w-full sm:w-auto bg-primary hover:bg-primary-light text-white px-6 py-2.5 rounded-lg transition flex items-center justify-center gap-2"
              style={{ fontFamily: bodyFont }}
            >
              {initialData.id ? "Update Level" : "Create Level"}
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