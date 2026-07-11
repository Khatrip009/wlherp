import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );

  const { domainId } = await req.json();

  // Fetch domain record
  const { data: domain } = await supabase
    .from("organization_domains")
    .select("*")
    .eq("id", domainId)
    .single();

  if (!domain) {
    return new Response(JSON.stringify({ error: "Domain not found" }), {
      status: 404,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  // Verify DNS (simplified – in production use a real DNS resolver)
  // We'll simulate verification: check if domain has a CNAME pointing to your app.
  // For now, we'll just trust the user and mark as verified (you can later integrate with a DNS API).
  // For demo, we'll assume verification passes if the domain is not empty.
  const verified = domain.domain.length > 3;

  if (verified) {
    await supabase
      .from("organization_domains")
      .update({ verified: true })
      .eq("id", domainId);
  }

  return new Response(JSON.stringify({ verified }), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});