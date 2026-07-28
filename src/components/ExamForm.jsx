import { useState, useEffect } from "react";
import toast from "react-hot-toast";
import {
  X,
  FileText,
  Layers,
  Calendar,
  Award,
  Filter,
} from "lucide-react";
import { getBatchOptions, getMediumOptions } from "../services/examService";
import { useOrgDarkLogo } from "../hooks/useOrgDarkLogo";
import { useOrg } from "../context/OrganizationContext";
import { useTheme } from "../context/ThemeContext";

export default function ExamForm({ onSubmit, onClose, initialData = {} }) {
  const darkLogo = useOrgDarkLogo();
  const { branch, selectedFinancialYear } = useOrg();
  const theme = useTheme();
  const branchId = branch?.id;
  const financialYearId = selectedFinancialYear?.id;

  const headingFont = theme?.font_heading || "Righteous";
  const bodyFont = theme?.font_body || "Montserrat";

  const [batches, setBatches] = useState([]);
  const [mediums, setMediums] = useState([]);
  const [selectedMediumId, setSelectedMediumId] = useState("");
  const [form, setForm] = useState({
    exam_name: initialData.exam_name || "",
    batch_id: initialData.batch_id || "",
    exam_date: initialData.exam_date || new Date().toISOString().split("T")[0],
    total_marks: initialData.total_marks || "",
  });

  useEffect(() => {
    if (!branchId || !financialYearId) return;
    loadDropdowns();
  }, [branchId, financialYearId]);

  async function loadDropdowns() {
    try {
      const [batchData, mediumData] = await Promise.all([
        getBatchOptions(branchId, financialYearId),
        getMediumOptions(),
      ]);
      setBatches(batchData);
      setMediums(mediumData);
    } catch {
      toast.error("Failed to load data");
    }
  }

  function handleChange(e) {
    setForm((prev) => ({ ...prev, [e.target.name]: e.target.value }));
  }

  const filteredBatches = batches.filter((b) =>
    !selectedMediumId ? true : b.medium_id === parseInt(selectedMediumId)
  );

  async function handleSubmit(e) {
    e.preventDefault();
    if (!form.exam_name || !form.batch_id || !form.exam_date) {
      toast.error("Exam name, batch, and date are required");
      return;
    }
    try {
      const payload = {
        ...form,
        total_marks: form.total_marks ? Number(form.total_marks) : null,
      };

      const context = {
        branchId: branchId,
        financialYearId: financialYearId,
      };

      await onSubmit(payload, context);
    } catch (err) {
      toast.error(err.message);
    }
  }

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl w-full max-w-lg shadow-xl border border-primary-bg">
        {/* Header with logo */}
        <div className="sticky top-0 bg-white border-b border-primary-bg px-6 py-4 flex items-center justify-between rounded-t-xl">
          <div className="flex items-center gap-3">
            <img
              src={darkLogo}
              alt="ShreeVidhya Academy"
              className="h-10 w-auto"
            />
            <h2 className="text-xl font-bold text-primary" style={{ fontFamily: headingFont }}>
              {initialData.id ? "Edit Exam" : "New Exam"}
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
          {/* Exam Name */}
          <div>
            <label className="block text-sm text-primary-dark mb-1" style={{ fontFamily: bodyFont }}>
              <FileText size={14} className="inline mr-1" />
              Exam Name *
            </label>
            <input
              name="exam_name"
              placeholder="e.g., Mid-Term, Final"
              value={form.exam_name}
              onChange={handleChange}
              className="w-full border border-primary-bg bg-white text-primary-dark rounded p-2.5 focus:ring-1 focus:ring-primary focus:border-primary outline-none placeholder-primary-dark/40"
              required
              style={{ fontFamily: bodyFont }}
            />
          </div>

          {/* Medium Filter */}
          <div>
            <label className="block text-sm text-primary-dark mb-1" style={{ fontFamily: bodyFont }}>
              <Filter size={14} className="inline mr-1" />
              Medium
            </label>
            <select
              value={selectedMediumId}
              onChange={(e) => {
                setSelectedMediumId(e.target.value);
                setForm((prev) => ({ ...prev, batch_id: "" }));
              }}
              className="w-full border border-primary-bg bg-white text-primary-dark rounded p-2.5 focus:ring-1 focus:ring-primary focus:border-primary outline-none"
              style={{ fontFamily: bodyFont }}
            >
              <option value="">All Mediums</option>
              {mediums.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name}
                </option>
              ))}
            </select>
          </div>

          {/* Batch */}
          <div>
            <label className="block text-sm text-primary-dark mb-1" style={{ fontFamily: bodyFont }}>
              <Layers size={14} className="inline mr-1" />
              Batch *
            </label>
            <select
              name="batch_id"
              value={form.batch_id}
              onChange={handleChange}
              className="w-full border border-primary-bg bg-white text-primary-dark rounded p-2.5 focus:ring-1 focus:ring-primary focus:border-primary outline-none"
              required
              style={{ fontFamily: bodyFont }}
            >
              <option value="">Select Batch</option>
              {filteredBatches.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.batch_name}
                </option>
              ))}
            </select>
          </div>

          {/* Exam Date */}
          <div>
            <label className="block text-sm text-primary-dark mb-1" style={{ fontFamily: bodyFont }}>
              <Calendar size={14} className="inline mr-1" />
              Exam Date *
            </label>
            <input
              type="date"
              name="exam_date"
              value={form.exam_date}
              onChange={handleChange}
              className="w-full border border-primary-bg bg-white text-primary-dark rounded p-2.5 focus:ring-1 focus:ring-primary focus:border-primary outline-none"
              required
            />
          </div>

          {/* Total Marks */}
          <div>
            <label className="block text-sm text-primary-dark mb-1" style={{ fontFamily: bodyFont }}>
              <Award size={14} className="inline mr-1" />
              Total Marks
            </label>
            <input
              type="number"
              name="total_marks"
              placeholder="e.g., 100"
              value={form.total_marks}
              onChange={handleChange}
              className="w-full border border-primary-bg bg-white text-primary-dark rounded p-2.5 focus:ring-1 focus:ring-primary focus:border-primary outline-none placeholder-primary-dark/40"
              style={{ fontFamily: bodyFont }}
            />
          </div>

          {/* Buttons */}
          <div className="flex flex-col sm:flex-row-reverse gap-3 pt-2">
            <button
              type="submit"
              className="w-full sm:w-auto bg-primary hover:bg-primary-light text-white px-6 py-2.5 rounded-lg transition flex items-center justify-center gap-2"
              style={{ fontFamily: bodyFont }}
            >
              {initialData.id ? "Update Exam" : "Create Exam"}
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