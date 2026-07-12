import { useState, useEffect, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import toast from "react-hot-toast";
import {
  X,
  Layers,
  User,
  Calendar,
  TrendingUp,
  Star,
  MessageSquareText,
  Filter,
  BarChart3,
} from "lucide-react";
import {
  getActiveBatches,
  getStudentsByBatch,
  getMediumOptions,
  getProgressEvaluations,
} from "../services/progressService";
import { useOrgDarkLogo } from "../hooks/useOrgDarkLogo";
import { useOrg } from "../context/OrganizationContext";

export default function ProgressEvaluationForm({
  onSubmit,
  onClose,
  initialData = {},
}) {
  const darkLogo = useOrgDarkLogo();
  const { branch, selectedFinancialYear } = useOrg();
  const branchId = branch?.id;
  const financialYearId = selectedFinancialYear?.id;

  const [batches, setBatches] = useState([]);
  const [mediums, setMediums] = useState([]);
  const [selectedMediumId, setSelectedMediumId] = useState("");
  const [students, setStudents] = useState([]);

  const [form, setForm] = useState({
    student_id: initialData.student_id || "",
    batch_id: initialData.batch_id || "",
    evaluation_date:
      initialData.evaluation_date || new Date().toISOString().split("T")[0],
    attendance_percentage: initialData.attendance_percentage || "",
    performance_score: initialData.performance_score || "",
    teacher_remarks: initialData.teacher_remarks || "",
  });

  // Load dropdowns only when branch & FY are ready
  useEffect(() => {
    if (!branchId || !financialYearId) return;
    loadDropdowns();
  }, [branchId, financialYearId]);

  // Set medium filter based on selected batch
  useEffect(() => {
    if (!form.batch_id || batches.length === 0) return;
    const batch = batches.find((b) => b.id == form.batch_id);
    if (batch) {
      setSelectedMediumId(batch.medium_id ? String(batch.medium_id) : "");
    }
  }, [form.batch_id, batches]);

  // Load students when batch changes
  useEffect(() => {
    if (!form.batch_id || !branchId || !financialYearId) {
      setStudents([]);
      return;
    }
    loadStudents(form.batch_id);
  }, [form.batch_id, branchId, financialYearId]);

  async function loadDropdowns() {
    try {
      const [batchData, mediumData] = await Promise.all([
        getActiveBatches(branchId, financialYearId),   // now scoped
        getMediumOptions(),                             // org‑wide
      ]);
      setBatches(batchData);
      setMediums(mediumData);
    } catch {
      toast.error("Failed to load data");
    }
  }

  async function loadStudents(batchId) {
    try {
      const data = await getStudentsByBatch(batchId, branchId, financialYearId);
      setStudents(data);
    } catch {
      toast.error("Failed to load students");
    }
  }

  function handleChange(e) {
    setForm((prev) => ({ ...prev, [e.target.name]: e.target.value }));
  }

  // Fetch previous evaluations for the selected student (scoped by service)
  const { data: studentEvals = [] } = useQuery({
    queryKey: ["student-evaluations", form.student_id, branchId, financialYearId],
    queryFn: async () => {
      if (!form.student_id) return [];
      const { data } = await getProgressEvaluations({
        pageParam: 0,
        filters: { student_id: form.student_id, pageSize: 100 },
        branchId,
        financialYearId,
      });
      return data || [];
    },
    enabled: !!form.student_id && !!branchId && !!financialYearId,
    staleTime: 1 * 60 * 1000,
  });

  // Auto‑compute averages
  const averages = useMemo(() => {
    const valid = studentEvals.filter(
      (e) => e.attendance_percentage != null && e.performance_score != null
    );
    if (valid.length === 0) return { avgAtt: "—", avgScore: "—" };
    const totalAtt = valid.reduce((s, e) => s + Number(e.attendance_percentage), 0);
    const totalScore = valid.reduce((s, e) => s + Number(e.performance_score), 0);
    return {
      avgAtt: (totalAtt / valid.length).toFixed(1) + "%",
      avgScore: (totalScore / valid.length).toFixed(1),
    };
  }, [studentEvals]);

  // Filter batches by selected medium (keep current batch visible)
  const filteredBatches = batches.filter(
    (b) =>
      !selectedMediumId ||
      b.medium_id == selectedMediumId ||
      b.id == form.batch_id
  );

  async function handleSubmit(e) {
    e.preventDefault();
    if (!form.student_id || !form.batch_id || !form.evaluation_date) {
      toast.error("Student, batch, and date are required");
      return;
    }
    const payload = {
      ...form,
      attendance_percentage: form.attendance_percentage
        ? Number(form.attendance_percentage)
        : null,
      performance_score: form.performance_score
        ? Number(form.performance_score)
        : null,
    };

    const context = {
      branchId: branchId,
      financialYearId: financialYearId,
    };

    try {
      await onSubmit(payload, context);
    } catch (err) {
      toast.error(err.message);
    }
  }

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl w-full max-w-lg max-h-[90vh] flex flex-col shadow-xl">
        {/* Header */}
        <div className="flex-shrink-0 bg-white border-b border-secondary-light px-6 py-4 flex items-center justify-between rounded-t-xl">
          <div className="flex items-center gap-3">
            <img
              src={darkLogo}
              alt="ShreeVidhya Academy"
              className="h-10 w-auto"
            />
            <h2 className="text-xl font-righteous text-primary-dark">
              {initialData.id ? "Edit Evaluation" : "New Evaluation"}
            </h2>
          </div>
          <button
            onClick={onClose}
            className="p-2 hover:bg-secondary-bg rounded-lg transition"
          >
            <X size={20} className="text-secondary-dark" />
          </button>
        </div>

        {/* Scrollable form */}
        <div className="flex-1 overflow-y-auto p-6 space-y-5">
          {/* Batch first */}
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

          {/* Medium filter (below batch) */}
          <div>
            <label className="block text-sm font-montserrat text-secondary-dark mb-1">
              <Filter size={14} className="inline mr-1" />
              Medium
            </label>
            <select
              value={selectedMediumId}
              onChange={(e) => {
                setSelectedMediumId(e.target.value);
                if (form.batch_id && e.target.value) {
                  const batch = batches.find((b) => b.id == form.batch_id);
                  if (batch && batch.medium_id != e.target.value) {
                    setForm((prev) => ({ ...prev, batch_id: "", student_id: "" }));
                  }
                }
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
              disabled={!form.batch_id}
            >
              <option value="">Select Student</option>
              {students.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.first_name} {s.last_name} ({s.admission_no})
                </option>
              ))}
            </select>
          </div>

          {/* Auto Averages */}
          {form.student_id && (
            <div className="bg-gray-50 p-3 rounded-lg border border-secondary-light">
              <p className="text-xs font-medium text-secondary-dark mb-2 flex items-center gap-1">
                <BarChart3 size={14} /> Student Averages (from previous evaluations)
              </p>
              <div className="grid grid-cols-2 gap-3">
                <div className="text-center">
                  <p className="text-sm font-bold text-primary-dark">{averages.avgAtt}</p>
                  <p className="text-xs text-secondary-light">Avg Attendance</p>
                </div>
                <div className="text-center">
                  <p className="text-sm font-bold text-primary-dark">{averages.avgScore}</p>
                  <p className="text-xs text-secondary-light">Avg Score</p>
                </div>
              </div>
            </div>
          )}

          {/* Evaluation Date */}
          <div>
            <label className="block text-sm font-montserrat text-secondary-dark mb-1">
              <Calendar size={14} className="inline mr-1" />
              Evaluation Date *
            </label>
            <input
              type="date"
              name="evaluation_date"
              value={form.evaluation_date}
              onChange={handleChange}
              className="w-full border border-secondary-light rounded p-2.5 focus:ring-1 focus:ring-primary focus:border-primary outline-none"
              required
            />
          </div>

          {/* Attendance % and Performance Score */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-montserrat text-secondary-dark mb-1">
                <TrendingUp size={14} className="inline mr-1" />
                Attendance %
              </label>
              <input
                type="number"
                name="attendance_percentage"
                placeholder="e.g., 85"
                value={form.attendance_percentage}
                onChange={handleChange}
                className="w-full border border-secondary-light rounded p-2.5 focus:ring-1 focus:ring-primary focus:border-primary outline-none placeholder-secondary-light"
                min="0"
                max="100"
                step="0.1"
              />
            </div>
            <div>
              <label className="block text-sm font-montserrat text-secondary-dark mb-1">
                <Star size={14} className="inline mr-1" />
                Performance Score
              </label>
              <input
                type="number"
                name="performance_score"
                placeholder="e.g., 72"
                value={form.performance_score}
                onChange={handleChange}
                className="w-full border border-secondary-light rounded p-2.5 focus:ring-1 focus:ring-primary focus:border-primary outline-none placeholder-secondary-light"
                min="0"
                max="100"
                step="0.1"
              />
            </div>
          </div>

          {/* Teacher Remarks */}
          <div>
            <label className="block text-sm font-montserrat text-secondary-dark mb-1">
              <MessageSquareText size={14} className="inline mr-1" />
              Teacher Remarks
            </label>
            <textarea
              name="teacher_remarks"
              placeholder="Comments on progress..."
              value={form.teacher_remarks}
              onChange={handleChange}
              rows={3}
              className="w-full border border-secondary-light rounded p-2.5 focus:ring-1 focus:ring-primary focus:border-primary outline-none placeholder-secondary-light resize-none"
            />
          </div>
        </div>

        {/* Footer buttons */}
        <div className="flex-shrink-0 border-t border-secondary-light px-6 py-4 flex flex-col sm:flex-row-reverse gap-3 rounded-b-xl">
          <button
            type="submit"
            onClick={handleSubmit}
            className="w-full sm:w-auto bg-primary hover:bg-primary-light text-white px-6 py-2.5 rounded-lg font-montserrat transition flex items-center justify-center gap-2"
          >
            {initialData.id ? "Update Evaluation" : "Save Evaluation"}
          </button>
          <button
            type="button"
            onClick={onClose}
            className="w-full sm:w-auto border border-secondary-light text-secondary-dark hover:bg-secondary-bg px-6 py-2.5 rounded-lg font-montserrat transition"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}