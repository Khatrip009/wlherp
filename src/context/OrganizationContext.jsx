// src/context/OrganizationContext.jsx
import { createContext, useContext, useState, useEffect, useCallback } from "react";
import { supabase } from "../api/supabase";
import { useAuth } from "./AuthContext";

const OrgContext = createContext();

export function OrganizationProvider({ children }) {
  const { user } = useAuth();
  const [org, setOrg] = useState(null);
  const [theme, setTheme] = useState(null);
  const [branch, setBranch] = useState(null);
  const [branches, setBranches] = useState([]);
  const [financialYears, setFinancialYears] = useState([]);
  const [selectedFinancialYear, setSelectedFinancialYear] = useState(null);
  const [mediums, setMediums] = useState([]);   // ← NEW

  // Apply theme CSS variables
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
      const { data: profile } = await supabase
        .from("profiles")
        .select("organization_id, selected_financial_year_id")
        .eq("id", user.id)
        .single();

      if (!profile?.organization_id) return;

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
        supabase.from("financial_years")
          .select("*")
          .eq("organization_id", profile.organization_id)
          .order("start_date", { ascending: false }),
        supabase
          .from("organization_mediums")
          .select("medium_id, mediums(name)")   // assuming mediums table has "name"
          .eq("org_id", profile.organization_id),
      ]);

      setOrg(orgData);
      setTheme(themeData || null);
      setBranches(branchList || []);
      setFinancialYears(fys || []);

      // Extract mediums list from mapping
      const mediumList = (mediumRows || []).map((row) => ({
        id: row.medium_id,
        name: row.mediums?.name || "",
      }));
      setMediums(mediumList);

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

  // ── Derived value: numeric ID for use in .eq("id", orgId) ──
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
        mediums,            // now available everywhere
        organizationId,     // just the number, safe to use in queries
      }}
    >
      {children}
    </OrgContext.Provider>
  );
}

export const useOrg = () => useContext(OrgContext);