// src/pages/Login.jsx
import { useState } from "react";
import { Navigate } from "react-router-dom";
import toast from "react-hot-toast";
import { Mail, Lock, LogIn } from "lucide-react";
import { supabase } from "../api/supabase";
import { useAuth } from "../context/AuthContext";
import { useOrgDarkLogo } from "../hooks/useOrgDarkLogo";
import { useOrg } from "../context/OrganizationContext";   // ← new import

export default function Login() {
  const darkLogo = useOrgDarkLogo();
  const { org } = useOrg();                                   // ← get organisation
  const orgName = org?.company_name || "Academy";            // fallback while loading
  const { user, profile, loading: authLoading } = useAuth();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);

  // Redirect once auth is fully loaded
  if (user && profile) {
    return <Navigate to="/" replace />;
  }

  if (authLoading || (user && !profile)) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-secondary-bg">
        <p className="text-secondary font-montserrat">Loading your account…</p>
      </div>
    );
  }

  // Password login
  async function handlePasswordLogin(e) {
    e.preventDefault();
    setLoading(true);
    try {
      const { error } = await supabase.auth.signInWithPassword({
        email,
        password,
      });
      if (error) {
        toast.error(error.message);
        setLoading(false);
        return;
      }
    } catch (err) {
      console.error(err);
      toast.error("Login failed");
      setLoading(false);
    }
  }

  // Forgot password
  async function handleForgotPassword() {
    if (!email) {
      toast.error("Enter your email first");
      return;
    }
    try {
      const { error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: window.location.origin + "/#/login",
      });
      if (error) throw error;
      toast.success("Password reset link sent");
    } catch (err) {
      toast.error(err.message || "Failed to send reset link");
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-secondary-bg px-4">
      <div className="bg-white shadow-xl rounded-2xl p-8 w-full max-w-md border border-secondary-light">
        {/* Logo */}
        <div className="flex justify-center mb-6">
          <img src={darkLogo} alt={orgName} className="h-20 w-auto" />
        </div>

        {/* Title – now dynamic */}
        <h1 className="text-2xl font-righteous text-primary-dark text-center mb-1">
          {orgName}
        </h1>
        <p className="text-sm text-secondary text-center font-montserrat mb-8">
          Sign in to your account
        </p>

        {/* Password login form */}
        <form onSubmit={handlePasswordLogin} className="space-y-5">
          <div>
            <label className="block text-sm font-montserrat text-secondary-dark mb-1">
              <Mail size={14} className="inline mr-1" /> Email
            </label>
            <input
              type="email"
              placeholder="you@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full border border-secondary-light rounded-lg p-3 focus:ring-1 focus:ring-primary focus:border-primary outline-none placeholder-secondary-light"
              required
            />
          </div>
          <div>
            <label className="block text-sm font-montserrat text-secondary-dark mb-1">
              <Lock size={14} className="inline mr-1" /> Password
            </label>
            <input
              type="password"
              placeholder="Your password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full border border-secondary-light rounded-lg p-3 focus:ring-1 focus:ring-primary focus:border-primary outline-none placeholder-secondary-light"
              required
            />
            <button
              type="button"
              onClick={handleForgotPassword}
              className="text-xs text-secondary hover:text-primary font-montserrat mt-1"
            >
              Forgot password?
            </button>
          </div>
          <button
            type="submit"
            disabled={loading}
            className="w-full bg-primary hover:bg-primary-light text-white rounded-lg p-3 font-montserrat transition disabled:opacity-50 flex items-center justify-center gap-2"
          >
            <LogIn size={18} />
            {loading ? "Signing In..." : "Sign In"}
          </button>
        </form>

        {/* Copyright – now uses org name */}
        <p className="text-xs text-secondary-light text-center mt-8 font-montserrat">
          © {new Date().getFullYear()} {orgName}. All rights reserved.
        </p>
      </div>
    </div>
  );
}