import { useState, useEffect } from "react";
import toast from "react-hot-toast";
import { X, Hash, User, BookOpen, Layers, Calendar, Link2 } from "lucide-react";
import {
  getStudentOptions,
  getCourseOptions,
  getLevelsByCourse,
} from "../services/certificateService";
import { useOrgDarkLogo } from "../hooks/useOrgDarkLogo";
import { useOrg } from "../context/OrganizationContext";

export default function CertificateForm({ onSubmit, onClose, initialData = {} }) {
  const darkLogo = useOrgDarkLogo();
  const { branch, selectedFinancialYear } = useOrg();
  const branchId = branch?.id;
  const financialYearId = selectedFinancialYear?.id;

  const [students, setStudents] = useState([]);
  const [courses, setCourses] = useState([]);
  const [levels, setLevels] = useState([]);

  const [form, setForm] = useState({
    certificate_no: initialData.certificate_no || "CERT-" + Date.now(),
    student_id: initialData.student_id || "",
    course_id: initialData.course_id || "",
    level_id: initialData.level_id || "",
    issue_date: initialData.issue_date || new Date().toISOString().split("T")[0],
    certificate_url: initialData.certificate_url || "",
  });

  // Load students and courses only when branch/FY are ready
  useEffect(() => {
    if (!branchId || !financialYearId) return;
    loadDropdowns();
  }, [branchId, financialYearId]);

  useEffect(() => {
    if (form.course_id) {
      loadLevels(form.course_id);
    } else {
      setLevels([]);
    }
  }, [form.course_id]);

  async function loadDropdowns() {
    try {
      const [studentData, courseData] = await Promise.all([
        getStudentOptions(branchId, financialYearId),   // now scoped
        getCourseOptions(),                              // org‑wide
      ]);
      setStudents(studentData);
      setCourses(courseData);
    } catch {
      toast.error("Failed to load form data");
    }
  }

  async function loadLevels(courseId) {
    try {
      const data = await getLevelsByCourse(courseId);
      setLevels(data);
    } catch {
      toast.error("Failed to load levels");
    }
  }

  function handleChange(e) {
    setForm((prev) => ({ ...prev, [e.target.name]: e.target.value }));
  }

  async function handleSubmit(e) {
    e.preventDefault();
    if (!form.student_id || !form.course_id || !form.level_id || !form.certificate_no) {
      toast.error("Please fill all required fields");
      return;
    }

    const context = {
      branchId: branchId,
      financialYearId: financialYearId,
    };

    try {
      await onSubmit({ ...form, issued_by: 1 }, context);
    } catch (err) {
      toast.error(err.message);
    }
  }

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl w-full max-w-lg shadow-xl">
        {/* Header with logo */}
        <div className="sticky top-0 bg-white border-b border-secondary-light px-6 py-4 flex items-center justify-between rounded-t-xl">
          <div className="flex items-center gap-3">
            <img
              src={darkLogo}
              alt="ShreeVidhya Academy"
              className="h-10 w-auto"
            />
            <h2 className="text-xl font-righteous text-primary-dark">
              {initialData.id ? "Edit Certificate" : "Issue Certificate"}
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
          {/* Certificate No */}
          <div>
            <label className="block text-sm font-montserrat text-secondary-dark mb-1">
              <Hash size={14} className="inline mr-1" />
              Certificate No *
            </label>
            <input
              name="certificate_no"
              placeholder="CERT-..."
              value={form.certificate_no}
              onChange={handleChange}
              className="w-full border border-secondary-light rounded p-2.5 focus:ring-1 focus:ring-primary focus:border-primary outline-none placeholder-secondary-light"
              required
            />
          </div>

          {/* Student */}
          <div>
            <label className="block text-sm font-montserrat text-secondary-dark mb-1">
              <User size={14} className="inline mr-1" />
              Student *
            </label>
            <select
              name="student_id"
              value={form.student_id}
              onChange={handleChange}
              className="w-full border border-secondary-light rounded p-2.5 focus:ring-1 focus:ring-primary focus:border-primary outline-none"
              required
            >
              <option value="">Select Student</option>
              {students.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.first_name} {s.last_name} ({s.admission_no})
                </option>
              ))}
            </select>
          </div>

          {/* Course */}
          <div>
            <label className="block text-sm font-montserrat text-secondary-dark mb-1">
              <BookOpen size={14} className="inline mr-1" />
              Course *
            </label>
            <select
              name="course_id"
              value={form.course_id}
              onChange={handleChange}
              className="w-full border border-secondary-light rounded p-2.5 focus:ring-1 focus:ring-primary focus:border-primary outline-none"
              required
            >
              <option value="">Select Course</option>
              {courses.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.course_name}
                </option>
              ))}
            </select>
          </div>

          {/* Level */}
          <div>
            <label className="block text-sm font-montserrat text-secondary-dark mb-1">
              <Layers size={14} className="inline mr-1" />
              Level *
            </label>
            <select
              name="level_id"
              value={form.level_id}
              onChange={handleChange}
              className="w-full border border-secondary-light rounded p-2.5 focus:ring-1 focus:ring-primary focus:border-primary outline-none"
              required
              disabled={!form.course_id}
            >
              <option value="">Select Level</option>
              {levels.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.level_name}
                </option>
              ))}
              {form.course_id && levels.length === 0 && (
                <option value="" disabled>
                  No levels defined – add levels in course settings
                </option>
              )}
            </select>
          </div>

          {/* Issue Date */}
          <div>
            <label className="block text-sm font-montserrat text-secondary-dark mb-1">
              <Calendar size={14} className="inline mr-1" />
              Issue Date *
            </label>
            <input
              type="date"
              name="issue_date"
              value={form.issue_date}
              onChange={handleChange}
              className="w-full border border-secondary-light rounded p-2.5 focus:ring-1 focus:ring-primary focus:border-primary outline-none"
              required
            />
          </div>

          {/* Certificate URL */}
          <div>
            <label className="block text-sm font-montserrat text-secondary-dark mb-1">
              <Link2 size={14} className="inline mr-1" />
              Certificate URL <span className="text-secondary-light">(optional)</span>
            </label>
            <input
              name="certificate_url"
              placeholder="https://..."
              value={form.certificate_url}
              onChange={handleChange}
              className="w-full border border-secondary-light rounded p-2.5 focus:ring-1 focus:ring-primary focus:border-primary outline-none placeholder-secondary-light"
            />
            {form.certificate_url && (
              <a
                href={form.certificate_url}
                target="_blank"
                rel="noreferrer"
                className="text-primary text-xs underline mt-1 inline-block"
              >
                Preview link
              </a>
            )}
          </div>

          {/* Buttons */}
          <div className="flex flex-col sm:flex-row-reverse gap-3 pt-2">
            <button
              type="submit"
              className="w-full sm:w-auto bg-primary hover:bg-primary-light text-white px-6 py-2.5 rounded-lg font-montserrat transition flex items-center justify-center gap-2"
            >
              {initialData.id ? "Update" : "Issue Certificate"}
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