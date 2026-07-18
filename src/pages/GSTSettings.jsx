import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "../api/supabase";
import { useAuth } from "../context/AuthContext";
import { useOrg } from "../context/OrganizationContext";
import { getOrganization, updateOrganization } from "../services/organizationService";
import toast from "react-hot-toast";
import { Save, Loader, Building, Info } from "lucide-react";
import GSTLookup from "../components/GSTLookup";

export default function GSTSettings() {
  const { profile } = useAuth();
  const { org: currentOrg } = useOrg();
  const queryClient = useQueryClient();

  // ── Check if user is branch admin ──
  const isBranchAdmin = profile?.role?.toLowerCase() === "branch_admin";

  // ── Fetch organisation – use current org id from context if available ──
  const { data: org, isLoading } = useQuery({
    queryKey: ["organization", currentOrg?.id],
    queryFn: () => getOrganization(currentOrg?.id),
    enabled: !!currentOrg?.id,
    staleTime: 10 * 60 * 1000,
  });

  const { data: states = [] } = useQuery({
    queryKey: ["states"],
    queryFn: async () => {
      const { data } = await supabase.from("states").select("id, name, code").order("name");
      return data || [];
    },
    staleTime: 10 * 60 * 1000,
  });

  const [form, setForm] = useState({
    gst_registered: false,
    business_legal_name: "",
    trade_name: "",
    gstin: "",
    state_code: "",
    place_of_supply: "",
    registration_type: "",
    fiscal_year_start: "",
    financial_year: "",
  });

  useEffect(() => {
    if (org) {
      setForm({
        gst_registered: org.gst_registered || false,
        business_legal_name: org.business_legal_name || "",
        trade_name: org.trade_name || "",
        gstin: org.gstin || "",
        state_code: org.state_code || "",
        place_of_supply: org.place_of_supply || "",
        registration_type: org.registration_type || "",
        fiscal_year_start: org.fiscal_year_start || "",
        financial_year: org.financial_year || "",
      });
    }
  }, [org]);

  const mutation = useMutation({
    mutationFn: (payload) => updateOrganization(payload),
    onSuccess: () => {
      toast.success("GST settings updated successfully");
      queryClient.invalidateQueries(["organization"]);
    },
    onError: (err) => toast.error(err.message || "Failed to update GST settings"),
  });

  const handleChange = (e) => {
    if (isBranchAdmin) return;
    const { name, value, type, checked } = e.target;
    setForm((prev) => ({
      ...prev,
      [name]: type === "checkbox" ? checked : value,
    }));
  };

  const handleGSTLookupSuccess = (data) => {
    if (isBranchAdmin) return;
    setForm((prev) => ({
      ...prev,
      business_legal_name: data.legal_name || prev.business_legal_name,
      trade_name: data.trade_name || prev.trade_name,
      state_code: data.state_code || prev.state_code,
      registration_type: data.registration_type || prev.registration_type,
    }));
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    if (isBranchAdmin) return;
    if (form.gst_registered && form.gstin) {
      const gstinClean = form.gstin.replace(/\s/g, "").toUpperCase();
      if (gstinClean.length !== 15) {
        toast.error("GSTIN must be exactly 15 characters");
        return;
      }
      setForm((prev) => ({ ...prev, gstin: gstinClean }));
    }
    mutation.mutate(form);
  };

  if (isLoading) {
    return (
      <div className="p-8 text-center text-gray-500 dark:text-gray-400">Loading settings…</div>
    );
  }

  return (
    <div className="space-y-6 px-4 sm:px-6 lg:px-0">
      {/* Header */}
      <div>
        <h1
          className="text-2xl sm:text-3xl font-bold"
          style={{ fontFamily: "var(--font-heading)", color: "var(--color-primary)" }}
        >
          GST Settings
        </h1>
        <p
          className="text-sm text-gray-600 dark:text-gray-400 mt-1"
          style={{ fontFamily: "var(--font-body)" }}
        >
          Configure GST registration and default tax settings for your organization
        </p>
      </div>

      {isBranchAdmin && (
        <div className="bg-yellow-50 border-l-4 border-yellow-400 p-4 rounded">
          <p className="text-yellow-700 text-sm font-medium">Read‑only mode</p>
          <p className="text-yellow-600 text-sm">
            As a branch admin, you can view but cannot edit GST settings.
          </p>
        </div>
      )}

      {/* Form */}
      <form
        onSubmit={handleSubmit}
        className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 p-6 max-w-3xl space-y-6"
      >
        {/* GST Registered toggle */}
        <div className="flex items-center gap-3">
          <input
            type="checkbox"
            id="gst_registered"
            name="gst_registered"
            checked={form.gst_registered}
            onChange={handleChange}
            disabled={isBranchAdmin}
            className="w-5 h-5 text-primary border-gray-300 dark:border-gray-600 rounded focus:ring-primary dark:focus:ring-offset-gray-800 disabled:opacity-50"
          />
          <label
            htmlFor="gst_registered"
            className="text-sm font-medium text-gray-700 dark:text-gray-300 disabled:opacity-50"
            style={{ fontFamily: "var(--font-body)" }}
          >
            GST Registered
          </label>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label
              className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1"
              style={{ fontFamily: "var(--font-body)" }}
            >
              Business Legal Name
            </label>
            <input
              type="text"
              name="business_legal_name"
              value={form.business_legal_name}
              onChange={handleChange}
              disabled={isBranchAdmin}
              className="w-full border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 rounded-lg p-2.5 text-sm focus:ring-2 focus:ring-[var(--color-primary)] outline-none disabled:bg-gray-100 disabled:text-gray-500 dark:disabled:bg-gray-600 dark:disabled:text-gray-400"
              placeholder="As per GST registration"
            />
          </div>
          <div>
            <label
              className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1"
              style={{ fontFamily: "var(--font-body)" }}
            >
              Trade Name
            </label>
            <input
              type="text"
              name="trade_name"
              value={form.trade_name}
              onChange={handleChange}
              disabled={isBranchAdmin}
              className="w-full border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 rounded-lg p-2.5 text-sm focus:ring-2 focus:ring-[var(--color-primary)] outline-none disabled:bg-gray-100 disabled:text-gray-500 dark:disabled:bg-gray-600 dark:disabled:text-gray-400"
              placeholder="Display name (optional)"
            />
          </div>
        </div>

        <div>
          <label
            className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1"
            style={{ fontFamily: "var(--font-body)" }}
          >
            GSTIN
          </label>
          <div className="flex flex-col sm:flex-row gap-2">
            <input
              type="text"
              name="gstin"
              value={form.gstin}
              onChange={handleChange}
              disabled={isBranchAdmin}
              className="flex-1 border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 rounded-lg p-2.5 text-sm uppercase focus:ring-2 focus:ring-[var(--color-primary)] outline-none disabled:bg-gray-100 disabled:text-gray-500 dark:disabled:bg-gray-600 dark:disabled:text-gray-400"
              placeholder="22AAAAA0000A1Z5"
              maxLength={15}
            />
            {!isBranchAdmin && (
              <GSTLookup
                gstin={form.gstin}
                onSuccess={handleGSTLookupSuccess}
                buttonText="Fetch GST Details"
                className="flex-shrink-0"
              />
            )}
          </div>
          <p
            className="text-xs text-gray-500 dark:text-gray-400 mt-1"
            style={{ fontFamily: "var(--font-body)" }}
          >
            Enter 15‑character alphanumeric GSTIN and click "Fetch GST Details" to auto‑fill legal
            name, state, and registration type.
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label
              className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1"
              style={{ fontFamily: "var(--font-body)" }}
            >
              State
            </label>
            <select
              name="state_code"
              value={form.state_code}
              onChange={handleChange}
              disabled={isBranchAdmin}
              className="w-full border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 rounded-lg p-2.5 text-sm focus:ring-2 focus:ring-[var(--color-primary)] outline-none disabled:bg-gray-100 disabled:text-gray-500 dark:disabled:bg-gray-600 dark:disabled:text-gray-400"
            >
              <option value="">Select State</option>
              {states.map((state) => (
                <option key={state.id} value={state.code}>
                  {state.name} ({state.code})
                </option>
              ))}
            </select>
          </div>
          <div>
            <label
              className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1"
              style={{ fontFamily: "var(--font-body)" }}
            >
              Place of Supply (Default)
            </label>
            <select
              name="place_of_supply"
              value={form.place_of_supply}
              onChange={handleChange}
              disabled={isBranchAdmin}
              className="w-full border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 rounded-lg p-2.5 text-sm focus:ring-2 focus:ring-[var(--color-primary)] outline-none disabled:bg-gray-100 disabled:text-gray-500 dark:disabled:bg-gray-600 dark:disabled:text-gray-400"
            >
              <option value="">Default Place of Supply</option>
              {states.map((state) => (
                <option key={state.id} value={state.code}>
                  {state.name} ({state.code})
                </option>
              ))}
            </select>
            <p
              className="text-xs text-gray-500 dark:text-gray-400 mt-1"
              style={{ fontFamily: "var(--font-body)" }}
            >
              Default state for inter‑state supplies
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label
              className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1"
              style={{ fontFamily: "var(--font-body)" }}
            >
              Registration Type
            </label>
            <select
              name="registration_type"
              value={form.registration_type}
              onChange={handleChange}
              disabled={isBranchAdmin}
              className="w-full border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 rounded-lg p-2.5 text-sm focus:ring-2 focus:ring-[var(--color-primary)] outline-none disabled:bg-gray-100 disabled:text-gray-500 dark:disabled:bg-gray-600 dark:disabled:text-gray-400"
            >
              <option value="">Select Type</option>
              <option value="Regular">Regular</option>
              <option value="Composition">Composition</option>
              <option value="Unregistered">Unregistered</option>
            </select>
          </div>
          <div>
            <label
              className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1"
              style={{ fontFamily: "var(--font-body)" }}
            >
              Financial Year
            </label>
            <input
              type="text"
              name="financial_year"
              value={form.financial_year}
              onChange={handleChange}
              disabled={isBranchAdmin}
              className="w-full border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 rounded-lg p-2.5 text-sm focus:ring-2 focus:ring-[var(--color-primary)] outline-none disabled:bg-gray-100 disabled:text-gray-500 dark:disabled:bg-gray-600 dark:disabled:text-gray-400"
              placeholder="e.g. 2025-26"
            />
          </div>
        </div>

        <div>
          <label
            className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1"
            style={{ fontFamily: "var(--font-body)" }}
          >
            Fiscal Year Start Date
          </label>
          <input
            type="date"
            name="fiscal_year_start"
            value={form.fiscal_year_start}
            onChange={handleChange}
            disabled={isBranchAdmin}
            className="w-full border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 rounded-lg p-2.5 text-sm focus:ring-2 focus:ring-[var(--color-primary)] outline-none disabled:bg-gray-100 disabled:text-gray-500 dark:disabled:bg-gray-600 dark:disabled:text-gray-400"
          />
        </div>

        {/* Save button – hidden for branch admin */}
        {!isBranchAdmin && (
          <div className="flex justify-end pt-4 border-t border-gray-200 dark:border-gray-700">
            <button
              type="submit"
              disabled={mutation.isPending}
              className="bg-primary hover:bg-primary-light text-white px-6 py-2.5 rounded-lg text-sm font-medium transition disabled:opacity-50 flex items-center gap-2"
              style={{ fontFamily: "var(--font-body)" }}
            >
              {mutation.isPending ? (
                <>
                  <Loader className="w-4 h-4 animate-spin" />
                  Saving...
                </>
              ) : (
                <>
                  <Save className="w-4 h-4" />
                  Save Settings
                </>
              )}
            </button>
          </div>
        )}

        {isBranchAdmin && (
          <div className="text-center text-sm text-gray-400 border-t pt-4 mt-2">
            You are viewing this page in read‑only mode.
          </div>
        )}
      </form>
    </div>
  );
}