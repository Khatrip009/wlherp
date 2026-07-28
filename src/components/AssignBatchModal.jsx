// src/components/AssignBatchModal.jsx
import { useState, useEffect } from "react";
import toast from "react-hot-toast";
import { Search, X, Users, Calendar, CheckSquare, Layers } from "lucide-react";
import {
  getActiveStudents,
  getActiveBatches,
  getMediumOptions,
  bulkAssignStudents,
} from "../services/batchAssignmentService";
import { useOrg } from "../context/OrganizationContext";

export default function AssignBatchModal({ onSubmit, onClose }) {
  const { branch, selectedFinancialYear } = useOrg();
  const branchId = branch?.id;
  const financialYearId = selectedFinancialYear?.id;

  const [students, setStudents] = useState([]);
  const [batches, setBatches] = useState([]);
  const [mediums, setMediums] = useState([]);
  const [selectedMediumId, setSelectedMediumId] = useState("");

  const [selectedStudents, setSelectedStudents] = useState([]);
  const [search, setSearch] = useState("");
  const [batchId, setBatchId] = useState("");
  const [enrollmentDate, setEnrollmentDate] = useState(
    new Date().toISOString().split("T")[0]
  );
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!branchId || !financialYearId) return;
    loadDropdownData();
  }, [branchId, financialYearId]);

  async function loadDropdownData() {
    try {
      const [studentData, batchData, mediumData] = await Promise.all([
        getActiveStudents(branchId, financialYearId),
        getActiveBatches(branchId, financialYearId),
        getMediumOptions(),
      ]);
      setStudents(studentData);
      setBatches(batchData);
      setMediums(mediumData);
    } catch (err) {
      toast.error("Failed to load data");
    }
  }

  // Filter by search + medium
  const filteredStudents = students.filter((s) => {
    const matchesSearch =
      s.first_name.toLowerCase().includes(search.toLowerCase()) ||
      s.last_name.toLowerCase().includes(search.toLowerCase()) ||
      s.admission_no?.toLowerCase().includes(search.toLowerCase());
    const matchesMedium = !selectedMediumId || s.medium_id === parseInt(selectedMediumId);
    return matchesSearch && matchesMedium;
  });

  // Filter batches by medium
  const filteredBatches = batches.filter(
    (b) => !selectedMediumId || b.medium_id === parseInt(selectedMediumId)
  );

  function toggleStudent(studentId) {
    setSelectedStudents((prev) =>
      prev.includes(studentId)
        ? prev.filter((id) => id !== studentId)
        : [...prev, studentId]
    );
  }

  function toggleAll() {
    if (selectedStudents.length === filteredStudents.length) {
      setSelectedStudents([]);
    } else {
      setSelectedStudents(filteredStudents.map((s) => s.id));
    }
  }

  async function handleSubmit(e) {
    e.preventDefault();
    if (!batchId) {
      toast.error("Please select a batch");
      return;
    }
    if (selectedStudents.length === 0) {
      toast.error("Please select at least one student");
      return;
    }

    setLoading(true);
    try {
      await bulkAssignStudents(batchId, selectedStudents, enrollmentDate, {
        branchId,
        financialYearId,
      });
      toast.success(`${selectedStudents.length} student(s) assigned to batch`);
      if (onSubmit) onSubmit();
      onClose();
    } catch (err) {
      toast.error(err.message || "Bulk assignment failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <div className="bg-white dark:bg-accent rounded-xl w-full max-w-2xl max-h-[90vh] overflow-y-auto shadow-xl border border-gray-200 dark:border-gray-700">
        {/* Header */}
        <div className="sticky top-0 bg-white dark:bg-accent border-b border-gray-200 dark:border-gray-700 px-6 py-4 flex items-center justify-between rounded-t-xl z-10">
          <div className="flex items-center gap-3">
            <img
              src="/ShreeVidhyaDark.png"
              alt="ShreeVidhya Academy"
              className="h-10 w-auto"
            />
            <h2 className="text-xl font-heading text-primary">
              Bulk Assign to Batch
            </h2>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition">
            <X size={20} className="text-gray-600 dark:text-gray-400" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-5">
          {/* Medium Filter */}
          <div>
            <label className="block text-sm font-body text-gray-700 dark:text-gray-300 mb-1">
              <Layers size={14} className="inline mr-1" /> Medium
            </label>
            <select
              value={selectedMediumId}
              onChange={(e) => setSelectedMediumId(e.target.value)}
              className="w-full border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 rounded p-2.5 focus:ring-2 focus:ring-primary focus:border-primary outline-none"
            >
              <option value="">All Mediums</option>
              {mediums.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name}
                </option>
              ))}
            </select>
          </div>

          {/* Batch & Date */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-body text-gray-700 dark:text-gray-300 mb-1">
                <Users size={14} className="inline mr-1" />
                Batch *
              </label>
              <select
                value={batchId}
                onChange={(e) => setBatchId(e.target.value)}
                className="w-full border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 rounded p-2.5 focus:ring-2 focus:ring-primary focus:border-primary outline-none"
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
              <label className="block text-sm font-body text-gray-700 dark:text-gray-300 mb-1">
                <Calendar size={14} className="inline mr-1" />
                Enrollment Date *
              </label>
              <input
                type="date"
                value={enrollmentDate}
                onChange={(e) => setEnrollmentDate(e.target.value)}
                className="w-full border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 rounded p-2.5 focus:ring-2 focus:ring-primary focus:border-primary outline-none"
                required
              />
            </div>
          </div>

          {/* Search */}
          <div>
            <label className="block text-sm font-body text-gray-700 dark:text-gray-300 mb-1">
              Search Students
            </label>
            <div className="relative">
              <Search size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 dark:text-gray-500" />
              <input
                type="text"
                placeholder="Type name or admission no..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 rounded-lg pl-10 pr-4 py-2.5 focus:ring-2 focus:ring-primary focus:border-primary outline-none placeholder-gray-400 dark:placeholder-gray-500"
              />
            </div>
          </div>

          {/* Select All */}
          {filteredStudents.length > 0 && (
            <label className="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-300 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={
                  selectedStudents.length === filteredStudents.length &&
                  filteredStudents.length > 0
                }
                onChange={toggleAll}
                className="rounded accent-primary h-4 w-4"
              />
              <CheckSquare size={16} className="text-primary" />
              <span>
                {selectedStudents.length === filteredStudents.length
                  ? "Deselect All"
                  : "Select All"}
              </span>
              <span className="text-gray-500 dark:text-gray-400 text-xs">
                ({filteredStudents.length} students)
              </span>
            </label>
          )}

          {/* Student List */}
          <div className="border border-gray-300 dark:border-gray-600 rounded-lg overflow-hidden">
            <div className="max-h-64 overflow-y-auto divide-y divide-gray-200 dark:divide-gray-700 bg-white dark:bg-gray-800">
              {filteredStudents.length === 0 ? (
                <p className="p-4 text-sm text-gray-500 dark:text-gray-400 text-center">
                  No students found
                </p>
              ) : (
                filteredStudents.map((student) => (
                  <label
                    key={student.id}
                    className="flex items-center gap-3 px-4 py-3 hover:bg-primary-bg dark:hover:bg-primary-dark cursor-pointer transition"
                  >
                    <input
                      type="checkbox"
                      checked={selectedStudents.includes(student.id)}
                      onChange={() => toggleStudent(student.id)}
                      className="rounded accent-primary h-4 w-4"
                    />
                    <span className="font-medium text-gray-800 dark:text-gray-100">
                      {student.first_name} {student.last_name}
                    </span>
                    <span className="text-xs text-gray-500 dark:text-gray-400 ml-auto">
                      {student.admission_no}
                    </span>
                  </label>
                ))
              )}
            </div>
          </div>

          {/* Selected Count */}
          <p className="text-sm text-gray-700 dark:text-gray-300 font-body">
            <span className="font-semibold text-primary">
              {selectedStudents.length}
            </span>{" "}
            student(s) selected
          </p>

          {/* Buttons */}
          <div className="flex flex-col sm:flex-row-reverse gap-3 pt-2">
            <button
              type="submit"
              disabled={loading}
              className="w-full sm:w-auto bg-primary hover:bg-primary-light text-white px-6 py-2.5 rounded-lg font-body transition disabled:opacity-50 flex items-center justify-center gap-2"
            >
              {loading ? "Assigning..." : "Assign All Selected"}
            </button>
            <button
              type="button"
              onClick={onClose}
              className="w-full sm:w-auto border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-700 px-6 py-2.5 rounded-lg font-body transition"
            >
              Cancel
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}