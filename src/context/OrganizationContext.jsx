// src/context/OrganizationContext.jsx
import { createContext, useContext, useState, useEffect, useCallback } from "react";
import { supabase } from "../api/supabase";
import { useAuth } from "./AuthContext";

const OrgContext = createContext();

export function OrganizationProvider({ children }) {
  const { user } = useAuth();
  const [org, setOrg] = useState(null);
  const [theme, setTheme] = useState(null);            // ← NEW
  const [branch, setBranch] = useState(null);
  const [branches, setBranches] = useState([]);
  const [financialYears, setFinancialYears] = useState([]);
  const [selectedFinancialYear, setSelectedFinancialYear] = useState(null);

  // Apply theme CSS variables whenever the theme changes
  useEffect(() => {
    if (!theme) return;
    const root = document.documentElement;
    root.style.setProperty("--color-primary", theme.primary_color);
    root.style.setProperty("--color-primary-light", theme.primary_light_color);
    root.style.setProperty("--color-primary-dark", theme.primary_dark_color);
    root.style.setProperty("--color-accent", theme.accent_color);
    root.style.setProperty("--color-accent-light", theme.accent_light_color);
    root.style.setProperty("--color-accent-dark", theme.accent_dark_color);
    root.style.setProperty("--font-heading", theme.font_heading);
    root.style.setProperty("--font-body", theme.font_body);
  }, [theme]);

  useEffect(() => {
    // ── USER LOGGED OUT ──
    if (!user) {
      setOrg(null);
      setTheme(null);
      setBranch(null);
      setBranches([]);
      setFinancialYears([]);
      setSelectedFinancialYear(null);

      // Domain matching for public pages (only when no user)
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

    // ── USER LOGGED IN ──
    async function loadOrganization() {
      const { data: profile } = await supabase
        .from("profiles")
        .select("organization_id, selected_financial_year_id")
        .eq("id", user.id)
        .single();

      if (!profile?.organization_id) return;

      // Fetch org, theme, branches, and financial years in parallel
      const [
        { data: orgData },
        { data: themeData },
        { data: branchList },
        { data: fys },
      ] = await Promise.all([
        supabase.from("organization").select("*").eq("id", profile.organization_id).single(),
        supabase.from("themes").select("*").eq("org_id", profile.organization_id).maybeSingle(),
        supabase.from("branches").select("*").eq("organization_id", profile.organization_id),
        supabase.from("financial_years")
          .select("*")
          .eq("organization_id", profile.organization_id)
          .order("start_date", { ascending: false }),
      ]);

      setOrg(orgData);
      setTheme(themeData || null);
      setBranches(branchList || []);
      setFinancialYears(fys || []);

      if (branchList?.length) setBranch(branchList[0]);

      if (fys && fys.length > 0) {
        const current = fys.find(fy => fy.id === profile.selected_financial_year_id) || null;
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

  return (
    <OrgContext.Provider
      value={{
        org,
        theme,   // ← exposed
        branch,
        setBranch,
        branches,
        financialYears,
        selectedFinancialYear,
        switchFinancialYear,
      }}
    >
      {children}
    </OrgContext.Provider>
  );
}

export const useOrg = () => useContext(OrgContext);