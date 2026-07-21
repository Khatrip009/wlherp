// src/pages/OrganizationSettings.jsx
import { useState, useEffect } from "react";
import { supabase } from "../api/supabase";
import { useAuth } from "../context/AuthContext";
import { useOrg } from "../context/OrganizationContext";
import toast from "react-hot-toast";

import { Building, Phone, Mail, Globe, MapPin, Eye, EyeOff, Save, FileText, Mail as MailIcon } from "lucide-react";
import { getMediums } from "../services/mediumService";
import { updateOrganization } from "../services/organizationService";
import { sendEmail } from "../services/emailService";

export default function OrganizationSettings() {
  const { profile } = useAuth();
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

  // ── Check if user is branch admin ──
  const isBranchAdmin = profile?.role?.toLowerCase() === "branch_admin";

  // ─── Helper: get admin emails ──────────────────────────────────────
  const getAdminEmails = async () => {
    if (!org?.id) return [];
    const { data, error } = await supabase
      .from("profiles")
      .select("email")
      .eq("organization_id", org.id)
      .in("role", ["admin", "super_admin", "organization_admin"])
      .eq("is_active", true);
    if (error) {
      console.error("Failed to fetch admin emails:", error);
      return [];
    }
    return data?.map(p => p.email).filter(Boolean) || [];
  };

  // ─── Send organization report email ───────────────────────────────
  const sendOrgReport = async () => {
    if (!org) {
      alert("Organization not loaded.");
      return;
    }

    try {
      const adminEmails = await getAdminEmails();
      if (adminEmails.length === 0) {
        alert("No admin emails found.");
        return;
      }

      const mediums = allMediums.filter(m => selectedMediumIds.includes(m.id)).map(m => m.name).join(', ') || 'None';

      const htmlBody = `
        <div style="font-family:Arial,sans-serif;max-width:800px;margin:0 auto;">
          <h2 style="color:#0D47A1;">Organization Profile</h2>
          <p><strong>Name:</strong> ${org.company_name || '—'}</p>
          <p><strong>Phone:</strong> ${org.phone || '—'}</p>
          <p><strong>Email:</strong> ${org.email || '—'}</p>
          <p><strong>Website:</strong> ${org.website || '—'}</p>
          <p><strong>GSTIN:</strong> ${org.gstin || '—'}</p>
          <p><strong>Address:</strong> ${org.address || '—'}</p>
          <p><strong>Vision:</strong> ${org.vision || '—'}</p>
          <p><strong>Mission:</strong> ${org.mission || '—'}</p>
          <p><strong>Description:</strong> ${org.description || '—'}</p>
          <p><strong>Mediums:</strong> ${mediums}</p>
          <hr />
          <p style="color:#888;font-size:10px;">Computer‑generated report from ${org.company_name || 'Academy'}</p>
        </div>
      `;

      await sendEmail({
        to: adminEmails,
        subject: `Organization Profile - ${org.company_name || 'Academy'}`,
        html: htmlBody,
       // from: org?.email || undefined,
      });

      toast.success("Organization report sent to admins.");
    } catch (err) {
      console.error("Email error:", err);
      toast.error("Failed to send report.");
    }
  };

  // ── Fetch org from context or profile ──
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

  // ── Fetch all mediums and current linked mediums ──
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

  // ── Pre‑fill form fields when org is loaded ──
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
    if (isBranchAdmin) return; // no changes allowed
    const { name, value } = e.target;
    setForm((prev) => ({ ...prev, [name]: value }));
  };

  const toggleMedium = (mediumId) => {
    if (isBranchAdmin) return;
    setSelectedMediumIds((prev) =>
      prev.includes(mediumId) ? prev.filter((id) => id !== mediumId) : [...prev, mediumId]
    );
  };

  const handleSave = async () => {
    if (isBranchAdmin || !org) return;
    setSaving(true);
    try {
      const updates = { ...form };

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

      updates.logo_light_url = (await uploadFile(lightLogoFile, "logos", "light-logo")) || org.logo_light_url;
      updates.logo_dark_url = (await uploadFile(darkLogoFile, "logos", "dark-logo")) || org.logo_dark_url;
      updates.letterhead_url = (await uploadFile(letterheadFile, "letterheads", "letterhead")) || org.letterhead_url;

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
      <div className="p-8 text-center text-secondary">Loading organization…</div>
    );
  }

  return (
    <>
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-6 gap-3">
        <div>
          <h1 className="text-3xl font-righteous text-primary-dark mb-2">Organization Settings</h1>
          <p className="text-sm text-secondary-dark">Update academy details</p>
        </div>
        {/* 👇 Send Report button */}
        <button
          onClick={sendOrgReport}
          className="bg-green-600 hover:bg-green-700 text-white px-4 py-2.5 rounded-lg transition font-montserrat text-sm flex items-center gap-2"
        >
          <MailIcon size={18} /> Send Report
        </button>
      </div>

      {isBranchAdmin && (
        <div className="bg-yellow-50 border-l-4 border-yellow-400 p-4 mb-6 rounded">
          <p className="text-yellow-700 text-sm font-medium">Read‑only mode</p>
          <p className="text-yellow-600 text-sm">
            As a branch admin, you can view but cannot edit organization settings.
          </p>
        </div>
      )}

      <div className="bg-white rounded-xl shadow-sm p-6 space-y-6 max-w-3xl">
        {/* Logos & Letterhead */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
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
              disabled={isBranchAdmin}
              className="w-full text-sm file:mr-4 file:py-2 file:px-4 file:rounded file:border-0 file:bg-primary file:text-white disabled:opacity-50 disabled:cursor-not-allowed"
            />
          </div>

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
              disabled={isBranchAdmin}
              className="w-full text-sm file:mr-4 file:py-2 file:px-4 file:rounded file:border-0 file:bg-primary file:text-white disabled:opacity-50 disabled:cursor-not-allowed"
            />
          </div>

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
              disabled={isBranchAdmin}
              className="w-full text-sm file:mr-4 file:py-2 file:px-4 file:rounded file:border-0 file:bg-primary file:text-white disabled:opacity-50 disabled:cursor-not-allowed"
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
            <input
              name="company_name"
              value={form.company_name}
              onChange={handleChange}
              disabled={isBranchAdmin}
              className="w-full border rounded-lg p-2.5 disabled:bg-gray-100 disabled:text-gray-500"
            />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">
              <Phone size={14} className="inline mr-1" /> Phone
            </label>
            <input
              name="phone"
              value={form.phone}
              onChange={handleChange}
              disabled={isBranchAdmin}
              className="w-full border rounded-lg p-2.5 disabled:bg-gray-100 disabled:text-gray-500"
            />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">
              <Mail size={14} className="inline mr-1" /> Email
            </label>
            <input
              name="email"
              value={form.email}
              onChange={handleChange}
              disabled={isBranchAdmin}
              className="w-full border rounded-lg p-2.5 disabled:bg-gray-100 disabled:text-gray-500"
            />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">
              <Globe size={14} className="inline mr-1" /> Website
            </label>
            <input
              name="website"
              value={form.website}
              onChange={handleChange}
              disabled={isBranchAdmin}
              className="w-full border rounded-lg p-2.5 disabled:bg-gray-100 disabled:text-gray-500"
            />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">GSTIN</label>
            <input
              name="gstin"
              value={form.gstin}
              onChange={handleChange}
              disabled={isBranchAdmin}
              className="w-full border rounded-lg p-2.5 uppercase disabled:bg-gray-100 disabled:text-gray-500"
              maxLength={15}
            />
          </div>
          <div className="col-span-2">
            <label className="block text-sm font-medium mb-1">
              <MapPin size={14} className="inline mr-1" /> Address
            </label>
            <textarea
              name="address"
              value={form.address}
              onChange={handleChange}
              disabled={isBranchAdmin}
              rows={2}
              className="w-full border rounded-lg p-2.5 resize-none disabled:bg-gray-100 disabled:text-gray-500"
            />
          </div>
          <div className="col-span-2">
            <label className="block text-sm font-medium mb-1">Vision</label>
            <textarea
              name="vision"
              value={form.vision}
              onChange={handleChange}
              disabled={isBranchAdmin}
              rows={2}
              className="w-full border rounded-lg p-2.5 resize-none disabled:bg-gray-100 disabled:text-gray-500"
            />
          </div>
          <div className="col-span-2">
            <label className="block text-sm font-medium mb-1">Mission</label>
            <textarea
              name="mission"
              value={form.mission}
              onChange={handleChange}
              disabled={isBranchAdmin}
              rows={2}
              className="w-full border rounded-lg p-2.5 resize-none disabled:bg-gray-100 disabled:text-gray-500"
            />
          </div>
          <div className="col-span-2">
            <label className="block text-sm font-medium mb-1">Description</label>
            <textarea
              name="description"
              value={form.description}
              onChange={handleChange}
              disabled={isBranchAdmin}
              rows={3}
              className="w-full border rounded-lg p-2.5 resize-none disabled:bg-gray-100 disabled:text-gray-500"
            />
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
                disabled={isBranchAdmin}
                className={`px-4 py-1.5 rounded-full text-sm font-medium border transition ${
                  selectedMediumIds.includes(medium.id)
                    ? "bg-primary text-white border-primary"
                    : "bg-white text-secondary-dark border-secondary-light hover:border-primary"
                } disabled:opacity-50 disabled:cursor-not-allowed`}
              >
                {medium.name}
              </button>
            ))}
          </div>
        </div>

        {/* Save button – hidden for branch admin */}
        {!isBranchAdmin && (
          <button
            onClick={handleSave}
            disabled={saving}
            className="flex items-center gap-2 bg-primary text-white px-6 py-2.5 rounded-lg font-medium hover:bg-primary-light transition disabled:opacity-50"
          >
            <Save size={18} />
            {saving ? "Saving..." : "Save Changes"}
          </button>
        )}

        {isBranchAdmin && (
          <div className="text-center text-sm text-gray-400 border-t pt-4 mt-2">
            You are viewing this page in read‑only mode.
          </div>
        )}
      </div>
    </>
  );
}