import { useEffect, useState } from "react";
import toast from "react-hot-toast";
import { X, FileText, Clock, User, CheckCircle2, AlertCircle, Upload } from "lucide-react";
import {
  getSubmissionsByHomework,
  updateSubmission,
  getBatchStudents,
} from "../services/homeworkService";
import { useOrgDarkLogo } from "../hooks/useOrgDarkLogo";
import { useOrg } from "../context/OrganizationContext";   // NEW

export default function ViewSubmissionsModal({ homework, onClose }) {
  const darkLogo = useOrgDarkLogo();
  const { branch, selectedFinancialYear } = useOrg();      // NEW

  const [students, setStudents] = useState([]);
  const [submissions, setSubmissions] = useState([]);
  const [loading, setLoading] = useState(true);

  // Editable marks/remarks per submission
  const [marksInput, setMarksInput] = useState({});
  const [remarksInput, setRemarksInput] = useState({});

  useEffect(() => {
    loadData();
  }, [homework.id]);

  async function loadData() {
    setLoading(true);
    try {
      const [allStudents, allSubs] = await Promise.all([
        getBatchStudents(homework.batch_id),
        getSubmissionsByHomework(homework.id),
      ]);
      setStudents(allStudents);
      setSubmissions(allSubs);

      // Pre-fill inputs from existing submissions
      const marksMap = {};
      const remarksMap = {};
      allSubs.forEach((sub) => {
        marksMap[sub.student_id] = sub.marks || "";
        remarksMap[sub.student_id] = sub.remarks || "";
      });
      setMarksInput(marksMap);
      setRemarksInput(remarksMap);
    } catch (err) {
      toast.error("Failed to load data");
    } finally {
      setLoading(false);
    }
  }

  async function handleSaveMarks(submission) {
    try {
      // Build context
      const context = {
        branchId: branch?.id,
        financialYearId: selectedFinancialYear?.id,
      };
      await updateSubmission(
        submission.id,
        {
          marks: Number(marksInput[submission.student_id]),
          remarks: remarksInput[submission.student_id],
          status: "Graded",
        },
        context                     // pass context as third argument
      );
      toast.success("Marks saved");
      loadData();
    } catch (err) {
      toast.error("Save failed");
    }
  }

  const findSubmission = (studentId) =>
    submissions.find((s) => s.student_id === studentId);

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl w-full max-w-5xl max-h-[90vh] overflow-y-auto shadow-xl">
        {/* Header with logo */}
        <div className="sticky top-0 bg-white border-b border-secondary-light px-6 py-4 flex items-center justify-between rounded-t-xl z-10">
          <div className="flex items-center gap-3">
            <img
              src={darkLogo}
              alt="ShreeVidhya Academy"
              className="h-10 w-auto"
            />
            <div>
              <h2 className="text-xl font-righteous text-primary-dark">
                Submissions
              </h2>
              <p className="text-sm text-secondary-dark font-montserrat">
                {homework.title}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 hover:bg-secondary-bg rounded-lg transition"
          >
            <X size={20} className="text-secondary-dark" />
          </button>
        </div>

        {/* Batch, Subject & Medium info */}
        <div className="px-6 pt-4 flex flex-wrap gap-2 items-center text-sm text-secondary-dark font-montserrat">
          <span className="flex items-center gap-1">
            <User size={14} /> {homework.batches?.batch_name}
          </span>
          {homework.batches?.mediums?.name && (
            <span className="bg-primary-bg text-primary px-2 py-0.5 rounded-full text-xs">
              {homework.batches.mediums.name}
            </span>
          )}
          <span className="text-secondary-light">|</span>
          <span className="flex items-center gap-1">
            <FileText size={14} /> {homework.subjects?.subject_name}
          </span>
        </div>

        {loading ? (
          <div className="p-8 text-center text-secondary">Loading submissions...</div>
        ) : students.length === 0 ? (
          <div className="p-8 text-center text-secondary">
            No students enrolled in this batch.
          </div>
        ) : (
          <div className="overflow-x-auto p-4">
            <table className="w-full min-w-[800px]">
              <thead className="bg-slate-50 border-b border-secondary-light">
                <tr>
                  <th className="text-left p-3 text-sm font-montserrat text-secondary-dark">
                    <User size={14} className="inline mr-1" /> Student
                  </th>
                  <th className="text-left text-sm font-montserrat text-secondary-dark">
                    <Upload size={14} className="inline mr-1" /> File
                  </th>
                  <th className="text-left text-sm font-montserrat text-secondary-dark">
                    <Clock size={14} className="inline mr-1" /> Submitted
                  </th>
                  <th className="text-left text-sm font-montserrat text-secondary-dark">
                    Marks
                  </th>
                  <th className="text-left text-sm font-montserrat text-secondary-dark">
                    Remarks
                  </th>
                  <th className="text-left text-sm font-montserrat text-secondary-dark">
                    Status
                  </th>
                  <th className="text-left text-sm font-montserrat text-secondary-dark">
                    Action
                  </th>
                </tr>
              </thead>
              <tbody>
                {students.map((student) => {
                  const sub = findSubmission(student.id);
                  return (
                    <tr key={student.id} className="border-b border-secondary-light hover:bg-primary-bg transition">
                      <td className="p-3">
                        <p className="font-medium text-secondary-dark">
                          {student.first_name} {student.last_name}
                        </p>
                        <p className="text-xs text-secondary-light">{student.admission_no}</p>
                      </td>
                      <td>
                        {sub?.submission_file ? (
                          <a
                            href={sub.submission_file}
                            target="_blank"
                            rel="noreferrer"
                            className="text-primary hover:underline flex items-center gap-1"
                          >
                            <FileText size={14} /> View
                          </a>
                        ) : (
                          <span className="text-secondary-light flex items-center gap-1">
                            <AlertCircle size={14} /> No file
                          </span>
                        )}
                      </td>
                      <td className="text-sm text-secondary-dark">
                        {sub?.submitted_at
                          ? new Date(sub.submitted_at).toLocaleDateString("en-IN", {
                              day: "numeric",
                              month: "short",
                              hour: "2-digit",
                              minute: "2-digit",
                            })
                          : "-"}
                      </td>
                      <td>
                        <input
                          type="number"
                          value={marksInput[student.id] || ""}
                          onChange={(e) =>
                            setMarksInput((prev) => ({
                              ...prev,
                              [student.id]: e.target.value,
                            }))
                          }
                          className="border border-secondary-light rounded p-2 w-20 text-center focus:ring-1 focus:ring-primary focus:border-primary outline-none text-sm"
                          placeholder="0"
                        />
                      </td>
                      <td>
                        <input
                          type="text"
                          value={remarksInput[student.id] || ""}
                          onChange={(e) =>
                            setRemarksInput((prev) => ({
                              ...prev,
                              [student.id]: e.target.value,
                            }))
                          }
                          className="border border-secondary-light rounded p-2 w-32 focus:ring-1 focus:ring-primary focus:border-primary outline-none text-sm"
                          placeholder="Remark"
                        />
                      </td>
                      <td>
                        <span
                          className={`text-xs px-2 py-1 rounded-full font-medium ${
                            sub?.status === "Graded"
                              ? "bg-green-100 text-green-700"
                              : sub?.status === "Submitted"
                              ? "bg-blue-100 text-blue-700"
                              : "bg-gray-100 text-gray-600"
                          }`}
                        >
                          {sub?.status || "Not Submitted"}
                        </span>
                      </td>
                      <td>
                        {sub && (
                          <button
                            onClick={() => handleSaveMarks(sub)}
                            className="bg-primary hover:bg-primary-light text-white px-3 py-1.5 rounded text-sm font-montserrat transition flex items-center gap-1"
                          >
                            <CheckCircle2 size={14} /> Save
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}