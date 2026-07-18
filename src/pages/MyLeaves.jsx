import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import toast from "react-hot-toast";
import { Plus, Calendar, FileText, X, Download } from "lucide-react";

import { useAuth } from "../context/AuthContext";
import { supabase } from "../api/supabase";
import BackButton from "../components/BackButton";
import { useOrg } from "../context/OrganizationContext";
import { generateLeaveApplicationPdf } from "../utils/leaveApplicationPdf";

export default function MyLeaves() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const { org, branch, selectedFinancialYear } = useOrg();
  const branchId = branch?.id;
  const financialYearId = selectedFinancialYear?.id;
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ start_date: "", end_date: "", reason: "" });
  const [downloading, setDownloading] = useState(null);

  // ── Teacher ID ──────────────────────────────────────────────
  const { data: teacherId } = useQuery({
    queryKey: ["teacher-id", user?.id, branchId, financialYearId],
    queryFn: async () => {
      if (!user?.id) return null;
      let query = supabase
        .from("teachers")
        .select("id")
        .eq("user_id", user.id);
      if (branchId) query = query.eq("branch_id", branchId);
      if (financialYearId) query = query.eq("financial_year_id", financialYearId);
      const { data, error } = await query.maybeSingle();
      if (error) throw error;
      return data?.id || null;
    },
    enabled: !!user?.id && !!branchId && !!financialYearId,
    staleTime: 10 * 60 * 1000,
  });

  // ── My leaves with teacher details ──────────────────────
  const { data: leaves = [], isLoading } = useQuery({
    queryKey: ["my-leaves", teacherId, branchId, financialYearId],
    queryFn: async () => {
      if (!teacherId) return [];

      let query = supabase
        .from("leaves")
        .select(`
          *,
          teachers!inner (
            id,
            first_name,
            last_name,
            employee_code,
            mobile,
            email
          )
        `)
        .eq("teacher_id", teacherId)
        .order("created_at", { ascending: false });

      if (branchId) query = query.eq("branch_id", branchId);
      if (financialYearId) query = query.eq("financial_year_id", financialYearId);

      const { data, error } = await query;
      if (error) throw error;
      return data || [];
    },
    enabled: !!teacherId && !!branchId && !!financialYearId,
    staleTime: 2 * 60 * 1000,
  });

  // ── Create leave mutation ────────────────────────────────
  const createMutation = useMutation({
    mutationFn: async (payload) => {
      const enriched = {
        ...payload,
        teacher_id: teacherId,
        status: "Pending",
        branch_id: branchId,
        financial_year_id: financialYearId,
      };
      const { error } = await supabase
        .from("leaves")
        .insert(enriched);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Leave request submitted");
      queryClient.invalidateQueries({ queryKey: ["my-leaves"] });
      setShowForm(false);
      setForm({ start_date: "", end_date: "", reason: "" });
    },
    onError: () => toast.error("Failed to submit leave request"),
  });

  // ── PDF download handler ──────────────────────────────────
  const handleDownloadPDF = async (leave) => {
    setDownloading(leave.id);
    try {
      const teacher = leave.teachers;
      const doc = await generateLeaveApplicationPdf(
        leave,
        teacher,
        org,
        { autoPrint: false }
      );
      doc.save(`Leave_Application_${leave.id}.pdf`);
      toast.success("PDF downloaded");
    } catch (err) {
      console.error(err);
      toast.error("Failed to generate PDF");
    } finally {
      setDownloading(null);
    }
  };

  // ── Helpers ──────────────────────────────────────────────
  const pending = leaves.filter((l) => l.status === "Pending").length;
  const approved = leaves.filter((l) => l.status === "Approved").length;

  function handleSubmit(e) {
    e.preventDefault();
    if (!form.start_date || !form.end_date) return;
    createMutation.mutate(form);
  }

  return (
    <>
      <BackButton to="/teacher" label="Dashboard" />
      <div className="flex justify-between items-center mb-6">
        <div>
          <h1 className="text-3xl font-righteous text-primary-dark">My Leaves</h1>
          <p className="text-sm text-secondary-dark font-montserrat mt-1">Manage your leave requests</p>
        </div>
        <button
          onClick={() => setShowForm(true)}
          className="bg-primary hover:bg-primary-light text-white px-4 py-2 rounded-lg text-sm font-montserrat flex items-center gap-2"
        >
          <Plus size={16} /> Request Leave
        </button>
      </div>

      {leaves.length > 0 && (
        <div className="grid grid-cols-3 gap-4 mb-6">
          <div className="bg-white rounded-xl p-4 shadow-sm border border-secondary-light text-center">
            <p className="text-2xl font-bold text-primary">{leaves.length}</p>
            <p className="text-xs text-secondary mt-1">Total Requests</p>
          </div>
          <div className="bg-white rounded-xl p-4 shadow-sm border border-secondary-light text-center">
            <p className="text-2xl font-bold text-yellow-600">{pending}</p>
            <p className="text-xs text-secondary mt-1">Pending</p>
          </div>
          <div className="bg-white rounded-xl p-4 shadow-sm border border-secondary-light text-center">
            <p className="text-2xl font-bold text-green-600">{approved}</p>
            <p className="text-xs text-secondary mt-1">Approved</p>
          </div>
        </div>
      )}

      {isLoading ? (
        <div className="p-8 text-center">Loading...</div>
      ) : leaves.length === 0 ? (
        <div className="bg-white rounded-xl p-8 shadow-sm border border-secondary-light text-center">
          <Calendar size={32} className="text-secondary-light mx-auto mb-2" />
          <p className="text-secondary">No leave requests yet.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {leaves.map((l) => (
            <div key={l.id} className="bg-white rounded-xl p-4 shadow-sm border border-secondary-light">
              <div className="flex justify-between items-center">
                <div className="flex items-center gap-3">
                  <Calendar size={16} className="text-primary" />
                  <span className="text-sm font-medium">{l.start_date} → {l.end_date}</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                    l.status === "Approved" ? "bg-green-100 text-green-700" :
                    l.status === "Rejected" ? "bg-red-100 text-red-700" :
                    "bg-yellow-100 text-yellow-700"
                  }`}>{l.status}</span>
                  <button
                    onClick={() => handleDownloadPDF(l)}
                    disabled={downloading === l.id}
                    className="p-1.5 text-blue-600 hover:bg-blue-50 rounded transition disabled:opacity-50"
                    title="Download PDF"
                  >
                    <Download size={16} />
                  </button>
                </div>
              </div>
              {l.reason && <p className="text-sm text-secondary mt-2">{l.reason}</p>}
              {l.admin_remarks && <p className="text-xs text-red-500 mt-1">Admin: {l.admin_remarks}</p>}
            </div>
          ))}
        </div>
      )}

      {/* ── Leave Request Modal ── */}
      {showForm && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl w-full max-w-md shadow-xl">
            <div className="sticky top-0 bg-white border-b border-secondary-light px-6 py-4 flex items-center justify-between rounded-t-xl">
              <h2 className="text-xl font-righteous text-primary-dark">Request Leave</h2>
              <button onClick={() => setShowForm(false)} className="p-2 hover:bg-secondary-bg rounded-lg">
                <X size={20} className="text-secondary-dark" />
              </button>
            </div>
            <form onSubmit={handleSubmit} className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-montserrat text-secondary-dark mb-1">
                  <Calendar size={14} className="inline mr-1" />Start Date *
                </label>
                <input type="date" value={form.start_date} onChange={(e) => setForm({ ...form, start_date: e.target.value })}
                  className="w-full border border-secondary-light rounded p-2.5 focus:ring-1 focus:ring-primary outline-none" required />
              </div>
              <div>
                <label className="block text-sm font-montserrat text-secondary-dark mb-1">
                  <Calendar size={14} className="inline mr-1" />End Date *
                </label>
                <input type="date" value={form.end_date} onChange={(e) => setForm({ ...form, end_date: e.target.value })}
                  className="w-full border border-secondary-light rounded p-2.5 focus:ring-1 focus:ring-primary outline-none" required />
              </div>
              <div>
                <label className="block text-sm font-montserrat text-secondary-dark mb-1">
                  <FileText size={14} className="inline mr-1" />Reason
                </label>
                <textarea value={form.reason} onChange={(e) => setForm({ ...form, reason: e.target.value })}
                  rows={3} className="w-full border border-secondary-light rounded p-2.5 focus:ring-1 focus:ring-primary outline-none" />
              </div>
              <div className="flex flex-col sm:flex-row-reverse gap-3 pt-2">
                <button type="submit" disabled={createMutation.isPending}
                  className="w-full sm:w-auto bg-primary hover:bg-primary-light text-white px-6 py-2.5 rounded-lg font-montserrat transition disabled:opacity-60">
                  {createMutation.isPending ? "Submitting..." : "Submit"}
                </button>
                <button type="button" onClick={() => setShowForm(false)}
                  className="w-full sm:w-auto border border-secondary-light text-secondary-dark hover:bg-secondary-bg px-6 py-2.5 rounded-lg font-montserrat transition">
                  Cancel
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}