// src/pages/ThemeSettings.jsx
import { useState, useEffect } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import toast from "react-hot-toast";
import { Save, RotateCcw } from "lucide-react";

import BackButton from "../components/BackButton";

import { supabase } from "../api/supabase";
import { useTheme } from "../context/ThemeContext";
import { useOrg } from "../context/OrganizationContext";   // NEW

export default function ThemeSettings() {
  const queryClient = useQueryClient();
  const { theme } = useTheme();

  // ── Get current organization from context ──
  const { org: currentOrg } = useOrg();   // NEW

  const [form, setForm] = useState({
    primary_color: "#0D47A1",
    primary_light_color: "#1565C0",
    primary_dark_color: "#0A3478",
    accent_color: "#FF1070",
    accent_light_color: "#FF4081",
    accent_dark_color: "#C51162",
    font_heading: "Righteous",
    font_body: "Montserrat",
    logo_light_url: "",
    logo_dark_url: "",
  });

  useEffect(() => {
    if (theme) {
      setForm({
        primary_color: theme.primary_color,
        primary_light_color: theme.primary_light_color,
        primary_dark_color: theme.primary_dark_color,
        accent_color: theme.accent_color,
        accent_light_color: theme.accent_light_color,
        accent_dark_color: theme.accent_dark_color,
        font_heading: theme.font_heading,
        font_body: theme.font_body,
        logo_light_url: theme.logo_light_url || "",
        logo_dark_url: theme.logo_dark_url || "",
      });
    }
  }, [theme]);

  const updateMutation = useMutation({
    mutationFn: async (payload) => {
      // Use current org id instead of hardcoded 1
      const { error } = await supabase
        .from("themes")
        .update({ ...payload, updated_at: new Date() })
        .eq("org_id", currentOrg?.id);   // <-- FIXED
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Theme updated");
      queryClient.invalidateQueries({ queryKey: ["theme"] });
    },
    onError: (err) => toast.error(err.message),
  });

  const handleChange = (e) => setForm({ ...form, [e.target.name]: e.target.value });
  const handleSubmit = (e) => {
    e.preventDefault();
    updateMutation.mutate(form);
  };

  const resetToDefaults = () => {
    setForm({
      primary_color: "#0D47A1",
      primary_light_color: "#1565C0",
      primary_dark_color: "#0A3478",
      accent_color: "#FF1070",
      accent_light_color: "#FF4081",
      accent_dark_color: "#C51162",
      font_heading: "Righteous",
      font_body: "Montserrat",
      logo_light_url: "/ShreeVidhyalight.png",
      logo_dark_url: "/ShreeVidhyaDark.png",
    });
  };

  return (
    <>
      <BackButton to="/settings-hub" label="Settings" />
      <div className="max-w-4xl mx-auto">
        <h1 className="text-3xl font-righteous text-primary-dark mb-6">Theme Settings</h1>
        <form onSubmit={handleSubmit} className="bg-white rounded-xl p-6 shadow-sm space-y-6">
          {/* Primary colors */}
          <div>
            <h2 className="text-lg font-semibold text-primary-dark mb-3">Primary Colors</h2>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div>
                <label className="block text-sm text-secondary-dark mb-1">Primary</label>
                <input type="color" name="primary_color" value={form.primary_color} onChange={handleChange} className="h-10 w-full rounded border" />
                <input type="text" name="primary_color" value={form.primary_color} onChange={handleChange} className="mt-1 w-full border rounded p-2 text-sm" placeholder="#0D47A1" />
              </div>
              <div>
                <label className="block text-sm text-secondary-dark mb-1">Primary Light</label>
                <input type="color" name="primary_light_color" value={form.primary_light_color} onChange={handleChange} className="h-10 w-full rounded border" />
                <input type="text" name="primary_light_color" value={form.primary_light_color} onChange={handleChange} className="mt-1 w-full border rounded p-2 text-sm" placeholder="#1565C0" />
              </div>
              <div>
                <label className="block text-sm text-secondary-dark mb-1">Primary Dark</label>
                <input type="color" name="primary_dark_color" value={form.primary_dark_color} onChange={handleChange} className="h-10 w-full rounded border" />
                <input type="text" name="primary_dark_color" value={form.primary_dark_color} onChange={handleChange} className="mt-1 w-full border rounded p-2 text-sm" placeholder="#0A3478" />
              </div>
            </div>
          </div>

          {/* Accent colors */}
          <div>
            <h2 className="text-lg font-semibold text-primary-dark mb-3">Accent Colors</h2>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div>
                <label className="block text-sm text-secondary-dark mb-1">Accent</label>
                <input type="color" name="accent_color" value={form.accent_color} onChange={handleChange} className="h-10 w-full rounded border" />
                <input type="text" name="accent_color" value={form.accent_color} onChange={handleChange} className="mt-1 w-full border rounded p-2 text-sm" placeholder="#FF1070" />
              </div>
              <div>
                <label className="block text-sm text-secondary-dark mb-1">Accent Light</label>
                <input type="color" name="accent_light_color" value={form.accent_light_color} onChange={handleChange} className="h-10 w-full rounded border" />
                <input type="text" name="accent_light_color" value={form.accent_light_color} onChange={handleChange} className="mt-1 w-full border rounded p-2 text-sm" placeholder="#FF4081" />
              </div>
              <div>
                <label className="block text-sm text-secondary-dark mb-1">Accent Dark</label>
                <input type="color" name="accent_dark_color" value={form.accent_dark_color} onChange={handleChange} className="h-10 w-full rounded border" />
                <input type="text" name="accent_dark_color" value={form.accent_dark_color} onChange={handleChange} className="mt-1 w-full border rounded p-2 text-sm" placeholder="#C51162" />
              </div>
            </div>
          </div>

          {/* Fonts */}
          <div>
            <h2 className="text-lg font-semibold text-primary-dark mb-3">Fonts</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm text-secondary-dark mb-1">Heading Font</label>
                <select name="font_heading" value={form.font_heading} onChange={handleChange} className="w-full border rounded p-2 text-sm">
                  <option>Righteous</option>
                  <option>Poppins</option>
                  <option>Playfair Display</option>
                  <option>Merriweather</option>
                </select>
              </div>
              <div>
                <label className="block text-sm text-secondary-dark mb-1">Body Font</label>
                <select name="font_body" value={form.font_body} onChange={handleChange} className="w-full border rounded p-2 text-sm">
                  <option>Montserrat</option>
                  <option>Inter</option>
                  <option>Roboto</option>
                  <option>Open Sans</option>
                  <option>Nunito</option>
                </select>
              </div>
            </div>
          </div>

          {/* Logos */}
          <div>
            <h2 className="text-lg font-semibold text-primary-dark mb-3">Logos</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm text-secondary-dark mb-1">Light Logo URL</label>
                <input type="text" name="logo_light_url" value={form.logo_light_url} onChange={handleChange} placeholder="/ShreeVidhyalight.png" className="w-full border rounded p-2 text-sm" />
              </div>
              <div>
                <label className="block text-sm text-secondary-dark mb-1">Dark Logo URL</label>
                <input type="text" name="logo_dark_url" value={form.logo_dark_url} onChange={handleChange} placeholder="/ShreeVidhyaDark.png" className="w-full border rounded p-2 text-sm" />
              </div>
            </div>
          </div>

          {/* Actions */}
          <div className="flex gap-3">
            <button type="submit" disabled={updateMutation.isPending} className="bg-primary text-white px-5 py-2.5 rounded-lg flex items-center gap-2 hover:bg-primary-light">
              <Save size={18} /> Save Theme
            </button>
            <button type="button" onClick={resetToDefaults} className="border border-secondary-light px-4 py-2.5 rounded-lg flex items-center gap-2 text-secondary-dark hover:bg-secondary-bg">
              <RotateCcw size={18} /> Reset to Defaults
            </button>
          </div>
        </form>
      </div>
    </>
  );
}