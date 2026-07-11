// src/hooks/useOrgLightLogo.js
import { useQuery } from "@tanstack/react-query";
import { supabase } from "../api/supabase";
import { useOrg } from "../context/OrganizationContext";

export function useOrgLightLogo() {
  const { org } = useOrg();

  const { data: orgData } = useQuery({
    queryKey: ["org-light-logo", org?.id],
    queryFn: async () => {
      if (!org?.id) return null;
      const { data } = await supabase
        .from("organization")
        .select("logo_light_url")
        .eq("id", org.id)
        .single();
      return data;
    },
    enabled: !!org?.id,
    staleTime: Infinity,
  });

  return orgData?.logo_light_url || "/ShreeVidhyalight.png";
}