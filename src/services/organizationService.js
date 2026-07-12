// src/services/organizationService.js
import { supabase } from "../api/supabase";

const ORG_FIELDS = `
  id, company_name, phone, email, website, gstin, address, vision, mission,
  description, organization_key, is_active, domain, logo_light_url, logo_dark_url,
  letterhead_url
`;

/**
 * Fetch organization details + linked mediums for a given orgId.
 */
export async function getOrganization(orgId) {
  // Fetch organisation
 const { data: org } = await supabase
  .from("organization")
  .select("*")
  .eq("id", org?.id)      // ✅ numeric ID
  .single();
  if (error) throw error;

  // Fetch theme
  const { data: theme } = await supabase
    .from("themes")
    .select("*")
    .eq("org_id", orgId)
    .maybeSingle();

  // Fetch linked mediums
  const { data: links } = await supabase
    .from("organization_mediums")
    .select("medium_id, mediums(name)")
    .eq("org_id", orgId);

  const mediums = (links || []).map((om) => ({
    id: om.medium_id,
    name: om.mediums?.name || "",
  }));

  return { ...org, theme: theme || null, mediums };
}

/**
 * Update organisation details + sync linked mediums.
 */
export async function updateOrganization(orgId, payload) {
  const { mediums, ...orgData } = payload;

  // Update the organisation record (only known fields)
  const { data: org, error } = await supabase
    .from("organization")
    .update(orgData)
    .eq("id", orgId)
    .select(ORG_FIELDS)
    .single();
  if (error) throw error;

  // Sync mediums
  if (mediums !== undefined) {
    await supabase.from("organization_mediums").delete().eq("org_id", orgId);
    if (mediums.length > 0) {
      const links = mediums.map((mid) => ({ org_id: orgId, medium_id: mid }));
      await supabase.from("organization_mediums").insert(links);
    }
  }

  return org;
}