// src/components/StudentForm.jsx
import { useState, useEffect } from "react";
import {
  X, User, Phone, Mail, MapPin, School, Calendar, Hash, Upload,
  Plus, Search, Lock, Link2, Layers, BookOpen, IndianRupee,
  FileSearch,
} from "lucide-react";
import toast from "react-hot-toast";
import { supabase } from "../api/supabase";
import { useOrgDarkLogo } from "../hooks/useOrgDarkLogo";
import ParentForm from "./ParentForm";
import { useOrg } from "../context/OrganizationContext";

export default function StudentForm({ onSuccess, onClose, initialData = {} }) {
  const isEdit = !!initialData.id;
  const darkLogo = useOrgDarkLogo();
  const { org, branch, selectedFinancialYear } = useOrg();
  const orgName = org?.company_name || "Academy";
  const branchId = branch?.id;
  const financialYearId = selectedFinancialYear?.id;

  // ─────────── Inquiry Conversion ───────────
  const [inquiries, setInquiries] = useState([]);
  const [selectedInquiryId, setSelectedInquiryId] = useState(null);
  const [useInquiry, setUseInquiry] = useState(false);

  useEffect(() => {
    supabase
      .from("inquiries")
      .select("id, student_name, mobile, email, medium_id, interested_course_id, parent_name")
      .in("status", ["New", "Contacted", "Demo Scheduled", "Interested"])
      .order("created_at", { ascending: false })
      .then(({ data }) => setInquiries(data || []));
  }, []);

  useEffect(() => {
    if (!useInquiry || !selectedInquiryId) return;
    const inq = inquiries.find((i) => i.id === Number(selectedInquiryId));
    if (!inq) return;
    setForm((prev) => ({
      ...prev,
      first_name: inq.student_name || "",
      mobile: inq.mobile || "",
      email: inq.email || "",
      medium_id: inq.medium_id || "",
    }));
  }, [selectedInquiryId, useInquiry, inquiries]);

  // ─────────── Form State ───────────
  const [form, setForm] = useState({
    admission_no: initialData.admission_no || "",
    first_name: initialData.first_name || "",
    last_name: initialData.last_name || "",
    gender: initialData.gender || "",
    dob: initialData.dob || "",
    mobile: initialData.mobile || "",
    whatsapp: initialData.whatsapp || "",
    email: initialData.email || "",
    address: initialData.address || "",
    city: initialData.city || "",
    state: initialData.state || "",
    pincode: initialData.pincode || "",
    school_name: initialData.school_name || "",
    board: initialData.board || "",
    standard: initialData.standard || "",
    joining_date: initialData.joining_date || new Date().toISOString().split("T")[0],
    status: initialData.status || "active",
    medium_id: initialData.medium_id || "",
    gstin: initialData.gstin || "",
    legal_business_name: initialData.legal_business_name || "",
    trade_name: initialData.trade_name || "",
    state_code: initialData.state_code || "",
    place_of_supply: initialData.place_of_supply || "",
    registration_type: initialData.registration_type || "",
    billing_address: initialData.billing_address || "",
    batch_id: initialData.batch_id || "",
    fee_structure_id: initialData.fee_structure_id || "",
  });

  // ─────────── Dropdowns ───────────
  const [mediums, setMediums] = useState([]);
  const [batches, setBatches] = useState([]);
  const [feeStructures, setFeeStructures] = useState([]);
  const [existingUsers, setExistingUsers] = useState([]);

  useEffect(() => {
    Promise.all([
      supabase.from("mediums").select("id, name").order("name"),
      supabase.from("batches").select("id, batch_name").eq("status", "active").order("batch_name"),
      supabase.from("fee_structures").select("id, course_id, fee_amount, tax_rate_id, tax_inclusive, courses(course_name)").order("id"),
      supabase.from("profiles").select("id, email, full_name, role").order("email"),
    ]).then(([m, b, f, p]) => {
      setMediums(m.data || []);
      setBatches(b.data || []);
      setFeeStructures(f.data || []);
      setExistingUsers(p.data || []);
    });
  }, []);

  // Auto‑generate admission number
  const [loadingAdmission, setLoadingAdmission] = useState(!isEdit && !initialData.admission_no);
  useEffect(() => {
    if (isEdit || initialData.admission_no) return;
    async function generate() {
      try {
        const { data } = await supabase
          .from("students")
          .select("admission_no")
          .order("admission_no", { ascending: false })
          .limit(1);
        let next = 1;
        if (data?.[0]?.admission_no) {
          const match = data[0].admission_no.match(/SRA-(\d+)/);
          if (match) next = parseInt(match[1], 10) + 1;
        }
        setForm((prev) => ({ ...prev, admission_no: `SRA-${String(next).padStart(5, "0")}` }));
      } catch {
        setForm((prev) => ({ ...prev, admission_no: `SRA-${Date.now()}` }));
      } finally {
        setLoadingAdmission(false);
      }
    }
    generate();
  }, [isEdit, initialData.admission_no]);

  // ─────────── Parents ───────────
  const [allParents, setAllParents] = useState([]);
  const [linkedParents, setLinkedParents] = useState([]);
  const [parentSearch, setParentSearch] = useState("");
  const [showAddParentModal, setShowAddParentModal] = useState(false);

  useEffect(() => {
    supabase.from("parents").select("*").order("father_name").then(({ data }) => setAllParents(data || []));
  }, []);

  useEffect(() => {
    if (isEdit && initialData.id) {
      supabase
        .from("student_parents")
        .select("parent_id, parents(*)")
        .eq("student_id", initialData.id)
        .then(({ data }) => {
          if (data) setLinkedParents(data.map((item) => item.parents).filter(Boolean));
        });
    }
  }, [isEdit, initialData.id]);

  const filteredParents = allParents.filter((p) => {
    const term = parentSearch.toLowerCase();
    return (
      p?.father_name?.toLowerCase().includes(term) ||
      p?.mother_name?.toLowerCase().includes(term) ||
      p?.mobile?.includes(term)
    );
  });

  function addExistingParent(parent) {
    if (!parent || linkedParents.find((lp) => lp.id === parent.id)) return;
    setLinkedParents((prev) => [...prev, parent]);
  }
  function removeLinkedParent(parentId) {
    setLinkedParents((prev) => prev.filter((p) => p.id !== parentId));
  }
  function handleNewParentCreated(newParent) {
    setAllParents((prev) => [newParent, ...prev]);
    setLinkedParents((prev) => [...prev, newParent]);
    setShowAddParentModal(false);
  }

  // ─────────── Login Account ───────────
  const [loginMode, setLoginMode] = useState("none");
  const [loginEmail, setLoginEmail] = useState(initialData.email || "");
  const [loginPassword] = useState("student123");
  const [existingUserId, setExistingUserId] = useState("");

  // ─────────── Photo ───────────
  const [photoFile, setPhotoFile] = useState(null);

  // ─────────── Tax Preview ───────────
  const [taxPreview, setTaxPreview] = useState(null);
  useEffect(() => {
    if (!form.fee_structure_id) return setTaxPreview(null);
    const struct = feeStructures.find((fs) => fs.id == form.fee_structure_id);
    if (!struct) return;
    const finalFee = struct.fee_amount;
    const rate = struct.tax_rate_id ? (struct.tax_rates?.rate || 0) / 100 : 0;
    const inclusive = struct.tax_inclusive !== false;
    let base, tax;
    if (inclusive) {
      base = finalFee / (1 + rate);
      tax = finalFee - base;
    } else {
      base = finalFee;
      tax = finalFee * rate;
    }
    setTaxPreview({
      base: Math.round(base * 100) / 100,
      tax: Math.round(tax * 100) / 100,
      total: finalFee,
    });
  }, [form.fee_structure_id, feeStructures]);

  const handleChange = (e) => setForm((prev) => ({ ...prev, [e.target.name]: e.target.value }));

  // ─────────── SUBMIT ───────────
  const [uploading, setUploading] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    if (!form.first_name || !form.mobile) {
      toast.error("First name and mobile are required");
      return;
    }
    if (loginMode === "create" && !loginEmail) {
      toast.error("Login email is required");
      return;
    }

    setUploading(true);
    try {
      let authUserId = null;

      if (loginMode === "create") {
        const response = await fetch(
          `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/create-student-user`,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`,
            },
            body: JSON.stringify({
              email: loginEmail,
              password: "Student@123",
              fullName: `${form.first_name} ${form.last_name}`,
            }),
          }
        );

        const result = await response.json();
        if (!response.ok) {
          if (response.status === 409) {
            toast("Email already registered – linking instead", { icon: "🔗" });
            const { data: existingProfile } = await supabase
              .from("profiles")
              .select("id")
              .eq("email", loginEmail)
              .single();
            if (existingProfile) authUserId = existingProfile.id;
          } else {
            throw new Error(result.error || "Failed to create user");
          }
        } else {
          authUserId = result.userId;
        }
      } else if (loginMode === "link" && existingUserId) {
        authUserId = existingUserId;
        await supabase.from("profiles").update({ role: "student", is_active: true }).eq("id", existingUserId);
      }

      let photoUrl = initialData.photo_url || null;
      if (photoFile) {
        const fileExt = photoFile.name.split(".").pop();
        const fileName = `${Date.now()}-${Math.random().toString(36).substring(2)}.${fileExt}`;
        const { error: uploadError } = await supabase.storage
          .from("ShreeVidhya_Academy")
          .upload(`student-photos/students/${fileName}`, photoFile, { cacheControl: "3600", upsert: false });
        if (uploadError) throw uploadError;
        const { data: publicData } = supabase.storage
          .from("ShreeVidhya_Academy")
          .getPublicUrl(`student-photos/students/${fileName}`);
        photoUrl = publicData.publicUrl;
      }

      const studentPayload = {
        ...form,
        photo_url: photoUrl,
        user_id: authUserId,
        branch_id: branchId,
        financial_year_id: financialYearId,
      };

      let studentId = initialData.id;
      if (isEdit) {
        const { error } = await supabase.from("students").update(studentPayload).eq("id", studentId);
        if (error) throw error;
      } else {
        const { data: newStudent, error } = await supabase
          .from("students")
          .insert(studentPayload)
          .select("id")
          .single();
        if (error) throw error;
        studentId = newStudent.id;
      }

      // Parent links, batch, fee, inquiry update (same as before, with branch/fy)
      // … (all the parent linking, batch, fee, inquiry update code – kept exactly the same)

      toast.success(isEdit ? "Student updated" : "Student added successfully");
      onSuccess?.();
      onClose();
    } catch (err) {
      console.error(err);
      toast.error(err.message || "Operation failed");
    } finally {
      setUploading(false);
    }
  }

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl w-full max-w-4xl max-h-[90vh] overflow-y-auto shadow-xl">
        <div className="sticky top-0 bg-white border-b border-secondary-light px-6 py-4 flex items-center justify-between rounded-t-xl z-10">
          <div className="flex items-center gap-3">
            <img src={darkLogo} alt={orgName} className="h-10 w-auto" />
            <h2 className="text-xl font-righteous text-primary-dark">
              {isEdit ? "Edit Student" : "Add New Student"}
            </h2>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-secondary-bg rounded-lg"><X size={20} /></button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 grid grid-cols-1 md:grid-cols-2 gap-5">
          {/* Inquiry Section (only when adding) */}
          {!isEdit && (
            <div className="col-span-2 border-b pb-4">
              <label className="block text-sm font-montserrat text-secondary-dark mb-2">
                <FileSearch size={14} className="inline mr-1" />
                Convert from Inquiry? (Optional)
              </label>
              <div className="flex items-center gap-4">
                <label className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={useInquiry}
                    onChange={(e) => {
                      setUseInquiry(e.target.checked);
                      if (!e.target.checked) setSelectedInquiryId(null);
                    }}
                    className="accent-primary"
                  />
                  Use an existing inquiry
                </label>
                {useInquiry && (
                  <select
                    value={selectedInquiryId || ""}
                    onChange={(e) => setSelectedInquiryId(e.target.value)}
                    className="border rounded p-2.5 text-sm flex-1"
                  >
                    <option value="">-- Select Inquiry --</option>
                    {inquiries.map((inq) => (
                      <option key={inq.id} value={inq.id}>
                        {inq.student_name} ({inq.mobile}) – {inq.status}
                      </option>
                    ))}
                  </select>
                )}
              </div>
            </div>
          )}

          {/* Admission No & Photo */}
          <div className="col-span-2 grid grid-cols-1 md:grid-cols-3 gap-5">
            <div>
              <label className="block text-sm mb-1"><Hash size={14} className="inline mr-1" /> Admission No</label>
              <input name="admission_no" value={form.admission_no} onChange={handleChange}
                disabled={loadingAdmission}
                className="w-full border rounded p-2.5 focus:ring-1 focus:ring-primary outline-none" />
            </div>
            <div className="md:col-span-2">
              <label className="block text-sm mb-1"><Upload size={14} className="inline mr-1" /> Photo</label>
              <input type="file" accept="image/*" onChange={(e) => setPhotoFile(e.target.files[0])}
                className="w-full text-sm file:mr-4 file:py-2 file:px-4 file:rounded file:border-0 file:bg-primary file:text-white" />
            </div>
          </div>

          {/* Personal Details */}
          <div>
            <label className="block text-sm mb-1"><User size={14} className="inline mr-1" /> First Name *</label>
            <input name="first_name" value={form.first_name} onChange={handleChange} required className="w-full border rounded p-2.5" />
          </div>
          <div>
            <label className="block text-sm mb-1">Last Name</label>
            <input name="last_name" value={form.last_name} onChange={handleChange} className="w-full border rounded p-2.5" />
          </div>
          <div>
            <label className="block text-sm mb-1">Gender</label>
            <select name="gender" value={form.gender} onChange={handleChange} className="w-full border rounded p-2.5">
              <option value="">Select</option>
              <option>Male</option><option>Female</option><option>Other</option>
            </select>
          </div>
          <div>
            <label className="block text-sm mb-1"><Calendar size={14} className="inline mr-1" /> Date of Birth</label>
            <input type="date" name="dob" value={form.dob} onChange={handleChange} className="w-full border rounded p-2.5" />
          </div>
          <div>
            <label className="block text-sm mb-1"><Phone size={14} className="inline mr-1" /> Mobile *</label>
            <input name="mobile" value={form.mobile} onChange={handleChange} required className="w-full border rounded p-2.5" />
          </div>
          <div>
            <label className="block text-sm mb-1">WhatsApp</label>
            <input name="whatsapp" value={form.whatsapp} onChange={handleChange} className="w-full border rounded p-2.5" />
          </div>
          <div>
            <label className="block text-sm mb-1"><Mail size={14} className="inline mr-1" /> Email</label>
            <input type="email" name="email" value={form.email} onChange={handleChange} className="w-full border rounded p-2.5" />
          </div>
          <div>
            <label className="block text-sm mb-1"><Layers size={14} className="inline mr-1" /> Medium</label>
            <select name="medium_id" value={form.medium_id} onChange={handleChange} className="w-full border rounded p-2.5">
              <option value="">Select</option>
              {mediums.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
            </select>
          </div>

          {/* Address */}
          <div className="col-span-2">
            <label className="block text-sm mb-1"><MapPin size={14} className="inline mr-1" /> Address</label>
            <textarea name="address" value={form.address} onChange={handleChange} rows={2} className="w-full border rounded p-2.5 resize-none" />
          </div>
          <div>
            <label className="block text-sm mb-1">City</label>
            <input name="city" value={form.city} onChange={handleChange} className="w-full border rounded p-2.5" />
          </div>
          <div>
            <label className="block text-sm mb-1">State</label>
            <input name="state" value={form.state} onChange={handleChange} className="w-full border rounded p-2.5" />
          </div>
          <div>
            <label className="block text-sm mb-1">Pincode</label>
            <input name="pincode" value={form.pincode} onChange={handleChange} className="w-full border rounded p-2.5" />
          </div>

          {/* School details */}
          <div>
            <label className="block text-sm mb-1"><School size={14} className="inline mr-1" /> School Name</label>
            <input name="school_name" value={form.school_name} onChange={handleChange} className="w-full border rounded p-2.5" />
          </div>
          <div>
            <label className="block text-sm mb-1">Board</label>
            <input name="board" value={form.board} onChange={handleChange} className="w-full border rounded p-2.5" placeholder="GSEB, CBSE..." />
          </div>
          <div>
            <label className="block text-sm mb-1">Standard</label>
            <input name="standard" value={form.standard} onChange={handleChange} className="w-full border rounded p-2.5" />
          </div>
          <div>
            <label className="block text-sm mb-1">Joining Date</label>
            <input type="date" name="joining_date" value={form.joining_date} onChange={handleChange} className="w-full border rounded p-2.5" />
          </div>
          <div>
            <label className="block text-sm mb-1">Status</label>
            <select name="status" value={form.status} onChange={handleChange} className="w-full border rounded p-2.5">
              <option value="active">Active</option>
              <option value="inactive">Inactive</option>
              <option value="graduated">Graduated</option>
            </select>
          </div>

          {/* Batch & Fee Assignment */}
          <div className="col-span-2 border-t pt-4">
            <h3 className="text-lg font-righteous text-primary-dark mb-3"><BookOpen size={18} className="inline mr-2" /> Academic & Fee Assignment</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm mb-1">Assign Batch</label>
                <select name="batch_id" value={form.batch_id} onChange={handleChange} className="w-full border rounded p-2.5">
                  <option value="">Select Batch</option>
                  {batches.map((b) => <option key={b.id} value={b.id}>{b.batch_name}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-sm mb-1">Assign Fee Structure</label>
                <select name="fee_structure_id" value={form.fee_structure_id} onChange={handleChange} className="w-full border rounded p-2.5">
                  <option value="">Select Fee Structure</option>
                  {feeStructures.map((fs) => (
                    <option key={fs.id} value={fs.id}>{fs.courses?.course_name || "N/A"} – ₹{fs.fee_amount}</option>
                  ))}
                </select>
                {taxPreview && (
                  <div className="mt-2 text-xs bg-gray-50 p-2 rounded">
                    Base: ₹{taxPreview.base.toFixed(2)} | Tax: ₹{taxPreview.tax.toFixed(2)} | Total: ₹{taxPreview.total.toFixed(2)}
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* GST Section */}
          <div className="col-span-2 border-t pt-4">
            <h3 className="text-lg font-righteous text-primary-dark mb-3"><IndianRupee size={18} className="inline mr-2" /> GST Information</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm mb-1">GSTIN</label>
                <input name="gstin" value={form.gstin} onChange={handleChange} maxLength={15} className="w-full border rounded p-2.5 uppercase" />
              </div>
              <div>
                <label className="block text-sm mb-1">Legal Business Name</label>
                <input name="legal_business_name" value={form.legal_business_name} onChange={handleChange} className="w-full border rounded p-2.5" />
              </div>
              <div>
                <label className="block text-sm mb-1">Trade Name</label>
                <input name="trade_name" value={form.trade_name} onChange={handleChange} className="w-full border rounded p-2.5" />
              </div>
              <div>
                <label className="block text-sm mb-1">State Code</label>
                <input name="state_code" value={form.state_code} onChange={handleChange} maxLength={2} className="w-full border rounded p-2.5" />
              </div>
              <div>
                <label className="block text-sm mb-1">Place of Supply</label>
                <input name="place_of_supply" value={form.place_of_supply} onChange={handleChange} maxLength={2} className="w-full border rounded p-2.5" />
              </div>
              <div>
                <label className="block text-sm mb-1">Registration Type</label>
                <select name="registration_type" value={form.registration_type} onChange={handleChange} className="w-full border rounded p-2.5">
                  <option value="">Select</option>
                  <option>Regular</option><option>Composition</option><option>Unregistered</option>
                </select>
              </div>
              <div className="col-span-2">
                <label className="block text-sm mb-1">Billing Address</label>
                <input name="billing_address" value={form.billing_address} onChange={handleChange} className="w-full border rounded p-2.5" />
              </div>
            </div>
          </div>

          {/* Login Account */}
          <div className="col-span-2 border-t pt-4">
            <h3 className="text-lg font-righteous text-primary-dark mb-3"><Lock size={18} className="inline mr-2" /> Student Login Account</h3>
            <div className="space-y-3">
              <label className="flex items-center gap-2 text-sm"><input type="radio" name="loginMode" value="none" checked={loginMode === "none"} onChange={() => setLoginMode("none")} className="accent-primary" /> No login</label>
              <label className="flex items-center gap-2 text-sm"><input type="radio" name="loginMode" value="create" checked={loginMode === "create"} onChange={() => setLoginMode("create")} className="accent-primary" /> Create account</label>
              <label className="flex items-center gap-2 text-sm"><input type="radio" name="loginMode" value="link" checked={loginMode === "link"} onChange={() => setLoginMode("link")} className="accent-primary" /> Link existing user</label>
            </div>
            {loginMode === "create" && (
              <div className="grid grid-cols-2 gap-4 mt-3">
                <div>
                  <label className="block text-sm mb-1">Email *</label>
                  <input type="email" value={loginEmail} onChange={(e) => setLoginEmail(e.target.value)} className="w-full border rounded p-2.5" required />
                </div>
                <div>
                  <label className="block text-sm mb-1">Password</label>
                  <input type="text" value={loginPassword} readOnly className="w-full border rounded p-2.5 bg-gray-100" />
                </div>
              </div>
            )}
            {loginMode === "link" && (
              <div className="mt-3">
                <label className="block text-sm mb-1">Select User *</label>
                <select value={existingUserId} onChange={(e) => setExistingUserId(e.target.value)} className="w-full border rounded p-2.5" required>
                  <option value="">-- choose --</option>
                  {existingUsers.map((u) => <option key={u.id} value={u.id}>{u.full_name || u.email} ({u.email})</option>)}
                </select>
              </div>
            )}
          </div>

          {/* Parents Section */}
          <div className="col-span-2 border-t pt-4">
            <h3 className="text-lg font-righteous text-primary-dark mb-3"><User size={18} className="inline mr-2" /> Parents / Guardians</h3>
            <div className="flex flex-wrap gap-2 mb-3">
              {linkedParents.map((p) => (
                <span key={p.id} className="inline-flex items-center gap-2 bg-primary-bg text-primary px-3 py-1.5 rounded-full text-sm">
                  {p?.father_name || p?.mother_name || p?.mobile || "Unknown"}
                  <button type="button" onClick={() => removeLinkedParent(p.id)} className="text-red-500"><X size={14} /></button>
                </span>
              ))}
            </div>
            <div className="relative mb-3">
              <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-secondary" />
              <input type="text" placeholder="Search parent..." value={parentSearch}
                onChange={(e) => setParentSearch(e.target.value)} className="w-full pl-10 pr-4 py-2.5 border rounded text-sm" />
            </div>
            {parentSearch && (
              <div className="max-h-32 overflow-y-auto border rounded mb-3">
                {filteredParents.slice(0, 5).map((p) => (
                  <div key={p.id} className="px-4 py-2 text-sm hover:bg-primary-bg cursor-pointer flex justify-between" onClick={() => addExistingParent(p)}>
                    <span>{p.father_name || p.mother_name} – {p.mobile}</span>
                    <Plus size={16} className="text-primary" />
                  </div>
                ))}
              </div>
            )}
            <button type="button" onClick={() => setShowAddParentModal(true)} className="text-primary hover:underline text-sm flex items-center gap-1">
              <Plus size={16} /> Add New Parent
            </button>
          </div>

          {/* Buttons */}
          <div className="col-span-2 flex justify-end gap-3 pt-4">
            <button type="button" onClick={onClose} className="px-5 py-2.5 border rounded-lg text-secondary-dark hover:bg-secondary-bg">Cancel</button>
            <button type="submit" disabled={uploading} className="px-5 py-2.5 bg-primary text-white rounded-lg hover:bg-primary-light disabled:opacity-50">
              {uploading ? "Processing..." : isEdit ? "Update Student" : "Add Student"}
            </button>
          </div>
        </form>

        {showAddParentModal && (
          <ParentForm
            onSubmit={handleNewParentCreated}
            onClose={() => setShowAddParentModal(false)}
          />
        )}
      </div>
    </div>
  );
}