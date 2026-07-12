import { useState, useEffect } from "react";
import toast from "react-hot-toast";
import {
  X, Layers, BookOpen, FileText, AlignLeft, Calendar, Link2, User, Filter,
} from "lucide-react";
import {
  getBatchOptions,
  getSubjectsByCourse,
  getTeacherOptions,
  getMediumOptions,
} from "../services/homeworkService";
import { useOrgDarkLogo } from "../hooks/useOrgDarkLogo";
import { useAuth } from "../context/AuthContext";
import { useOrg } from "../context/OrganizationContext";
import { supabase } from "../api/supabase";

export default function HomeworkForm({ onSubmit, onClose, initialData = {} }) {
  const darkLogo = useOrgDarkLogo();
  const { user, profile } = useAuth();
  const { branch, selectedFinancialYear } = useOrg();
  const branchId = branch?.id;
  const financialYearId = selectedFinancialYear?.id;

  const [batches, setBatches] = useState([]);
  const [mediums, setMediums] = useState([]);
  const [selectedMediumId, setSelectedMediumId] = useState("");
  const [subjects, setSubjects] = useState([]);
  const [teachers, setTeachers] = useState([]);
  const [loadingTeacherId, setLoadingTeacherId] = useState(false);
  const [loadingSubjects, setLoadingSubjects] = useState(false);

  const [form, setForm] = useState({
    batch_id: initialData.batch_id || "",
    subject_id: initialData.subject_id || "",
    title: initialData.title || "",
    description: initialData.description || "",
    assigned_date: initialData.assigned_date || new Date().toISOString().split("T")[0],
    due_date: initialData.due_date || "",
    attachment_url: initialData.attachment_url || "",
    created_by: initialData.created_by || "",
  });

  const isAdmin = profile?.role === "admin" || profile?.role === "super_admin";

  // Load dropdowns when branch/FY are ready
  useEffect(() => {
    if (!branchId || !financialYearId) return;
    loadDropdowns();
    autoSetTeacher();
  }, [branchId, financialYearId]);

  // Fetch subjects whenever batch_id changes
  useEffect(() => {
    if (!form.batch_id || !branchId || !financialYearId) {
      setSubjects([]);
      return;
    }

    async function fetchSubjects() {
      setLoadingSubjects(true);
      try {
        const { data: batchData, error: batchError } = await supabase
          .from("batches")
          .select("course_id")
          .eq("id", form.batch_id)
          .eq("branch_id", branchId)
          .eq("financial_year_id", financialYearId)
          .maybeSingle();

        if (batchError) throw batchError;
        if (!batchData || !batchData.course_id) {
          setSubjects([]);
          return;
        }

        // Now scope subjects by branch and financial year
        const subj = await getSubjectsByCourse(
          batchData.course_id,
          branchId,
          financialYearId
        );
        setSubjects(subj);
      } catch (err) {
        console.error("Failed to load subjects:", err);
        toast.error("Failed to load subjects");
        setSubjects([]);
      } finally {
        setLoadingSubjects(false);
      }
    }

    fetchSubjects();
  }, [form.batch_id, branchId, financialYearId]);

  // Auto-set teacher for non-admin users (scoped)
  async function autoSetTeacher() {
    if (isAdmin || !user?.id || !branchId || !financialYearId) return;
    try {
      setLoadingTeacherId(true);
      const { data: teacherData } = await supabase
        .from("teachers")
        .select("id")
        .eq("user_id", user.id)
        .eq("branch_id", branchId)
        .eq("financial_year_id", financialYearId)
        .maybeSingle();
      if (teacherData?.id) {
        setForm((prev) => ({ ...prev, created_by: teacherData.id }));
      }
    } catch (err) {
      console.error("Failed to auto-set teacher ID", err);
    } finally {
      setLoadingTeacherId(false);
    }
  }

  async function loadDropdowns() {
    try {
      const [batchData, teacherData, mediumData] = await Promise.all([
        getBatchOptions(branchId, financialYearId),
        getTeacherOptions(branchId, financialYearId),
        getMediumOptions(),
      ]);
      setBatches(batchData);
      setTeachers(teacherData);
      setMediums(mediumData);
    } catch {
      toast.error("Failed to load form data");
    }
  }

  function handleChange(e) {
    setForm((prev) => ({ ...prev, [e.target.name]: e.target.value }));
  }

  // Filter batches by selected medium
  const filteredBatches = batches.filter((b) =>
    !selectedMediumId ? true : b.medium_id === parseInt(selectedMediumId)
  );

  async function handleSubmit(e) {
    e.preventDefault();
    if (!form.batch_id || !form.subject_id || !form.title || !form.assigned_date) {
      toast.error("Batch, subject, title, and assigned date are required");
      return;
    }
    try {
      const context = {
        branchId: branchId,
        financialYearId: financialYearId,
      };
      await onSubmit({ ...form, created_by: form.created_by || null }, context);
    } catch (err) {
      toast.error(err.message);
    }
  }

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl w-full max-w-2xl shadow-xl max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="sticky top-0 bg-white border-b border-secondary-light px-6 py-4 flex items-center justify-between rounded-t-xl z-10">
          <div className="flex items-center gap-3">
            <img src={darkLogo} alt="ShreeVidhya Academy" className="h-10 w-auto" />
            <h2 className="text-xl font-righteous text-primary-dark">
              {initialData.id ? "Edit Homework" : "New Homework"}
            </h2>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-secondary-bg rounded-lg transition">
            <X size={20} className="text-secondary-dark" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-5">
          {/* Medium Filter */}
          <div>
            <label className="block text-sm font-montserrat text-secondary-dark mb-1">
              <Filter size={14} className="inline mr-1" />
              Medium
            </label>
            <select
              value={selectedMediumId}
              onChange={(e) => {
                setSelectedMediumId(e.target.value);
                setForm((prev) => ({ ...prev, batch_id: "", subject_id: "" }));
              }}
              className="w-full border border-secondary-light rounded p-2.5 focus:ring-1 focus:ring-primary focus:border-primary outline-none"
            >
              <option value="">All Mediums</option>
              {mediums.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name}
                </option>
              ))}
            </select>
          </div>

          {/* Batch & Subject */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
            <div>
              <label className="block text-sm font-montserrat text-secondary-dark mb-1">
                <Layers size={14} className="inline mr-1" />
                Batch *
              </label>
              <select
                name="batch_id"
                value={form.batch_id}
                onChange={handleChange}
                className="w-full border border-secondary-light rounded p-2.5 focus:ring-1 focus:ring-primary focus:border-primary outline-none"
                required
              >
                <option value="">Select Batch</option>
                {filteredBatches.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.batch_name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-montserrat text-secondary-dark mb-1">
                <BookOpen size={14} className="inline mr-1" />
                Subject *
              </label>
              <select
                name="subject_id"
                value={form.subject_id}
                onChange={handleChange}
                className="w-full border border-secondary-light rounded p-2.5 focus:ring-1 focus:ring-primary focus:border-primary outline-none"
                required
                disabled={!form.batch_id || loadingSubjects}
              >
                <option value="">
                  {loadingSubjects ? "Loading subjects..." : "Select Subject"}
                </option>
                {!loadingSubjects && subjects.length === 0 && form.batch_id && (
                  <option value="" disabled>
                    No subjects found for this batch.
                  </option>
                )}
                {subjects.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.subject_name}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Title */}
          <div>
            <label className="block text-sm font-montserrat text-secondary-dark mb-1">
              <FileText size={14} className="inline mr-1" />
              Title *
            </label>
            <input
              name="title"
              placeholder="Homework title"
              value={form.title}
              onChange={handleChange}
              className="w-full border border-secondary-light rounded p-2.5 focus:ring-1 focus:ring-primary focus:border-primary outline-none placeholder-secondary-light"
              required
            />
          </div>

          {/* Description */}
          <div>
            <label className="block text-sm font-montserrat text-secondary-dark mb-1">
              <AlignLeft size={14} className="inline mr-1" />
              Description
            </label>
            <textarea
              name="description"
              placeholder="Detailed instructions"
              value={form.description}
              onChange={handleChange}
              rows={3}
              className="w-full border border-secondary-light rounded p-2.5 focus:ring-1 focus:ring-primary focus:border-primary outline-none placeholder-secondary-light resize-none"
            />
          </div>

          {/* Dates */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
            <div>
              <label className="block text-sm font-montserrat text-secondary-dark mb-1">
                <Calendar size={14} className="inline mr-1" />
                Assigned Date *
              </label>
              <input
                type="date"
                name="assigned_date"
                value={form.assigned_date}
                onChange={handleChange}
                className="w-full border border-secondary-light rounded p-2.5 focus:ring-1 focus:ring-primary focus:border-primary outline-none"
                required
              />
            </div>
            <div>
              <label className="block text-sm font-montserrat text-secondary-dark mb-1">
                <Calendar size={14} className="inline mr-1" />
                Due Date
              </label>
              <input
                type="date"
                name="due_date"
                value={form.due_date}
                onChange={handleChange}
                className="w-full border border-secondary-light rounded p-2.5 focus:ring-1 focus:ring-primary focus:border-primary outline-none"
              />
            </div>
          </div>

          {/* Attachment URL */}
          <div>
            <label className="block text-sm font-montserrat text-secondary-dark mb-1">
              <Link2 size={14} className="inline mr-1" />
              Attachment URL
            </label>
            <input
              name="attachment_url"
              placeholder="https://..."
              value={form.attachment_url}
              onChange={handleChange}
              className="w-full border border-secondary-light rounded p-2.5 focus:ring-1 focus:ring-primary focus:border-primary outline-none placeholder-secondary-light"
            />
          </div>

          {/* Assigned Teacher */}
          {isAdmin ? (
            <div>
              <label className="block text-sm font-montserrat text-secondary-dark mb-1">
                <User size={14} className="inline mr-1" />
                Assigned Teacher
              </label>
              <select
                name="created_by"
                value={form.created_by}
                onChange={handleChange}
                className="w-full border border-secondary-light rounded p-2.5 focus:ring-1 focus:ring-primary focus:border-primary outline-none"
              >
                <option value="">Optional</option>
                {teachers.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.first_name} {t.last_name}
                  </option>
                ))}
              </select>
            </div>
          ) : (
            <input type="hidden" name="created_by" value={form.created_by || ""} />
          )}

          {/* Buttons */}
          <div className="flex flex-col sm:flex-row-reverse gap-3 pt-2">
            <button
              type="submit"
              disabled={loadingTeacherId || loadingSubjects}
              className="w-full sm:w-auto bg-primary hover:bg-primary-light text-white px-6 py-2.5 rounded-lg font-montserrat transition flex items-center justify-center gap-2"
            >
              {initialData.id ? "Update Homework" : "Create Homework"}
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