import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import toast from "react-hot-toast";
import { supabase } from "../api/supabase";

import BackButton from "../components/BackButton";

import { Plus, Trash2, ExternalLink } from "lucide-react";
import { useOrg } from "../context/OrganizationContext"; // NEW

const RESOURCE_TYPES = [
  "textbook",
  "assignment",
  "past_paper",
  "reference",
  "notes",
];

export default function LearningResources() {
  const queryClient = useQueryClient();
  const [showForm, setShowForm] = useState(false);
  const [filters, setFilters] = useState({
    subject_id: "",
    batch_id: "",
    resource_type: "",
    medium_id: "",
  });

  const [form, setForm] = useState({
    subject_id: "",
    batch_id: "",
    chapter_no: "",
    chapter_title: "",
    resource_url: "",
    resource_type: "textbook",
    medium_id: "",
    board: "GSEB",
    is_premium: false,
  });

  // ── Branch & Financial Year context ──
  const { branch, selectedFinancialYear } = useOrg();
  const branchId = branch?.id;
  const financialYearId = selectedFinancialYear?.id;

  // Fetch dropdown data – scoped where appropriate

  // Subjects – scoped
  const { data: subjects = [] } = useQuery({
    queryKey: ["subjects-list", branchId, financialYearId],
    queryFn: async () => {
      let query = supabase
        .from("subjects")
        .select("id, subject_name, courses(course_name)")
        .order("subject_name");

      if (branchId) query = query.eq("branch_id", branchId);
      if (financialYearId) query = query.eq("financial_year_id", financialYearId);

      const { data } = await query;
      return data || [];
    },
    enabled: !!branchId && !!financialYearId,
    staleTime: 10 * 60 * 1000,
  });

  // Batches – scoped
  const { data: batches = [] } = useQuery({
    queryKey: ["batches-list", branchId, financialYearId],
    queryFn: async () => {
      let query = supabase
        .from("batches")
        .select("id, batch_name")
        .order("batch_name");

      if (branchId) query = query.eq("branch_id", branchId);
      if (financialYearId) query = query.eq("financial_year_id", financialYearId);

      const { data } = await query;
      return data || [];
    },
    enabled: !!branchId && !!financialYearId,
    staleTime: 10 * 60 * 1000,
  });

  // Mediums – org‑wide (no branch/FY)
  const { data: mediums = [] } = useQuery({
    queryKey: ["mediums-list"],
    queryFn: async () => {
      const { data } = await supabase
        .from("mediums")
        .select("id, name")
        .order("name");
      return data || [];
    },
    staleTime: 10 * 60 * 1000,
  });

  // Fetch resources with filters (scoped)
  const { data: resources = [], isLoading } = useQuery({
    queryKey: ["learning-resources", filters, branchId, financialYearId],
    queryFn: async () => {
      let query = supabase
        .from("learning_resources")
        .select(
          "*, subjects(subject_name, courses(course_name)), batches(batch_name), mediums(name)"
        )
        .order("created_at", { ascending: false });

      // Scope to branch & FY
      if (branchId) query = query.eq("branch_id", branchId);
      if (financialYearId) query = query.eq("financial_year_id", financialYearId);

      if (filters.subject_id) query = query.eq("subject_id", filters.subject_id);
      if (filters.batch_id) query = query.eq("batch_id", filters.batch_id);
      if (filters.resource_type)
        query = query.eq("resource_type", filters.resource_type);
      if (filters.medium_id) query = query.eq("medium_id", filters.medium_id);

      const { data } = await query;
      return data || [];
    },
    enabled: !!branchId && !!financialYearId,
    staleTime: 5 * 60 * 1000,
  });

  // Add resource mutation – scoped
  const addMutation = useMutation({
    mutationFn: async (payload) => {
      const { error } = await supabase
        .from("learning_resources")
        .insert({
          ...payload,
          branch_id: branchId,
          financial_year_id: financialYearId,
        });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Resource added");
      queryClient.invalidateQueries({ queryKey: ["learning-resources"] });
      setShowForm(false);
    },
    onError: () => toast.error("Failed to add"),
  });

  // Delete resource mutation – scoped
  const deleteMutation = useMutation({
    mutationFn: async (id) => {
      let query = supabase
        .from("learning_resources")
        .delete()
        .eq("id", id);

      if (branchId) query = query.eq("branch_id", branchId);
      if (financialYearId) query = query.eq("financial_year_id", financialYearId);

      const { error } = await query;
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Deleted");
      queryClient.invalidateQueries({ queryKey: ["learning-resources"] });
    },
    onError: () => toast.error("Delete failed"),
  });

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!form.subject_id || !form.resource_url) {
      toast.error("Subject and URL are required");
      return;
    }
    const payload = {
      ...form,
      batch_id: form.batch_id || null,
      medium_id: form.medium_id || null,
    };
    addMutation.mutate(payload);
  };

  return (
    <>
      <BackButton to="/communication-hub" label="Communication" />
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-3xl font-righteous text-primary-dark">
          Learning Resources
        </h1>
        <button
          onClick={() => setShowForm(true)}
          className="bg-primary hover:bg-primary-light text-white px-4 py-2 rounded-lg flex items-center gap-2"
        >
          <Plus size={18} /> Add Resource
        </button>
      </div>

      {/* Filters */}
      <div className="flex gap-4 mb-6 flex-wrap">
        <select
          className="border p-2 rounded"
          value={filters.subject_id}
          onChange={(e) =>
            setFilters({ ...filters, subject_id: e.target.value })
          }
        >
          <option value="">All Subjects</option>
          {subjects.map((s) => (
            <option key={s.id} value={s.id}>
              {s.subject_name} ({s.courses?.course_name})
            </option>
          ))}
        </select>

        <select
          className="border p-2 rounded"
          value={filters.batch_id}
          onChange={(e) =>
            setFilters({ ...filters, batch_id: e.target.value })
          }
        >
          <option value="">All Batches</option>
          {batches.map((b) => (
            <option key={b.id} value={b.id}>
              {b.batch_name}
            </option>
          ))}
        </select>

        <select
          className="border p-2 rounded"
          value={filters.resource_type}
          onChange={(e) =>
            setFilters({ ...filters, resource_type: e.target.value })
          }
        >
          <option value="">All Types</option>
          {RESOURCE_TYPES.map((t) => (
            <option key={t} value={t}>
              {t.replace("_", " ")}
            </option>
          ))}
        </select>

        <select
          className="border p-2 rounded"
          value={filters.medium_id}
          onChange={(e) =>
            setFilters({ ...filters, medium_id: e.target.value })
          }
        >
          <option value="">All Mediums</option>
          {mediums.map((m) => (
            <option key={m.id} value={m.id}>
              {m.name}
            </option>
          ))}
        </select>
      </div>

      {/* Resources Table */}
      <div className="bg-white rounded-xl shadow-sm overflow-x-auto">
        <table className="w-full min-w-[600px]">
          <thead className="bg-slate-100">
            <tr>
              <th className="p-3 text-left">Subject</th>
              <th className="p-3 text-left">Batch</th>
              <th className="p-3 text-left">Chapter</th>
              <th className="p-3 text-left">Type</th>
              <th className="p-3 text-left">Medium / Board</th>
              <th className="p-3 text-left">Premium</th>
              <th className="p-3 text-left">Actions</th>
            </tr>
          </thead>
          <tbody>
            {isLoading ? (
              <tr>
                <td colSpan={7} className="p-4 text-center">
                  Loading...
                </td>
              </tr>
            ) : (
              resources.map((r) => (
                <tr key={r.id} className="border-b">
                  <td className="p-3 text-sm">
                    {r.subjects?.subject_name} ({r.subjects?.courses?.course_name})
                  </td>
                  <td className="p-3 text-sm">
                    {r.batches?.batch_name || "All"}
                  </td>
                  <td className="p-3 text-sm">
                    Ch {r.chapter_no}: {r.chapter_title}
                  </td>
                  <td className="p-3 text-sm capitalize">
                    {r.resource_type.replace("_", " ")}
                  </td>
                  <td className="p-3 text-sm">
                    {r.mediums?.name || r.medium || "—"} - {r.board}
                  </td>
                  <td className="p-3 text-sm">
                    {r.is_premium ? "🔒" : "🆓"}
                  </td>
                  <td className="p-3 text-sm flex gap-2">
                    <a
                      href={r.resource_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-blue-600 hover:underline inline-flex items-center gap-1"
                    >
                      <ExternalLink size={16} /> Open
                    </a>
                    <button
                      onClick={() => deleteMutation.mutate(r.id)}
                      className="text-red-600"
                      title="Delete"
                    >
                      <Trash2 size={16} />
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Add Form Modal */}
      {showForm && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl p-6 w-full max-w-lg shadow-xl">
            <h2 className="text-xl font-righteous text-primary-dark mb-4">
              Add Resource
            </h2>
            <form onSubmit={handleSubmit} className="space-y-4">
              {/* Subject */}
              <select
                required
                value={form.subject_id}
                onChange={(e) =>
                  setForm({ ...form, subject_id: e.target.value })
                }
                className="w-full border p-2 rounded"
              >
                <option value="">Select Subject</option>
                {subjects.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.subject_name} ({s.courses?.course_name})
                  </option>
                ))}
              </select>

              {/* Batch */}
              <select
                value={form.batch_id}
                onChange={(e) =>
                  setForm({ ...form, batch_id: e.target.value })
                }
                className="w-full border p-2 rounded"
              >
                <option value="">All Batches (optional)</option>
                {batches.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.batch_name}
                  </option>
                ))}
              </select>

              {/* Chapter fields */}
              <input
                type="number"
                placeholder="Chapter No"
                value={form.chapter_no}
                onChange={(e) =>
                  setForm({ ...form, chapter_no: e.target.value })
                }
                className="w-full border p-2 rounded"
              />
              <input
                type="text"
                placeholder="Chapter Title"
                value={form.chapter_title}
                onChange={(e) =>
                  setForm({ ...form, chapter_title: e.target.value })
                }
                className="w-full border p-2 rounded"
              />

              {/* Resource URL */}
              <input
                type="url"
                required
                placeholder="Resource URL (Google Drive, etc.)"
                value={form.resource_url}
                onChange={(e) =>
                  setForm({ ...form, resource_url: e.target.value })
                }
                className="w-full border p-2 rounded"
              />

              {/* Type & Medium */}
              <div className="flex gap-4">
                <select
                  value={form.resource_type}
                  onChange={(e) =>
                    setForm({ ...form, resource_type: e.target.value })
                  }
                  className="w-1/2 border p-2 rounded"
                >
                  {RESOURCE_TYPES.map((t) => (
                    <option key={t} value={t}>
                      {t.replace("_", " ")}
                    </option>
                  ))}
                </select>

                <select
                  value={form.medium_id}
                  onChange={(e) =>
                    setForm({ ...form, medium_id: e.target.value })
                  }
                  className="w-1/2 border p-2 rounded"
                >
                  <option value="">Select Medium</option>
                  {mediums.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.name}
                    </option>
                  ))}
                </select>
              </div>

              {/* Board & Premium */}
              <div className="flex gap-4 items-center">
                <select
                  value={form.board}
                  onChange={(e) =>
                    setForm({ ...form, board: e.target.value })
                  }
                  className="w-1/2 border p-2 rounded"
                >
                  <option>GSEB</option>
                  <option>CBSE</option>
                </select>
                <label className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={form.is_premium}
                    onChange={(e) =>
                      setForm({ ...form, is_premium: e.target.checked })
                    }
                  />
                  Premium (paid access)
                </label>
              </div>

              {/* Buttons */}
              <div className="flex justify-end gap-3 pt-4">
                <button
                  type="button"
                  onClick={() => setShowForm(false)}
                  className="px-4 py-2 border rounded"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-primary text-white rounded"
                >
                  Add
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}