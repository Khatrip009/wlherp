// src/components/TeacherForm.jsx
import React, { useState, useEffect } from "react";
import { supabase } from "../api/supabase";
import toast from "react-hot-toast";
import {
  X,
  User,
  Mail,
  Lock,
  Briefcase,
  Phone,
  BookOpen,
  Layers,
  GraduationCap,
  BookMarked,
  Calendar,
  Plus,
  Trash2,
} from "lucide-react";
import {
  getCourseLevelOptions,
  getSubjectOptions,
} from "../services/teacherService";
import { useOrg } from "../context/OrganizationContext";

// ─── Prefix mapping for staff types ──────────────────────
const STAFF_PREFIX = {
  teacher: "TCH",
  admin: "ADM",
  accountant: "ACC",
  librarian: "LIB",
  support: "SUP",
  other: "STF",
};

export default function TeacherForm({ initialData = null, onSubmit, onClose }) {
  const isEdit = !!initialData;
  const { branch, selectedFinancialYear } = useOrg();

  // Helper to derive course IDs from existing data
  const getInitialCourseIds = () => {
    if (initialData?.course_ids?.length) return initialData.course_ids;
    const levelCourseIds = (initialData?.course_levels || []).map(cl => cl.course_id).filter(Boolean);
    const subjectCourseIds = (initialData?.subjects || []).map(s => s.course_id).filter(Boolean);
    const all = [...levelCourseIds, ...subjectCourseIds];
    return [...new Set(all)];
  };

  // Parse initial bank accounts from JSON
  const parseInitialBankAccounts = () => {
    if (!initialData?.bank_account_details) return [{ bank_name: "", branch_name: "", ifsc_code: "", account_number: "" }];
    try {
      const parsed = typeof initialData.bank_account_details === 'string'
        ? JSON.parse(initialData.bank_account_details)
        : initialData.bank_account_details;
      if (Array.isArray(parsed) && parsed.length > 0) return parsed;
    } catch (e) {}
    return [{ bank_name: "", branch_name: "", ifsc_code: "", account_number: "" }];
  };

  const [form, setForm] = useState({
    first_name: initialData?.first_name || "",
    last_name: initialData?.last_name || "",
    email: initialData?.email || "",
    password: "",
    employee_code: initialData?.employee_code || "",
    mobile: initialData?.mobile || "",
    qualification: initialData?.qualification || "",
    joining_date: initialData?.joining_date || "",
    salary: initialData?.salary || "",
    status: initialData?.status || "active",
    branch_id: initialData?.branch_id || branch?.id || "",
    medium_ids: initialData?.mediums?.map((m) => m.id) || [],
    course_ids: getInitialCourseIds(),
    course_level_ids: initialData?.course_levels?.map((cl) => cl.id) || [],
    subject_ids: initialData?.subjects?.map((s) => s.id) || [],

    // Employee fields
    staff_type: initialData?.staff_type || "teacher",
    department: initialData?.department || "",
    designation: initialData?.designation || "",
    date_of_birth: initialData?.date_of_birth || "",
    gender: initialData?.gender || "",
    emergency_contact: initialData?.emergency_contact || "",
  });

  const [bankAccounts, setBankAccounts] = useState(parseInitialBankAccounts());
  const [mediums, setMediums] = useState([]);
  const [courses, setCourses] = useState([]);
  const [allCourseLevels, setAllCourseLevels] = useState([]);
  const [allSubjects, setAllSubjects] = useState([]);
  const [branches, setBranches] = useState([]);
  const [loading, setLoading] = useState(false);
  const [autoCodeLoading, setAutoCodeLoading] = useState(!isEdit && !initialData?.employee_code);

  // ─── Auto‑generate employee code ─────────
  useEffect(() => {
    if (isEdit || initialData?.employee_code) {
      setAutoCodeLoading(false);
      return;
    }
    async function generateCode() {
      try {
        const prefix = STAFF_PREFIX[form.staff_type] || "EMP";
        const { data, error } = await supabase
          .from("teachers")
          .select("employee_code")
          .ilike("employee_code", `${prefix}-%`)
          .order("employee_code", { ascending: false })
          .limit(1);

        if (error) throw error;

        let nextNum = 1;
        if (data && data.length > 0) {
          const lastCode = data[0].employee_code;
          const numPart = lastCode.split("-")[1];
          nextNum = (parseInt(numPart, 10) || 0) + 1;
        }
        const newCode = `${prefix}-${String(nextNum).padStart(4, "0")}`;
        setForm(prev => ({ ...prev, employee_code: newCode }));
      } catch (err) {
        console.error("Failed to generate employee code", err);
      } finally {
        setAutoCodeLoading(false);
      }
    }
    generateCode();
  }, [isEdit, initialData?.employee_code, form.staff_type]);

  // Fetch dropdown options: mediums, courses, levels, subjects, and branches
  useEffect(() => {
    const fetchData = async () => {
      const [mediumRes, courseRes, levelRes, subjectRes] = await Promise.all([
        supabase.from("mediums").select("id, name").order("name"),
        supabase.from("courses").select("id, course_name").order("course_name"),
        getCourseLevelOptions(),
        getSubjectOptions(),
      ]);
      setMediums(mediumRes.data || []);
      setCourses(courseRes.data || []);
      setAllCourseLevels(levelRes || []);
      setAllSubjects(subjectRes || []);
    };
    fetchData();
  }, []);

  // Fetch branches for the current organization (when branch context is available)
  useEffect(() => {
    if (!branch?.organization_id) return;
    const fetchBranches = async () => {
      const { data, error } = await supabase
        .from("branches")
        .select("id, branch_name")
        .eq("organization_id", branch.organization_id)
        .order("branch_name");
      if (!error && data) {
        setBranches(data);
        // If no branch is selected yet, default to the context branch
        if (!form.branch_id && data.length > 0) {
          setForm(prev => ({ ...prev, branch_id: branch.id || data[0].id }));
        }
      }
    };
    fetchBranches();
  }, [branch?.organization_id]);

  // Filter levels and subjects based on selected courses
  const filteredCourseLevels = allCourseLevels.filter(
    (cl) => !form.course_ids || form.course_ids.length === 0 || (cl.course_id && form.course_ids.includes(cl.course_id))
  );
  const filteredSubjects = allSubjects.filter(
    (s) => !form.course_ids || form.course_ids.length === 0 || (s.course_id && form.course_ids.includes(s.course_id))
  );

  // When course selection changes, remove orphaned levels/subjects
  useEffect(() => {
    if (form.course_ids && form.course_ids.length > 0) {
      const validLevelIds = allCourseLevels
        .filter((cl) => form.course_ids.includes(cl.course_id))
        .map((cl) => cl.id);
      const validSubjectIds = allSubjects
        .filter((s) => form.course_ids.includes(s.course_id))
        .map((s) => s.id);

      setForm((prev) => ({
        ...prev,
        course_level_ids: prev.course_level_ids.filter((id) => validLevelIds.includes(id)),
        subject_ids: prev.subject_ids.filter((id) => validSubjectIds.includes(id)),
      }));
    } else {
      setForm((prev) => ({
        ...prev,
        course_level_ids: [],
        subject_ids: [],
      }));
    }
  }, [form.course_ids, allCourseLevels, allSubjects]);

  const handleChange = (e) => {
    const { name, value, type, checked } = e.target;
    if (type === "checkbox") {
      const arrayName = name;
      setForm((prev) => {
        const current = prev[arrayName] || [];
        if (checked) {
          return { ...prev, [arrayName]: [...current, Number(value)] };
        } else {
          return { ...prev, [arrayName]: current.filter((id) => id !== Number(value)) };
        }
      });
    } else {
      setForm((prev) => ({ ...prev, [name]: value }));
    }
  };

  // Bank account handlers
  const addBankAccount = () => {
    setBankAccounts([...bankAccounts, { bank_name: "", branch_name: "", ifsc_code: "", account_number: "" }]);
  };
  const removeBankAccount = (index) => {
    setBankAccounts(bankAccounts.filter((_, i) => i !== index));
  };
  const updateBankAccount = (index, field, value) => {
    const updated = [...bankAccounts];
    updated[index] = { ...updated[index], [field]: value };
    setBankAccounts(updated);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();

    // ─── Validation ──────────────────────
    if (!form.branch_id) {
      toast.error("Please select a branch");
      return;
    }
    if (form.email && !form.email.includes('@')) {
      toast.error('Please enter a valid email address');
      return;
    }
    if (form.password && form.password.length < 6) {
      toast.error('Password must be at least 6 characters');
      return;
    }
    if (!selectedFinancialYear?.id) {
      toast.error("No financial year selected. Please set up the current financial year.");
      return;
    }

    setLoading(true);
    try {
      const validAccounts = bankAccounts.filter(acc => acc.bank_name || acc.account_number);
      const bankJson = validAccounts.length > 0 ? JSON.stringify(validAccounts) : null;

      const payload = {
        ...form,
        bank_account_details: bankJson,
      };

      const context = {
        branchId: form.branch_id,
        financialYearId: selectedFinancialYear.id,
      };

      await onSubmit(payload, context);
      onClose();
    } catch (err) {
      toast.error(err.message);
    } finally {
      setLoading(false);
    }
  };

  const staffLabel = form.staff_type === "teacher" ? "Teacher" : "Employee";

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl w-full max-w-2xl shadow-xl max-h-[90vh] overflow-y-auto">
        <div className="sticky top-0 bg-white border-b border-secondary-light px-6 py-4 flex items-center justify-between rounded-t-xl">
          <h2 className="text-xl font-righteous text-primary-dark">
            {isEdit ? `Edit ${staffLabel}` : "Add New Employee"}
          </h2>
          <button onClick={onClose} className="p-2 hover:bg-secondary-bg rounded-lg">
            <X size={20} className="text-secondary-dark" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          {/* STAFF TYPE */}
          <div>
            <label className="block text-sm font-montserrat text-secondary-dark mb-1">
              <Briefcase size={14} className="inline mr-1" /> Staff Type *
            </label>
            <select
              name="staff_type"
              value={form.staff_type}
              onChange={handleChange}
              className="w-full border border-secondary-light rounded p-2.5 focus:ring-1 focus:ring-primary focus:border-primary outline-none"
              required
            >
              <option value="teacher">Teacher</option>
              <option value="admin">Administrator</option>
              <option value="accountant">Accountant</option>
              <option value="librarian">Librarian</option>
              <option value="support">Support Staff</option>
              <option value="other">Other</option>
            </select>
          </div>

          {/* Branch Selection */}
          <div>
            <label className="block text-sm font-montserrat text-secondary-dark mb-1">
              Branch *
            </label>
            <select
              name="branch_id"
              value={form.branch_id}
              onChange={handleChange}
              className="w-full border border-secondary-light rounded p-2.5 focus:ring-1 focus:ring-primary focus:border-primary outline-none"
              required
            >
              <option value="">Select Branch</option>
              {branches.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.branch_name}
                </option>
              ))}
            </select>
          </div>

          {/* Employee Code */}
          <div>
            <label className="block text-sm font-montserrat text-secondary-dark mb-1">
              <Briefcase size={14} className="inline mr-1" /> Employee Code
            </label>
            <div className="relative">
              <input
                type="text"
                name="employee_code"
                value={form.employee_code}
                onChange={handleChange}
                disabled={autoCodeLoading}
                className="w-full border border-secondary-light rounded p-2.5 focus:ring-1 focus:ring-primary focus:border-primary outline-none disabled:bg-gray-100"
                placeholder={autoCodeLoading ? "Generating…" : "Auto‑generated"}
              />
              {autoCodeLoading && (
                <div className="absolute right-3 top-1/2 -translate-y-1/2">
                  <div className="animate-spin h-4 w-4 border-2 border-primary border-r-transparent rounded-full" />
                </div>
              )}
            </div>
            <p className="text-xs text-secondary-light mt-1">
              {isEdit ? "Code cannot be changed after creation" : "Auto‑generated based on staff type"}
            </p>
          </div>

          {/* Basic fields */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-montserrat text-secondary-dark mb-1">
                <User size={14} className="inline mr-1" /> First Name *
              </label>
              <input
                type="text"
                name="first_name"
                value={form.first_name}
                onChange={handleChange}
                required
                className="w-full border border-secondary-light rounded p-2.5 focus:ring-1 focus:ring-primary focus:border-primary outline-none"
              />
            </div>
            <div>
              <label className="block text-sm font-montserrat text-secondary-dark mb-1">Last Name</label>
              <input
                type="text"
                name="last_name"
                value={form.last_name}
                onChange={handleChange}
                className="w-full border border-secondary-light rounded p-2.5 focus:ring-1 focus:ring-primary focus:border-primary outline-none"
              />
            </div>
          </div>

          {/* Mobile */}
          <div>
            <label className="block text-sm font-montserrat text-secondary-dark mb-1">
              <Phone size={14} className="inline mr-1" /> Mobile
            </label>
            <input
              type="text"
              name="mobile"
              value={form.mobile}
              onChange={handleChange}
              className="w-full border border-secondary-light rounded p-2.5 focus:ring-1 focus:ring-primary focus:border-primary outline-none"
            />
          </div>

          {/* Email & Password */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-montserrat text-secondary-dark mb-1">
                <Mail size={14} className="inline mr-1" /> Email
              </label>
              <input
                type="email"
                name="email"
                value={form.email}
                onChange={handleChange}
                className="w-full border border-secondary-light rounded p-2.5 focus:ring-1 focus:ring-primary focus:border-primary outline-none"
              />
            </div>
            <div>
              <label className="block text-sm font-montserrat text-secondary-dark mb-1">
                <Lock size={14} className="inline mr-1" /> Password {!isEdit && "*"}
              </label>
              <input
                type="password"
                name="password"
                value={form.password}
                onChange={handleChange}
                required={!isEdit}
                className="w-full border border-secondary-light rounded p-2.5 focus:ring-1 focus:ring-primary focus:border-primary outline-none"
              />
            </div>
          </div>

          {/* Department & Designation */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-montserrat text-secondary-dark mb-1">Department</label>
              <input
                type="text"
                name="department"
                value={form.department}
                onChange={handleChange}
                placeholder="e.g., Academics, Admin"
                className="w-full border border-secondary-light rounded p-2.5 focus:ring-1 focus:ring-primary focus:border-primary outline-none"
              />
            </div>
            <div>
              <label className="block text-sm font-montserrat text-secondary-dark mb-1">Designation</label>
              <input
                type="text"
                name="designation"
                value={form.designation}
                onChange={handleChange}
                placeholder="e.g., Senior Teacher"
                className="w-full border border-secondary-light rounded p-2.5 focus:ring-1 focus:ring-primary focus:border-primary outline-none"
              />
            </div>
          </div>

          {/* DOB & Gender */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-montserrat text-secondary-dark mb-1">
                <Calendar size={14} className="inline mr-1" /> Date of Birth
              </label>
              <input
                type="date"
                name="date_of_birth"
                value={form.date_of_birth}
                onChange={handleChange}
                className="w-full border border-secondary-light rounded p-2.5 focus:ring-1 focus:ring-primary focus:border-primary outline-none"
              />
            </div>
            <div>
              <label className="block text-sm font-montserrat text-secondary-dark mb-1">Gender</label>
              <select
                name="gender"
                value={form.gender}
                onChange={handleChange}
                className="w-full border border-secondary-light rounded p-2.5 focus:ring-1 focus:ring-primary focus:border-primary outline-none"
              >
                <option value="">Select</option>
                <option>Male</option>
                <option>Female</option>
                <option>Other</option>
              </select>
            </div>
          </div>

          {/* Emergency Contact */}
          <div>
            <label className="block text-sm font-montserrat text-secondary-dark mb-1">
              Emergency Contact
            </label>
            <input
              type="text"
              name="emergency_contact"
              value={form.emergency_contact}
              onChange={handleChange}
              placeholder="Name and phone number"
              className="w-full border border-secondary-light rounded p-2.5 focus:ring-1 focus:ring-primary focus:border-primary outline-none"
            />
          </div>

          {/* Qualification */}
          <div>
            <label className="block text-sm font-montserrat text-secondary-dark mb-1">Qualification</label>
            <input
              type="text"
              name="qualification"
              value={form.qualification}
              onChange={handleChange}
              className="w-full border border-secondary-light rounded p-2.5 focus:ring-1 focus:ring-primary focus:border-primary outline-none"
            />
          </div>

          {/* Joining Date & Salary */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-montserrat text-secondary-dark mb-1">Joining Date</label>
              <input
                type="date"
                name="joining_date"
                value={form.joining_date}
                onChange={handleChange}
                className="w-full border border-secondary-light rounded p-2.5 focus:ring-1 focus:ring-primary focus:border-primary outline-none"
              />
            </div>
            <div>
              <label className="block text-sm font-montserrat text-secondary-dark mb-1">Salary</label>
              <input
                type="number"
                name="salary"
                value={form.salary}
                onChange={handleChange}
                className="w-full border border-secondary-light rounded p-2.5 focus:ring-1 focus:ring-primary focus:border-primary outline-none"
              />
            </div>
          </div>

          {/* Status */}
          <div>
            <label className="block text-sm font-montserrat text-secondary-dark mb-1">Status</label>
            <select
              name="status"
              value={form.status}
              onChange={handleChange}
              className="w-full border border-secondary-light rounded p-2.5 focus:ring-1 focus:ring-primary focus:border-primary outline-none"
            >
              <option value="active">Active</option>
              <option value="inactive">Inactive</option>
            </select>
          </div>

          {/* Bank Accounts */}
          <div>
            <label className="block text-sm font-montserrat text-secondary-dark mb-2">Bank Accounts</label>
            <div className="space-y-3">
              {bankAccounts.map((account, idx) => (
                <div key={idx} className="grid grid-cols-12 gap-2 items-center">
                  <input
                    type="text"
                    placeholder="Bank Name"
                    value={account.bank_name}
                    onChange={(e) => updateBankAccount(idx, "bank_name", e.target.value)}
                    className="col-span-3 border border-secondary-light rounded p-2 text-sm focus:ring-1 focus:ring-primary outline-none"
                  />
                  <input
                    type="text"
                    placeholder="Branch"
                    value={account.branch_name}
                    onChange={(e) => updateBankAccount(idx, "branch_name", e.target.value)}
                    className="col-span-3 border border-secondary-light rounded p-2 text-sm focus:ring-1 focus:ring-primary outline-none"
                  />
                  <input
                    type="text"
                    placeholder="IFSC Code"
                    value={account.ifsc_code}
                    onChange={(e) => updateBankAccount(idx, "ifsc_code", e.target.value)}
                    className="col-span-2 border border-secondary-light rounded p-2 text-sm focus:ring-1 focus:ring-primary outline-none uppercase"
                  />
                  <input
                    type="text"
                    placeholder="Account No."
                    value={account.account_number}
                    onChange={(e) => updateBankAccount(idx, "account_number", e.target.value)}
                    className="col-span-3 border border-secondary-light rounded p-2 text-sm focus:ring-1 focus:ring-primary outline-none"
                  />
                  <div className="col-span-1 flex justify-center">
                    {bankAccounts.length > 1 && (
                      <button
                        type="button"
                        onClick={() => removeBankAccount(idx)}
                        className="text-red-500 hover:text-red-700"
                      >
                        <Trash2 size={16} />
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
            <button
              type="button"
              onClick={addBankAccount}
              className="mt-2 text-primary text-sm flex items-center gap-1 hover:underline"
            >
              <Plus size={16} /> Add Bank Account
            </button>
          </div>

          {/* Mediums */}
          <div>
            <label className="block text-sm font-montserrat text-secondary-dark mb-2">
              <BookOpen size={14} className="inline mr-1" /> Mediums
            </label>
            <div className="flex flex-wrap gap-3">
              {mediums.map((m) => (
                <label key={m.id} className="flex items-center gap-1 text-sm">
                  <input
                    type="checkbox"
                    name="medium_ids"
                    value={m.id}
                    checked={form.medium_ids.includes(m.id)}
                    onChange={handleChange}
                  />
                  {m.name}
                </label>
              ))}
            </div>
          </div>

          {/* Courses */}
          <div>
            <label className="block text-sm font-montserrat text-secondary-dark mb-2">
              <BookMarked size={14} className="inline mr-1" /> Courses
            </label>
            <div className="flex flex-wrap gap-3">
              {courses.map((c) => (
                <label key={c.id} className="flex items-center gap-1 text-sm">
                  <input
                    type="checkbox"
                    name="course_ids"
                    value={c.id}
                    checked={form.course_ids.includes(c.id)}
                    onChange={handleChange}
                  />
                  {c.course_name}
                </label>
              ))}
            </div>
          </div>

          {/* Course Levels */}
          <div>
            <label className="block text-sm font-montserrat text-secondary-dark mb-2">
              <Layers size={14} className="inline mr-1" /> Course Levels
            </label>
            <div className="flex flex-wrap gap-3">
              {filteredCourseLevels.length === 0 && (
                <p className="text-xs text-secondary-light">Select a course first</p>
              )}
              {filteredCourseLevels.map((cl) => (
                <label key={cl.id} className="flex items-center gap-1 text-sm">
                  <input
                    type="checkbox"
                    name="course_level_ids"
                    value={cl.id}
                    checked={form.course_level_ids.includes(cl.id)}
                    onChange={handleChange}
                  />
                  {cl.level_name}
                </label>
              ))}
            </div>
          </div>

          {/* Subjects */}
          <div>
            <label className="block text-sm font-montserrat text-secondary-dark mb-2">
              <GraduationCap size={14} className="inline mr-1" /> Subjects
            </label>
            <div className="flex flex-wrap gap-3">
              {filteredSubjects.length === 0 && (
                <p className="text-xs text-secondary-light">Select a course first</p>
              )}
              {filteredSubjects.map((s) => (
                <label key={s.id} className="flex items-center gap-1 text-sm">
                  <input
                    type="checkbox"
                    name="subject_ids"
                    value={s.id}
                    checked={form.subject_ids.includes(s.id)}
                    onChange={handleChange}
                  />
                  {s.subject_name}
                </label>
              ))}
            </div>
          </div>

          <div className="flex flex-col sm:flex-row-reverse gap-3 pt-2">
            <button
              type="submit"
              disabled={loading}
              className="w-full sm:w-auto bg-primary hover:bg-primary-light text-white px-6 py-2.5 rounded-lg font-montserrat transition disabled:opacity-60"
            >
              {loading ? "Saving..." : isEdit ? `Update ${staffLabel}` : "Create Employee"}
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