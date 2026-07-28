// src/components/TeacherForm.jsx
import React, { useState, useEffect, useRef } from "react";
import { supabase } from "../api/supabase";
import toast from "react-hot-toast";
import {
  X, User, Mail, Briefcase, Phone, BookOpen, Layers,
  GraduationCap, BookMarked, Calendar, Plus, Trash2, Link2, Unlink2, Search, Loader2
} from "lucide-react";
import {
  getCourseOptions, getCourseLevelOptions, getSubjectOptions, getMediumOptions
} from "../services/teacherService";
import { useOrg } from "../context/OrganizationContext";
import { useTheme } from "../context/ThemeContext";

const STAFF_PREFIX = {
  teacher: "TCH", admin: "ADM", accountant: "ACC",
  librarian: "LIB", support: "SUP", other: "STF",
};

export default function TeacherForm({ initialData = null, onSubmit, onClose }) {
  const isEdit = !!initialData;
  const { branch, selectedFinancialYear, org } = useOrg();
  const theme = useTheme();
  const branchId = branch?.id;
  const financialYearId = selectedFinancialYear?.id;

  const headingFont = theme?.font_heading || "Righteous";
  const bodyFont = theme?.font_body || "Montserrat";

  // --- Initial values ---
  const getInitialCourseIds = () => {
    if (initialData?.course_ids?.length) return initialData.course_ids;
    const levelCourseIds = (initialData?.course_levels || []).map(cl => cl.course_id).filter(Boolean);
    const subjectCourseIds = (initialData?.subjects || []).map(s => s.course_id).filter(Boolean);
    return [...new Set([...levelCourseIds, ...subjectCourseIds])];
  };

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
    employee_code: initialData?.employee_code || "",
    mobile: initialData?.mobile || "",
    qualification: initialData?.qualification || "",
    joining_date: initialData?.joining_date || "",
    salary: initialData?.salary || "",
    status: initialData?.status || "active",
    branch_id: initialData?.branch_id || branchId || "",
    medium_ids: initialData?.mediums?.map((m) => m.id) || [],
    course_ids: getInitialCourseIds(),
    course_level_ids: initialData?.course_levels?.map((cl) => cl.id) || [],
    subject_ids: initialData?.subjects?.map((s) => s.id) || [],
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

  // --- Link Account ---
  const [linkedUser, setLinkedUser] = useState(null);           // { id, email, full_name }
  const [searchEmail, setSearchEmail] = useState("");
  const [searchResults, setSearchResults] = useState([]);
  const [searching, setSearching] = useState(false);
  const [showResults, setShowResults] = useState(false);
  const searchContainerRef = useRef(null);

  // Initialize linked user if editing and teacher has user_id
  useEffect(() => {
    if (initialData?.user_id) {
      // We can fetch the email from the view
      supabase
        .from("user_emails")
        .select("email")
        .eq("id", initialData.user_id)
        .single()
        .then(({ data }) => {
          setLinkedUser({
            id: initialData.user_id,
            email: data?.email || null,
            full_name: null,
          });
        })
        .catch(() => {
          setLinkedUser({ id: initialData.user_id, email: null });
        });
    }
  }, [initialData]);

  // Close dropdown when clicking outside
  useEffect(() => {
    const handler = (e) => {
      if (searchContainerRef.current && !searchContainerRef.current.contains(e.target)) {
        setShowResults(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  // Search profiles by email or name
  const handleSearch = async () => {
    const term = searchEmail.trim();
    if (!term) {
      setSearchResults([]);
      setShowResults(false);
      return;
    }
    setSearching(true);
    try {
      const { data, error } = await supabase
        .from("profiles")
        .select("id, full_name, email")
        .or(`email.ilike.%${term}%,full_name.ilike.%${term}%`)
        .limit(5);

      if (error) throw error;
      setSearchResults(data || []);
      setShowResults(true);
    } catch (err) {
      toast.error("Search failed");
      console.error(err);
    } finally {
      setSearching(false);
    }
  };

  const selectProfile = (profile) => {
    setLinkedUser({
      id: profile.id,
      email: profile.email || profile.full_name,
      full_name: profile.full_name,
    });
    setSearchEmail("");
    setSearchResults([]);
    setShowResults(false);
  };

  const unlink = () => {
    setLinkedUser(null);
  };

  // ─── Auto‑generate employee code ─────
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
        setForm(prev => ({ ...prev, employee_code: `${prefix}-${String(nextNum).padStart(4, "0")}` }));
      } catch (err) {
        console.error("Failed to generate employee code", err);
      } finally {
        setAutoCodeLoading(false);
      }
    }
    generateCode();
  }, [isEdit, initialData?.employee_code, form.staff_type]);

  // ─── Fetch dropdowns ─────
  useEffect(() => {
    if (!branchId || !financialYearId) return;
    const fetchData = async () => {
      const [mediumRes, courseRes, levelRes, subjectRes] = await Promise.all([
        getMediumOptions(),
        getCourseOptions(),
        getCourseLevelOptions(),
        getSubjectOptions(),
      ]);
      setMediums(mediumRes || []);
      setCourses(courseRes || []);
      setAllCourseLevels(levelRes || []);
      setAllSubjects(subjectRes || []);
    };
    fetchData();
  }, [branchId, financialYearId]);

  useEffect(() => {
    if (!org?.id) return;
    const fetchBranches = async () => {
      const { data, error } = await supabase
        .from("branches")
        .select("id, branch_name")
        .eq("organization_id", org.id)
        .order("branch_name");
      if (!error && data) {
        setBranches(data);
        if (!form.branch_id && data.length > 0) {
          setForm(prev => ({ ...prev, branch_id: branchId || data[0].id }));
        }
      }
    };
    fetchBranches();
  }, [org?.id]);

  const filteredCourseLevels = allCourseLevels.filter(
    cl => !form.course_ids || form.course_ids.length === 0 || (cl.course_id && form.course_ids.includes(cl.course_id))
  );
  const filteredSubjects = allSubjects.filter(
    s => !form.course_ids || form.course_ids.length === 0 || (s.course_id && form.course_ids.includes(s.course_id))
  );

  useEffect(() => {
    if (form.course_ids && form.course_ids.length > 0) {
      const validLevelIds = allCourseLevels.filter(cl => form.course_ids.includes(cl.course_id)).map(cl => cl.id);
      const validSubjectIds = allSubjects.filter(s => form.course_ids.includes(s.course_id)).map(s => s.id);
      setForm(prev => ({
        ...prev,
        course_level_ids: prev.course_level_ids.filter(id => validLevelIds.includes(id)),
        subject_ids: prev.subject_ids.filter(id => validSubjectIds.includes(id)),
      }));
    } else {
      setForm(prev => ({ ...prev, course_level_ids: [], subject_ids: [] }));
    }
  }, [form.course_ids, allCourseLevels, allSubjects]);

  const handleChange = (e) => {
    const { name, value, type, checked } = e.target;
    if (type === "checkbox") {
      setForm(prev => {
        const current = prev[name] || [];
        return checked ? { ...prev, [name]: [...current, Number(value)] } : { ...prev, [name]: current.filter(id => id !== Number(value)) };
      });
    } else {
      setForm(prev => ({ ...prev, [name]: value }));
    }
  };

  const addBankAccount = () => setBankAccounts([...bankAccounts, { bank_name: "", branch_name: "", ifsc_code: "", account_number: "" }]);
  const removeBankAccount = (index) => setBankAccounts(bankAccounts.filter((_, i) => i !== index));
  const updateBankAccount = (index, field, value) => {
    const updated = [...bankAccounts];
    updated[index] = { ...updated[index], [field]: value };
    setBankAccounts(updated);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!form.branch_id) { toast.error("Please select a branch"); return; }
    if (form.email && !form.email.includes('@')) { toast.error('Invalid email'); return; }
    if (!selectedFinancialYear?.id) { toast.error("No financial year selected."); return; }

    setLoading(true);
    try {
      const validAccounts = bankAccounts.filter(acc => acc.bank_name || acc.account_number);
      const bankJson = validAccounts.length > 0 ? JSON.stringify(validAccounts) : null;

      const payload = {
        ...form,
        bank_account_details: bankJson,
        user_id: linkedUser?.id || null,
        linked_email: linkedUser?.email || null,
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
      <div className="bg-white rounded-xl w-full max-w-2xl shadow-xl max-h-[90vh] overflow-y-auto border border-primary-bg">
        <div className="sticky top-0 bg-white border-b border-primary-bg px-6 py-4 flex items-center justify-between rounded-t-xl">
          <h2 className="text-xl font-bold text-primary" style={{ fontFamily: headingFont }}>
            {isEdit ? `Edit ${staffLabel}` : "Add New Employee"}
          </h2>
          <button onClick={onClose} className="p-2 hover:bg-primary-bg rounded-lg">
            <X size={20} className="text-primary-dark" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          {/* STAFF TYPE */}
          <div>
            <label className="block text-sm text-primary-dark mb-1" style={{ fontFamily: bodyFont }}>
              <Briefcase size={14} className="inline mr-1" /> Staff Type *
            </label>
            <select
              name="staff_type"
              value={form.staff_type}
              onChange={handleChange}
              className="w-full border border-primary-bg rounded p-2.5 focus:ring-1 focus:ring-primary focus:border-primary outline-none bg-white text-primary-dark"
              required
              style={{ fontFamily: bodyFont }}
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
            <label className="block text-sm text-primary-dark mb-1" style={{ fontFamily: bodyFont }}>
              Branch *
            </label>
            <select
              name="branch_id"
              value={form.branch_id}
              onChange={handleChange}
              className="w-full border border-primary-bg rounded p-2.5 focus:ring-1 focus:ring-primary focus:border-primary outline-none bg-white text-primary-dark"
              required
              style={{ fontFamily: bodyFont }}
            >
              <option value="">Select Branch</option>
              {branches.map(b => (
                <option key={b.id} value={b.id}>{b.branch_name}</option>
              ))}
            </select>
          </div>

          {/* Employee Code */}
          <div>
            <label className="block text-sm text-primary-dark mb-1" style={{ fontFamily: bodyFont }}>
              <Briefcase size={14} className="inline mr-1" /> Employee Code
            </label>
            <div className="relative">
              <input
                type="text"
                name="employee_code"
                value={form.employee_code}
                onChange={handleChange}
                disabled={autoCodeLoading}
                className="w-full border border-primary-bg rounded p-2.5 focus:ring-1 focus:ring-primary focus:border-primary outline-none disabled:bg-primary-bg bg-white text-primary-dark"
                placeholder={autoCodeLoading ? "Generating…" : "Auto‑generated"}
                style={{ fontFamily: bodyFont }}
              />
              {autoCodeLoading && (
                <div className="absolute right-3 top-1/2 -translate-y-1/2">
                  <div className="animate-spin h-4 w-4 border-2 border-primary border-r-transparent rounded-full" />
                </div>
              )}
            </div>
          </div>

          {/* First Name & Last Name */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm text-primary-dark mb-1" style={{ fontFamily: bodyFont }}>
                <User size={14} className="inline mr-1" /> First Name *
              </label>
              <input
                type="text"
                name="first_name"
                value={form.first_name}
                onChange={handleChange}
                required
                className="w-full border border-primary-bg rounded p-2.5 focus:ring-1 focus:ring-primary focus:border-primary outline-none bg-white text-primary-dark"
                style={{ fontFamily: bodyFont }}
              />
            </div>
            <div>
              <label className="block text-sm text-primary-dark mb-1" style={{ fontFamily: bodyFont }}>
                Last Name
              </label>
              <input
                type="text"
                name="last_name"
                value={form.last_name}
                onChange={handleChange}
                className="w-full border border-primary-bg rounded p-2.5 focus:ring-1 focus:ring-primary focus:border-primary outline-none bg-white text-primary-dark"
                style={{ fontFamily: bodyFont }}
              />
            </div>
          </div>

          {/* Mobile */}
          <div>
            <label className="block text-sm text-primary-dark mb-1" style={{ fontFamily: bodyFont }}>
              <Phone size={14} className="inline mr-1" /> Mobile
            </label>
            <input
              type="text"
              name="mobile"
              value={form.mobile}
              onChange={handleChange}
              className="w-full border border-primary-bg rounded p-2.5 focus:ring-1 focus:ring-primary focus:border-primary outline-none bg-white text-primary-dark"
              style={{ fontFamily: bodyFont }}
            />
          </div>

          {/* Email */}
          <div>
            <label className="block text-sm text-primary-dark mb-1" style={{ fontFamily: bodyFont }}>
              <Mail size={14} className="inline mr-1" /> Email
            </label>
            <input
              type="email"
              name="email"
              value={form.email}
              onChange={handleChange}
              className="w-full border border-primary-bg rounded p-2.5 focus:ring-1 focus:ring-primary focus:border-primary outline-none bg-white text-primary-dark"
              style={{ fontFamily: bodyFont }}
            />
          </div>

          {/* Department & Designation */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm text-primary-dark mb-1" style={{ fontFamily: bodyFont }}>
                Department
              </label>
              <input
                type="text"
                name="department"
                value={form.department}
                onChange={handleChange}
                placeholder="e.g., Academics, Admin"
                className="w-full border border-primary-bg rounded p-2.5 focus:ring-1 focus:ring-primary focus:border-primary outline-none bg-white text-primary-dark placeholder-primary-dark/40"
                style={{ fontFamily: bodyFont }}
              />
            </div>
            <div>
              <label className="block text-sm text-primary-dark mb-1" style={{ fontFamily: bodyFont }}>
                Designation
              </label>
              <input
                type="text"
                name="designation"
                value={form.designation}
                onChange={handleChange}
                placeholder="e.g., Senior Teacher"
                className="w-full border border-primary-bg rounded p-2.5 focus:ring-1 focus:ring-primary focus:border-primary outline-none bg-white text-primary-dark placeholder-primary-dark/40"
                style={{ fontFamily: bodyFont }}
              />
            </div>
          </div>

          {/* DOB & Gender */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm text-primary-dark mb-1" style={{ fontFamily: bodyFont }}>
                <Calendar size={14} className="inline mr-1" /> Date of Birth
              </label>
              <input
                type="date"
                name="date_of_birth"
                value={form.date_of_birth}
                onChange={handleChange}
                className="w-full border border-primary-bg rounded p-2.5 focus:ring-1 focus:ring-primary focus:border-primary outline-none bg-white text-primary-dark"
              />
            </div>
            <div>
              <label className="block text-sm text-primary-dark mb-1" style={{ fontFamily: bodyFont }}>
                Gender
              </label>
              <select
                name="gender"
                value={form.gender}
                onChange={handleChange}
                className="w-full border border-primary-bg rounded p-2.5 focus:ring-1 focus:ring-primary focus:border-primary outline-none bg-white text-primary-dark"
                style={{ fontFamily: bodyFont }}
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
            <label className="block text-sm text-primary-dark mb-1" style={{ fontFamily: bodyFont }}>
              Emergency Contact
            </label>
            <input
              type="text"
              name="emergency_contact"
              value={form.emergency_contact}
              onChange={handleChange}
              placeholder="Name and phone number"
              className="w-full border border-primary-bg rounded p-2.5 focus:ring-1 focus:ring-primary focus:border-primary outline-none bg-white text-primary-dark placeholder-primary-dark/40"
              style={{ fontFamily: bodyFont }}
            />
          </div>

          {/* Qualification */}
          <div>
            <label className="block text-sm text-primary-dark mb-1" style={{ fontFamily: bodyFont }}>
              Qualification
            </label>
            <input
              type="text"
              name="qualification"
              value={form.qualification}
              onChange={handleChange}
              className="w-full border border-primary-bg rounded p-2.5 focus:ring-1 focus:ring-primary focus:border-primary outline-none bg-white text-primary-dark"
              style={{ fontFamily: bodyFont }}
            />
          </div>

          {/* Joining Date & Salary */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm text-primary-dark mb-1" style={{ fontFamily: bodyFont }}>
                Joining Date
              </label>
              <input
                type="date"
                name="joining_date"
                value={form.joining_date}
                onChange={handleChange}
                className="w-full border border-primary-bg rounded p-2.5 focus:ring-1 focus:ring-primary focus:border-primary outline-none bg-white text-primary-dark"
              />
            </div>
            <div>
              <label className="block text-sm text-primary-dark mb-1" style={{ fontFamily: bodyFont }}>
                Salary
              </label>
              <input
                type="number"
                name="salary"
                value={form.salary}
                onChange={handleChange}
                className="w-full border border-primary-bg rounded p-2.5 focus:ring-1 focus:ring-primary focus:border-primary outline-none bg-white text-primary-dark"
                style={{ fontFamily: bodyFont }}
              />
            </div>
          </div>

          {/* Status */}
          <div>
            <label className="block text-sm text-primary-dark mb-1" style={{ fontFamily: bodyFont }}>
              Status
            </label>
            <select
              name="status"
              value={form.status}
              onChange={handleChange}
              className="w-full border border-primary-bg rounded p-2.5 focus:ring-1 focus:ring-primary focus:border-primary outline-none bg-white text-primary-dark"
              style={{ fontFamily: bodyFont }}
            >
              <option value="active">Active</option>
              <option value="inactive">Inactive</option>
            </select>
          </div>

          {/* Bank Accounts */}
          <div>
            <label className="block text-sm text-primary-dark mb-2" style={{ fontFamily: bodyFont }}>
              Bank Accounts
            </label>
            <div className="space-y-3">
              {bankAccounts.map((account, idx) => (
                <div key={idx} className="grid grid-cols-12 gap-2 items-center">
                  <input type="text" placeholder="Bank Name" value={account.bank_name} onChange={(e) => updateBankAccount(idx, "bank_name", e.target.value)} className="col-span-3 border border-primary-bg rounded p-2 text-sm focus:ring-1 focus:ring-primary outline-none bg-white text-primary-dark placeholder-primary-dark/40" style={{ fontFamily: bodyFont }} />
                  <input type="text" placeholder="Branch" value={account.branch_name} onChange={(e) => updateBankAccount(idx, "branch_name", e.target.value)} className="col-span-3 border border-primary-bg rounded p-2 text-sm focus:ring-1 focus:ring-primary outline-none bg-white text-primary-dark placeholder-primary-dark/40" style={{ fontFamily: bodyFont }} />
                  <input type="text" placeholder="IFSC Code" value={account.ifsc_code} onChange={(e) => updateBankAccount(idx, "ifsc_code", e.target.value)} className="col-span-2 border border-primary-bg rounded p-2 text-sm focus:ring-1 focus:ring-primary outline-none bg-white text-primary-dark placeholder-primary-dark/40 uppercase" style={{ fontFamily: bodyFont }} />
                  <input type="text" placeholder="Account No." value={account.account_number} onChange={(e) => updateBankAccount(idx, "account_number", e.target.value)} className="col-span-3 border border-primary-bg rounded p-2 text-sm focus:ring-1 focus:ring-primary outline-none bg-white text-primary-dark placeholder-primary-dark/40" style={{ fontFamily: bodyFont }} />
                  <div className="col-span-1 flex justify-center">
                    {bankAccounts.length > 1 && (
                      <button type="button" onClick={() => removeBankAccount(idx)} className="text-accent-dark hover:text-accent"><Trash2 size={16} /></button>
                    )}
                  </div>
                </div>
              ))}
            </div>
            <button type="button" onClick={addBankAccount} className="mt-2 text-primary text-sm flex items-center gap-1 hover:underline" style={{ fontFamily: bodyFont }}>
              <Plus size={16} /> Add Bank Account
            </button>
          </div>

          {/* Mediums */}
          <div>
            <label className="block text-sm text-primary-dark mb-2" style={{ fontFamily: bodyFont }}>
              <BookOpen size={14} className="inline mr-1" /> Mediums
            </label>
            <div className="flex flex-wrap gap-3">
              {mediums.map(m => (
                <label key={m.id} className="flex items-center gap-1 text-sm text-primary-dark" style={{ fontFamily: bodyFont }}>
                  <input type="checkbox" name="medium_ids" value={m.id} checked={form.medium_ids.includes(m.id)} onChange={handleChange} className="text-primary focus:ring-primary" />
                  {m.name}
                </label>
              ))}
            </div>
          </div>

          {/* Courses */}
          <div>
            <label className="block text-sm text-primary-dark mb-2" style={{ fontFamily: bodyFont }}>
              <BookMarked size={14} className="inline mr-1" /> Courses
            </label>
            <div className="flex flex-wrap gap-3">
              {courses.map(c => (
                <label key={c.id} className="flex items-center gap-1 text-sm text-primary-dark" style={{ fontFamily: bodyFont }}>
                  <input type="checkbox" name="course_ids" value={c.id} checked={form.course_ids.includes(c.id)} onChange={handleChange} className="text-primary focus:ring-primary" />
                  {c.course_name}
                </label>
              ))}
            </div>
          </div>

          {/* Course Levels */}
          <div>
            <label className="block text-sm text-primary-dark mb-2" style={{ fontFamily: bodyFont }}>
              <Layers size={14} className="inline mr-1" /> Course Levels
            </label>
            <div className="flex flex-wrap gap-3">
              {filteredCourseLevels.length === 0 && <p className="text-xs text-primary-dark/60" style={{ fontFamily: bodyFont }}>Select a course first</p>}
              {filteredCourseLevels.map(cl => (
                <label key={cl.id} className="flex items-center gap-1 text-sm text-primary-dark" style={{ fontFamily: bodyFont }}>
                  <input type="checkbox" name="course_level_ids" value={cl.id} checked={form.course_level_ids.includes(cl.id)} onChange={handleChange} className="text-primary focus:ring-primary" />
                  {cl.level_name}
                </label>
              ))}
            </div>
          </div>

          {/* Subjects */}
          <div>
            <label className="block text-sm text-primary-dark mb-2" style={{ fontFamily: bodyFont }}>
              <GraduationCap size={14} className="inline mr-1" /> Subjects
            </label>
            <div className="flex flex-wrap gap-3">
              {filteredSubjects.length === 0 && <p className="text-xs text-primary-dark/60" style={{ fontFamily: bodyFont }}>Select a course first</p>}
              {filteredSubjects.map(s => (
                <label key={s.id} className="flex items-center gap-1 text-sm text-primary-dark" style={{ fontFamily: bodyFont }}>
                  <input type="checkbox" name="subject_ids" value={s.id} checked={form.subject_ids.includes(s.id)} onChange={handleChange} className="text-primary focus:ring-primary" />
                  {s.subject_name}
                </label>
              ))}
            </div>
          </div>

          {/* ─── LINKED ACCOUNT SECTION ─── */}
          <div className="border-t border-primary-bg pt-4" ref={searchContainerRef}>
            <h3 className="text-sm font-semibold text-primary-dark mb-3" style={{ fontFamily: headingFont }}>
              <Link2 size={16} className="inline mr-1" /> Linked Account
            </h3>

            {linkedUser ? (
              <div className="flex items-center justify-between bg-primary-bg p-3 rounded-lg">
                <div>
                  <p className="text-sm font-medium text-primary-dark">
                    <Mail size={14} className="inline mr-1" />
                    {linkedUser.email || "No email"}
                  </p>
                  {linkedUser.full_name && (
                    <p className="text-xs text-primary-dark/60">{linkedUser.full_name}</p>
                  )}
                </div>
                <button type="button" onClick={unlink} className="text-accent hover:text-accent-dark text-sm flex items-center gap-1">
                  <Unlink2 size={14} /> Unlink
                </button>
              </div>
            ) : (
              <div className="space-y-2">
                <p className="text-xs text-primary-dark/70" style={{ fontFamily: bodyFont }}>
                  Link an existing account by searching with email or name.
                </p>
                <div className="flex gap-2">
                  <div className="relative flex-1">
                    <input
                      type="text"
                      placeholder="Search profiles..."
                      value={searchEmail}
                      onChange={(e) => {
                        setSearchEmail(e.target.value);
                        if (!e.target.value.trim()) {
                          setShowResults(false);
                          setSearchResults([]);
                        }
                      }}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          e.preventDefault();
                          handleSearch();
                        }
                      }}
                      className="w-full border border-primary-bg rounded p-2 text-sm focus:ring-1 focus:ring-primary outline-none bg-white text-primary-dark placeholder-primary-dark/40"
                      style={{ fontFamily: bodyFont }}
                    />
                    {showResults && (
                      <div className="absolute z-10 w-full mt-1 bg-white border border-primary-bg rounded shadow-lg max-h-44 overflow-y-auto">
                        {searchResults.length > 0 ? (
                          searchResults.map(profile => (
                            <div
                              key={profile.id}
                              onClick={() => selectProfile(profile)}
                              className="px-3 py-2 hover:bg-primary-bg cursor-pointer border-b border-primary-bg/30 last:border-0"
                            >
                              <div className="text-sm font-medium text-primary-dark">
                                {profile.full_name || 'No name'}
                              </div>
                              <div className="text-xs text-primary-dark/70">{profile.email}</div>
                            </div>
                          ))
                        ) : (
                          <div className="px-3 py-2 text-sm text-primary-dark/60">No results found</div>
                        )}
                      </div>
                    )}
                  </div>
                  <button
                    type="button"
                    onClick={handleSearch}
                    disabled={searching || !searchEmail.trim()}
                    className="bg-primary text-white px-4 py-2 rounded text-sm hover:bg-primary-light disabled:opacity-50 flex items-center gap-1"
                  >
                    {searching ? <Loader2 size={14} className="animate-spin" /> : <Search size={14} />}
                    {searching ? "Searching" : "Search"}
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* Submit / Cancel */}
          <div className="flex flex-col sm:flex-row-reverse gap-3 pt-2">
            <button
              type="submit"
              disabled={loading}
              className="w-full sm:w-auto bg-primary hover:bg-primary-light text-white px-6 py-2.5 rounded-lg transition disabled:opacity-60"
              style={{ fontFamily: bodyFont }}
            >
              {loading ? "Saving..." : isEdit ? `Update ${staffLabel}` : "Create Employee"}
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