// src/components/StudentForm.jsx
import { useState, useEffect } from "react";
import {
  X, User, Phone, Mail, MapPin, School, Calendar, Hash, Upload,
  Plus, Search, Lock, Layers, BookOpen, IndianRupee,
  FileSearch, Unlink2, Link2
} from "lucide-react";
import toast from "react-hot-toast";
import { supabase } from "../api/supabase";
import { useOrgDarkLogo } from "../hooks/useOrgDarkLogo";
import ParentForm from "./ParentForm";
import { useOrg } from "../context/OrganizationContext";
import { useTheme } from "../context/ThemeContext";

export default function StudentForm({
  onSuccess,
  onClose,
  initialData = {},
  inquiryId = null,
}) {
  const isEdit = !!initialData.id;
  const darkLogo = useOrgDarkLogo();
  const { org, branch, selectedFinancialYear } = useOrg();
  const theme = useTheme();
  const orgName = org?.company_name || "Academy";
  const branchId = branch?.id;
  const financialYearId = selectedFinancialYear?.id;
  const orgId = org?.id;

  const headingFont = theme?.font_heading || "Righteous";
  const bodyFont = theme?.font_body || "Montserrat";

  // ─────────── Inquiry Loading ───────────
  const [inquiries, setInquiries] = useState([]);
  const [selectedInquiryId, setSelectedInquiryId] = useState(inquiryId || null);
  const [useInquiry, setUseInquiry] = useState(!!inquiryId);

  useEffect(() => {
    if (!branchId || !financialYearId || inquiryId) return;
    supabase
      .from("inquiries")
      .select("id, student_name, mobile, email, medium_id, interested_course_id, parent_name")
      .in("status", ["Interested", "Demo Scheduled"])
      .eq("branch_id", branchId)
      .eq("financial_year_id", financialYearId)
      .order("created_at", { ascending: false })
      .then(({ data }) => setInquiries(data || []));
  }, [branchId, financialYearId, inquiryId]);

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
      _inquiryParentName: inq.parent_name || "",
      _inquiryMobile: inq.mobile || "",
    }));
  }, [selectedInquiryId, useInquiry, inquiries]);

  useEffect(() => {
    if (!inquiryId || !branchId || !financialYearId) return;
    async function loadInquiry() {
      const { data } = await supabase
        .from("inquiries")
        .select("*")
        .eq("id", inquiryId)
        .eq("branch_id", branchId)
        .eq("financial_year_id", financialYearId)
        .single();
      if (data) {
        setUseInquiry(true);
        setSelectedInquiryId(inquiryId);
        setForm((prev) => ({
          ...prev,
          first_name: data.student_name || "",
          mobile: data.mobile || "",
          email: data.email || "",
          medium_id: data.medium_id || "",
          _inquiryParentName: data.parent_name || "",
          _inquiryMobile: data.mobile || "",
        }));
      }
    }
    loadInquiry();
  }, [inquiryId, branchId, financialYearId]);

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
    _inquiryParentName: "",
    _inquiryMobile: "",
  });

  // Password for auto‑created accounts (hidden from UI)
  const studentPassword = "Student@123";

  // ─────────── Dropdowns ───────────
  const [mediums, setMediums] = useState([]);
  const [batches, setBatches] = useState([]);
  const [feeStructures, setFeeStructures] = useState([]);
  const [existingUsers, setExistingUsers] = useState([]);

  useEffect(() => {
    if (!branchId || !financialYearId || !orgId) return;
    Promise.all([
      supabase.from("mediums").select("id, name").order("name"),
      supabase
        .from("batches")
        .select("id, batch_name")
        .eq("status", "active")
        .eq("branch_id", branchId)
        .eq("financial_year_id", financialYearId)
        .order("batch_name"),
      supabase
        .from("fee_structures")
        .select("id, course_id, fee_amount, tax_rate_id, tax_inclusive, courses(course_name), tax_rates(rate)")
        .eq("branch_id", branchId)
        .eq("financial_year_id", financialYearId)
        .order("id"),
      supabase
        .from("profiles")
        .select("id, email, full_name, role")
        .eq("organization_id", orgId)
        .eq("role", "student")
        .order("email"),
    ]).then(([m, b, f, p]) => {
      setMediums(m.data || []);
      setBatches(b.data || []);
      setFeeStructures(f.data || []);
      setExistingUsers(p.data || []);
    });
  }, [branchId, financialYearId, orgId]);

  // ─────────── Parents ───────────
  const [allParents, setAllParents] = useState([]);
  const [linkedParents, setLinkedParents] = useState([]);
  const [parentSearch, setParentSearch] = useState("");
  const [showAddParentModal, setShowAddParentModal] = useState(false);

  useEffect(() => {
    if (!branchId || !financialYearId) return;
    supabase
      .from("parents")
      .select("*")
      .eq("branch_id", branchId)
      .eq("financial_year_id", financialYearId)
      .order("father_name")
      .then(({ data }) => setAllParents(data || []));
  }, [branchId, financialYearId]);

  useEffect(() => {
    if (isEdit && initialData.id && branchId && financialYearId) {
      supabase
        .from("student_parents")
        .select("parent_id, parents(*)")
        .eq("student_id", initialData.id)
        .eq("branch_id", branchId)
        .eq("financial_year_id", financialYearId)
        .then(({ data }) => {
          if (data) setLinkedParents(data.map((item) => item.parents).filter(Boolean));
        });
    }
  }, [isEdit, initialData.id, branchId, financialYearId]);

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

  // ─────────── Linked Account (edit mode display) ───────────
  const [linkedUser, setLinkedUser] = useState(null);
  const [existingUserId, setExistingUserId] = useState("");

  useEffect(() => {
    if (isEdit && initialData?.user_id) {
      supabase
        .from("user_emails")
        .select("email")
        .eq("id", initialData.user_id)
        .single()
        .then(({ data }) => {
          setLinkedUser({ id: initialData.user_id, email: data?.email || null });
        })
        .catch(() => setLinkedUser({ id: initialData.user_id, email: null }));
    }
  }, [isEdit, initialData?.user_id]);

  // ─────────── Photo, Tax Preview ───────────
  const [photoFile, setPhotoFile] = useState(null);
  const [taxPreview, setTaxPreview] = useState(null);
  useEffect(() => {
    if (!form.fee_structure_id) return setTaxPreview(null);
    const struct = feeStructures.find((fs) => fs.id == form.fee_structure_id);
    if (!struct) return;
    const finalFee = struct.fee_amount;
    const rate = struct.tax_rates?.rate ? struct.tax_rates.rate / 100 : 0;
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
    if (!branchId || !financialYearId) {
      toast.error("Branch and financial year not loaded. Please refresh.");
      return;
    }

    setUploading(true);
    try {
      let authUserId = linkedUser?.id || null;   // keep existing link if editing

      // --- Auto‑create user for NEW students with email ---
      if (!isEdit && form.email && !authUserId) {
        // If email already exists in profiles, just use that ID
        const { data: existingProfile } = await supabase
          .from("profiles")
          .select("id")
          .eq("email", form.email)
          .maybeSingle();

        if (existingProfile) {
          authUserId = existingProfile.id;
        } else {
          // Create brand new auth user via Edge Function
          const response = await fetch(
            `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/create-student-user`,
            {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`,
              },
              body: JSON.stringify({
                email: form.email,
                password: studentPassword,
                fullName: `${form.first_name} ${form.last_name}`.trim(),
                organization_id: orgId,
                branch_id: branchId,
                financial_year_id: financialYearId,
              }),
            }
          );
          const result = await response.json();
          if (!response.ok) {
            throw new Error(result.error || "Failed to create user account");
          }
          authUserId = result.userId;
          toast.success("Login account created");
        }
      }

      // --- If admin chose to link an existing user (edit mode) ---
      if (existingUserId) {
        authUserId = existingUserId;
        await supabase.from("profiles").update({ role: "student", is_active: true }).eq("id", existingUserId);
      }

      // --- Upload photo ---
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

      // --- Prepare student payload ---
      const { batch_id, fee_structure_id, _inquiryParentName, _inquiryMobile, ...studentData } = form;

      const studentPayload = {
        ...studentData,
        photo_url: photoUrl,
        user_id: authUserId,
        linked_email: form.email || null,
        branch_id: branchId,
        financial_year_id: financialYearId,
      };

      if (!isEdit && !studentPayload.admission_no) {
        delete studentPayload.admission_no;
      }

      // --- Insert / Update student ---
      let studentId = initialData.id;
      if (isEdit) {
        let updateQuery = supabase
          .from("students")
          .update(studentPayload)
          .eq("id", studentId);
        if (branchId) updateQuery = updateQuery.eq("branch_id", branchId);
        if (financialYearId) updateQuery = updateQuery.eq("financial_year_id", financialYearId);
        const { error } = await updateQuery;
        if (error) throw error;
      } else {
        const { data: newStudent, error } = await supabase
          .from("students")
          .insert(studentPayload)
          .select("id, admission_no")
          .single();
        if (error) throw error;
        studentId = newStudent.id;
      }

      // ── Parent linking ──
      if (selectedInquiryId && useInquiry && linkedParents.length === 0) {
        const parentPayload = {
          father_name: form._inquiryParentName || "N/A",
          mother_name: "",
          mobile: form._inquiryMobile || form.mobile,
          whatsapp: form.mobile,
          email: form.email || "",
          address: form.address || "",
          branch_id: branchId,
          financial_year_id: financialYearId,
        };

        let checkQuery = supabase
          .from("parents")
          .select("id")
          .eq("mobile", parentPayload.mobile);
        if (branchId) checkQuery = checkQuery.eq("branch_id", branchId);
        if (financialYearId) checkQuery = checkQuery.eq("financial_year_id", financialYearId);
        const { data: existingParent } = await checkQuery.maybeSingle();

        let parentId;
        if (existingParent) {
          parentId = existingParent.id;
        } else {
          const { data: newParent, error: parentError } = await supabase
            .from("parents")
            .insert(parentPayload)
            .select("id")
            .single();
          if (parentError) throw parentError;
          parentId = newParent.id;
        }

        if (parentId) {
          const { error: linkError } = await supabase
            .from("student_parents")
            .insert({
              student_id: studentId,
              parent_id: parentId,
              relation: "Parent",
              branch_id: branchId,
              financial_year_id: financialYearId,
            });
          if (linkError) throw linkError;
        }
      }

      if (isEdit) {
        let deleteQuery = supabase
          .from("student_parents")
          .delete()
          .eq("student_id", studentId);
        if (branchId) deleteQuery = deleteQuery.eq("branch_id", branchId);
        if (financialYearId) deleteQuery = deleteQuery.eq("financial_year_id", financialYearId);
        await deleteQuery;
      }
      if (linkedParents.length > 0) {
        const parentLinks = linkedParents.map((p) => ({
          student_id: studentId,
          parent_id: p.id,
          relation: "Parent",
          branch_id: branchId,
          financial_year_id: financialYearId,
        }));
        const { error: linkError } = await supabase.from("student_parents").insert(parentLinks);
        if (linkError) throw linkError;
      }

      if (batch_id) {
        if (isEdit) {
          let deactivateQuery = supabase
            .from("student_batches")
            .update({ status: "inactive" })
            .eq("student_id", studentId)
            .eq("status", "active");
          if (branchId) deactivateQuery = deactivateQuery.eq("branch_id", branchId);
          if (financialYearId) deactivateQuery = deactivateQuery.eq("financial_year_id", financialYearId);
          await deactivateQuery;
        }
        const { error: batchError } = await supabase.from("student_batches").insert({
          student_id: studentId,
          batch_id: batch_id,
          status: "active",
          branch_id: branchId,
          financial_year_id: financialYearId,
        });
        if (batchError) throw batchError;
      }

      if (fee_structure_id) {
        const feeStruct = feeStructures.find((fs) => fs.id == fee_structure_id);
        if (feeStruct) {
          const { data: studentFee, error: feeError } = await supabase
            .from("student_fees")
            .insert({
              student_id: studentId,
              fee_structure_id: fee_structure_id,
              total_fee: feeStruct.fee_amount,
              final_fee: feeStruct.fee_amount,
              status: "Pending",
              branch_id: branchId,
              financial_year_id: financialYearId,
            })
            .select("id")
            .single();
          if (feeError) throw feeError;

          const { data: feeComponents, error: compFetchError } = await supabase
            .from("fee_structure_components")
            .select("*, tax_rates(rate)")
            .eq("fee_structure_id", fee_structure_id)
            .eq("branch_id", branchId)
            .eq("financial_year_id", financialYearId)
            .order("sort_order");
          if (compFetchError) throw compFetchError;

          if (feeComponents && feeComponents.length > 0) {
            const studentFeeComponents = feeComponents.map((comp) => {
              const rate = comp.tax_rates?.rate ? comp.tax_rates.rate / 100 : 0;
              const baseAmount = Number(comp.amount);
              const totalAmount = comp.tax_inclusive ? baseAmount : baseAmount * (1 + rate);
              return {
                student_fee_id: studentFee.id,
                fee_structure_component_id: comp.id,
                due_amount: totalAmount,
                paid_amount: 0,
                branch_id: branchId,
                financial_year_id: financialYearId,
              };
            });
            const { error: compInsertError } = await supabase
              .from("student_fee_components")
              .insert(studentFeeComponents);
            if (compInsertError) throw compInsertError;
          }
        }
      }

      if (selectedInquiryId && useInquiry) {
        let updateInquiryQuery = supabase
          .from("inquiries")
          .update({ status: "Admitted" })
          .eq("id", selectedInquiryId);
        if (branchId) updateInquiryQuery = updateInquiryQuery.eq("branch_id", branchId);
        if (financialYearId) updateInquiryQuery = updateInquiryQuery.eq("financial_year_id", financialYearId);
        const { error: inquiryError } = await updateInquiryQuery;
        if (inquiryError) throw inquiryError;
      }

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

  // ─────────── RENDER ───────────
  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl w-full max-w-4xl max-h-[90vh] overflow-y-auto shadow-xl border border-primary-bg">
        <div className="sticky top-0 bg-white border-b border-primary-bg px-6 py-4 flex items-center justify-between rounded-t-xl z-10">
          <div className="flex items-center gap-3">
            <img src={darkLogo} alt={orgName} className="h-10 w-auto" />
            <h2 className="text-xl font-bold text-primary" style={{ fontFamily: headingFont }}>
              {isEdit ? "Edit Student" : "Add New Student"}
            </h2>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-primary-bg rounded-lg"><X size={20} className="text-primary-dark" /></button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 grid grid-cols-1 md:grid-cols-2 gap-5">
          {/* Inquiry Section */}
          {!isEdit && !inquiryId && (
            <div className="col-span-2 border-b border-primary-bg pb-4">
              <label className="block text-sm text-primary-dark mb-2" style={{ fontFamily: bodyFont }}>
                <FileSearch size={14} className="inline mr-1" />
                Convert from Inquiry? (Optional)
              </label>
              <div className="flex items-center gap-4">
                <label className="flex items-center gap-2 text-sm text-primary-dark" style={{ fontFamily: bodyFont }}>
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
                    className="border border-primary-bg rounded p-2.5 text-sm bg-white text-primary-dark flex-1 focus:ring-1 focus:ring-primary"
                    style={{ fontFamily: bodyFont }}
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
              <label className="block text-sm text-primary-dark mb-1" style={{ fontFamily: bodyFont }}><Hash size={14} className="inline mr-1" /> Admission No</label>
              {isEdit ? (
                <input
                  name="admission_no"
                  value={form.admission_no}
                  onChange={handleChange}
                  className="w-full border border-primary-bg rounded p-2.5 focus:ring-1 focus:ring-primary outline-none bg-white text-primary-dark"
                  style={{ fontFamily: bodyFont }}
                />
              ) : (
                <input
                  type="text"
                  value="Auto‑assigned on save"
                  readOnly
                  className="w-full border border-primary-bg rounded p-2.5 bg-primary-bg text-primary-dark/60 cursor-not-allowed"
                  style={{ fontFamily: bodyFont }}
                />
              )}
            </div>
            <div className="md:col-span-2">
              <label className="block text-sm text-primary-dark mb-1" style={{ fontFamily: bodyFont }}><Upload size={14} className="inline mr-1" /> Photo</label>
              <input
                type="file"
                accept="image/*"
                onChange={(e) => setPhotoFile(e.target.files[0])}
                className="w-full text-sm file:mr-4 file:py-2 file:px-4 file:rounded file:border-0 file:bg-primary file:text-white"
                style={{ fontFamily: bodyFont }}
              />
            </div>
          </div>

          {/* Personal Details */}
          <div>
            <label className="block text-sm text-primary-dark mb-1" style={{ fontFamily: bodyFont }}><User size={14} className="inline mr-1" /> First Name *</label>
            <input name="first_name" value={form.first_name} onChange={handleChange} required className="w-full border border-primary-bg rounded p-2.5 focus:ring-1 focus:ring-primary outline-none bg-white text-primary-dark" style={{ fontFamily: bodyFont }} />
          </div>
          <div>
            <label className="block text-sm text-primary-dark mb-1" style={{ fontFamily: bodyFont }}>Last Name</label>
            <input name="last_name" value={form.last_name} onChange={handleChange} className="w-full border border-primary-bg rounded p-2.5 bg-white text-primary-dark focus:ring-1 focus:ring-primary" style={{ fontFamily: bodyFont }} />
          </div>
          <div>
            <label className="block text-sm text-primary-dark mb-1" style={{ fontFamily: bodyFont }}>Gender</label>
            <select name="gender" value={form.gender} onChange={handleChange} className="w-full border border-primary-bg rounded p-2.5 bg-white text-primary-dark focus:ring-1 focus:ring-primary" style={{ fontFamily: bodyFont }}>
              <option value="">Select</option>
              <option>Male</option>
              <option>Female</option>
              <option>Other</option>
            </select>
          </div>
          <div>
            <label className="block text-sm text-primary-dark mb-1" style={{ fontFamily: bodyFont }}><Calendar size={14} className="inline mr-1" /> Date of Birth</label>
            <input type="date" name="dob" value={form.dob} onChange={handleChange} className="w-full border border-primary-bg rounded p-2.5 bg-white text-primary-dark focus:ring-1 focus:ring-primary" />
          </div>
          <div>
            <label className="block text-sm text-primary-dark mb-1" style={{ fontFamily: bodyFont }}><Phone size={14} className="inline mr-1" /> Mobile *</label>
            <input name="mobile" value={form.mobile} onChange={handleChange} required className="w-full border border-primary-bg rounded p-2.5 bg-white text-primary-dark focus:ring-1 focus:ring-primary" style={{ fontFamily: bodyFont }} />
          </div>
          <div>
            <label className="block text-sm text-primary-dark mb-1" style={{ fontFamily: bodyFont }}>WhatsApp</label>
            <input name="whatsapp" value={form.whatsapp} onChange={handleChange} className="w-full border border-primary-bg rounded p-2.5 bg-white text-primary-dark focus:ring-1 focus:ring-primary" style={{ fontFamily: bodyFont }} />
          </div>
          <div>
            <label className="block text-sm text-primary-dark mb-1" style={{ fontFamily: bodyFont }}><Mail size={14} className="inline mr-1" /> Email</label>
            <input type="email" name="email" value={form.email} onChange={handleChange} className="w-full border border-primary-bg rounded p-2.5 bg-white text-primary-dark focus:ring-1 focus:ring-primary" style={{ fontFamily: bodyFont }} />
          </div>
          <div>
            <label className="block text-sm text-primary-dark mb-1" style={{ fontFamily: bodyFont }}><Layers size={14} className="inline mr-1" /> Medium</label>
            <select name="medium_id" value={form.medium_id} onChange={handleChange} className="w-full border border-primary-bg rounded p-2.5 bg-white text-primary-dark focus:ring-1 focus:ring-primary" style={{ fontFamily: bodyFont }}>
              <option value="">Select</option>
              {mediums.map((m) => (<option key={m.id} value={m.id}>{m.name}</option>))}
            </select>
          </div>

          {/* Address */}
          <div className="col-span-2">
            <label className="block text-sm text-primary-dark mb-1" style={{ fontFamily: bodyFont }}><MapPin size={14} className="inline mr-1" /> Address</label>
            <textarea name="address" value={form.address} onChange={handleChange} rows={2} className="w-full border border-primary-bg rounded p-2.5 bg-white text-primary-dark focus:ring-1 focus:ring-primary resize-none" style={{ fontFamily: bodyFont }} />
          </div>
          <div>
            <label className="block text-sm text-primary-dark mb-1" style={{ fontFamily: bodyFont }}>City</label>
            <input name="city" value={form.city} onChange={handleChange} className="w-full border border-primary-bg rounded p-2.5 bg-white text-primary-dark focus:ring-1 focus:ring-primary" style={{ fontFamily: bodyFont }} />
          </div>
          <div>
            <label className="block text-sm text-primary-dark mb-1" style={{ fontFamily: bodyFont }}>State</label>
            <input name="state" value={form.state} onChange={handleChange} className="w-full border border-primary-bg rounded p-2.5 bg-white text-primary-dark focus:ring-1 focus:ring-primary" style={{ fontFamily: bodyFont }} />
          </div>
          <div>
            <label className="block text-sm text-primary-dark mb-1" style={{ fontFamily: bodyFont }}>Pincode</label>
            <input name="pincode" value={form.pincode} onChange={handleChange} className="w-full border border-primary-bg rounded p-2.5 bg-white text-primary-dark focus:ring-1 focus:ring-primary" style={{ fontFamily: bodyFont }} />
          </div>

          {/* School details */}
          <div>
            <label className="block text-sm text-primary-dark mb-1" style={{ fontFamily: bodyFont }}><School size={14} className="inline mr-1" /> School Name</label>
            <input name="school_name" value={form.school_name} onChange={handleChange} className="w-full border border-primary-bg rounded p-2.5 bg-white text-primary-dark focus:ring-1 focus:ring-primary" style={{ fontFamily: bodyFont }} />
          </div>
          <div>
            <label className="block text-sm text-primary-dark mb-1" style={{ fontFamily: bodyFont }}>Board</label>
            <input name="board" value={form.board} onChange={handleChange} className="w-full border border-primary-bg rounded p-2.5 bg-white text-primary-dark focus:ring-1 focus:ring-primary" placeholder="GSEB, CBSE..." style={{ fontFamily: bodyFont }} />
          </div>
          <div>
            <label className="block text-sm text-primary-dark mb-1" style={{ fontFamily: bodyFont }}>Standard</label>
            <input name="standard" value={form.standard} onChange={handleChange} className="w-full border border-primary-bg rounded p-2.5 bg-white text-primary-dark focus:ring-1 focus:ring-primary" style={{ fontFamily: bodyFont }} />
          </div>
          <div>
            <label className="block text-sm text-primary-dark mb-1" style={{ fontFamily: bodyFont }}>Joining Date</label>
            <input type="date" name="joining_date" value={form.joining_date} onChange={handleChange} className="w-full border border-primary-bg rounded p-2.5 bg-white text-primary-dark focus:ring-1 focus:ring-primary" />
          </div>
          <div>
            <label className="block text-sm text-primary-dark mb-1" style={{ fontFamily: bodyFont }}>Status</label>
            <select name="status" value={form.status} onChange={handleChange} className="w-full border border-primary-bg rounded p-2.5 bg-white text-primary-dark focus:ring-1 focus:ring-primary" style={{ fontFamily: bodyFont }}>
              <option value="active">Active</option>
              <option value="inactive">Inactive</option>
              <option value="graduated">Graduated</option>
            </select>
          </div>

          {/* Batch & Fee Assignment */}
          <div className="col-span-2 border-t border-primary-bg pt-4">
            <h3 className="text-lg font-bold text-primary mb-3" style={{ fontFamily: headingFont }}><BookOpen size={18} className="inline mr-2" /> Academic & Fee Assignment</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm text-primary-dark mb-1" style={{ fontFamily: bodyFont }}>Assign Batch</label>
                <select name="batch_id" value={form.batch_id} onChange={handleChange} className="w-full border border-primary-bg rounded p-2.5 bg-white text-primary-dark focus:ring-1 focus:ring-primary" style={{ fontFamily: bodyFont }}>
                  <option value="">Select Batch</option>
                  {batches.map((b) => (<option key={b.id} value={b.id}>{b.batch_name}</option>))}
                </select>
              </div>
              <div>
                <label className="block text-sm text-primary-dark mb-1" style={{ fontFamily: bodyFont }}>Assign Fee Structure</label>
                <select name="fee_structure_id" value={form.fee_structure_id} onChange={handleChange} className="w-full border border-primary-bg rounded p-2.5 bg-white text-primary-dark focus:ring-1 focus:ring-primary" style={{ fontFamily: bodyFont }}>
                  <option value="">Select Fee Structure</option>
                  {feeStructures.map((fs) => (<option key={fs.id} value={fs.id}>{fs.courses?.course_name || "N/A"} – ₹{fs.fee_amount}</option>))}
                </select>
                {taxPreview && (
                  <div className="mt-2 text-xs bg-primary-bg p-2 rounded text-primary-dark" style={{ fontFamily: bodyFont }}>
                    Base: ₹{taxPreview.base.toFixed(2)} | Tax: ₹{taxPreview.tax.toFixed(2)} | Total: ₹{taxPreview.total.toFixed(2)}
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* GST Section */}
          <div className="col-span-2 border-t border-primary-bg pt-4">
            <h3 className="text-lg font-bold text-primary mb-3" style={{ fontFamily: headingFont }}><IndianRupee size={18} className="inline mr-2" /> GST Information</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div><label className="block text-sm text-primary-dark mb-1" style={{ fontFamily: bodyFont }}>GSTIN</label><input name="gstin" value={form.gstin} onChange={handleChange} maxLength={15} className="w-full border border-primary-bg rounded p-2.5 bg-white text-primary-dark focus:ring-1 focus:ring-primary uppercase" style={{ fontFamily: bodyFont }} /></div>
              <div><label className="block text-sm text-primary-dark mb-1" style={{ fontFamily: bodyFont }}>Legal Business Name</label><input name="legal_business_name" value={form.legal_business_name} onChange={handleChange} className="w-full border border-primary-bg rounded p-2.5 bg-white text-primary-dark focus:ring-1 focus:ring-primary" style={{ fontFamily: bodyFont }} /></div>
              <div><label className="block text-sm text-primary-dark mb-1" style={{ fontFamily: bodyFont }}>Trade Name</label><input name="trade_name" value={form.trade_name} onChange={handleChange} className="w-full border border-primary-bg rounded p-2.5 bg-white text-primary-dark focus:ring-1 focus:ring-primary" style={{ fontFamily: bodyFont }} /></div>
              <div><label className="block text-sm text-primary-dark mb-1" style={{ fontFamily: bodyFont }}>State Code</label><input name="state_code" value={form.state_code} onChange={handleChange} maxLength={2} className="w-full border border-primary-bg rounded p-2.5 bg-white text-primary-dark focus:ring-1 focus:ring-primary" style={{ fontFamily: bodyFont }} /></div>
              <div><label className="block text-sm text-primary-dark mb-1" style={{ fontFamily: bodyFont }}>Place of Supply</label><input name="place_of_supply" value={form.place_of_supply} onChange={handleChange} maxLength={2} className="w-full border border-primary-bg rounded p-2.5 bg-white text-primary-dark focus:ring-1 focus:ring-primary" style={{ fontFamily: bodyFont }} /></div>
              <div><label className="block text-sm text-primary-dark mb-1" style={{ fontFamily: bodyFont }}>Registration Type</label><select name="registration_type" value={form.registration_type} onChange={handleChange} className="w-full border border-primary-bg rounded p-2.5 bg-white text-primary-dark focus:ring-1 focus:ring-primary" style={{ fontFamily: bodyFont }}><option value="">Select</option><option>Regular</option><option>Composition</option><option>Unregistered</option></select></div>
              <div className="col-span-2"><label className="block text-sm text-primary-dark mb-1" style={{ fontFamily: bodyFont }}>Billing Address</label><input name="billing_address" value={form.billing_address} onChange={handleChange} className="w-full border border-primary-bg rounded p-2.5 bg-white text-primary-dark focus:ring-1 focus:ring-primary" style={{ fontFamily: bodyFont }} /></div>
            </div>
          </div>

          {/* Login Account (auto‑create for new, display for edit) */}
          <div className="col-span-2 border-t border-primary-bg pt-4">
            <h3 className="text-lg font-bold text-primary mb-3" style={{ fontFamily: headingFont }}>
              <Lock size={18} className="inline mr-2" /> Student Login Account
            </h3>

            {isEdit ? (
              linkedUser ? (
                <div className="flex items-center justify-between bg-primary-bg p-3 rounded-lg">
                  <div>
                    <p className="text-sm font-medium text-primary-dark">
                      <Mail size={14} className="inline mr-1" />
                      Linked to: {linkedUser.email || "Unknown"}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        setLinkedUser(null);
                        setExistingUserId("");
                      }}
                      className="text-accent hover:text-accent-dark text-sm flex items-center gap-1"
                    >
                      <Unlink2 size={14} /> Unlink
                    </button>
                  </div>
                </div>
              ) : (
                <div>
                  <p className="text-sm text-primary-dark/70 mb-2" style={{ fontFamily: bodyFont }}>
                    Not linked. You can link an existing user or leave blank.
                  </p>
                  <div className="flex items-center gap-3">
                    <select
                      value={existingUserId}
                      onChange={(e) => setExistingUserId(e.target.value)}
                      className="border border-primary-bg rounded p-2.5 bg-white text-primary-dark flex-1 focus:ring-1 focus:ring-primary"
                      style={{ fontFamily: bodyFont }}
                    >
                      <option value="">-- Link existing user --</option>
                      {existingUsers.map((u) => (
                        <option key={u.id} value={u.id}>{u.full_name || u.email} ({u.email})</option>
                      ))}
                    </select>
                    <button
                      type="button"
                      onClick={() => {
                        if (existingUserId) {
                          setLinkedUser({ id: existingUserId, email: existingUsers.find(u => u.id === existingUserId)?.email || "Selected user" });
                        }
                      }}
                      className="bg-primary text-white px-4 py-2 rounded text-sm"
                    >
                      Link
                    </button>
                  </div>
                </div>
              )
            ) : (
              <p className="text-sm text-primary-dark/70" style={{ fontFamily: bodyFont }}>
                {form.email
                  ? "A login account will be automatically created with this email."
                  : "Enter an email to automatically create a student login account."}
              </p>
            )}
          </div>

          {/* Parents Section */}
          <div className="col-span-2 border-t border-primary-bg pt-4">
            <h3 className="text-lg font-bold text-primary mb-3" style={{ fontFamily: headingFont }}><User size={18} className="inline mr-2" /> Parents / Guardians</h3>
            <div className="flex flex-wrap gap-2 mb-3">
              {linkedParents.map((p) => (
                <span key={p.id} className="inline-flex items-center gap-2 bg-primary-bg text-primary px-3 py-1.5 rounded-full text-sm" style={{ fontFamily: bodyFont }}>
                  {p?.father_name || p?.mother_name || p?.mobile || "Unknown"}
                  <button type="button" onClick={() => removeLinkedParent(p.id)} className="text-accent-dark hover:text-accent"><X size={14} /></button>
                </span>
              ))}
            </div>
            <div className="relative mb-3">
              <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-primary-dark/60" />
              <input type="text" placeholder="Search parent..." value={parentSearch} onChange={(e) => setParentSearch(e.target.value)} className="w-full pl-10 pr-4 py-2.5 border border-primary-bg rounded text-sm bg-white text-primary-dark placeholder-primary-dark/40" style={{ fontFamily: bodyFont }} />
            </div>
            {parentSearch && (
              <div className="max-h-32 overflow-y-auto border border-primary-bg rounded mb-3">
                {filteredParents.slice(0, 5).map((p) => (
                  <div key={p.id} className="px-4 py-2 text-sm hover:bg-primary-bg cursor-pointer flex justify-between text-primary-dark" onClick={() => addExistingParent(p)} style={{ fontFamily: bodyFont }}>
                    <span>{p.father_name || p.mother_name} – {p.mobile}</span>
                    <Plus size={16} className="text-primary" />
                  </div>
                ))}
              </div>
            )}
            <button type="button" onClick={() => setShowAddParentModal(true)} className="text-primary hover:underline text-sm flex items-center gap-1" style={{ fontFamily: bodyFont }}><Plus size={16} /> Add New Parent</button>
          </div>

          {/* Buttons */}
          <div className="col-span-2 flex justify-end gap-3 pt-4">
            <button type="button" onClick={onClose} className="px-5 py-2.5 border border-primary-bg rounded-lg text-primary-dark hover:bg-primary-bg transition-colors" style={{ fontFamily: bodyFont }}>Cancel</button>
            <button type="submit" disabled={uploading} className="px-5 py-2.5 bg-primary hover:bg-primary-light text-white rounded-lg font-medium transition disabled:opacity-50" style={{ fontFamily: bodyFont }}>
              {uploading ? "Processing..." : isEdit ? "Update Student" : "Add Student"}
            </button>
          </div>
        </form>

        {showAddParentModal && (
          <ParentForm onSubmit={handleNewParentCreated} onClose={() => setShowAddParentModal(false)} />
        )}
      </div>
    </div>
  );
}