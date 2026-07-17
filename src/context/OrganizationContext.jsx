import { createContext, useContext, useState, useEffect, useCallback } from "react";
import { supabase } from "../api/supabase";
import { useAuth } from "./AuthContext";
import toast from "react-hot-toast";

const OrgContext = createContext();

export function OrganizationProvider({ children }) {
  const { user } = useAuth();
  const [org, setOrg] = useState(null);
  const [theme, setTheme] = useState(null);
  const [branch, setBranch] = useState(null);
  const [branches, setBranches] = useState([]);
  const [financialYears, setFinancialYears] = useState([]);
  const [selectedFinancialYear, setSelectedFinancialYear] = useState(null);
  const [mediums, setMediums] = useState([]);

  useEffect(() => {
    // ── LOGOUT ──
    if (!user) {
      setOrg(null);
      setTheme(null);
      setBranch(null);
      setBranches([]);
      setFinancialYears([]);
      setSelectedFinancialYear(null);
      setMediums([]);

      const hostname = window.location.hostname;
      if (hostname !== "app.shreevidhyaerp.online" && hostname !== "localhost") {
        (async () => {
          try {
            const { data: orgData } = await supabase
              .from("organization")
              .select("*, organization_domains!inner(domain)")
              .eq("organization_domains.domain", hostname)
              .single();
            if (orgData) {
              setOrg(orgData);
              const { data: branchList } = await supabase
                .from("branches")
                .select("*")
                .eq("organization_id", orgData.id);
              setBranches(branchList || []);
              if (branchList?.length) setBranch(branchList[0]);
            }
          } catch {
            // ignore
          }
        })();
      }
      return;
    }

    // ── LOGIN ──
    async function loadOrganization() {
      const { data: profile, error: profileError } = await supabase
        .from("profiles")
        .select("organization_id, selected_financial_year_id, role, branch_id")
        .eq("id", user.id)
        .single();

      if (profileError) {
        console.error("Error fetching profile:", profileError);
        toast.error("Failed to load user profile.");
        return;
      }

      if (!profile?.organization_id) {
        toast.error("No organization assigned to this user.");
        return;
      }

      // Enforce organization ID = 3 (optional – keep if needed)
      if (profile.organization_id !== 3) {
        toast.error("Access denied: Only organization ID 3 is allowed.");
        return;
      }

      // ─── ✅ FIX: case‑insensitive admin check ───
      const adminRoles = ["admin", "super_admin", "organization_admin", "org_admin", "Admin"];
      const isAdmin = adminRoles.includes(profile.role?.toLowerCase());

      const [
        { data: orgData },
        { data: themeData },
        { data: branchList },
        { data: fys },
        { data: mediumRows },
      ] = await Promise.all([
        supabase.from("organization").select("*").eq("id", profile.organization_id).single(),
        supabase.from("themes").select("*").eq("org_id", profile.organization_id).maybeSingle(),
        supabase.from("branches").select("*").eq("organization_id", profile.organization_id),
        supabase
          .from("financial_years")
          .select("*")
          .eq("organization_id", profile.organization_id)
          .order("start_date", { ascending: false }),
        supabase
          .from("organization_mediums")
          .select("medium_id, mediums(name)")
          .eq("org_id", profile.organization_id),
      ]);

      setOrg(orgData);
      setTheme(themeData || null);
      setFinancialYears(fys || []);

      const mediumList = (mediumRows || []).map((row) => ({
        id: row.medium_id,
        name: row.mediums?.name || "",
      }));
      setMediums(mediumList);

      // ─── Branch access ────────────────────────────────────
      let accessibleBranches = branchList || [];
      if (!isAdmin) {
        // Non‑admin: only their assigned branch
        accessibleBranches = accessibleBranches.filter(
          (b) => b.id === profile.branch_id
        );
        if (accessibleBranches.length === 0) {
          toast.error("No branch assigned to this user.");
        }
      }
      // Admin sees all branches – no filtering.

      setBranches(accessibleBranches);

      // Default to the first accessible branch
      if (accessibleBranches.length) {
        setBranch(accessibleBranches[0]);
      } else {
        setBranch(null);
      }

      // Financial year
      if (fys && fys.length > 0) {
        const current = fys.find((fy) => fy.id === profile.selected_financial_year_id) || null;
        setSelectedFinancialYear(current);
      } else {
        setSelectedFinancialYear(null);
      }
    }

    loadOrganization();
  }, [user]);

  const switchFinancialYear = useCallback(
    async (fyId) => {
      const fy = financialYears.find((f) => f.id === fyId);
      if (!fy || !user) return;
      await supabase
        .from("profiles")
        .update({ selected_financial_year_id: fyId })
        .eq("id", user.id);
      setSelectedFinancialYear(fy);
    },
    [financialYears, user]
  );

  const organizationId = org?.id ?? null;

  return (
    <OrgContext.Provider
      value={{
        org,
        theme,
        branch,
        setBranch,
        branches,
        financialYears,
        selectedFinancialYear,
        switchFinancialYear,
        mediums,
        organizationId,
      }}
    >
      {children}
    </OrgContext.Provider>
  );
}

export const useOrg = () => useContext(OrgContext);