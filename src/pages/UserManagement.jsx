// src/pages/UserManagement.jsx
import { useState } from "react";
import {
  useQuery,
  useMutation,
  useQueryClient,
} from "@tanstack/react-query";
import toast from "react-hot-toast";
import {
  Search,
  Edit3,
  Trash2,
  X,
  User,
  Mail,
  Shield,
  Save,
  UserPlus,
  Building,
  MapPin,
  Calendar,
} from "lucide-react";

import BackButton from "../components/BackButton";
import { supabase } from "../api/supabase";
import { useOrg } from "../context/OrganizationContext";

const ALLOWED_ROLES = [
  "organization_admin",
  "branch_admin",
  "teacher",
  "student",
  "parent",
];

const formatRole = (role) =>
  role
    ? role
        .split("_")
        .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
        .join(" ")
    : "";

export default function UserManagement() {
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [editingId, setEditingId] = useState(null);
  const [editRole, setEditRole] = useState("");
  const [editStatus, setEditStatus] = useState(true);
  const [editOrgId, setEditOrgId] = useState(null);
  const [editBranchId, setEditBranchId] = useState(null);
  const [editFYId, setEditFYId] = useState(null);
  const [showInvite, setShowInvite] = useState(false);
  const [inviteForm, setInviteForm] = useState({
    email: "",
    password: "",
    full_name: "",
    role: "organization_admin",
  });

  const {
    org,
    branch,
    selectedFinancialYear,
    branches,
    financialYears,
  } = useOrg();
  const organizationId = org?.id;
  const currentBranchId = branch?.id;
  const currentFinancialYearId = selectedFinancialYear?.id;

  // 1. Fetch all profiles
  const { data: profiles = [], isLoading } = useQuery({
    queryKey: ["profiles"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("profiles")
        .select(
          "id, email, full_name, role, is_active, organization_id, branch_id, selected_financial_year_id, created_at"
        )
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data || [];
    },
    staleTime: 5 * 60 * 1000,
  });

  const filteredProfiles = profiles.filter((p) => {
    const term = search.toLowerCase();
    return (
      p.email?.toLowerCase().includes(term) ||
      p.full_name?.toLowerCase().includes(term)
    );
  });

  // 2. Update profile
  const updateMutation = useMutation({
    mutationFn: async ({
      id,
      role,
      is_active,
      organization_id,
      branch_id,
      selected_financial_year_id,
    }) => {
      const payload = { role, is_active };
      if (organization_id !== undefined) payload.organization_id = organization_id;
      if (branch_id !== undefined) payload.branch_id = branch_id;
      if (selected_financial_year_id !== undefined)
        payload.selected_financial_year_id = selected_financial_year_id;

      const { error } = await supabase
        .from("profiles")
        .update(payload)
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("User updated");
      queryClient.invalidateQueries({ queryKey: ["profiles"] });
      setEditingId(null);
    },
    onError: (err) => toast.error(err.message),
  });

  // 3. Deactivate user
  const deactivateMutation = useMutation({
    mutationFn: async (id) => {
      const { error } = await supabase
        .from("profiles")
        .update({ is_active: false })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("User deactivated");
      queryClient.invalidateQueries({ queryKey: ["profiles"] });
    },
    onError: (err) => toast.error(err.message),
  });

  // 4. Invite new user – INSERT the profile, not UPDATE
const inviteMutation = useMutation({
  mutationFn: async (formData) => {
    const { data: sessionData } = await supabase.auth.getSession();
    const accessToken = sessionData?.session?.access_token;
    if (!accessToken) throw new Error("Your session expired. Please log in again.");

    // ✅ Use the FULL Supabase URL – same as the cURL test
    const response = await fetch(
      `https://xdnebzhxjlkeqhjsmiow.supabase.co/functions/v1/invite-user`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({
          email: formData.email,
          password: formData.password,
          full_name: formData.full_name,
          role: formData.role,
          organization_id: organizationId,
          branch_id: currentBranchId,
          financial_year_id: currentFinancialYearId,
        }),
      }
    );

    const result = await response.json();
    if (!response.ok) throw new Error(result.error || "Invitation failed");
    return result;
  },
  onSuccess: () => {
    toast.success("User invited");
    setShowInvite(false);
    setInviteForm({ email: "", password: "", full_name: "", role: "organization_admin" });
    queryClient.invalidateQueries({ queryKey: ["profiles"] });
  },
  onError: (err) => toast.error(err.message),
});

  const startEdit = (profile) => {
    setEditingId(profile.id);
    setEditRole(profile.role);
    setEditStatus(profile.is_active);
    setEditOrgId(profile.organization_id || organizationId);
    setEditBranchId(profile.branch_id || currentBranchId);
    setEditFYId(profile.selected_financial_year_id || currentFinancialYearId);
  };

  const cancelEdit = () => setEditingId(null);

  const handleInviteSubmit = (e) => {
    e.preventDefault();
    if (!inviteForm.email || !inviteForm.password) {
      toast.error("Email and password are required");
      return;
    }
    if (inviteForm.password.length < 6) {
      toast.error("Password must be at least 6 characters");
      return;
    }
    inviteMutation.mutate(inviteForm);
  };

  return (
    <div className="space-y-6 px-4 sm:px-6 lg:px-0">
      <BackButton to="/settings-hub" label="Settings" />
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-6 gap-4">
        <div>
          <h1 className="text-3xl font-heading text-primary">Users</h1>
          <p className="text-sm text-gray-600 dark:text-gray-400 font-body mt-1">
            Manage staff, students and parent accounts
          </p>
        </div>
        <button
          onClick={() => setShowInvite(true)}
          className="bg-primary hover:bg-primary-light text-white px-5 py-2.5 rounded-lg transition font-body text-sm flex items-center gap-2"
        >
          <UserPlus size={18} /> Invite User
        </button>
      </div>

      <div className="relative mb-6 max-w-md">
        <Search size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 dark:text-gray-500" />
        <input
          type="text"
          placeholder="Search by email or name..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 rounded-lg pl-10 pr-4 py-2.5 text-sm focus:ring-2 focus:ring-primary focus:border-primary outline-none placeholder-gray-400 dark:placeholder-gray-500"
        />
      </div>

      <div className="bg-white dark:bg-accent rounded-xl shadow-sm overflow-hidden border border-gray-200 dark:border-gray-700">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[900px]">
            <thead className="bg-gray-50 dark:bg-gray-700 border-b border-gray-200 dark:border-gray-600">
              <tr>
                <th className="p-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                  <Mail size={14} className="inline mr-1" /> Email
                </th>
                <th className="p-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                  <User size={14} className="inline mr-1" /> Full Name
                </th>
                <th className="p-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                  <Shield size={14} className="inline mr-1" /> Role
                </th>
                <th className="p-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                  <Building size={14} className="inline mr-1" /> Org
                </th>
                <th className="p-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                  <MapPin size={14} className="inline mr-1" /> Branch
                </th>
                <th className="p-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                  <Calendar size={14} className="inline mr-1" /> FY
                </th>
                <th className="p-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Status</th>
                <th className="p-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
              {isLoading ? (
                <tr><td colSpan={8} className="p-6 text-center text-gray-500 dark:text-gray-400">Loading users…</td></tr>
              ) : filteredProfiles.length === 0 ? (
                <tr><td colSpan={8} className="p-6 text-center text-gray-500 dark:text-gray-400"><div className="flex flex-col items-center gap-2"><User size={32} className="text-gray-400 dark:text-gray-500" /><span>No users found</span></div></td></tr>
              ) : (
                filteredProfiles.map((profile) => (
                  <tr key={profile.id} className="hover:bg-primary-bg transition-colors">
                    <td className="p-3 text-sm text-gray-700 dark:text-gray-200">{profile.email}</td>
                    <td className="p-3 text-sm text-gray-700 dark:text-gray-200">{profile.full_name || "-"}</td>
                    <td className="p-3 text-sm">
                      {editingId === profile.id ? (
                        <select value={editRole} onChange={(e) => setEditRole(e.target.value)} className="border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 rounded p-1 text-sm focus:ring-2 focus:ring-primary outline-none">
                          {ALLOWED_ROLES.map((role) => (<option key={role} value={role}>{formatRole(role)}</option>))}
                        </select>
                      ) : (
                        <span className="bg-primary-bg text-primary px-2 py-0.5 rounded-full text-xs font-medium">{formatRole(profile.role)}</span>
                      )}
                    </td>
                    <td className="p-3 text-sm">
                      {editingId === profile.id ? (
                        <select value={editOrgId || ""} onChange={(e) => setEditOrgId(e.target.value ? Number(e.target.value) : null)} className="border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 rounded p-1 text-sm">
                          <option value={organizationId}>{org?.company_name || "Org 3"}</option>
                        </select>
                      ) : (
                        <span className="text-xs text-gray-700 dark:text-gray-300">{profile.organization_id ? `Org ${profile.organization_id}` : "-"}</span>
                      )}
                    </td>
                    <td className="p-3 text-sm">
                      {editingId === profile.id ? (
                        <select value={editBranchId || ""} onChange={(e) => setEditBranchId(e.target.value ? Number(e.target.value) : null)} className="border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 rounded p-1 text-sm">
                          {branches.map((b) => (<option key={b.id} value={b.id}>{b.branch_name}</option>))}
                        </select>
                      ) : (
                        <span className="text-xs text-gray-700 dark:text-gray-300">{branches.find((b) => b.id === profile.branch_id)?.branch_name || "-"}</span>
                      )}
                    </td>
                    <td className="p-3 text-sm">
                      {editingId === profile.id ? (
                        <select value={editFYId || ""} onChange={(e) => setEditFYId(e.target.value ? Number(e.target.value) : null)} className="border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 rounded p-1 text-sm">
                          {financialYears.map((fy) => (<option key={fy.id} value={fy.id}>{fy.name}</option>))}
                        </select>
                      ) : (
                        <span className="text-xs text-gray-700 dark:text-gray-300">{financialYears.find((fy) => fy.id === profile.selected_financial_year_id)?.name || "-"}</span>
                      )}
                    </td>
                    <td className="p-3 text-sm">
                      {editingId === profile.id ? (
                        <select value={editStatus} onChange={(e) => setEditStatus(e.target.value === "true")} className="border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 rounded p-1 text-sm focus:ring-2 focus:ring-primary outline-none">
                          <option value="true">Active</option>
                          <option value="false">Inactive</option>
                        </select>
                      ) : (
                        <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${profile.is_active ? "bg-primary-bg text-primary" : "bg-accent-bg text-accent-dark"}`}>
                          {profile.is_active ? "Active" : "Inactive"}
                        </span>
                      )}
                    </td>
                    <td className="p-3 text-sm">
                      {editingId === profile.id ? (
                        <div className="flex gap-2">
                          <button onClick={() => updateMutation.mutate({ id: profile.id, role: editRole, is_active: editStatus, organization_id: editOrgId, branch_id: editBranchId, selected_financial_year_id: editFYId })} className="bg-primary hover:bg-primary-light text-white px-3 py-1 rounded text-xs flex items-center gap-1">
                            <Save size={14} /> Save
                          </button>
                          <button onClick={cancelEdit} className="border border-gray-300 dark:border-gray-600 px-3 py-1 rounded text-xs text-gray-700 dark:text-gray-200">Cancel</button>
                        </div>
                      ) : (
                        <div className="flex gap-2">
                          <button onClick={() => startEdit(profile)} className="text-primary hover:underline" title="Edit"><Edit3 size={15} /></button>
                          <button onClick={() => { if (!window.confirm("Deactivate this user? They will no longer be able to log in.")) return; deactivateMutation.mutate(profile.id); }} className="text-accent-dark hover:underline" title="Deactivate"><Trash2 size={15} /></button>
                        </div>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {showInvite && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white dark:bg-accent rounded-xl w-full max-w-md shadow-xl border border-gray-200 dark:border-gray-700">
            <div className="sticky top-0 bg-white dark:bg-accent border-b border-gray-200 dark:border-gray-700 px-6 py-4 flex items-center justify-between rounded-t-xl">
              <div className="flex items-center gap-3">
                <img src={org?.logo_dark_url || "/ShreeVidhyaDark.png"} alt="ShreeVidhya Academy" className="h-10 w-auto" />
                <h2 className="text-xl font-heading text-primary">Invite User</h2>
              </div>
              <button onClick={() => setShowInvite(false)} className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg">
                <X size={20} className="text-gray-600 dark:text-gray-400" />
              </button>
            </div>
            <form onSubmit={handleInviteSubmit} className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-body text-gray-700 dark:text-gray-300 mb-1"><Mail size={14} className="inline mr-1" /> Email *</label>
                <input type="email" value={inviteForm.email} onChange={(e) => setInviteForm({ ...inviteForm, email: e.target.value })} className="w-full border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 rounded p-2.5 focus:ring-2 focus:ring-primary outline-none placeholder-gray-400 dark:placeholder-gray-500" required />
              </div>
              <div>
                <label className="block text-sm font-body text-gray-700 dark:text-gray-300 mb-1">Password *</label>
                <input type="password" value={inviteForm.password} onChange={(e) => setInviteForm({ ...inviteForm, password: e.target.value })} className="w-full border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 rounded p-2.5 focus:ring-2 focus:ring-primary outline-none placeholder-gray-400 dark:placeholder-gray-500" required minLength={6} />
              </div>
              <div>
                <label className="block text-sm font-body text-gray-700 dark:text-gray-300 mb-1"><User size={14} className="inline mr-1" /> Full Name</label>
                <input type="text" value={inviteForm.full_name} onChange={(e) => setInviteForm({ ...inviteForm, full_name: e.target.value })} className="w-full border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 rounded p-2.5 focus:ring-2 focus:ring-primary outline-none placeholder-gray-400 dark:placeholder-gray-500" />
              </div>
              <div>
                <label className="block text-sm font-body text-gray-700 dark:text-gray-300 mb-1"><Shield size={14} className="inline mr-1" /> Role</label>
                <select value={inviteForm.role} onChange={(e) => setInviteForm({ ...inviteForm, role: e.target.value })} className="w-full border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 rounded p-2.5 focus:ring-2 focus:ring-primary outline-none">
                  {ALLOWED_ROLES.map((role) => (<option key={role} value={role}>{formatRole(role)}</option>))}
                </select>
              </div>
              <div className="flex flex-col sm:flex-row-reverse gap-3 pt-2">
                <button type="submit" disabled={inviteMutation.isLoading} className="w-full sm:w-auto bg-primary hover:bg-primary-light text-white px-6 py-2.5 rounded-lg font-body transition disabled:opacity-50">
                  {inviteMutation.isLoading ? "Inviting..." : "Invite"}
                </button>
                <button type="button" onClick={() => setShowInvite(false)} className="w-full sm:w-auto border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-700 px-6 py-2.5 rounded-lg font-body transition">
                  Cancel
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}