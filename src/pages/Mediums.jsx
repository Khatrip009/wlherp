// src/pages/Mediums.jsx
import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import toast from "react-hot-toast";
import {
  Plus,
  Edit3,
  Trash2,
  Save,
  X,
} from "lucide-react";

import {
  getMediums,
  createMedium,
  updateMedium,
  deleteMedium,
} from "../services/mediumService";

export default function Mediums() {
  const queryClient = useQueryClient();

  const [showForm, setShowForm] = useState(false);
  const [editId, setEditId] = useState(null);
  const [name, setName] = useState("");

  const { data: mediums = [], isLoading } = useQuery({
    queryKey: ["mediums"],
    queryFn: getMediums,
  });

  const addMutation = useMutation({
    mutationFn: createMedium,
    onSuccess: () => {
      toast.success("Medium added");
      queryClient.invalidateQueries({ queryKey: ["mediums"] });
      setShowForm(false);
      setName("");
    },
    onError: () => toast.error("Failed to add"),
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, name }) => updateMedium(id, { name }),
    onSuccess: () => {
      toast.success("Medium updated");
      queryClient.invalidateQueries({ queryKey: ["mediums"] });
      setEditId(null);
      setName("");
    },
    onError: () => toast.error("Update failed"),
  });

  const deleteMutation = useMutation({
    mutationFn: deleteMedium,
    onSuccess: () => {
      toast.success("Medium deleted");
      queryClient.invalidateQueries({ queryKey: ["mediums"] });
    },
    onError: () => toast.error("Delete failed – medium may be in use"),
  });

  function handleAdd(e) {
    e.preventDefault();
    if (!name.trim()) return toast.error("Name required");
    addMutation.mutate({ name: name.trim() });
  }

  function handleUpdate(id) {
    if (!name.trim()) return;
    updateMutation.mutate({ id, name: name.trim() });
  }

  return (
    <div className="space-y-6 px-4 sm:px-6 lg:px-0">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-3xl font-heading text-primary-dark">Mediums</h1>
        <button
          onClick={() => {
            setShowForm(true);
            setName("");
          }}
          className="bg-primary hover:bg-primary-light text-white px-4 py-2 rounded-lg flex items-center gap-2"
        >
          <Plus size={18} /> Add Medium
        </button>
      </div>

      <div className="bg-white dark:bg-accent rounded-xl shadow-sm overflow-x-auto border border-gray-200 dark:border-gray-700">
        <table className="w-full min-w-[400px]">
          <thead className="bg-gray-50 dark:bg-gray-700">
            <tr>
              <th className="p-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Name</th>
              <th className="p-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider w-32">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
            {isLoading ? (
              <tr><td colSpan={2} className="p-4 text-center text-gray-500 dark:text-gray-400">Loading...</td></tr>
            ) : mediums.length === 0 ? (
              <tr><td colSpan={2} className="p-4 text-center text-gray-500 dark:text-gray-400">No mediums found.</td></tr>
            ) : (
              mediums.map((m) => (
                <tr key={m.id} className="hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors">
                  <td className="p-3 text-sm text-gray-700 dark:text-gray-200">
                    {editId === m.id ? (
                      <input
                        value={name}
                        onChange={(e) => setName(e.target.value)}
                        className="border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 rounded p-2 w-full"
                        placeholder="Medium name"
                      />
                    ) : (
                      m.name
                    )}
                  </td>
                  <td className="p-3 text-sm">
                    {editId === m.id ? (
                      <div className="flex gap-2">
                        <button
                          onClick={() => handleUpdate(m.id)}
                          className="text-primary dark:text-primary-light hover:underline"
                        >
                          <Save size={16} />
                        </button>
                        <button
                          onClick={() => setEditId(null)}
                          className="text-gray-500 dark:text-gray-400 hover:underline"
                        >
                          <X size={16} />
                        </button>
                      </div>
                    ) : (
                      <div className="flex gap-2">
                        <button
                          onClick={() => {
                            setEditId(m.id);
                            setName(m.name);
                          }}
                          className="text-primary dark:text-primary-light hover:underline"
                        >
                          <Edit3 size={16} />
                        </button>
                        <button
                          onClick={() => {
                            if (window.confirm("Delete this medium?"))
                              deleteMutation.mutate(m.id);
                          }}
                          className="text-accent-dark dark:text-accent-light hover:underline"
                        >
                          <Trash2 size={16} />
                        </button>
                      </div>
                    )}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Add Modal */}
      {showForm && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
          <div className="bg-white dark:bg-accent rounded-xl p-6 w-full max-w-sm shadow-xl border border-gray-200 dark:border-gray-700">
            <h2 className="text-lg font-heading text-primary mb-4">Add Medium</h2>
            <form onSubmit={handleAdd} className="space-y-4">
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Medium name (e.g., Gujarati, English)"
                className="w-full border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 rounded p-2.5 focus:ring-2 focus:ring-primary outline-none"
                required
              />
              <div className="flex justify-end gap-3">
                <button type="button" onClick={() => setShowForm(false)} className="px-4 py-2 border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-200 rounded hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors">Cancel</button>
                <button type="submit" className="px-4 py-2 bg-primary hover:bg-primary-light text-white rounded transition-colors">Save</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}