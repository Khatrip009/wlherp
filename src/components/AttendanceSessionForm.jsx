// src/components/AttendanceSessionForm.jsx
import { useState, useEffect } from "react";
import toast from "react-hot-toast";
import { X, Calendar, BookOpen, Layers } from "lucide-react";
import { getBatchOptions } from "../services/attendanceService";
import { useAuth } from "../context/AuthContext";
import { useOrg } from "../context/OrganizationContext";
import { supabase } from "../api/supabase";

export default function AttendanceSessionForm({
  onSubmit,
  onClose,
  initialData = {},
}) {
  const { user, profile } = useAuth();
  const { org, branch, selectedFinancialYear } = useOrg();

  const branchId = branch?.id;
  const financialYearId = selectedFinancialYear?.id;

  const darkLogo = org?.logo_dark_url || "/ShreeVidhyaDark.png";
  const orgName = org?.company_name || "Academy";

  const [batches, setBatches] = useState([]);
  const [form, setForm] = useState({
    batch_id: initialData.batch_id || "",
    attendance_date:
      initialData.attendance_date || new Date().toISOString().split("T")[0],
    topic_covered: initialData.topic_covered || "",
  });
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!branchId || !financialYearId) return;
    loadDropdowns();
  }, [branchId, financialYearId]);

  async function loadDropdowns() {
    try {
      const batchData = await getBatchOptions(branchId, financialYearId);
      setBatches(batchData);
    } catch {
      toast.error("Failed to load batches");
    }
  }

  function handleChange(e) {
    setForm((prev) => ({ ...prev, [e.target.name]: e.target.value }));
  }

  async function handleSubmit(e) {
    e.preventDefault();
    if (!form.batch_id || !form.attendance_date) {
      toast.error("Batch and date are required");
      return;
    }

    setSubmitting(true);
    try {
      let created_by = null;
      const isAdmin =
        profile?.role === "admin" || profile?.role === "super_admin";

      if (!isAdmin) {
        // Scope teacher lookup to current branch & financial year
        const { data: teacherData, error: teacherError } = await supabase
          .from("teachers")
          .select("id")
          .eq("user_id", user.id)
          .eq("branch_id", branchId)
          .eq("financial_year_id", financialYearId)
          .maybeSingle();
        if (teacherError) throw teacherError;
        created_by = teacherData?.id || null;
      }

      const payload = { ...form, created_by };
      const context = {
        branchId,
        financialYearId,
      };

      await onSubmit(payload, context);
    } catch (err) {
      toast.error(err.message || "Error creating session");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl w-full max-w-lg shadow-xl">
        {/* Header with dynamic logo */}
        <div className="sticky top-0 bg-white border-b border-secondary-light px-6 py-4 flex items-center justify-between rounded-t-xl">
          <div className="flex items-center gap-3">
            <img src={darkLogo} alt={orgName} className="h-10 w-auto" />
            <h2 className="text-xl font-righteous text-primary-dark">
              {initialData.id ? "Edit Session" : "New Attendance Session"}
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
          {/* Batch */}
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
              {batches.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.batch_name}
                </option>
              ))}
            </select>
          </div>

          {/* Date */}
          <div>
            <label className="block text-sm font-montserrat text-secondary-dark mb-1">
              <Calendar size={14} className="inline mr-1" />
              Date *
            </label>
            <input
              type="date"
              name="attendance_date"
              value={form.attendance_date}
              onChange={handleChange}
              className="w-full border border-secondary-light rounded p-2.5 focus:ring-1 focus:ring-primary focus:border-primary outline-none"
              required
            />
          </div>

          {/* Topic */}
          <div>
            <label className="block text-sm font-montserrat text-secondary-dark mb-1">
              <BookOpen size={14} className="inline mr-1" />
              Topic Covered
            </label>
            <input
              type="text"
              name="topic_covered"
              placeholder="E.g., Algebra - Introduction"
              value={form.topic_covered}
              onChange={handleChange}
              className="w-full border border-secondary-light rounded p-2.5 focus:ring-1 focus:ring-primary focus:border-primary outline-none placeholder-secondary-light"
            />
          </div>

          {/* Buttons */}
          <div className="flex flex-col sm:flex-row-reverse gap-3 pt-2">
            <button
              type="submit"
              disabled={submitting}
              className="w-full sm:w-auto bg-primary hover:bg-primary-light text-white px-6 py-2.5 rounded-lg font-montserrat transition disabled:opacity-50 flex items-center justify-center gap-2"
            >
              {submitting
                ? "Saving..."
                : initialData.id
                ? "Update Session"
                : "Create Session"}
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