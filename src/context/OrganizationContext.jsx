// src/context/OrganizationContext.jsx
import { createContext, useContext, useState, useEffect, useCallback } from "react";
import { supabase } from "../api/supabase";
import { useAuth } from "./AuthContext";

const OrgContext = createContext();

export function OrganizationProvider({ children }) {
  const { user } = useAuth();
  const [org, setOrg] = useState(null);
  const [branch, setBranch] = useState(null);
  const [branches, setBranches] = useState([]);
  const [financialYears, setFinancialYears] = useState([]);
  const [selectedFinancialYear, setSelectedFinancialYear] = useState(null);
  const [mediums, setMediums] = useState([]);

  useEffect(() => {
    let cancelled = false;

    async function loadOrg() {
      const { data: orgData } = await supabase
        .from("organization")
        .select("*")
        .eq("id", 3)
        .single();

      if (!orgData || cancelled) return;

      setOrg(orgData);

      const [{ data: branchList }, { data: fys }, { data: mediumRows }] = await Promise.all([
        supabase.from("branches").select("*").eq("organization_id", orgData.id),
        supabase.from("financial_years").select("*").eq("organization_id", orgData.id).order("start_date", { ascending: false }),
        supabase.from("organization_mediums").select("medium_id, mediums(name)").eq("org_id", orgData.id),
      ]);

      if (cancelled) return;

      setBranches(branchList || []);
      if (branchList?.length) setBranch(branchList[0]);

      setFinancialYears(fys || []);
      if (fys?.length) setSelectedFinancialYear(fys[0]);

      const mediumList = (mediumRows || []).map((row) => ({
        id: row.medium_id,
        name: row.mediums?.name || "",
      }));
      setMediums(mediumList);

      // If user is logged in, silently fix missing org/branch/FY
      if (user) {
        const { data: profile } = await supabase
          .from("profiles")
          .select("organization_id, branch_id, selected_financial_year_id")
          .eq("id", user.id)
          .single();

        if (profile && (!profile.organization_id || !profile.branch_id || !profile.selected_financial_year_id)) {
          await supabase
            .from("profiles")
            .update({
              organization_id: 3,
              branch_id: branchList?.[0]?.id || null,
              selected_financial_year_id: fys?.[0]?.id || null,
            })
            .eq("id", user.id);
        }
      }
    }

    loadOrg();
    return () => { cancelled = true; };
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
        branch,
        setBranch,
        branches,
        financialYears,
        selectedFinancialYear,
        switchFinancialYear,
        mediums,
        organizationId: org?.id ?? null,
      }}
    >
      {children}
    </OrgContext.Provider>
  );
}

export const useOrg = () => useContext(OrgContext);