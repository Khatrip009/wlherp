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
import AdminLayout from "../layouts/AdminLayout";
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
    <AdminLayout>
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-3xl font-righteous text-primary-dark">Mediums</h1>
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

      <div className="bg-white rounded-xl shadow-sm overflow-x-auto">
        <table className="w-full min-w-[400px]">
          <thead className="bg-slate-100">
            <tr>
              <th className="p-3 text-left">Name</th>
              <th className="p-3 text-left w-32">Actions</th>
            </tr>
          </thead>
          <tbody>
            {isLoading ? (
              <tr><td colSpan={2} className="p-4 text-center">Loading...</td></tr>
            ) : mediums.length === 0 ? (
              <tr><td colSpan={2} className="p-4 text-center">No mediums found.</td></tr>
            ) : (
              mediums.map((m) => (
                <tr key={m.id} className="border-t">
                  <td className="p-3">
                    {editId === m.id ? (
                      <input
                        value={name}
                        onChange={(e) => setName(e.target.value)}
                        className="border border-secondary-light rounded p-2 w-full"
                        placeholder="Medium name"
                      />
                    ) : (
                      m.name
                    )}
                  </td>
                  <td className="p-3">
                    {editId === m.id ? (
                      <div className="flex gap-2">
                        <button
                          onClick={() => handleUpdate(m.id)}
                          className="text-primary hover:underline"
                        >
                          <Save size={16} />
                        </button>
                        <button
                          onClick={() => setEditId(null)}
                          className="text-secondary hover:underline"
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
                          className="text-blue-600 hover:underline"
                        >
                          <Edit3 size={16} />
                        </button>
                        <button
                          onClick={() => {
                            if (window.confirm("Delete this medium?"))
                              deleteMutation.mutate(m.id);
                          }}
                          className="text-red-600 hover:underline"
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
          <div className="bg-white rounded-xl p-6 w-full max-w-sm shadow-xl">
            <h2 className="text-lg font-righteous text-primary-dark mb-4">Add Medium</h2>
            <form onSubmit={handleAdd} className="space-y-4">
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Medium name (e.g., Gujarati, English)"
                className="w-full border border-secondary-light rounded p-2.5 focus:ring-1 focus:ring-primary outline-none"
                required
              />
              <div className="flex justify-end gap-3">
                <button type="button" onClick={() => setShowForm(false)} className="px-4 py-2 border rounded">Cancel</button>
                <button type="submit" className="px-4 py-2 bg-primary text-white rounded">Save</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </AdminLayout>
  );
}