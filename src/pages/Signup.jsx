import { useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import { supabase } from "../api/supabase";
import toast from "react-hot-toast";
import { Building, User, Mail, Lock, Globe } from "lucide-react";

function generateOrgKey(name) {
  const base = name
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "")
    .slice(0, 20) || "org";
  const random = Math.random().toString(36).substring(2, 6);
  return `${base}-${random}`;
}

export default function Signup() {
  const navigate = useNavigate();
  const [form, setForm] = useState({
    companyName: "",
    fullName: "",
    email: "",
    password: "",
    subdomain: "",
  });
  const [loading, setLoading] = useState(false);

  const handleChange = (e) => {
    setForm({ ...form, [e.target.name]: e.target.value });
  };

  const insertOrganization = async (orgData) => {
    // Try up to 2 times (in case of sequence mis‑sync)
    for (let attempt = 0; attempt < 2; attempt++) {
      const { data, error } = await supabase
        .from("organization")
        .insert(orgData)
        .select()
        .single();

      if (error) {
        if (error.code === "23505" && attempt === 0) {
          // Duplicate key – sequence might be off; the next insert will get a new value
          continue;
        }
        throw error;
      }
      return data;
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!form.companyName || !form.fullName || !form.email || !form.password) {
      toast.error("All fields are required");
      return;
    }

    setLoading(true);
    try {
      // 1. Create the auth user
      const { data: authData, error: authError } = await supabase.auth.signUp({
        email: form.email,
        password: form.password,
        options: { data: { full_name: form.fullName } },
      });
      if (authError) throw authError;

      const userId = authData.user.id;

      // 2. Make the user an admin
      const { error: roleError } = await supabase
        .from("profiles")
        .update({ role: "organization_admin" })
        .eq("id", userId);
      if (roleError) throw roleError;

      // 3. Generate unique organization key
      const orgKey = generateOrgKey(form.subdomain || form.companyName);

      // 4. Insert organization (with retry on duplicate key)
      const org = await insertOrganization({
        company_name: form.companyName,
        organization_key: orgKey,
        is_active: true,
        domain: form.subdomain
          ? `${form.subdomain}.app.shreevidhyaerp.online`
          : null,
      });

      // 5. Link profile to organization
      const { error: linkError } = await supabase
        .from("profiles")
        .update({ organization_id: org.id, branch_id: null })
        .eq("id", userId);
      if (linkError) throw linkError;

      // 6. Create default branch
      const { error: branchError } = await supabase
        .from("branches")
        .insert({
          organization_id: org.id,
          branch_name: "Main Branch",
        });
      if (branchError) throw branchError;

      toast.success("Organization created! Redirecting…");
      navigate("/onboarding");
    } catch (err) {
      toast.error(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 px-4">
      <div className="max-w-md w-full bg-white rounded-xl shadow p-8">
        <h1 className="text-2xl font-bold text-center text-primary-dark mb-6">
          Create Your Academy
        </h1>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium mb-1">
              <Building size={16} className="inline mr-1" /> Company Name *
            </label>
            <input
              type="text"
              name="companyName"
              value={form.companyName}
              onChange={handleChange}
              required
              className="w-full border rounded-lg p-2.5 focus:ring-1 focus:ring-primary"
              placeholder="ShreeVidhya Academy"
            />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">
              <User size={16} className="inline mr-1" /> Your Full Name *
            </label>
            <input
              type="text"
              name="fullName"
              value={form.fullName}
              onChange={handleChange}
              required
              className="w-full border rounded-lg p-2.5 focus:ring-1 focus:ring-primary"
              placeholder="Admin Name"
            />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">
              <Mail size={16} className="inline mr-1" /> Email *
            </label>
            <input
              type="email"
              name="email"
              value={form.email}
              onChange={handleChange}
              required
              className="w-full border rounded-lg p-2.5 focus:ring-1 focus:ring-primary"
              placeholder="admin@example.com"
            />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">
              <Lock size={16} className="inline mr-1" /> Password *
            </label>
            <input
              type="password"
              name="password"
              value={form.password}
              onChange={handleChange}
              required
              className="w-full border rounded-lg p-2.5 focus:ring-1 focus:ring-primary"
              placeholder="Min. 6 characters"
            />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">
              <Globe size={16} className="inline mr-1" /> Subdomain (optional)
            </label>
            <div className="flex items-center">
              <input
                type="text"
                name="subdomain"
                value={form.subdomain}
                onChange={handleChange}
                className="flex-1 border rounded-l-lg p-2.5 focus:ring-1 focus:ring-primary"
                placeholder="myacademy"
              />
              <span className="bg-gray-100 border border-l-0 rounded-r-lg px-3 py-2.5 text-sm text-gray-500">
                .app.shreevidhyaerp.online
              </span>
            </div>
          </div>
          <button
            type="submit"
            disabled={loading}
            className="w-full bg-primary text-white py-2.5 rounded-lg font-medium hover:bg-primary-light transition disabled:opacity-50"
          >
            {loading ? "Creating..." : "Create Organization"}
          </button>
        </form>
        <p className="mt-4 text-center text-sm text-gray-500">
          Already have an account?{" "}
          <Link to="/login" className="text-primary hover:underline">
            Sign in
          </Link>
        </p>
      </div>
    </div>
  );
}