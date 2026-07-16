// src/pages/Branches.jsx
import React, { useState, useEffect, useCallback } from "react";
import { supabase } from "../api/supabase";
import { useOrg } from "../context/OrganizationContext";
import { useAuth } from "../context/AuthContext";
import toast from "react-hot-toast";
import {
  Plus,
  Pencil,
  Trash2,
  MapPin,
  Phone,
  Mail,
  Building,
  X,
} from "lucide-react";
import * as branchService from "../services/branchService";

export default function Branches() {
  const orgContext = useOrg();
  const { profile } = useAuth();
  const [org, setOrg] = useState(orgContext?.org || null);
  const [branches, setBranches] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingBranch, setEditingBranch] = useState(null);

  const [form, setForm] = useState({
    branch_name: "",
    address: "",
    city: "",
    state: "",
    pincode: "",
    phone: "",
    email: "",
  });

  // Fallback to load organisation if not provided by context
  useEffect(() => {
    if (!org && profile?.id) {
      const loadOrg = async () => {
        const { data: profileData } = await supabase
          .from("profiles")
          .select("organization_id")
          .eq("id", profile.id)
          .single();
        if (profileData?.organization_id) {
          const { data: orgData } = await supabase
            .from("organization")
            .select("*")
            .eq("id", profileData.organization_id)
            .single();
          if (orgData) setOrg(orgData);
        }
      };
      loadOrg();
    }
  }, [org, profile?.id]);

  // Keep org in sync when context changes
  useEffect(() => {
    if (orgContext?.org) setOrg(orgContext.org);
  }, [orgContext?.org]);

  const fetchBranches = useCallback(async () => {
    try {
      const data = await branchService.getBranches(org?.id);
      setBranches(data);
    } catch (err) {
      toast.error("Failed to load branches");
    } finally {
      setLoading(false);
    }
  }, [org?.id]);

  useEffect(() => {
    if (org?.id) fetchBranches();
  }, [fetchBranches]);

  const openCreateForm = () => {
    setEditingBranch(null);
    setForm({
      branch_name: "",
      address: "",
      city: "",
      state: "",
      pincode: "",
      phone: "",
      email: "",
    });
    setShowForm(true);
  };

  const openEditForm = (branch) => {
    setEditingBranch(branch);
    setForm({
      branch_name: branch.branch_name || "",
      address: branch.address || "",
      city: branch.city || "",
      state: branch.state || "",
      pincode: branch.pincode || "",
      phone: branch.phone || "",
      email: branch.email || "",
    });
    setShowForm(true);
  };

  const handleChange = (e) => {
    const { name, value } = e.target;
    setForm((prev) => ({ ...prev, [name]: value }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!form.branch_name.trim()) {
      toast.error("Branch name is required");
      return;
    }
    if (!org?.id) {
      toast.error("Could not determine your organisation. Please try again.");
      return;
    }

    try {
      if (editingBranch) {
        await branchService.updateBranch(editingBranch.id, form);
        toast.success("Branch updated");
      } else {
        await branchService.createBranch(form, org.id);
        toast.success("Branch created");
      }
      setShowForm(false);
      fetchBranches();
    } catch (err) {
      toast.error(err.message);
    }
  };

  const handleDelete = async (branchId) => {
    if (!window.confirm("Delete this branch? It will be deactivated.")) return;
    try {
      await branchService.deleteBranch(branchId);
      toast.success("Branch deactivated");
      fetchBranches();
    } catch (err) {
      toast.error(err.message);
    }
  };

  if (loading) {
    return (
      <div className="p-6 text-center text-gray-500 dark:text-gray-400">
        Loading branches...
      </div>
    );
  }

  return (
    <div className="space-y-6 px-4 sm:px-6 lg:px-0">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1
            className="text-2xl sm:text-3xl font-bold"
            style={{ fontFamily: "var(--font-heading)", color: "var(--color-primary)" }}
          >
            Branches
          </h1>
          <p
            className="text-sm text-gray-600 dark:text-gray-400 mt-1"
            style={{ fontFamily: "var(--font-body)" }}
          >
            Manage your organization's branches
          </p>
        </div>
        <button
          onClick={openCreateForm}
          className="inline-flex items-center gap-2 px-4 py-2.5 bg-primary hover:bg-primary-light text-white rounded-lg transition-colors text-sm font-medium"
          style={{ fontFamily: "var(--font-body)" }}
        >
          <Plus size={18} /> Add Branch
        </button>
      </div>

      {/* Branch List */}
      {branches.length === 0 ? (
        <div className="text-center py-12 text-gray-500 dark:text-gray-400">
          <Building size={48} className="mx-auto mb-4 opacity-50" />
          <p>No branches yet. Create your first branch to get started.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {branches.map((branch) => (
            <div
              key={branch.id}
              className="bg-white dark:bg-gray-800 rounded-xl p-4 shadow-sm border border-gray-200 dark:border-gray-700 hover:shadow-md transition"
            >
              <div className="flex items-start justify-between">
                <h3 className="font-semibold text-lg truncate text-gray-800 dark:text-gray-100">
                  {branch.branch_name}
                </h3>
                <div className="flex gap-2 ml-2">
                  <button
                    onClick={() => openEditForm(branch)}
                    className="text-primary hover:text-primary-light transition-colors"
                  >
                    <Pencil size={16} />
                  </button>
                  <button
                    onClick={() => handleDelete(branch.id)}
                    className="text-red-500 hover:text-red-700 transition-colors"
                  >
                    <Trash2 size={16} />
                  </button>
                </div>
              </div>
              {branch.address && (
                <p className="text-sm text-gray-600 dark:text-gray-400 mt-2 flex items-center gap-1">
                  <MapPin size={14} /> {branch.address}
                </p>
              )}
              {branch.phone && (
                <p className="text-sm text-gray-600 dark:text-gray-400 mt-1 flex items-center gap-1">
                  <Phone size={14} /> {branch.phone}
                </p>
              )}
              {branch.email && (
                <p className="text-sm text-gray-600 dark:text-gray-400 mt-1 flex items-center gap-1">
                  <Mail size={14} /> {branch.email}
                </p>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Create/Edit Modal */}
      {showForm && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white dark:bg-gray-800 rounded-xl w-full max-w-md shadow-xl border border-gray-200 dark:border-gray-700">
            <div className="sticky top-0 bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 px-6 py-4 flex items-center justify-between rounded-t-xl">
              <h2
                className="text-xl font-bold"
                style={{ fontFamily: "var(--font-heading)", color: "var(--color-primary)" }}
              >
                {editingBranch ? "Edit Branch" : "New Branch"}
              </h2>
              <button
                onClick={() => setShowForm(false)}
                className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors"
              >
                <X size={20} className="text-gray-500 dark:text-gray-400" />
              </button>
            </div>
            <form onSubmit={handleSubmit} className="p-6 space-y-4">
              <div>
                <label
                  className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1"
                  style={{ fontFamily: "var(--font-body)" }}
                >
                  Branch Name *
                </label>
                <input
                  type="text"
                  name="branch_name"
                  value={form.branch_name}
                  onChange={handleChange}
                  required
                  className="w-full border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 rounded-lg p-2.5 text-sm focus:ring-2 focus:ring-[var(--color-primary)] outline-none"
                />
              </div>
              <div>
                <label
                  className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1"
                  style={{ fontFamily: "var(--font-body)" }}
                >
                  Address
                </label>
                <input
                  type="text"
                  name="address"
                  value={form.address}
                  onChange={handleChange}
                  className="w-full border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 rounded-lg p-2.5 text-sm focus:ring-2 focus:ring-[var(--color-primary)] outline-none"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label
                    className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1"
                    style={{ fontFamily: "var(--font-body)" }}
                  >
                    City
                  </label>
                  <input
                    type="text"
                    name="city"
                    value={form.city}
                    onChange={handleChange}
                    className="w-full border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 rounded-lg p-2.5 text-sm focus:ring-2 focus:ring-[var(--color-primary)] outline-none"
                  />
                </div>
                <div>
                  <label
                    className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1"
                    style={{ fontFamily: "var(--font-body)" }}
                  >
                    State
                  </label>
                  <input
                    type="text"
                    name="state"
                    value={form.state}
                    onChange={handleChange}
                    className="w-full border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 rounded-lg p-2.5 text-sm focus:ring-2 focus:ring-[var(--color-primary)] outline-none"
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label
                    className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1"
                    style={{ fontFamily: "var(--font-body)" }}
                  >
                    Pincode
                  </label>
                  <input
                    type="text"
                    name="pincode"
                    value={form.pincode}
                    onChange={handleChange}
                    className="w-full border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 rounded-lg p-2.5 text-sm focus:ring-2 focus:ring-[var(--color-primary)] outline-none"
                  />
                </div>
                <div>
                  <label
                    className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1"
                    style={{ fontFamily: "var(--font-body)" }}
                  >
                    Phone
                  </label>
                  <input
                    type="text"
                    name="phone"
                    value={form.phone}
                    onChange={handleChange}
                    className="w-full border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 rounded-lg p-2.5 text-sm focus:ring-2 focus:ring-[var(--color-primary)] outline-none"
                  />
                </div>
              </div>
              <div>
                <label
                  className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1"
                  style={{ fontFamily: "var(--font-body)" }}
                >
                  Email
                </label>
                <input
                  type="email"
                  name="email"
                  value={form.email}
                  onChange={handleChange}
                  className="w-full border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 rounded-lg p-2.5 text-sm focus:ring-2 focus:ring-[var(--color-primary)] outline-none"
                />
              </div>
              <div className="flex justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setShowForm(false)}
                  className="px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-sm text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
                  style={{ fontFamily: "var(--font-body)" }}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-primary hover:bg-primary-light text-white rounded-lg text-sm font-medium transition-colors"
                  style={{ fontFamily: "var(--font-body)" }}
                >
                  {editingBranch ? "Update" : "Create"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}