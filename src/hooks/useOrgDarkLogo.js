// src/hooks/useOrgDarkLogo.js
import { useQuery } from "@tanstack/react-query";
import { supabase } from "../api/supabase";
import { useOrg } from "../context/OrganizationContext";

export function useOrgDarkLogo() {
  const { org } = useOrg();

  const { data: orgData } = useQuery({
    queryKey: ["org-dark-logo", org?.id],
    queryFn: async () => {
      if (!org?.id) return null;
      const { data } = await supabase
        .from("organization")
        .select("logo_dark_url")
        .eq("id", org.id)          // ✅ use org.id, not org object
        .single();
      return data;
    },
    enabled: !!org?.id,
    staleTime: Infinity,
  });

  return orgData?.logo_dark_url || "/ShreeVidhyaDark.png"; // fallback only if absolutely no logo set
}