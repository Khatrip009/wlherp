// src/pages/Vendors.jsx
import { useState, useRef } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { getVendors, createVendor, updateVendor, deleteVendor } from "../services/vendorService";
import { supabase } from "../api/supabase";
import toast from "react-hot-toast";

import { Search, Plus, Edit3, Trash2, X, Save, Loader } from "lucide-react";
import GSTLookup from "../components/GSTLookup";
import { useOrg } from "../context/OrganizationContext";

export default function Vendors() {
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState({
    vendor_name: "",
    gstin: "",
    pan: "",
    address: "",
    state_code: "",
    contact_person: "",
    phone: "",
    email: "",
    bank_name: "",
    account_number: "",
    ifsc_code: "",
  });

  // ── Organisation / Branch / Financial Year context ──
  const { branch, selectedFinancialYear } = useOrg();
  const branchId = branch?.id;
  const financialYearId = selectedFinancialYear?.id;
  const ctx = { branchId, financialYearId };

  // Fetch vendors with optional search – scoped to branch & FY
  const { data: vendors = [], isLoading } = useQuery({
    queryKey: ["vendors", search, branchId, financialYearId],
    queryFn: () => getVendors({ search }, branchId, financialYearId),
    enabled: !!branchId && !!financialYearId,
    staleTime: 5 * 60 * 1000,
  });

  // Fetch states for dropdown (organisation‑wide)
  const { data: states = [] } = useQuery({
    queryKey: ["states-dropdown"],
    queryFn: async () => {
      const { data } = await supabase.from("states").select("id, name, code").order("name");
      return data || [];
    },
    staleTime: 10 * 60 * 1000,
  });

  // Mutations – now pass context for write / scoped IDs for delete
  const createMutation = useMutation({
    mutationFn: (payload) => createVendor(payload, ctx),
    onSuccess: () => {
      toast.success("Vendor created");
      queryClient.invalidateQueries(["vendors"]);
      closeModal();
    },
    onError: (err) => toast.error(err.message),
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, payload }) => updateVendor(id, payload, ctx),
    onSuccess: () => {
      toast.success("Vendor updated");
      queryClient.invalidateQueries(["vendors"]);
      closeModal();
    },
    onError: (err) => toast.error(err.message),
  });

  const deleteMutation = useMutation({
    mutationFn: (id) => deleteVendor(id, branchId, financialYearId),
    onSuccess: () => {
      toast.success("Vendor deleted");
      queryClient.invalidateQueries(["vendors"]);
    },
    onError: (err) => toast.error(err.message),
  });

  // Form handlers (unchanged)
  const openCreate = () => {
    setEditing(null);
    setForm({
      vendor_name: "",
      gstin: "",
      pan: "",
      address: "",
      state_code: "",
      contact_person: "",
      phone: "",
      email: "",
      bank_name: "",
      account_number: "",
      ifsc_code: "",
    });
    setModalOpen(true);
  };

  const openEdit = (vendor) => {
    setEditing(vendor);
    setForm({
      vendor_name: vendor.vendor_name || "",
      gstin: vendor.gstin || "",
      pan: vendor.pan || "",
      address: vendor.address || "",
      state_code: vendor.state_code || "",
      contact_person: vendor.contact_person || "",
      phone: vendor.phone || "",
      email: vendor.email || "",
      bank_name: vendor.bank_name || "",
      account_number: vendor.account_number || "",
      ifsc_code: vendor.ifsc_code || "",
    });
    setModalOpen(true);
  };

  const closeModal = () => {
    setModalOpen(false);
    setEditing(null);
  };

  const handleChange = (e) => {
    const { name, value } = e.target;
    setForm((prev) => ({ ...prev, [name]: value }));
  };

  // Auto‑fill from GST lookup (unchanged)
  const handleGSTLookupSuccess = (data) => {
    setForm((prev) => ({
      ...prev,
      vendor_name: data.legal_name || prev.vendor_name,
      address: data.address || prev.address,
      state_code: data.state_code || prev.state_code,
    }));
    toast.success("Vendor details auto‑filled from GSTIN");
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!form.vendor_name.trim()) {
      toast.error("Vendor name is required");
      return;
    }
    const payload = { ...form };
    if (payload.gstin) {
      payload.gstin = payload.gstin.replace(/\s/g, "").toUpperCase();
    }
    if (editing) {
      updateMutation.mutate({ id: editing.id, payload });
    } else {
      createMutation.mutate(payload);
    }
  };

  const handleDelete = (id) => {
    if (window.confirm("Are you sure you want to delete this vendor?")) {
      deleteMutation.mutate(id);
    }
  };

  return (
    <>
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-3xl font-righteous text-primary-dark">Vendors</h1>
        <button
          onClick={openCreate}
          className="bg-primary text-white px-4 py-2 rounded-lg text-sm flex items-center gap-2"
        >
          <Plus size={16} /> Add Vendor
        </button>
      </div>

      {/* Search */}
      <div className="relative mb-4 max-w-md">
        <Search size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-secondary" />
        <input
          type="text"
          placeholder="Search vendors..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full pl-10 pr-4 py-2.5 border rounded-lg text-sm"
        />
      </div>

      {/* Table */}
      <div className="bg-white rounded-xl shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[700px]">
            <thead className="bg-slate-100">
              <tr>
                <th className="p-3 text-left text-sm">Vendor Name</th>
                <th className="p-3 text-left text-sm">GSTIN</th>
                <th className="p-3 text-left text-sm">Contact</th>
                <th className="p-3 text-left text-sm">Phone</th>
                <th className="p-3 text-left text-sm">State</th>
                <th className="p-3 text-left text-sm">Actions</th>
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                <tr>
                  <td colSpan={6} className="p-6 text-center text-secondary">Loading vendors…</td>
                </tr>
              ) : vendors.length === 0 ? (
                <tr>
                  <td colSpan={6} className="p-6 text-center text-secondary">No vendors found.</td>
                </tr>
              ) : (
                vendors.map((vendor) => (
                  <tr key={vendor.id} className="border-t hover:bg-gray-50 transition">
                    <td className="p-3 text-sm font-medium">{vendor.vendor_name}</td>
                    <td className="p-3 text-sm">{vendor.gstin || "—"}</td>
                    <td className="p-3 text-sm">{vendor.contact_person || "—"}</td>
                    <td className="p-3 text-sm">{vendor.phone || "—"}</td>
                    <td className="p-3 text-sm">{vendor.state_code || "—"}</td>
                    <td className="p-3 text-sm">
                      <div className="flex gap-2">
                        <button
                          onClick={() => openEdit(vendor)}
                          className="text-blue-600 hover:underline"
                        >
                          <Edit3 size={15} />
                        </button>
                        <button
                          onClick={() => handleDelete(vendor.id)}
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

      {/* Modal for Create/Edit */}
      {modalOpen && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto shadow-xl">
            <div className="sticky top-0 bg-white px-6 py-4 border-b flex items-center justify-between rounded-t-xl">
              <h2 className="text-xl font-righteous text-primary-dark">
                {editing ? "Edit Vendor" : "Add Vendor"}
              </h2>
              <button onClick={closeModal} className="p-2 hover:bg-secondary-bg rounded-lg">
                <X size={20} className="text-secondary-dark" />
              </button>
            </div>

            <form onSubmit={handleSubmit} className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-montserrat text-secondary-dark mb-1">
                  Vendor Name *
                </label>
                <input
                  type="text"
                  name="vendor_name"
                  value={form.vendor_name}
                  onChange={handleChange}
                  className="w-full border border-secondary-light rounded p-2.5 focus:ring-1 focus:ring-primary"
                  required
                />
              </div>

              <div>
                <label className="block text-sm font-montserrat text-secondary-dark mb-1">
                  GSTIN
                </label>
                <div className="flex flex-col sm:flex-row gap-2">
                  <input
                    type="text"
                    name="gstin"
                    value={form.gstin}
                    onChange={handleChange}
                    className="flex-1 border border-secondary-light rounded p-2.5 focus:ring-1 focus:ring-primary uppercase"
                    placeholder="22AAAAA0000A1Z5"
                    maxLength={15}
                  />
                  <GSTLookup
                    gstin={form.gstin}
                    onSuccess={handleGSTLookupSuccess}
                    buttonText="Fetch GST Details"
                    className="flex-shrink-0"
                  />
                </div>
                <p className="text-xs text-secondary-light mt-1">
                  Enter 15‑character GSTIN and click "Fetch GST Details" to auto‑fill name, address, and state.
                </p>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-montserrat text-secondary-dark mb-1">
                    PAN
                  </label>
                  <input
                    type="text"
                    name="pan"
                    value={form.pan}
                    onChange={handleChange}
                    className="w-full border border-secondary-light rounded p-2.5 focus:ring-1 focus:ring-primary uppercase"
                    placeholder="ABCDE1234F"
                    maxLength={10}
                  />
                </div>
                <div>
                  <label className="block text-sm font-montserrat text-secondary-dark mb-1">
                    State
                  </label>
                  <select
                    name="state_code"
                    value={form.state_code}
                    onChange={handleChange}
                    className="w-full border border-secondary-light rounded p-2.5 focus:ring-1 focus:ring-primary"
                  >
                    <option value="">Select State</option>
                    {states.map((state) => (
                      <option key={state.id} value={state.code}>
                        {state.name} ({state.code})
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-sm font-montserrat text-secondary-dark mb-1">
                  Address
                </label>
                <textarea
                  name="address"
                  value={form.address}
                  onChange={handleChange}
                  rows={2}
                  className="w-full border border-secondary-light rounded p-2.5 focus:ring-1 focus:ring-primary"
                  placeholder="Full address"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-montserrat text-secondary-dark mb-1">
                    Contact Person
                  </label>
                  <input
                    type="text"
                    name="contact_person"
                    value={form.contact_person}
                    onChange={handleChange}
                    className="w-full border border-secondary-light rounded p-2.5 focus:ring-1 focus:ring-primary"
                  />
                </div>
                <div>
                  <label className="block text-sm font-montserrat text-secondary-dark mb-1">
                    Phone
                  </label>
                  <input
                    type="tel"
                    name="phone"
                    value={form.phone}
                    onChange={handleChange}
                    className="w-full border border-secondary-light rounded p-2.5 focus:ring-1 focus:ring-primary"
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-montserrat text-secondary-dark mb-1">
                  Email
                </label>
                <input
                  type="email"
                  name="email"
                  value={form.email}
                  onChange={handleChange}
                  className="w-full border border-secondary-light rounded p-2.5 focus:ring-1 focus:ring-primary"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div>
                  <label className="block text-sm font-montserrat text-secondary-dark mb-1">
                    Bank Name
                  </label>
                  <input
                    type="text"
                    name="bank_name"
                    value={form.bank_name}
                    onChange={handleChange}
                    className="w-full border border-secondary-light rounded p-2.5 focus:ring-1 focus:ring-primary"
                  />
                </div>
                <div>
                  <label className="block text-sm font-montserrat text-secondary-dark mb-1">
                    Account Number
                  </label>
                  <input
                    type="text"
                    name="account_number"
                    value={form.account_number}
                    onChange={handleChange}
                    className="w-full border border-secondary-light rounded p-2.5 focus:ring-1 focus:ring-primary"
                  />
                </div>
                <div>
                  <label className="block text-sm font-montserrat text-secondary-dark mb-1">
                    IFSC Code
                  </label>
                  <input
                    type="text"
                    name="ifsc_code"
                    value={form.ifsc_code}
                    onChange={handleChange}
                    className="w-full border border-secondary-light rounded p-2.5 focus:ring-1 focus:ring-primary uppercase"
                    placeholder="SBIN0001234"
                  />
                </div>
              </div>

              <div className="flex justify-end gap-3 pt-2 border-t">
                <button
                  type="button"
                  onClick={closeModal}
                  className="border border-secondary-light px-4 py-2 rounded-lg text-sm hover:bg-secondary-bg transition"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={createMutation.isPending || updateMutation.isPending}
                  className="bg-primary hover:bg-primary-light text-white px-6 py-2 rounded-lg text-sm flex items-center gap-2 transition disabled:opacity-50"
                >
                  {(createMutation.isPending || updateMutation.isPending) ? (
                    <>
                      <Loader className="w-4 h-4 animate-spin" />
                      Saving...
                    </>
                  ) : (
                    <>
                      <Save size={16} />
                      {editing ? "Update" : "Create"}
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}