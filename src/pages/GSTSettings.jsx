// src/pages/GSTSettings.jsx
import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "../api/supabase";
import { getOrganization, updateOrganization } from "../services/organizationService";
import toast from "react-hot-toast";
import AdminLayout from "../layouts/AdminLayout";
import { Save, Loader, Building, Info } from "lucide-react";
import GSTLookup from "../components/GSTLookup";

export default function GSTSettings() {
  const queryClient = useQueryClient();

  const { data: org, isLoading } = useQuery({
    queryKey: ["organization"],
    queryFn: getOrganization,
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
    const { name, value, type, checked } = e.target;
    setForm((prev) => ({
      ...prev,
      [name]: type === "checkbox" ? checked : value,
    }));
  };

  // ── Auto‑fill from GST lookup ──
  const handleGSTLookupSuccess = (data) => {
    setForm((prev) => ({
      ...prev,
      business_legal_name: data.legal_name || prev.business_legal_name,
      trade_name: data.trade_name || prev.trade_name,
      state_code: data.state_code || prev.state_code,
      registration_type: data.registration_type || prev.registration_type,
      // Optionally, you can also set gstin if not already set
      // gstin: data.gstin,
    }));
  };

  const handleSubmit = (e) => {
    e.preventDefault();
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
      <AdminLayout>
        <div className="p-8 text-center text-secondary">Loading settings…</div>
      </AdminLayout>
    );
  }

  return (
    <AdminLayout>
      <div className="mb-6">
        <h1 className="text-3xl font-righteous text-primary-dark">GST Settings</h1>
        <p className="text-sm text-secondary-dark mt-1">
          Configure GST registration and default tax settings for your organization
        </p>
      </div>

      <form onSubmit={handleSubmit} className="bg-white rounded-xl shadow-sm p-6 max-w-3xl space-y-6">
        {/* GST Registered toggle */}
        <div className="flex items-center gap-3">
          <input
            type="checkbox"
            id="gst_registered"
            name="gst_registered"
            checked={form.gst_registered}
            onChange={handleChange}
            className="w-5 h-5 text-primary border-gray-300 rounded focus:ring-primary"
          />
          <label htmlFor="gst_registered" className="text-sm font-medium text-gray-700">
            GST Registered
          </label>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-montserrat text-secondary-dark mb-1">
              Business Legal Name
            </label>
            <input
              type="text"
              name="business_legal_name"
              value={form.business_legal_name}
              onChange={handleChange}
              className="w-full border border-secondary-light rounded p-2.5 focus:ring-1 focus:ring-primary"
              placeholder="As per GST registration"
            />
          </div>
          <div>
            <label className="block text-sm font-montserrat text-secondary-dark mb-1">
              Trade Name
            </label>
            <input
              type="text"
              name="trade_name"
              value={form.trade_name}
              onChange={handleChange}
              className="w-full border border-secondary-light rounded p-2.5 focus:ring-1 focus:ring-primary"
              placeholder="Display name (optional)"
            />
          </div>
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
            Enter 15‑character alphanumeric GSTIN and click "Fetch GST Details" to auto‑fill legal name, state, and registration type.
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
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
          <div>
            <label className="block text-sm font-montserrat text-secondary-dark mb-1">
              Place of Supply (Default)
            </label>
            <select
              name="place_of_supply"
              value={form.place_of_supply}
              onChange={handleChange}
              className="w-full border border-secondary-light rounded p-2.5 focus:ring-1 focus:ring-primary"
            >
              <option value="">Default Place of Supply</option>
              {states.map((state) => (
                <option key={state.id} value={state.code}>
                  {state.name} ({state.code})
                </option>
              ))}
            </select>
            <p className="text-xs text-secondary-light mt-1">Default state for inter‑state supplies</p>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-montserrat text-secondary-dark mb-1">
              Registration Type
            </label>
            <select
              name="registration_type"
              value={form.registration_type}
              onChange={handleChange}
              className="w-full border border-secondary-light rounded p-2.5 focus:ring-1 focus:ring-primary"
            >
              <option value="">Select Type</option>
              <option value="Regular">Regular</option>
              <option value="Composition">Composition</option>
              <option value="Unregistered">Unregistered</option>
            </select>
          </div>
          <div>
            <label className="block text-sm font-montserrat text-secondary-dark mb-1">
              Financial Year
            </label>
            <input
              type="text"
              name="financial_year"
              value={form.financial_year}
              onChange={handleChange}
              className="w-full border border-secondary-light rounded p-2.5 focus:ring-1 focus:ring-primary"
              placeholder="e.g. 2025-26"
            />
          </div>
        </div>

        <div>
          <label className="block text-sm font-montserrat text-secondary-dark mb-1">
            Fiscal Year Start Date
          </label>
          <input
            type="date"
            name="fiscal_year_start"
            value={form.fiscal_year_start}
            onChange={handleChange}
            className="w-full border border-secondary-light rounded p-2.5 focus:ring-1 focus:ring-primary"
          />
        </div>

        <div className="flex justify-end pt-4 border-t">
          <button
            type="submit"
            disabled={mutation.isPending}
            className="bg-primary hover:bg-primary-light text-white px-6 py-2.5 rounded-lg font-montserrat transition disabled:opacity-50 flex items-center gap-2"
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
      </form>
    </AdminLayout>
  );
}