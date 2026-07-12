// src/pages/TeacherProfile.jsx
import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import toast from "react-hot-toast";
import {
  User,
  Mail,
  Phone,
  Briefcase,
  Calendar,
  Edit3,
  Save,
  X,
  Clock,
  Layers,
  FileText,
} from "lucide-react";
import AdminLayout from "../layouts/AdminLayout";
import BackButton from "../components/BackButton";

import { useAuth } from "../context/AuthContext";
import { supabase } from "../api/supabase";
import { useOrg } from "../context/OrganizationContext";   // NEW

export default function TeacherProfile() {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  // ── Branch & financial year context ──
  const { branch, selectedFinancialYear } = useOrg();   // NEW
  const branchId = branch?.id;
  const financialYearId = selectedFinancialYear?.id;

  // ---- Fetch teacher data (scoped) ----
  const { data: teacher, isLoading, error } = useQuery({
    queryKey: ["teacher-profile", user?.id, branchId, financialYearId],
    queryFn: async () => {
      if (!user?.id || !branchId || !financialYearId) return null;
      const { data, error } = await supabase
        .from("teachers")
        .select("*")
        .eq("user_id", user.id)
        .eq("branch_id", branchId)
        .eq("financial_year_id", financialYearId)
        .single();
      if (error) throw error;
      return data;
    },
    enabled: !!user?.id && !!branchId && !!financialYearId,
  });

  // ---- Fetch assigned batches with medium (scoped) ----
  const { data: batches = [] } = useQuery({
    queryKey: ["teacher-batches", teacher?.id, branchId, financialYearId],
    queryFn: async () => {
      if (!teacher?.id || !branchId || !financialYearId) return [];
      const { data } = await supabase
        .from("batch_teachers")
        .select(`
          batch_id,
          batches (
            batch_name,
            start_time,
            end_time,
            days,
            medium_id,
            mediums ( name ),
            courses ( course_name )
          )
        `)
        .eq("teacher_id", teacher.id)
        .eq("branch_id", branchId)
        .eq("financial_year_id", financialYearId)
        .eq("batches.branch_id", branchId)           // scope the nested batches
        .eq("batches.financial_year_id", financialYearId);
      return data || [];
    },
    enabled: !!teacher?.id && !!branchId && !!financialYearId,
  });

  // ---- Profile update state ----
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState({
    first_name: "",
    last_name: "",
    mobile: "",
    email: "",
    qualification: "",
  });

  // ---- Leave request modal state ----
  const [showLeaveModal, setShowLeaveModal] = useState(false);
  const [leaveForm, setLeaveForm] = useState({
    start_date: "",
    end_date: "",
    reason: "",
  });

  // Set form when teacher data loads
  useEffect(() => {
    if (teacher) {
      setForm({
        first_name: teacher.first_name || "",
        last_name: teacher.last_name || "",
        mobile: teacher.mobile || "",
        email: teacher.email || "",
        qualification: teacher.qualification || "",
      });
    }
  }, [teacher]);

  // ---- Update profile mutation (already includes branch & FY) ----
  const updateMutation = useMutation({
    mutationFn: async (payload) => {
      const { error } = await supabase
        .from("teachers")
        .update({
          ...payload,
          branch_id: branchId,
          financial_year_id: financialYearId,
        })
        .eq("id", teacher.id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Profile updated");
      queryClient.invalidateQueries({ queryKey: ["teacher-profile", user?.id] });
      setEditing(false);
    },
    onError: (err) => toast.error(err.message || "Update failed"),
  });

  // ---- Leave request mutation (already includes branch & FY) ----
  const leaveMutation = useMutation({
    mutationFn: async (payload) => {
      const { error } = await supabase.from("leaves").insert({
        teacher_id: teacher.id,
        start_date: payload.start_date,
        end_date: payload.end_date,
        reason: payload.reason,
        status: "Pending",
        branch_id: branchId,
        financial_year_id: financialYearId,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Leave request submitted");
      setShowLeaveModal(false);
      setLeaveForm({ start_date: "", end_date: "", reason: "" });
    },
    onError: (err) => toast.error(err.message || "Leave request failed"),
  });

  // ---- Handlers ----
  function handleEditToggle() {
    if (editing) {
      setEditing(false);
      setForm({
        first_name: teacher.first_name || "",
        last_name: teacher.last_name || "",
        mobile: teacher.mobile || "",
        email: teacher.email || "",
        qualification: teacher.qualification || "",
      });
    } else {
      setEditing(true);
    }
  }

  async function handleSave(e) {
    e.preventDefault();
    if (!form.first_name || !form.mobile) {
      toast.error("Name and mobile are required");
      return;
    }
    updateMutation.mutate(form);
  }

  function handleLeaveSubmit(e) {
    e.preventDefault();
    if (!leaveForm.start_date || !leaveForm.end_date) {
      toast.error("Start and end dates are required");
      return;
    }
    leaveMutation.mutate(leaveForm);
  }

  if (isLoading) {
    return (
      <AdminLayout>
      <BackButton to="/teacher" label="My Dashboard" />
        <div className="p-8 text-center text-secondary font-montserrat">Loading profile…</div>
      </AdminLayout>
    );
  }

  if (error || !teacher) {
    return (
      <AdminLayout>
        <div className="p-8 text-center text-red-500">No teacher record found.</div>
      </AdminLayout>
    );
  }

  return (
    <AdminLayout>
      <div className="mb-6">
        <h1 className="text-3xl font-righteous text-primary-dark">My Profile</h1>
        <p className="text-sm text-secondary-dark font-montserrat mt-1">Manage your personal details</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Personal Information Card */}
        <div className="bg-white rounded-xl p-6 shadow-sm border border-secondary-light lg:col-span-2">
          <div className="flex justify-between items-center mb-6">
            <h2 className="text-xl font-righteous text-primary-dark flex items-center gap-2">
              <User size={20} /> Personal Information
            </h2>
            <button
              onClick={handleEditToggle}
              className="text-sm font-montserrat text-primary hover:underline flex items-center gap-1"
            >
              {editing ? (
                <>
                  <X size={16} /> Cancel
                </>
              ) : (
                <>
                  <Edit3 size={16} /> Edit
                </>
              )}
            </button>
          </div>

          {editing ? (
            <form onSubmit={handleSave} className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-montserrat text-secondary-dark mb-1">First Name *</label>
                  <input
                    type="text"
                    value={form.first_name}
                    onChange={(e) => setForm({ ...form, first_name: e.target.value })}
                    className="w-full border border-secondary-light rounded p-2.5 focus:ring-1 focus:ring-primary outline-none"
                    required
                  />
                </div>
                <div>
                  <label className="block text-sm font-montserrat text-secondary-dark mb-1">Last Name *</label>
                  <input
                    type="text"
                    value={form.last_name}
                    onChange={(e) => setForm({ ...form, last_name: e.target.value })}
                    className="w-full border border-secondary-light rounded p-2.5 focus:ring-1 focus:ring-primary outline-none"
                    required
                  />
                </div>
                <div>
                  <label className="block text-sm font-montserrat text-secondary-dark mb-1">Mobile *</label>
                  <input
                    type="text"
                    value={form.mobile}
                    onChange={(e) => setForm({ ...form, mobile: e.target.value })}
                    className="w-full border border-secondary-light rounded p-2.5 focus:ring-1 focus:ring-primary outline-none"
                    required
                  />
                </div>
                <div>
                  <label className="block text-sm font-montserrat text-secondary-dark mb-1">Email</label>
                  <input
                    type="email"
                    value={form.email}
                    onChange={(e) => setForm({ ...form, email: e.target.value })}
                    className="w-full border border-secondary-light rounded p-2.5 focus:ring-1 focus:ring-primary outline-none"
                  />
                </div>
                <div className="sm:col-span-2">
                  <label className="block text-sm font-montserrat text-secondary-dark mb-1">Qualification</label>
                  <input
                    type="text"
                    value={form.qualification}
                    onChange={(e) => setForm({ ...form, qualification: e.target.value })}
                    className="w-full border border-secondary-light rounded p-2.5 focus:ring-1 focus:ring-primary outline-none"
                  />
                </div>
              </div>
              <div className="flex justify-end">
                <button
                  type="submit"
                  disabled={updateMutation.isPending}
                  className="bg-primary hover:bg-primary-light text-white px-5 py-2.5 rounded-lg font-montserrat transition flex items-center gap-2"
                >
                  <Save size={16} />
                  {updateMutation.isPending ? "Saving..." : "Save Changes"}
                </button>
              </div>
            </form>
          ) : (
            <div className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="flex items-center gap-2">
                  <User size={16} className="text-primary" />
                  <span className="font-medium">{teacher.first_name} {teacher.last_name}</span>
                </div>
                {teacher.employee_code && (
                  <div className="flex items-center gap-2">
                    <Briefcase size={16} className="text-primary" />
                    <span>Code: {teacher.employee_code}</span>
                  </div>
                )}
                <div className="flex items-center gap-2">
                  <Phone size={16} className="text-primary" />
                  <span>{teacher.mobile}</span>
                </div>
                {teacher.email && (
                  <div className="flex items-center gap-2">
                    <Mail size={16} className="text-primary" />
                    <span>{teacher.email}</span>
                  </div>
                )}
                {teacher.qualification && (
                  <div className="flex items-center gap-2">
                    <Briefcase size={16} className="text-primary" />
                    <span>Qualification: {teacher.qualification}</span>
                  </div>
                )}
                {teacher.joining_date && (
                  <div className="flex items-center gap-2">
                    <Calendar size={16} className="text-primary" />
                    <span>Joined: {teacher.joining_date}</span>
                  </div>
                )}
                {teacher.salary && (
                  <div className="flex items-center gap-2">
                    <Briefcase size={16} className="text-primary" />
                    <span>Salary: ₹{Number(teacher.salary).toLocaleString()}</span>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Actions Card */}
        <div className="space-y-6">
          {/* Assigned Batches */}
          <div className="bg-white rounded-xl p-5 shadow-sm border border-secondary-light">
            <h2 className="text-lg font-righteous text-primary-dark mb-3 flex items-center gap-2">
              <Layers size={18} /> My Batches
            </h2>
            {batches.length === 0 ? (
              <p className="text-sm text-secondary">No batches assigned.</p>
            ) : (
              <ul className="space-y-3 text-sm">
                {batches.map((b) => (
                  <li key={b.batch_id} className="border-b pb-2 last:border-b-0">
                    <div className="flex justify-between items-start">
                      <div>
                        <span className="font-medium">{b.batches?.batch_name}</span>
                        <span className="text-secondary ml-1">
                          ({b.batches?.courses?.course_name})
                        </span>
                        {b.batches?.mediums?.name && (
                          <span className="ml-2 inline-block bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full text-xs">
                            {b.batches.mediums.name}
                          </span>
                        )}
                      </div>
                      <span className="text-secondary text-xs whitespace-nowrap">
                        {b.batches?.start_time} - {b.batches?.end_time}
                      </span>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>

          {/* Leave Request */}
          <div className="bg-white rounded-xl p-5 shadow-sm border border-secondary-light">
            <h2 className="text-lg font-righteous text-primary-dark mb-3 flex items-center gap-2">
              <FileText size={18} /> Leave Request
            </h2>
            <button
              onClick={() => setShowLeaveModal(true)}
              className="bg-primary hover:bg-primary-light text-white px-4 py-2 rounded-lg text-sm font-montserrat transition w-full flex items-center justify-center gap-2"
            >
              <Calendar size={16} /> Request Leave
            </button>
          </div>
        </div>
      </div>

      {/* Leave Request Modal */}
      {showLeaveModal && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl w-full max-w-md shadow-xl">
            <div className="sticky top-0 bg-white border-b border-secondary-light px-6 py-4 flex items-center justify-between rounded-t-xl">
              <h2 className="text-xl font-righteous text-primary-dark">Request Leave</h2>
              <button onClick={() => setShowLeaveModal(false)} className="p-2 hover:bg-secondary-bg rounded-lg">
                <X size={20} className="text-secondary-dark" />
              </button>
            </div>
            <form onSubmit={handleLeaveSubmit} className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-montserrat text-secondary-dark mb-1">
                  <Calendar size={14} className="inline mr-1" /> Start Date *
                </label>
                <input
                  type="date"
                  value={leaveForm.start_date}
                  onChange={(e) => setLeaveForm({ ...leaveForm, start_date: e.target.value })}
                  className="w-full border border-secondary-light rounded p-2.5 focus:ring-1 focus:ring-primary outline-none"
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-montserrat text-secondary-dark mb-1">
                  <Calendar size={14} className="inline mr-1" /> End Date *
                </label>
                <input
                  type="date"
                  value={leaveForm.end_date}
                  onChange={(e) => setLeaveForm({ ...leaveForm, end_date: e.target.value })}
                  className="w-full border border-secondary-light rounded p-2.5 focus:ring-1 focus:ring-primary outline-none"
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-montserrat text-secondary-dark mb-1">Reason</label>
                <textarea
                  value={leaveForm.reason}
                  onChange={(e) => setLeaveForm({ ...leaveForm, reason: e.target.value })}
                  rows={3}
                  className="w-full border border-secondary-light rounded p-2.5 focus:ring-1 focus:ring-primary outline-none"
                />
              </div>
              <div className="flex flex-col sm:flex-row-reverse gap-3 pt-2">
                <button
                  type="submit"
                  disabled={leaveMutation.isPending}
                  className="w-full sm:w-auto bg-primary hover:bg-primary-light text-white px-6 py-2.5 rounded-lg font-montserrat transition"
                >
                  {leaveMutation.isPending ? "Submitting..." : "Submit"}
                </button>
                <button
                  type="button"
                  onClick={() => setShowLeaveModal(false)}
                  className="w-full sm:w-auto border border-secondary-light text-secondary-dark hover:bg-secondary-bg px-6 py-2.5 rounded-lg font-montserrat transition"
                >
                  Cancel
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </AdminLayout>
  );
}