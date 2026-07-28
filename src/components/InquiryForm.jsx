// src/components/InquiryForm.jsx
import { useState, useEffect } from "react";
import toast from "react-hot-toast";
import {
  X, User, Phone, Mail, BookOpen, Calendar, Tag, Layers,
} from "lucide-react";
import {
  getCourseOptions,
  getMediumOptions,
} from "../services/inquiryService";
import { useOrgDarkLogo } from "../hooks/useOrgDarkLogo";
import { useOrg } from "../context/OrganizationContext";
import { useTheme } from "../context/ThemeContext";               // ✅ dynamic theme

export default function InquiryForm({ onSubmit, onClose, initialData = {} }) {
  const darkLogo = useOrgDarkLogo();
  const { org, branch, selectedFinancialYear } = useOrg();
  const theme = useTheme();                                     // ✅ theme hook
  const orgName = org?.company_name || "Academy";
  const branchId = branch?.id;
  const financialYearId = selectedFinancialYear?.id;

  const headingFont = theme?.font_heading || "Righteous";
  const bodyFont = theme?.font_body || "Montserrat";

  const [form, setForm] = useState({
    student_name: initialData.student_name || "",
    parent_name: initialData.parent_name || "",
    mobile: initialData.mobile || "",
    whatsapp: initialData.whatsapp || "",
    email: initialData.email || "",
    interested_course_id: initialData.interested_course_id || "",
    source: initialData.source || "",
    remarks: initialData.remarks || "",
    followup_date: initialData.followup_date || "",
    medium_id: initialData.medium_id || "",
  });

  const [courses, setCourses] = useState([]);
  const [mediums, setMediums] = useState([]);

  useEffect(() => {
    if (!branchId || !financialYearId) return;
    loadDropdowns();
  }, [branchId, financialYearId]);

  async function loadDropdowns() {
    try {
      const [courseData, mediumData] = await Promise.all([
        getCourseOptions(),
        getMediumOptions(),
      ]);
      setCourses(courseData);
      setMediums(mediumData);
    } catch (err) {
      toast.error("Failed to load form data");
    }
  }

  function handleChange(e) {
    setForm({ ...form, [e.target.name]: e.target.value });
  }

  async function handleSubmit(e) {
    e.preventDefault();
    if (!form.student_name || !form.mobile) {
      toast.error("Student name and mobile are required");
      return;
    }
    const context = { branchId, financialYearId };
    await onSubmit({ ...form, medium_id: form.medium_id || null }, context);
  }

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl w-full max-w-2xl shadow-xl max-h-[90vh] overflow-y-auto border border-primary-bg">
        <div className="sticky top-0 bg-white border-b border-primary-bg px-6 py-4 flex items-center justify-between rounded-t-xl z-10">
          <div className="flex items-center gap-3">
            <img src={darkLogo} alt={orgName} className="h-10 w-auto" />
            <h2 className="text-xl font-bold text-primary" style={{ fontFamily: headingFont }}>
              {initialData.id ? "Edit Inquiry" : "New Inquiry"}
            </h2>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-primary-bg rounded-lg transition">
            <X size={20} className="text-primary-dark" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-5">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm text-primary-dark mb-1" style={{ fontFamily: bodyFont }}>
                <User size={14} className="inline mr-1" /> Student Name *
              </label>
              <input
                name="student_name"
                placeholder="Full name"
                value={form.student_name}
                onChange={handleChange}
                className="w-full border border-primary-bg bg-white text-primary-dark rounded p-2.5 focus:ring-1 focus:ring-primary focus:border-primary outline-none placeholder-primary-dark/40"
                required
                style={{ fontFamily: bodyFont }}
              />
            </div>
            <div>
              <label className="block text-sm text-primary-dark mb-1" style={{ fontFamily: bodyFont }}>
                <User size={14} className="inline mr-1" /> Parent Name
              </label>
              <input
                name="parent_name"
                placeholder="Father / Mother"
                value={form.parent_name}
                onChange={handleChange}
                className="w-full border border-primary-bg bg-white text-primary-dark rounded p-2.5 focus:ring-1 focus:ring-primary focus:border-primary outline-none placeholder-primary-dark/40"
                style={{ fontFamily: bodyFont }}
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm text-primary-dark mb-1" style={{ fontFamily: bodyFont }}>
                <Phone size={14} className="inline mr-1" /> Mobile *
              </label>
              <input
                name="mobile"
                placeholder="Phone number"
                value={form.mobile}
                onChange={handleChange}
                className="w-full border border-primary-bg bg-white text-primary-dark rounded p-2.5 focus:ring-1 focus:ring-primary focus:border-primary outline-none placeholder-primary-dark/40"
                required
                style={{ fontFamily: bodyFont }}
              />
            </div>
            <div>
              <label className="block text-sm text-primary-dark mb-1" style={{ fontFamily: bodyFont }}>
                <Phone size={14} className="inline mr-1" /> WhatsApp
              </label>
              <input
                name="whatsapp"
                placeholder="WhatsApp number"
                value={form.whatsapp}
                onChange={handleChange}
                className="w-full border border-primary-bg bg-white text-primary-dark rounded p-2.5 focus:ring-1 focus:ring-primary focus:border-primary outline-none placeholder-primary-dark/40"
                style={{ fontFamily: bodyFont }}
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm text-primary-dark mb-1" style={{ fontFamily: bodyFont }}>
                <Mail size={14} className="inline mr-1" /> Email
              </label>
              <input
                type="email"
                name="email"
                placeholder="Email address"
                value={form.email}
                onChange={handleChange}
                className="w-full border border-primary-bg bg-white text-primary-dark rounded p-2.5 focus:ring-1 focus:ring-primary focus:border-primary outline-none placeholder-primary-dark/40"
                style={{ fontFamily: bodyFont }}
              />
            </div>
            <div>
              <label className="block text-sm text-primary-dark mb-1" style={{ fontFamily: bodyFont }}>
                <BookOpen size={14} className="inline mr-1" /> Interested Course
              </label>
              <select
                name="interested_course_id"
                value={form.interested_course_id}
                onChange={handleChange}
                className="w-full border border-primary-bg bg-white text-primary-dark rounded p-2.5 focus:ring-1 focus:ring-primary focus:border-primary outline-none"
                style={{ fontFamily: bodyFont }}
              >
                <option value="">Select Course</option>
                {courses.map((c) => (
                  <option key={c.id} value={c.id}>{c.course_name}</option>
                ))}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm text-primary-dark mb-1" style={{ fontFamily: bodyFont }}>
                <Layers size={14} className="inline mr-1" /> Medium
              </label>
              <select
                name="medium_id"
                value={form.medium_id}
                onChange={handleChange}
                className="w-full border border-primary-bg bg-white text-primary-dark rounded p-2.5 focus:ring-1 focus:ring-primary focus:border-primary outline-none"
                style={{ fontFamily: bodyFont }}
              >
                <option value="">Select Medium</option>
                {mediums.map((m) => (
                  <option key={m.id} value={m.id}>{m.name}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm text-primary-dark mb-1" style={{ fontFamily: bodyFont }}>
                <Tag size={14} className="inline mr-1" /> Source
              </label>
              <input
                name="source"
                placeholder="e.g., Walk-in, Reference"
                value={form.source}
                onChange={handleChange}
                className="w-full border border-primary-bg bg-white text-primary-dark rounded p-2.5 focus:ring-1 focus:ring-primary focus:border-primary outline-none placeholder-primary-dark/40"
                style={{ fontFamily: bodyFont }}
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm text-primary-dark mb-1" style={{ fontFamily: bodyFont }}>
                <Calendar size={14} className="inline mr-1" /> Follow-up Date
              </label>
              <input
                type="date"
                name="followup_date"
                value={form.followup_date}
                onChange={handleChange}
                className="w-full border border-primary-bg bg-white text-primary-dark rounded p-2.5 focus:ring-1 focus:ring-primary focus:border-primary outline-none"
              />
            </div>
          </div>

          <div>
            <label className="block text-sm text-primary-dark mb-1" style={{ fontFamily: bodyFont }}>
              Remarks
            </label>
            <textarea
              name="remarks"
              placeholder="Additional notes..."
              value={form.remarks}
              onChange={handleChange}
              rows={3}
              className="w-full border border-primary-bg bg-white text-primary-dark rounded p-2.5 focus:ring-1 focus:ring-primary focus:border-primary outline-none placeholder-primary-dark/40 resize-none"
              style={{ fontFamily: bodyFont }}
            />
          </div>

          <div className="flex flex-col sm:flex-row-reverse gap-3 pt-2">
            <button
              type="submit"
              className="w-full sm:w-auto bg-primary hover:bg-primary-light text-white px-6 py-2.5 rounded-lg transition flex items-center justify-center gap-2"
              style={{ fontFamily: bodyFont }}
            >
              {initialData.id ? "Update Inquiry" : "Create Inquiry"}
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