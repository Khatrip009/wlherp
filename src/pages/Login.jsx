import { useState } from "react";
import { Navigate, Link } from "react-router-dom";
import toast from "react-hot-toast";
import { Mail, Lock, LogIn, ArrowLeft, KeyRound, CheckCircle } from "lucide-react";
import { supabase } from "../api/supabase";
import { useAuth } from "../context/AuthContext";
import { useOrgDarkLogo } from "../hooks/useOrgDarkLogo";

export default function Login() {
  const darkLogo = useOrgDarkLogo();
  const { user, profile, loading: authLoading } = useAuth();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [useOtp, setUseOtp] = useState(false);
  const [otpSent, setOtpSent] = useState(false);
  const [otp, setOtp] = useState("");

  // -------- Redirect once auth is fully loaded --------
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

  // -------- Password login --------
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

  // -------- Send OTP --------
  async function handleSendOtp(e) {
    e.preventDefault();
    if (!email) {
      toast.error("Please enter your email address");
      return;
    }
    setLoading(true);
    try {
      const { error } = await supabase.auth.signInWithOtp({
        email,
        options: {
          shouldCreateUser: false,
          emailRedirectTo: window.location.origin + "/#/login",
        },
      });
      if (error) {
        toast.error(error.message);
        setLoading(false);
        return;
      }
      toast.success("OTP sent – check your inbox");
      setOtpSent(true);
    } catch (err) {
      console.error(err);
      toast.error("Failed to send OTP");
    } finally {
      setLoading(false);
    }
  }

  // -------- Forgot password --------
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

  // -------- Verify OTP --------
  async function handleVerifyOtp(e) {
    e.preventDefault();
    if (!otp.trim()) {
      toast.error("Enter the OTP from your email");
      return;
    }
    setLoading(true);
    try {
      const { error } = await supabase.auth.verifyOtp({
        email,
        token: otp.trim(),
        type: "email",
      });
      if (error) {
        toast.error(error.message);
        setLoading(false);
        return;
      }
    } catch (err) {
      console.error(err);
      toast.error("Verification failed");
      setLoading(false);
    }
  }

  // -------- Switch back to password mode --------
  function switchToPassword() {
    setUseOtp(false);
    setOtpSent(false);
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-secondary-bg px-4">
      <div className="bg-white shadow-xl rounded-2xl p-8 w-full max-w-md border border-secondary-light">
        <div className="flex justify-center mb-6">
          <img src={darkLogo} alt="ShreeVidhya Academy" className="h-20 w-auto" />
        </div>
        <h1 className="text-2xl font-righteous text-primary-dark text-center mb-1">
          ShreeVidhya Academy
        </h1>
        <p className="text-sm text-secondary text-center font-montserrat mb-8">
          {useOtp ? "Sign in with a one‑time code" : "Sign in to your account"}
        </p>

        {/* Password form */}
        {!useOtp && (
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
            <div className="text-center">
              <button
                type="button"
                onClick={() => setUseOtp(true)}
                className="text-sm text-primary hover:underline font-montserrat"
              >
                Sign in with a one‑time code
              </button>
            </div>
          </form>
        )}

        {/* OTP form */}
        {useOtp && (
          <>
            {!otpSent && (
              <div className="mb-4">
                <button
                  type="button"
                  onClick={switchToPassword}
                  className="text-sm text-secondary hover:text-primary-dark font-montserrat flex items-center gap-1"
                >
                  <ArrowLeft size={16} />
                  Back to password login
                </button>
              </div>
            )}
            {!otpSent ? (
              <form onSubmit={handleSendOtp} className="space-y-5">
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
                <button
                  type="submit"
                  disabled={loading}
                  className="w-full bg-accent hover:bg-accent-light text-white rounded-lg p-3 font-montserrat transition disabled:opacity-50 flex items-center justify-center gap-2"
                >
                  <KeyRound size={18} />
                  {loading ? "Sending..." : "Send One‑Time Code"}
                </button>
                <div className="text-center">
                  <button
                    type="button"
                    onClick={switchToPassword}
                    className="text-sm text-primary hover:underline font-montserrat"
                  >
                    Back to password login
                  </button>
                </div>
              </form>
            ) : (
              <form onSubmit={handleVerifyOtp} className="space-y-5">
                <p className="text-sm text-green-600 font-montserrat flex items-center gap-1">
                  <CheckCircle size={16} /> OTP sent to {email}
                </p>
                <div>
                  <label className="block text-sm font-montserrat text-secondary-dark mb-1">
                    <KeyRound size={14} className="inline mr-1" /> Enter OTP
                  </label>
                  <input
                    type="text"
                    placeholder="6-digit code"
                    value={otp}
                    onChange={(e) => setOtp(e.target.value)}
                    className="w-full border border-secondary-light rounded-lg p-3 focus:ring-1 focus:ring-primary focus:border-primary outline-none placeholder-secondary-light tracking-widest text-center text-lg"
                    maxLength={6}
                    required
                  />
                </div>
                <button
                  type="submit"
                  disabled={loading}
                  className="w-full bg-primary hover:bg-primary-light text-white rounded-lg p-3 font-montserrat transition disabled:opacity-50 flex items-center justify-center gap-2"
                >
                  <LogIn size={18} />
                  {loading ? "Verifying..." : "Verify & Sign In"}
                </button>
                <div className="text-center">
                  <button
                    type="button"
                    onClick={() => { setOtpSent(false); setOtp(""); }}
                    className="text-sm text-secondary hover:text-primary font-montserrat"
                  >
                    Resend OTP
                  </button>
                </div>
              </form>
            )}
          </>
        )}

        {/* ─── SIGN‑UP LINK ─── */}
        <p className="mt-6 text-center text-sm text-gray-500">
          Don't have an academy?{" "}
          <Link to="/signup" className="text-primary hover:underline font-medium">
            Create one
          </Link>
        </p>

        <p className="text-xs text-secondary-light text-center mt-4 font-montserrat">
          © {new Date().getFullYear()} ShreeVidhya Academy. All rights reserved.
        </p>
      </div>
    </div>
  );
}