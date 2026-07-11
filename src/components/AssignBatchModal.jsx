import { useState, useEffect } from "react";
import toast from "react-hot-toast";
import { Search, X, Users, Calendar, CheckSquare, Layers } from "lucide-react";
import {
  getActiveStudents,
  getActiveBatches,
  getMediumOptions,
  bulkAssignStudents,
} from "../services/batchAssignmentService";
import { useOrg } from "../context/OrganizationContext";   // NEW

export default function AssignBatchModal({ onSubmit, onClose }) {
  const { branch, selectedFinancialYear } = useOrg();      // NEW
  const context = { branchId: branch?.id, financialYearId: selectedFinancialYear?.id };  // NEW

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
    loadDropdownData();
  }, []);

  async function loadDropdownData() {
    try {
      const [studentData, batchData, mediumData] = await Promise.all([
        getActiveStudents(),
        getActiveBatches(),
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
  const filteredBatches = batches.filter((b) =>
    !selectedMediumId ? true : b.medium_id === parseInt(selectedMediumId)
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
      // Pass context as 4th argument (branchId, financialYearId)
      await bulkAssignStudents(batchId, selectedStudents, enrollmentDate, context);
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
      <div className="bg-white rounded-xl w-full max-w-2xl max-h-[90vh] overflow-y-auto shadow-xl">
        {/* Header */}
        <div className="sticky top-0 bg-white border-b border-secondary-light px-6 py-4 flex items-center justify-between rounded-t-xl z-10">
          <div className="flex items-center gap-3">
            <img
              src="/ShreeVidhyaDark.png"
              alt="ShreeVidhya Academy"
              className="h-10 w-auto"
            />
            <h2 className="text-xl font-righteous text-primary-dark">
              Bulk Assign to Batch
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
              <Layers size={14} className="inline mr-1" /> Medium
            </label>
            <select
              value={selectedMediumId}
              onChange={(e) => setSelectedMediumId(e.target.value)}
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

          {/* Batch & Date */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-montserrat text-secondary-dark mb-1">
                <Users size={14} className="inline mr-1" />
                Batch *
              </label>
              <select
                value={batchId}
                onChange={(e) => setBatchId(e.target.value)}
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
                <Calendar size={14} className="inline mr-1" />
                Enrollment Date *
              </label>
              <input
                type="date"
                value={enrollmentDate}
                onChange={(e) => setEnrollmentDate(e.target.value)}
                className="w-full border border-secondary-light rounded p-2.5 focus:ring-1 focus:ring-primary focus:border-primary outline-none"
                required
              />
            </div>
          </div>

          {/* Search */}
          <div>
            <label className="block text-sm font-montserrat text-secondary-dark mb-1">
              Search Students
            </label>
            <div className="relative">
              <Search size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-secondary" />
              <input
                type="text"
                placeholder="Type name or admission no..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full border border-secondary-light rounded-lg pl-10 pr-4 py-2.5 focus:ring-1 focus:ring-primary focus:border-primary outline-none"
              />
            </div>
          </div>

          {/* Select All */}
          {filteredStudents.length > 0 && (
            <label className="flex items-center gap-2 text-sm text-secondary-dark cursor-pointer select-none">
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
              <span className="text-secondary-light text-xs">
                ({filteredStudents.length} students)
              </span>
            </label>
          )}

          {/* Student List */}
          <div className="border border-secondary-light rounded-lg overflow-hidden">
            <div className="max-h-64 overflow-y-auto divide-y divide-secondary-light bg-white">
              {filteredStudents.length === 0 ? (
                <p className="p-4 text-sm text-secondary text-center">
                  No students found
                </p>
              ) : (
                filteredStudents.map((student) => (
                  <label
                    key={student.id}
                    className="flex items-center gap-3 px-4 py-3 hover:bg-primary-bg cursor-pointer transition"
                  >
                    <input
                      type="checkbox"
                      checked={selectedStudents.includes(student.id)}
                      onChange={() => toggleStudent(student.id)}
                      className="rounded accent-primary h-4 w-4"
                    />
                    <span className="font-medium text-secondary-dark">
                      {student.first_name} {student.last_name}
                    </span>
                    <span className="text-xs text-secondary ml-auto">
                      {student.admission_no}
                    </span>
                  </label>
                ))
              )}
            </div>
          </div>

          {/* Selected Count */}
          <p className="text-sm text-secondary-dark font-montserrat">
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
              className="w-full sm:w-auto bg-primary hover:bg-primary-light text-white px-6 py-2.5 rounded-lg font-montserrat transition disabled:opacity-50 flex items-center justify-center gap-2"
            >
              {loading ? "Assigning..." : "Assign All Selected"}
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