// src/pages/Parents.jsx
import React, { useState, useRef } from "react";
import {
  useInfiniteQuery,
  useMutation,
  useQueryClient,
} from "@tanstack/react-query";
import toast from "react-hot-toast";
import {
  Search,
  Plus,
  Edit3,
  Trash2,
  Download,
  Upload,
  Users,
  Mail,
} from "lucide-react";
import Papa from "papaparse";

import ParentForm from "../components/ParentForm";
import BackButton from "../components/BackButton";
import {
  getParents,
  createParent,
  updateParent,
  deleteParent,
  getAllParentsForExport,
} from "../services/parentService";
import { useOrg } from "../context/OrganizationContext";
import { useTheme } from "../context/ThemeContext"; // 👈 import theme
import { supabase } from "../api/supabase";
import { sendEmail, sendTemplateEmail } from "../services/emailService";

export default function Parents() {
  const queryClient = useQueryClient();

  const { branch, selectedFinancialYear, org } = useOrg();
  const theme = useTheme(); // 👈 get theme colours
  const branchId = branch?.id;
  const financialYearId = selectedFinancialYear?.id;
  const ctx = { branchId, financialYearId };

  // Search & filters
  const [search, setSearch] = useState("");
  const allFilters = { search };

  // UI state
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState(null);
  const [sendingEmailId, setSendingEmailId] = useState(null);
  const fileInputRef = useRef(null);

  // ─── Helper: get admin emails ──────────────────────────────────────
  const getAdminEmails = async () => {
    if (!org?.id) return [];
    const { data, error } = await supabase
      .from("profiles")
      .select("email")
      .eq("organization_id", org.id)
      .in("role", ["admin", "super_admin", "organization_admin"])
      .eq("is_active", true);
    if (error) {
      console.error("Failed to fetch admin emails:", error);
      return [];
    }
    return data?.map(p => p.email).filter(Boolean) || [];
  };

  // ─── Send Report Email ─────────────────────────────────────────────
  const sendReportEmail = async () => {
    if (parents.length === 0) {
      alert("No parents to send.");
      return;
    }

    try {
      const adminEmails = await getAdminEmails();
      if (adminEmails.length === 0) {
        alert("No admin emails found.");
        return;
      }

      // Build HTML table rows
      let tableRows = parents.map((p) => {
        const linkedStudents = p.linked_students?.map(s => `${s.first_name} ${s.last_name}`).join(', ') || '—';
        return `
          <tr>
            <td style="padding:4px 8px;border:1px solid #ddd;">${p.father_name || '—'}</td>
            <td style="padding:4px 8px;border:1px solid #ddd;">${p.mother_name || '—'}</td>
            <td style="padding:4px 8px;border:1px solid #ddd;">${p.mobile || '—'}</td>
            <td style="padding:4px 8px;border:1px solid #ddd;">${p.whatsapp || '—'}</td>
            <td style="padding:4px 8px;border:1px solid #ddd;">${p.email || '—'}</td>
            <td style="padding:4px 8px;border:1px solid #ddd;">${linkedStudents}</td>
          </tr>
        `;
      }).join('');

      const htmlBody = `
        <div style="font-family:Arial,sans-serif;max-width:800px;margin:0 auto;">
          <h2 style="color:${theme.primary_color};">Parent Report</h2>
          <p><strong>Branch:</strong> ${branch?.branch_name || 'N/A'}</p>
          <p><strong>Total Parents:</strong> ${parents.length}</p>
          <hr />
          <table style="width:100%;border-collapse:collapse;font-size:11px;border:1px solid #ddd;">
            <thead style="background:${theme.primary_light_color || '#e3f2fd'};">
              <tr>
                <th style="padding:4px 8px;border:1px solid #ddd;text-align:left;">Father</th>
                <th style="padding:4px 8px;border:1px solid #ddd;text-align:left;">Mother</th>
                <th style="padding:4px 8px;border:1px solid #ddd;text-align:left;">Mobile</th>
                <th style="padding:4px 8px;border:1px solid #ddd;text-align:left;">WhatsApp</th>
                <th style="padding:4px 8px;border:1px solid #ddd;text-align:left;">Email</th>
                <th style="padding:4px 8px;border:1px solid #ddd;text-align:left;">Linked Students</th>
              </tr>
            </thead>
            <tbody>
              ${tableRows}
            </tbody>
          </table>
          <p style="color:#888;font-size:10px;margin-top:20px;">Computer‑generated report from ${org?.company_name || 'Academy'}</p>
        </div>
      `;

      await sendEmail({
        to: adminEmails,
        subject: `Parent Report - ${new Date().toLocaleDateString()}`,
        html: htmlBody,
      });

      alert("Report sent to admins.");
    } catch (err) {
      console.error("Failed to send report:", err);
      alert("Failed to send report. Check console for details.");
    }
  };

  // ─── Resend welcome email to a parent ─────────────────────────────
  const resendWelcomeEmail = async (parent) => {
    if (!parent.email) {
      toast.error("No email address on file.");
      return;
    }
    if (!parent.user_id) {
      toast.error("This parent does not have a user account.");
      return;
    }

    setSendingEmailId(parent.id);
    try {
      const fullName = parent.father_name || parent.mother_name || "Parent";
      const context = {
        academyName: org?.company_name || "Academy",
        full_name: fullName,
        email: parent.email,
        temp_password: "Please use the 'Forgot Password' link to reset your password.",
        login_link: `${window.location.origin}/login`,
      };

      await sendTemplateEmail({
        to: parent.email,
        organizationId: org?.id,
        slug: "account_activation",
        context,
        branchId,
      });
      toast.success(`Welcome email sent to ${parent.email}`);
    } catch (err) {
      console.error("Resend error:", err);
      toast.error("Failed to send email.");
    } finally {
      setSendingEmailId(null);
    }
  };

  // ─── Infinite query ─────────────────────────────────────────────────
  const {
    data,
    isLoading,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
  } = useInfiniteQuery({
    queryKey: ["parents", allFilters, branchId, financialYearId],
    queryFn: ({ pageParam = 0 }) =>
      getParents({ pageParam, filters: allFilters, branchId, financialYearId }),
    getNextPageParam: (lastPage, allPages) => {
      const totalFetched = allPages.reduce((sum, page) => sum + page.data.length, 0);
      if (lastPage.count && totalFetched < lastPage.count) {
        return allPages.length;
      }
      return undefined;
    },
    initialPageParam: 0,
    enabled: !!branchId && !!financialYearId,
    staleTime: 5 * 60 * 1000,
  });

  const parents = data?.pages.flatMap((page) => page.data) || [];

  // ─── Mutations ──────────────────────────────────────────────────────
  const createMutation = useMutation({
    mutationFn: ({ form, studentId }) => createParent(form, studentId, ctx),
    onSuccess: () => {
      toast.success("Parent created and linked");
      queryClient.invalidateQueries({ queryKey: ["parents"] });
      setShowForm(false);
    },
    onError: (err) => toast.error(err.message || "Failed to create parent"),
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, payload }) => updateParent(id, payload, ctx),
    onSuccess: () => {
      toast.success("Parent updated");
      queryClient.invalidateQueries({ queryKey: ["parents"] });
      setEditing(null);
    },
    onError: () => toast.error("Failed to update parent"),
  });

  const deleteMutation = useMutation({
    mutationFn: (id) => deleteParent(id, ctx),
    onSuccess: () => {
      toast.success("Parent deleted");
      queryClient.invalidateQueries({ queryKey: ["parents"] });
    },
    onError: () =>
      toast.error("Deletion failed. The parent may be linked to students."),
  });

  // ─── CSV handlers ──────────────────────────────────────────────────
  async function handleCSVImport(event) {
    const file = event.target.files[0];
    if (!file) return;
    Papa.parse(file, {
      header: true,
      skipEmptyLines: true,
      complete: async (results) => {
        let successCount = 0;
        for (const row of results.data) {
          try {
            const payload = {
              father_name: row.father_name || null,
              mother_name: row.mother_name || null,
              mobile: row.mobile,
              whatsapp: row.whatsapp || null,
              email: row.email || null,
              occupation: row.occupation || null,
              address: row.address || null,
            };
            await createParent(payload, null, ctx);
            successCount++;
          } catch (err) {
            console.error(err);
          }
        }
        toast.success(`${successCount} parents imported`);
        queryClient.invalidateQueries({ queryKey: ["parents"] });
      },
      error: () => toast.error("CSV parsing error"),
    });
  }

  async function handleCSVExport() {
    try {
      const allData = await getAllParentsForExport(allFilters, branchId, financialYearId);
      const csv = Papa.unparse(allData);
      const blob = new Blob([csv], { type: "text/csv" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "parents.csv";
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      toast.error("Export failed");
    }
  }

  // ─── Form callbacks ─────────────────────────────────────────────────
  function handleCreate(payload) {
    createMutation.mutate({ form: payload.form, studentId: payload.studentId });
  }

  function handleUpdate(updatedFields) {
    updateMutation.mutate({ id: editing.id, payload: updatedFields });
  }

  function handleDelete(id) {
    if (!window.confirm("Delete this parent?")) return;
    deleteMutation.mutate(id);
  }

  return (
    <div className="space-y-6 px-4 sm:px-6 lg:px-0">
      <BackButton to="/admissions-hub" label="Admissions Hub" />

      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-6 gap-4">
        <div>
          <h1 className="text-3xl font-heading text-primary">
            Parents
          </h1>
          <p className="text-sm text-gray-600 dark:text-gray-400 font-body mt-1">
            Manage parent records – each parent must be linked to a student
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            onClick={sendReportEmail}
            className="bg-primary hover:bg-primary-dark text-white px-5 py-2.5 rounded-lg transition font-body text-sm flex items-center gap-2"
          >
            <Mail size={18} /> Send Report
          </button>
          <button
            onClick={() => setShowForm(true)}
            className="bg-primary hover:bg-primary-light text-white px-5 py-2.5 rounded-lg transition font-body text-sm flex items-center gap-2"
          >
            <Plus size={18} /> Add Parent
          </button>
          <button
            onClick={handleCSVExport}
            className="border border-gray-300 dark:border-gray-600 bg-white dark:bg-accent text-gray-700 dark:text-gray-200 px-4 py-2.5 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 transition font-body text-sm flex items-center gap-2"
          >
            <Download size={18} /> Export
          </button>
          <button
            onClick={() => fileInputRef.current?.click()}
            className="border border-gray-300 dark:border-gray-600 bg-white dark:bg-accent text-gray-700 dark:text-gray-200 px-4 py-2.5 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 transition font-body text-sm flex items-center gap-2"
          >
            <Upload size={18} /> Import
          </button>
          <input
            type="file"
            ref={fileInputRef}
            className="hidden"
            accept=".csv"
            onChange={handleCSVImport}
          />
        </div>
      </div>

      {/* Search */}
      <div className="relative mb-6 max-w-md">
        <Search
          size={18}
          className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 dark:text-gray-500"
        />
        <input
          type="text"
          placeholder="Search by name, mobile, or email..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 rounded-lg pl-10 pr-4 py-2.5 text-sm focus:ring-2 focus:ring-primary focus:border-primary outline-none placeholder-gray-400 dark:placeholder-gray-500"
        />
      </div>

      {/* Table */}
      <div className="bg-white dark:bg-accent rounded-xl shadow-sm overflow-hidden border border-gray-200 dark:border-gray-700">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[800px]">
            <thead className="bg-gray-50 dark:bg-gray-700 border-b border-gray-200 dark:border-gray-600">
              <tr>
                <th className="p-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Father</th>
                <th className="p-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Mother</th>
                <th className="p-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Mobile</th>
                <th className="p-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">WhatsApp</th>
                <th className="p-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Email</th>
                <th className="p-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Linked Students</th>
                <th className="p-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
              {isLoading ? (
                <tr>
                  <td colSpan={7} className="p-6 text-center text-gray-500 dark:text-gray-400">
                    Loading parents…
                  </td>
                </tr>
              ) : parents.length === 0 ? (
                <tr>
                  <td colSpan={7} className="p-6 text-center text-gray-500 dark:text-gray-400">
                    <div className="flex flex-col items-center gap-2">
                      <Users size={32} className="text-gray-400 dark:text-gray-500" />
                      <span>No parents found</span>
                      <span className="text-xs text-gray-400 dark:text-gray-500">
                        {search
                          ? "Try adjusting your search"
                          : "Add a new parent to get started"}
                      </span>
                    </div>
                  </td>
                </tr>
              ) : (
                parents.map((parent) => (
                  <tr
                    key={parent.id}
                    className="hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
                  >
                    <td className="p-3 text-sm text-gray-700 dark:text-gray-200">{parent.father_name || "-"}</td>
                    <td className="p-3 text-sm text-gray-700 dark:text-gray-200">{parent.mother_name || "-"}</td>
                    <td className="p-3 text-sm text-gray-700 dark:text-gray-200">{parent.mobile || "-"}</td>
                    <td className="p-3 text-sm text-gray-700 dark:text-gray-200">{parent.whatsapp || "-"}</td>
                    <td className="p-3 text-sm text-gray-700 dark:text-gray-200">{parent.email || "-"}</td>
                    <td className="p-3 text-sm">
                      {parent.linked_students && parent.linked_students.length > 0
                        ? parent.linked_students.map((s, i) => (
                            <span key={s.id} className="inline-block bg-primary-bg text-primary dark:bg-primary-dark dark:text-primary-light px-2 py-0.5 rounded-full text-xs mr-1 mb-1">
                              {s.first_name} {s.last_name}
                            </span>
                          ))
                        : <span className="text-accent-dark dark:text-accent-light italic text-xs">No student linked!</span>}
                    </td>
                    <td className="p-3 text-sm">
                      <div className="flex gap-2">
                        <button
                          onClick={() => resendWelcomeEmail(parent)}
                          disabled={sendingEmailId === parent.id || !parent.email || !parent.user_id}
                          className="text-primary dark:text-primary-light hover:underline flex items-center gap-1 disabled:opacity-50"
                          title="Resend welcome email"
                        >
                          <Mail size={15} />
                          {sendingEmailId === parent.id ? '...' : ''}
                        </button>
                        <button
                          onClick={() => setEditing(parent)}
                          className="text-primary dark:text-primary-light hover:underline"
                        >
                          <Edit3 size={15} />
                        </button>
                        <button
                          onClick={() => handleDelete(parent.id)}
                          className="text-accent-dark dark:text-accent-light hover:underline"
                        >
                          <Trash2 size={15} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Load More */}
      {hasNextPage && (
        <div className="flex justify-center mt-6">
          <button
            onClick={() => fetchNextPage()}
            disabled={isFetchingNextPage}
            className="bg-primary hover:bg-primary-light text-white px-6 py-2.5 rounded-lg font-body text-sm transition disabled:opacity-60"
          >
            {isFetchingNextPage ? "Loading more…" : "Load More"}
          </button>
        </div>
      )}

      {/* Modals */}
      {showForm && (
        <ParentForm
          onSubmit={handleCreate}
          onClose={() => setShowForm(false)}
        />
      )}
      {editing && (
        <ParentForm
          initialData={editing}
          onSubmit={handleUpdate}
          onClose={() => setEditing(null)}
        />
      )}
    </div>
  );
}