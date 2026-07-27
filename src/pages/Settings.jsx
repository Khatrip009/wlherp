// src/pages/Settings.jsx
import { useState, useRef, useEffect } from "react";
import toast from "react-hot-toast";
import {
  User,
  Mail,
  Shield,
  Phone,
  Camera,
  Lock,
  Save,
  Upload,
  Mail as MailIcon,
} from "lucide-react";

import BackButton from "../components/BackButton";
import { useAuth } from "../context/AuthContext";
import { useOrg } from "../context/OrganizationContext";
import { useTheme } from "../context/ThemeContext"; // ✅ dynamic theme
import { supabase } from "../api/supabase";
import { sendEmail } from "../services/emailService";

export default function Settings() {
  const { user, profile, loadUser } = useAuth();
  const { org } = useOrg();
  const theme = useTheme(); // ✅ theme hook

  const headingFont = theme?.font_heading || "Righteous";
  const bodyFont = theme?.font_body || "Montserrat";

  const fileInputRef = useRef(null);
  const [sendingReport, setSendingReport] = useState(false);

  // Profile form
  const [profileForm, setProfileForm] = useState({
    full_name: "",
    mobile: "",
    avatar_url: "",
  });
  const [avatarFile, setAvatarFile] = useState(null);
  const [avatarUploading, setAvatarUploading] = useState(false);

  // Password form
  const [passwordForm, setPasswordForm] = useState({
    newPassword: "",
    confirmPassword: "",
  });

  const [savingProfile, setSavingProfile] = useState(false);
  const [savingPassword, setSavingPassword] = useState(false);

  // Load initial values from profile context
  useEffect(() => {
    if (profile) {
      setProfileForm({
        full_name: profile.full_name || "",
        mobile: profile.mobile || "",
        avatar_url: profile.avatar_url || "",
      });
    }
  }, [profile]);

  // ─── Send Profile Report Email ──────────────────────────────────────
  const sendProfileReport = async () => {
    if (!user?.email) {
      toast.error("No email address associated with your account.");
      return;
    }

    setSendingReport(true);
    try {
      const orgName = org?.company_name || "Academy";
      const userRole = profile?.role || "User";
      const fullName = profileForm.full_name || "Not set";
      const mobile = profileForm.mobile || "Not set";
      const avatarUrl = profileForm.avatar_url || "No avatar uploaded";

      const htmlBody = `
        <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;">
          <h2 style="color:#0D47A1;">Your Profile Report</h2>
          <p><strong>Organization:</strong> ${orgName}</p>
          <p><strong>Email:</strong> ${user.email}</p>
          <p><strong>Role:</strong> ${userRole}</p>
          <p><strong>Full Name:</strong> ${fullName}</p>
          <p><strong>Mobile:</strong> ${mobile}</p>
          <p><strong>Avatar URL:</strong> ${avatarUrl}</p>
          <hr />
          <p style="color:#888;font-size:10px;">This is a computer‑generated profile report from ${orgName}.</p>
        </div>
      `;

      await sendEmail({
        to: user.email,
        subject: `Your Profile Report - ${orgName}`,
        html: htmlBody,
      });

      toast.success("Profile report sent to your email.");
    } catch (err) {
      console.error("Failed to send report:", err);
      toast.error("Failed to send report.");
    } finally {
      setSendingReport(false);
    }
  };

  // ─── Avatar upload (unchanged) ─────────────────────────────────────
  async function handleAvatarChange(e) {
    const file = e.target.files[0];
    if (!file) return;

    setAvatarFile(file);
    setAvatarUploading(true);
    try {
      const fileExt = file.name.split(".").pop();
      const fileName = `avatar-${user.id}-${Date.now()}.${fileExt}`;
      const filePath = `avatars/${fileName}`;

      const { error: uploadError } = await supabase.storage
        .from("ShreeVidhya_Academy")
        .upload(filePath, file, {
          cacheControl: "3600",
          upsert: false,
        });

      if (uploadError) throw uploadError;

      const { data: publicUrlData } = supabase.storage
        .from("ShreeVidhya_Academy")
        .getPublicUrl(filePath);

      setProfileForm((prev) => ({
        ...prev,
        avatar_url: publicUrlData.publicUrl,
      }));
      toast.success("Avatar uploaded – don't forget to save");
    } catch (err) {
      toast.error(`Avatar upload failed: ${err.message}`);
    } finally {
      setAvatarUploading(false);
    }
  }

  // ─── Profile update (unchanged) ──────────────────────────────────
  async function handleProfileUpdate(e) {
    e.preventDefault();
    setSavingProfile(true);
    try {
      const { error } = await supabase
        .from("profiles")
        .update({
          full_name: profileForm.full_name,
          mobile: profileForm.mobile,
          avatar_url: profileForm.avatar_url,
          updated_at: new Date(),
        })
        .eq("id", user.id);

      if (error) throw error;
      toast.success("Profile updated");
      if (loadUser) await loadUser();
    } catch (err) {
      toast.error(err.message || "Failed to update profile");
    } finally {
      setSavingProfile(false);
    }
  }

  // ─── Password change (unchanged) ──────────────────────────────────
  async function handlePasswordChange(e) {
    e.preventDefault();
    if (passwordForm.newPassword !== passwordForm.confirmPassword) {
      toast.error("Passwords do not match");
      return;
    }
    if (passwordForm.newPassword.length < 6) {
      toast.error("Password must be at least 6 characters");
      return;
    }
    setSavingPassword(true);
    try {
      const { error } = await supabase.auth.updateUser({
        password: passwordForm.newPassword,
      });
      if (error) throw error;
      toast.success("Password changed successfully");
      setPasswordForm({ newPassword: "", confirmPassword: "" });
    } catch (err) {
      toast.error(err.message || "Failed to change password");
    } finally {
      setSavingPassword(false);
    }
  }

  return (
    <>
      <BackButton to="/settings-hub" label="Settings" />
      <div className="flex flex-col sm:flex-row sm:items-center justify-between mb-8 gap-3">
        <div>
          <h1
            className="text-3xl text-primary"
            style={{ fontFamily: headingFont }}
          >
            Settings
          </h1>
          <p
            className="text-sm text-primary-dark mt-1"
            style={{ fontFamily: bodyFont }}
          >
            Manage your account
          </p>
        </div>
        {/* Send Report button */}
        <button
          onClick={sendProfileReport}
          disabled={sendingReport}
          className="bg-accent hover:bg-accent-dark text-white px-4 py-2 rounded-lg text-sm font-medium flex items-center gap-2 disabled:opacity-50"
          style={{ fontFamily: bodyFont }}
        >
          <MailIcon size={16} />
          {sendingReport ? "Sending..." : "Send My Profile Report"}
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        {/* Profile Section */}
        <div className="bg-white rounded-xl shadow-sm p-6 border border-primary-bg">
          <h2
            className="text-xl text-primary mb-6 flex items-center gap-2"
            style={{ fontFamily: headingFont }}
          >
            <User size={20} /> Profile
          </h2>

          {/* Avatar Upload */}
          <div className="flex items-center gap-5 mb-6">
            <div className="relative">
              <div className="w-20 h-20 rounded-full overflow-hidden border-2 border-primary flex items-center justify-center bg-primary-bg">
                {profileForm.avatar_url ? (
                  <img
                    src={profileForm.avatar_url}
                    alt="Avatar"
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <User size={40} className="text-primary" />
                )}
              </div>
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="absolute bottom-0 right-0 bg-primary text-white p-1.5 rounded-full shadow hover:bg-primary-light transition"
                disabled={avatarUploading}
              >
                <Camera size={14} />
              </button>
            </div>
            <div>
              <p
                className="font-medium text-primary-dark text-sm"
                style={{ fontFamily: bodyFont }}
              >
                Profile photo
              </p>
              <p
                className="text-xs text-primary-dark/60 mt-1"
                style={{ fontFamily: bodyFont }}
              >
                Click the icon to upload a new avatar
              </p>
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="text-primary text-sm hover:underline mt-1 flex items-center gap-1"
                disabled={avatarUploading}
                style={{ fontFamily: bodyFont }}
              >
                <Upload size={14} />
                {avatarUploading ? "Uploading..." : "Choose image"}
              </button>
            </div>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={handleAvatarChange}
            />
          </div>

          <form onSubmit={handleProfileUpdate} className="space-y-4">
            <div>
              <label
                className="block text-sm mb-1 text-primary-dark"
                style={{ fontFamily: bodyFont }}
              >
                <Mail size={14} className="inline mr-1" />
                Email
              </label>
              <input
                type="email"
                value={user?.email}
                disabled
                className="w-full border border-primary-bg rounded p-2.5 bg-primary-bg text-primary-dark cursor-not-allowed"
                style={{ fontFamily: bodyFont }}
              />
            </div>
            <div>
              <label
                className="block text-sm mb-1 text-primary-dark"
                style={{ fontFamily: bodyFont }}
              >
                <Shield size={14} className="inline mr-1" />
                Role
              </label>
              <input
                type="text"
                value={profile?.role || ""}
                disabled
                className="w-full border border-primary-bg rounded p-2.5 bg-primary-bg text-primary-dark cursor-not-allowed"
                style={{ fontFamily: bodyFont }}
              />
            </div>
            <div>
              <label
                className="block text-sm mb-1 text-primary-dark"
                style={{ fontFamily: bodyFont }}
              >
                <User size={14} className="inline mr-1" />
                Full Name
              </label>
              <input
                type="text"
                value={profileForm.full_name}
                onChange={(e) =>
                  setProfileForm({ ...profileForm, full_name: e.target.value })
                }
                className="w-full border border-primary-bg rounded p-2.5 focus:ring-1 focus:ring-primary focus:border-primary outline-none text-primary-dark bg-white"
                style={{ fontFamily: bodyFont }}
              />
            </div>
            <div>
              <label
                className="block text-sm mb-1 text-primary-dark"
                style={{ fontFamily: bodyFont }}
              >
                <Phone size={14} className="inline mr-1" />
                Mobile
              </label>
              <input
                type="text"
                value={profileForm.mobile}
                onChange={(e) =>
                  setProfileForm({ ...profileForm, mobile: e.target.value })
                }
                className="w-full border border-primary-bg rounded p-2.5 focus:ring-1 focus:ring-primary focus:border-primary outline-none text-primary-dark bg-white"
                style={{ fontFamily: bodyFont }}
              />
            </div>
            <button
              type="submit"
              disabled={savingProfile}
              className="w-full sm:w-auto bg-primary hover:bg-primary-light text-white px-5 py-2.5 rounded-lg transition disabled:opacity-50 flex items-center justify-center gap-2"
              style={{ fontFamily: bodyFont }}
            >
              <Save size={16} />
              {savingProfile ? "Saving..." : "Save Changes"}
            </button>
          </form>
        </div>

        {/* Password Section */}
        <div className="bg-white rounded-xl shadow-sm p-6 border border-primary-bg">
          <h2
            className="text-xl text-primary mb-6 flex items-center gap-2"
            style={{ fontFamily: headingFont }}
          >
            <Lock size={20} /> Change Password
          </h2>
          <form onSubmit={handlePasswordChange} className="space-y-4">
            <div>
              <label
                className="block text-sm mb-1 text-primary-dark"
                style={{ fontFamily: bodyFont }}
              >
                New Password
              </label>
              <input
                type="password"
                value={passwordForm.newPassword}
                onChange={(e) =>
                  setPasswordForm({
                    ...passwordForm,
                    newPassword: e.target.value,
                  })
                }
                className="w-full border border-primary-bg rounded p-2.5 focus:ring-1 focus:ring-primary focus:border-primary outline-none text-primary-dark bg-white"
                style={{ fontFamily: bodyFont }}
                required
                minLength={6}
              />
            </div>
            <div>
              <label
                className="block text-sm mb-1 text-primary-dark"
                style={{ fontFamily: bodyFont }}
              >
                Confirm New Password
              </label>
              <input
                type="password"
                value={passwordForm.confirmPassword}
                onChange={(e) =>
                  setPasswordForm({
                    ...passwordForm,
                    confirmPassword: e.target.value,
                  })
                }
                className="w-full border border-primary-bg rounded p-2.5 focus:ring-1 focus:ring-primary focus:border-primary outline-none text-primary-dark bg-white"
                style={{ fontFamily: bodyFont }}
                required
                minLength={6}
              />
            </div>
            <button
              type="submit"
              disabled={savingPassword}
              className="w-full sm:w-auto bg-primary hover:bg-primary-light text-white px-5 py-2.5 rounded-lg transition disabled:opacity-50 flex items-center justify-center gap-2"
              style={{ fontFamily: bodyFont }}
            >
              <Save size={16} />
              {savingPassword ? "Changing..." : "Change Password"}
            </button>
          </form>
        </div>
      </div>
    </>
  );
}