import { useState, useEffect } from "react";
import toast from "react-hot-toast";
import { X, User, Phone, Mail, Briefcase, MapPin, Users, Unlink } from "lucide-react";
import { supabase } from "../api/supabase";
import { useOrgDarkLogo } from "../hooks/useOrgDarkLogo";
import { createParent, updateParent, linkStudentToParent } from "../services/parentService";
import { useOrg } from "../context/OrganizationContext";   // NEW

export default function ParentForm({
  onSubmit,          // callback({ form, studentId }) for create, (form) for update
  onClose,
  initialData = {},
  studentId = null,  // only used for create from student profile
}) {
  const darkLogo = useOrgDarkLogo();
  const { branch, selectedFinancialYear } = useOrg();      // NEW
  const context = { branchId: branch?.id, financialYearId: selectedFinancialYear?.id }; // NEW

  const isEditing = !!initialData.id;

  const [form, setForm] = useState({
    father_name: initialData.father_name || "",
    mother_name: initialData.mother_name || "",
    mobile: initialData.mobile || "",
    whatsapp: initialData.whatsapp || "",
    email: initialData.email || "",
    occupation: initialData.occupation || "",
    address: initialData.address || "",
  });

  // Student selection – for create (required) or edit (optional)
  const [selectedStudentId, setSelectedStudentId] = useState(studentId || null);
  const [students, setStudents] = useState([]);
  const [loadingStudents, setLoadingStudents] = useState(!studentId);

  // Linked students (edit mode)
  const [linkedStudents, setLinkedStudents] = useState([]);
  const [loadingLinked, setLoadingLinked] = useState(isEditing);

  // Fetch all active students (always, but filter out linked ones in edit mode)
  useEffect(() => {
    if (!studentId) {
      setLoadingStudents(true);
      supabase
        .from("students")
        .select("id, first_name, last_name, standard")
        .eq("status", "active")
        .order("first_name")
        .then(({ data }) => setStudents(data || []))
        .finally(() => setLoadingStudents(false));
    }
  }, [studentId]);

  // Fetch linked students when editing
  useEffect(() => {
    if (isEditing) {
      setLoadingLinked(true);
      supabase
        .from("student_parents")
        .select("student_id, students(first_name, last_name, standard, admission_no)")
        .eq("parent_id", initialData.id)
        .then(({ data, error }) => {
          if (!error) {
            const mapped = data.map((link) => ({
              student_id: link.student_id,
              name: `${link.students.first_name} ${link.students.last_name}`,
              standard: link.students.standard,
              admission_no: link.students.admission_no,
            }));
            setLinkedStudents(mapped);
          }
          setLoadingLinked(false);
        });
    } else {
      setLoadingLinked(false);
    }
  }, [initialData.id, isEditing]);

  function handleChange(e) {
    setForm((prev) => ({ ...prev, [e.target.name]: e.target.value }));
  }

  async function handleUnlink(studentIdToUnlink) {
    try {
      const { error } = await supabase
        .from("student_parents")
        .delete()
        .eq("parent_id", initialData.id)
        .eq("student_id", studentIdToUnlink);

      if (error) throw error;

      setLinkedStudents((prev) => prev.filter((s) => s.student_id !== studentIdToUnlink));
      toast.success("Student unlinked");
    } catch (err) {
      toast.error(err.message || "Failed to unlink student");
    }
  }

  async function handleSubmit(e) {
  e.preventDefault();
  if (!form.father_name && !form.mother_name) {
    toast.error("At least one parent name is required");
    return;
  }
  if (!form.mobile) {
    toast.error("Mobile number is required");
    return;
  }

  try {
    if (isEditing) {
      // Update parent fields
      await updateParent(initialData.id, form, context);
      toast.success("Parent updated");

      // If a student is selected, link them (additional link)
      if (selectedStudentId) {
        await linkStudentToParent(initialData.id, selectedStudentId, context);
        toast.success("Student linked successfully");
        // Refresh linked students
        const { data } = await supabase
          .from("student_parents")
          .select("student_id, students(first_name, last_name, standard, admission_no)")
          .eq("parent_id", initialData.id);
        const mapped = data.map((link) => ({
          student_id: link.student_id,
          name: `${link.students.first_name} ${link.students.last_name}`,
          standard: link.students.standard,
          admission_no: link.students.admission_no,
        }));
        setLinkedStudents(mapped);
        setSelectedStudentId(null);
      }

      onSubmit(form);
    } else {
      // ── Create new parent – check for duplicate mobile first ──
      const { data: existing } = await supabase
        .from("parents")
        .select("*")
        .eq("mobile", form.mobile.trim())
        .maybeSingle();

      if (existing) {
        // Mobile already exists → use the existing parent
        const idToLink = studentId || selectedStudentId;
        if (idToLink) {
          await linkStudentToParent(existing.id, idToLink, context);
          toast.success("Parent already exists – linked successfully");
        }
        onSubmit({ form, studentId: idToLink, parent: existing });
        return;
      }

      // No duplicate → create new parent
      if (!studentId && !selectedStudentId) {
        toast.error("Please select a student to link this parent");
        return;
      }
      const idToLink = studentId || selectedStudentId;
      const createdParent = await createParent(form, idToLink, context);
      toast.success("Parent created and linked");
      onSubmit({ form, studentId: idToLink, parent: createdParent });
    }
  } catch (err) {
    toast.error(err.message || "Failed to save parent");
  }
}

  // Filter out already linked students from the dropdown in edit mode
  const availableStudents = isEditing
    ? students.filter((s) => !linkedStudents.some((ls) => ls.student_id === s.id))
    : students;

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl w-full max-w-2xl shadow-xl max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="sticky top-0 bg-white border-b border-secondary-light px-6 py-4 flex items-center justify-between rounded-t-xl z-10">
          <div className="flex items-center gap-3">
            <img
              src={darkLogo}
              alt="ShreeVidhya Academy"
              className="h-10 w-auto"
            />
            <h2 className="text-xl font-righteous text-primary-dark">
              {isEditing ? "Edit Parent" : "Add Parent"}
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
          {/* Student selector */}
          {!studentId && (
            <div>
              <label className="block text-sm font-montserrat text-secondary-dark mb-1">
                <Users size={14} className="inline mr-1" />
                {isEditing ? "Link Additional Student" : "Link to Student *"}
              </label>
              {loadingStudents ? (
                <p className="text-sm text-secondary">Loading students...</p>
              ) : (
                <select
                  value={selectedStudentId || ""}
                  onChange={(e) => setSelectedStudentId(e.target.value ? Number(e.target.value) : null)}
                  className="w-full border border-secondary-light rounded p-2.5 focus:ring-1 focus:ring-primary outline-none"
                  required={!isEditing}
                >
                  <option value="">{isEditing ? "None" : "Select a student"}</option>
                  {availableStudents.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.first_name} {s.last_name} {s.standard ? `(Std ${s.standard})` : ""}
                    </option>
                  ))}
                </select>
              )}
            </div>
          )}

          {/* Father & Mother Name */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-montserrat text-secondary-dark mb-1">
                <User size={14} className="inline mr-1" />
                Father Name
              </label>
              <input
                name="father_name"
                placeholder="Father's full name"
                value={form.father_name}
                onChange={handleChange}
                className="w-full border border-secondary-light rounded p-2.5 focus:ring-1 focus:ring-primary focus:border-primary outline-none placeholder-secondary-light"
              />
            </div>
            <div>
              <label className="block text-sm font-montserrat text-secondary-dark mb-1">
                <User size={14} className="inline mr-1" />
                Mother Name
              </label>
              <input
                name="mother_name"
                placeholder="Mother's full name"
                value={form.mother_name}
                onChange={handleChange}
                className="w-full border border-secondary-light rounded p-2.5 focus:ring-1 focus:ring-primary focus:border-primary outline-none placeholder-secondary-light"
              />
            </div>
          </div>

          {/* Mobile & WhatsApp */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-montserrat text-secondary-dark mb-1">
                <Phone size={14} className="inline mr-1" />
                Mobile *
              </label>
              <input
                name="mobile"
                placeholder="Phone number"
                value={form.mobile}
                onChange={handleChange}
                className="w-full border border-secondary-light rounded p-2.5 focus:ring-1 focus:ring-primary focus:border-primary outline-none placeholder-secondary-light"
                required
              />
            </div>
            <div>
              <label className="block text-sm font-montserrat text-secondary-dark mb-1">
                <Phone size={14} className="inline mr-1" />
                WhatsApp
              </label>
              <input
                name="whatsapp"
                placeholder="WhatsApp number"
                value={form.whatsapp}
                onChange={handleChange}
                className="w-full border border-secondary-light rounded p-2.5 focus:ring-1 focus:ring-primary focus:border-primary outline-none placeholder-secondary-light"
              />
            </div>
          </div>

          {/* Email & Occupation */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-montserrat text-secondary-dark mb-1">
                <Mail size={14} className="inline mr-1" />
                Email
              </label>
              <input
                type="email"
                name="email"
                placeholder="Email address"
                value={form.email}
                onChange={handleChange}
                className="w-full border border-secondary-light rounded p-2.5 focus:ring-1 focus:ring-primary focus:border-primary outline-none placeholder-secondary-light"
              />
            </div>
            <div>
              <label className="block text-sm font-montserrat text-secondary-dark mb-1">
                <Briefcase size={14} className="inline mr-1" />
                Occupation
              </label>
              <input
                name="occupation"
                placeholder="Occupation"
                value={form.occupation}
                onChange={handleChange}
                className="w-full border border-secondary-light rounded p-2.5 focus:ring-1 focus:ring-primary focus:border-primary outline-none placeholder-secondary-light"
              />
            </div>
          </div>

          {/* Address */}
          <div>
            <label className="block text-sm font-montserrat text-secondary-dark mb-1">
              <MapPin size={14} className="inline mr-1" />
              Address
            </label>
            <textarea
              name="address"
              placeholder="Full address"
              value={form.address}
              onChange={handleChange}
              rows={3}
              className="w-full border border-secondary-light rounded p-2.5 focus:ring-1 focus:ring-primary focus:border-primary outline-none placeholder-secondary-light resize-none"
            />
          </div>

          {/* Linked Students (edit mode) */}
          {isEditing && (
            <div>
              <label className="block text-sm font-montserrat text-secondary-dark mb-2">
                <Users size={14} className="inline mr-1" />
                Linked Students
              </label>
              {loadingLinked ? (
                <p className="text-sm text-secondary">Loading...</p>
              ) : linkedStudents.length === 0 ? (
                <p className="text-sm text-secondary italic">No students linked.</p>
              ) : (
                <ul className="space-y-2">
                  {linkedStudents.map((student) => (
                    <li
                      key={student.student_id}
                      className="flex items-center justify-between bg-gray-50 border rounded-lg px-3 py-2"
                    >
                      <span className="text-sm">
                        {student.name}
                        {student.standard ? ` (Std ${student.standard})` : ""}
                        {student.admission_no ? ` — ${student.admission_no}` : ""}
                      </span>
                      <button
                        type="button"
                        onClick={() => handleUnlink(student.student_id)}
                        className="text-red-500 hover:text-red-700 p-1 rounded"
                        title="Unlink student"
                      >
                        <Unlink size={16} />
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}

          {/* Buttons */}
          <div className="flex flex-col sm:flex-row-reverse gap-3 pt-2">
            <button
              type="submit"
              className="w-full sm:w-auto bg-primary hover:bg-primary-light text-white px-6 py-2.5 rounded-lg font-montserrat transition flex items-center justify-center gap-2"
            >
              {isEditing ? "Update Parent" : "Create Parent"}
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