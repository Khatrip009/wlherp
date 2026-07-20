import { createContext, useContext, useEffect, useState, useCallback } from "react";
import { supabase } from "../api/supabase";
import toast from "react-hot-toast";
import { useInactivityTimer } from "../hooks/useInactivityTimer";
import queryClient from "../lib/queryClient";

const AuthContext = createContext();

async function fetchProfile(userId) {
  const { data } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", userId)
    .maybeSingle();
  return data || null;
}

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);
  const [orgAccessDenied, setOrgAccessDenied] = useState(false);

  // ─── Sign out – stable reference, never changes ───
  const signOut = useCallback(async () => {
    try {
      const { error } = await supabase.auth.signOut();
      if (error) {
        if (error.status === 403) {
          console.warn("Logout: session already expired, ignoring 403");
        } else {
          throw error;
        }
      }
    } catch (error) {
      if (error.status !== 403) {
        console.error("Logout error:", error);
      }
    } finally {
      setUser(null);
      setProfile(null);
      setOrgAccessDenied(false);
      queryClient.clear();
    }
  }, []);

  // ── Auto logout after 15 minutes of inactivity ────────────
  // ✅ Pass signOut directly (not () => signOut()) to keep a stable reference
  useInactivityTimer(signOut, 15 * 60 * 1000, !!user);

  useEffect(() => {
    // ── Initial session ──
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!session?.user) {
        setLoading(false);
        return;
      }
      setUser(session.user);
      fetchProfile(session.user.id).then((p) => {
        if (p?.organization_id !== 3) {
          toast.error("Access denied: Only organization ID 3 is allowed.");
          signOut();
          setOrgAccessDenied(true);
          setLoading(false);
          return;
        }
        setProfile(p);
        setLoading(false);
      });
    });

    // ── Auth state changes ──
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(async (_event, session) => {
      if (!session?.user) {
        setUser(null);
        setProfile(null);
        setOrgAccessDenied(false);
        return;
      }
      setUser(session.user);
      const p = await fetchProfile(session.user.id);
      if (p?.organization_id !== 3) {
        toast.error("Access denied: Only organization ID 3 is allowed.");
        await signOut();
        setOrgAccessDenied(true);
        setProfile(null);
        setUser(null);
        return;
      }
      setProfile(p);
    });

    return () => subscription.unsubscribe();
  }, []);

  return (
    <AuthContext.Provider value={{ user, profile, loading, signOut, orgAccessDenied }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
} 