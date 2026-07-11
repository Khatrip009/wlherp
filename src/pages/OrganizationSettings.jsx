// src/pages/OrganizationSettings.jsx
import { useState, useEffect } from "react";
import { supabase } from "../api/supabase";
import { useOrg } from "../context/OrganizationContext";
import toast from "react-hot-toast";
import AdminLayout from "../layouts/AdminLayout";
import { Building, Phone, Mail, Globe, MapPin, Eye, EyeOff, Save, FileText } from "lucide-react";
import { getMediums } from "../services/mediumService";
import { updateOrganization } from "../services/organizationService";

export default function OrganizationSettings() {
  const orgContext = useOrg();
  const [org, setOrg] = useState(orgContext?.org || null);
  const [loadingOrg, setLoadingOrg] = useState(!org);

  const [form, setForm] = useState({
    company_name: "",
    phone: "",
    email: "",
    website: "",
    gstin: "",
    address: "",
    vision: "",
    mission: "",
    description: "",
  });

  const [lightLogoFile, setLightLogoFile] = useState(null);
  const [darkLogoFile, setDarkLogoFile] = useState(null);
  const [letterheadFile, setLetterheadFile] = useState(null);
  const [saving, setSaving] = useState(false);

  const [allMediums, setAllMediums] = useState([]);
  const [selectedMediumIds, setSelectedMediumIds] = useState([]);

  // Fetch org from context or profile
  useEffect(() => {
    if (!org) {
      const loadOrgFromProfile = async () => {
        try {
          const { data: { user } } = await supabase.auth.getUser();
          if (!user) return;
          const { data: profile } = await supabase
            .from("profiles")
            .select("organization_id")
            .eq("id", user.id)
            .single();
          if (profile?.organization_id) {
            const { data: orgData } = await supabase
              .from("organization")
              .select("*")
              .eq("id", profile.organization_id)
              .single();
            if (orgData) setOrg(orgData);
          }
        } catch (err) {
          console.error("Failed to load organization:", err);
        } finally {
          setLoadingOrg(false);
        }
      };
      loadOrgFromProfile();
    }
  }, [org]);

  // Fetch all mediums and current linked mediums
  useEffect(() => {
    getMediums().then(setAllMediums).catch(console.error);
    if (org) {
      supabase
        .from("organization_mediums")
        .select("medium_id")
        .eq("org_id", org.id)
        .then(({ data }) => {
          const ids = (data || []).map((r) => r.medium_id);
          setSelectedMediumIds(ids);
        });
    }
  }, [org]);

  // Pre‑fill form fields when org is loaded
  useEffect(() => {
    if (org) {
      setForm({
        company_name: org.company_name || "",
        phone: org.phone || "",
        email: org.email || "",
        website: org.website || "",
        gstin: org.gstin || "",
        address: org.address || "",
        vision: org.vision || "",
        mission: org.mission || "",
        description: org.description || "",
      });
    }
  }, [org]);

  const handleChange = (e) => {
    const { name, value } = e.target;
    setForm((prev) => ({ ...prev, [name]: value }));
  };

  const toggleMedium = (mediumId) => {
    setSelectedMediumIds((prev) =>
      prev.includes(mediumId) ? prev.filter((id) => id !== mediumId) : [...prev, mediumId]
    );
  };

  const handleSave = async () => {
    if (!org) return;
    setSaving(true);
    try {
      const updates = { ...form };

      // Helper to upload a file and return public URL
      const uploadFile = async (file, folder, fileName) => {
        if (!file) return null;
        const ext = file.name.split(".").pop();
        const path = `${folder}/${org.id}/${fileName}.${ext}`;
        await supabase.storage
          .from("ShreeVidhya_Academy")
          .upload(path, file, { cacheControl: "3600", upsert: true });
        const { data: publicUrl } = supabase.storage
          .from("ShreeVidhya_Academy")
          .getPublicUrl(path);
        return publicUrl.publicUrl;
      };

      // Upload logos
      updates.logo_light_url = (await uploadFile(lightLogoFile, "logos", "light-logo")) || org.logo_light_url;
      updates.logo_dark_url = (await uploadFile(darkLogoFile, "logos", "dark-logo")) || org.logo_dark_url;
      updates.letterhead_url = (await uploadFile(letterheadFile, "letterheads", "letterhead")) || org.letterhead_url;

      // Call service with mediums array
      const updatedOrg = await updateOrganization(org.id, {
        ...updates,
        mediums: selectedMediumIds,
      });

      if (orgContext?.setOrg) {
        orgContext.setOrg(updatedOrg);
      }
      setOrg(updatedOrg);
      toast.success("Organization updated!");
    } catch (err) {
      toast.error(err.message);
    } finally {
      setSaving(false);
    }
  };

  if (loadingOrg || !org) {
    return (
      <AdminLayout>
        <div className="p-8 text-center text-secondary">Loading organization…</div>
      </AdminLayout>
    );
  }

  return (
    <AdminLayout>
      <h1 className="text-3xl font-righteous text-primary-dark mb-2">Organization Settings</h1>
      <p className="text-sm text-secondary-dark mb-6">Update academy details</p>

      <div className="bg-white rounded-xl shadow-sm p-6 space-y-6 max-w-3xl">
        {/* Logos & Letterhead */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Light Logo */}
          <div>
            <label className="block text-sm font-medium mb-1">
              <Eye size={14} className="inline mr-1" /> Light Logo (sidebar)
            </label>
            {org.logo_light_url && (
              <img src={org.logo_light_url} alt="Light Logo" className="h-12 mb-2 rounded border" />
            )}
            <input
              type="file"
              accept="image/*"
              onChange={(e) => setLightLogoFile(e.target.files[0])}
              className="w-full text-sm file:mr-4 file:py-2 file:px-4 file:rounded file:border-0 file:bg-primary file:text-white"
            />
          </div>

          {/* Dark Logo */}
          <div>
            <label className="block text-sm font-medium mb-1">
              <EyeOff size={14} className="inline mr-1" /> Dark Logo (headers, PDFs)
            </label>
            {org.logo_dark_url && (
              <img src={org.logo_dark_url} alt="Dark Logo" className="h-12 mb-2 rounded border" />
            )}
            <input
              type="file"
              accept="image/*"
              onChange={(e) => setDarkLogoFile(e.target.files[0])}
              className="w-full text-sm file:mr-4 file:py-2 file:px-4 file:rounded file:border-0 file:bg-primary file:text-white"
            />
          </div>

          {/* Letterhead */}
          <div className="md:col-span-2">
            <label className="block text-sm font-medium mb-1">
              <FileText size={14} className="inline mr-1" /> Letterhead (background for reports)
            </label>
            {org.letterhead_url && (
              <img src={org.letterhead_url} alt="Letterhead" className="h-24 mb-2 rounded border object-contain" />
            )}
            <input
              type="file"
              accept="image/*"
              onChange={(e) => setLetterheadFile(e.target.files[0])}
              className="w-full text-sm file:mr-4 file:py-2 file:px-4 file:rounded file:border-0 file:bg-primary file:text-white"
            />
            <p className="text-xs text-secondary-light mt-1">
              Upload a full‑page letterhead image. It will be used as a background when printing reports.
            </p>
          </div>
        </div>

        {/* Text fields */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium mb-1">
              <Building size={14} className="inline mr-1" /> Company Name
            </label>
            <input name="company_name" value={form.company_name} onChange={handleChange} className="w-full border rounded-lg p-2.5" />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">
              <Phone size={14} className="inline mr-1" /> Phone
            </label>
            <input name="phone" value={form.phone} onChange={handleChange} className="w-full border rounded-lg p-2.5" />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">
              <Mail size={14} className="inline mr-1" /> Email
            </label>
            <input name="email" value={form.email} onChange={handleChange} className="w-full border rounded-lg p-2.5" />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">
              <Globe size={14} className="inline mr-1" /> Website
            </label>
            <input name="website" value={form.website} onChange={handleChange} className="w-full border rounded-lg p-2.5" />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">GSTIN</label>
            <input name="gstin" value={form.gstin} onChange={handleChange} className="w-full border rounded-lg p-2.5 uppercase" maxLength={15} />
          </div>
          <div className="col-span-2">
            <label className="block text-sm font-medium mb-1">
              <MapPin size={14} className="inline mr-1" /> Address
            </label>
            <textarea name="address" value={form.address} onChange={handleChange} rows={2} className="w-full border rounded-lg p-2.5 resize-none" />
          </div>
          <div className="col-span-2">
            <label className="block text-sm font-medium mb-1">Vision</label>
            <textarea name="vision" value={form.vision} onChange={handleChange} rows={2} className="w-full border rounded-lg p-2.5 resize-none" />
          </div>
          <div className="col-span-2">
            <label className="block text-sm font-medium mb-1">Mission</label>
            <textarea name="mission" value={form.mission} onChange={handleChange} rows={2} className="w-full border rounded-lg p-2.5 resize-none" />
          </div>
          <div className="col-span-2">
            <label className="block text-sm font-medium mb-1">Description</label>
            <textarea name="description" value={form.description} onChange={handleChange} rows={3} className="w-full border rounded-lg p-2.5 resize-none" />
          </div>
        </div>

        {/* Mediums */}
        <div>
          <label className="block text-sm font-medium mb-2">Mediums Supported</label>
          <div className="flex flex-wrap gap-2">
            {allMediums.map((medium) => (
              <button
                key={medium.id}
                type="button"
                onClick={() => toggleMedium(medium.id)}
                className={`px-4 py-1.5 rounded-full text-sm font-medium border transition ${
                  selectedMediumIds.includes(medium.id)
                    ? "bg-primary text-white border-primary"
                    : "bg-white text-secondary-dark border-secondary-light hover:border-primary"
                }`}
              >
                {medium.name}
              </button>
            ))}
          </div>
        </div>

        <button
          onClick={handleSave}
          disabled={saving}
          className="flex items-center gap-2 bg-primary text-white px-6 py-2.5 rounded-lg font-medium hover:bg-primary-light transition disabled:opacity-50"
        >
          <Save size={18} />
          {saving ? "Saving..." : "Save Changes"}
        </button>
      </div>
    </AdminLayout>
  );
}