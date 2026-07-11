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
} from "lucide-react";
import Papa from "papaparse";
import AdminLayout from "../layouts/AdminLayout";
import ParentForm from "../components/ParentForm";
import BackButton from "../components/BackButton";
import {
  getParents,
  createParent,
  updateParent,
  deleteParent,
  getAllParentsForExport,
} from "../services/parentService";
import { useOrg } from "../context/OrganizationContext";   // NEW

export default function Parents() {
  const queryClient = useQueryClient();

  // ── Organisation / Branch / Financial Year context ──
  const { branch, selectedFinancialYear } = useOrg();   // NEW
  const ctx = { branchId: branch?.id, financialYearId: selectedFinancialYear?.id };

  // Search & filters
  const [search, setSearch] = useState("");
  const allFilters = { search };

  // UI state
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState(null);
  const fileInputRef = useRef(null);

  // Infinite query
  const {
    data,
    isLoading,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
  } = useInfiniteQuery({
    queryKey: ["parents", allFilters],
    queryFn: ({ pageParam = 0 }) => getParents({ pageParam, filters: allFilters }),
    getNextPageParam: (lastPage, allPages) => {
      const totalFetched = allPages.reduce((sum, page) => sum + page.data.length, 0);
      if (lastPage.count && totalFetched < lastPage.count) {
        return allPages.length;
      }
      return undefined;
    },
    initialPageParam: 0,
    staleTime: 5 * 60 * 1000,
  });

  const parents = data?.pages.flatMap((page) => page.data) || [];

  // Mutations – now pass context
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

  // CSV Import – now passes context (no studentId)
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
            await createParent(payload, null, ctx);  // pass context
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

  // CSV Export (unchanged)
  async function handleCSVExport() {
    try {
      const allData = await getAllParentsForExport(allFilters);
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

  // Handlers for the form callbacks
  function handleCreate(payload) {
    // payload is { form, studentId, parent }
    createMutation.mutate({ form: payload.form, studentId: payload.studentId });
  }

  function handleUpdate(updatedFields) {
    // updatedFields is just the form object
    updateMutation.mutate({ id: editing.id, payload: updatedFields });
  }

  function handleDelete(id) {
    if (!window.confirm("Delete this parent?")) return;
    deleteMutation.mutate(id);
  }

  return (
    <AdminLayout>
      <BackButton to="/admissions-hub" label="Admissions Hub" />
      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-6 gap-4">
        <div>
          <h1 className="text-3xl font-righteous text-primary-dark">Parents</h1>
          <p className="text-sm text-secondary-dark font-montserrat mt-1">
            Manage parent records – each parent must be linked to a student
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            onClick={() => setShowForm(true)}
            className="bg-primary hover:bg-primary-light text-white px-5 py-2.5 rounded-lg transition font-montserrat text-sm flex items-center gap-2"
          >
            <Plus size={18} /> Add Parent
          </button>
          <button
            onClick={handleCSVExport}
            className="border border-secondary-light px-4 py-2.5 rounded-lg text-secondary-dark hover:bg-secondary-bg font-montserrat text-sm flex items-center gap-2"
          >
            <Download size={18} /> Export
          </button>
          <button
            onClick={() => fileInputRef.current?.click()}
            className="border border-secondary-light px-4 py-2.5 rounded-lg text-secondary-dark hover:bg-secondary-bg font-montserrat text-sm flex items-center gap-2"
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
          className="absolute left-3 top-1/2 -translate-y-1/2 text-secondary"
        />
        <input
          type="text"
          placeholder="Search by name, mobile, or email..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full border border-secondary-light rounded-lg pl-10 pr-4 py-2.5 text-sm focus:ring-1 focus:ring-primary focus:border-primary outline-none placeholder-secondary-light"
        />
      </div>

      {/* Table */}
      <div className="bg-white rounded-xl shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[800px]">
            <thead className="bg-slate-100 border-b border-secondary-light">
              <tr>
                <th className="p-3 text-left text-sm font-montserrat text-secondary-dark">Father</th>
                <th className="text-left text-sm font-montserrat text-secondary-dark">Mother</th>
                <th className="text-left text-sm font-montserrat text-secondary-dark">Mobile</th>
                <th className="text-left text-sm font-montserrat text-secondary-dark">WhatsApp</th>
                <th className="text-left text-sm font-montserrat text-secondary-dark">Email</th>
                <th className="text-left text-sm font-montserrat text-secondary-dark">Linked Students</th>
                <th className="text-left text-sm font-montserrat text-secondary-dark">Actions</th>
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                <tr>
                  <td colSpan={7} className="p-6 text-center text-secondary">
                    Loading parents…
                  </td>
                </tr>
              ) : parents.length === 0 ? (
                <tr>
                  <td colSpan={7} className="p-6 text-center text-secondary">
                    <div className="flex flex-col items-center gap-2">
                      <Users size={32} className="text-secondary-light" />
                      <span>No parents found</span>
                      <span className="text-xs text-secondary-light">
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
                    className="border-b border-secondary-light hover:bg-primary-bg transition"
                  >
                    <td className="p-3 text-sm">{parent.father_name || "-"}</td>
                    <td className="text-sm">{parent.mother_name || "-"}</td>
                    <td className="text-sm">{parent.mobile || "-"}</td>
                    <td className="text-sm">{parent.whatsapp || "-"}</td>
                    <td className="text-sm">{parent.email || "-"}</td>
                    <td className="text-sm">
                      {parent.linked_students && parent.linked_students.length > 0
                        ? parent.linked_students.map((s, i) => (
                            <span key={s.id} className="inline-block bg-primary-bg text-primary px-2 py-0.5 rounded-full text-xs mr-1 mb-1">
                              {s.first_name} {s.last_name}
                            </span>
                          ))
                        : <span className="text-red-500 italic text-xs">No student linked!</span>}
                    </td>
                    <td className="text-sm">
                      <div className="flex gap-2">
                        <button
                          onClick={() => setEditing(parent)}
                          className="text-blue-600 hover:underline"
                        >
                          <Edit3 size={15} />
                        </button>
                        <button
                          onClick={() => handleDelete(parent.id)}
                          className="text-red-600 hover:underline"
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
            className="bg-primary hover:bg-primary-light text-white px-6 py-2.5 rounded-lg font-montserrat text-sm transition disabled:opacity-60"
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
    </AdminLayout>
  );
}