// Deno imports – your editor will show errors, but they work in the Deno runtime
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { SmtpClient } from "https://deno.land/x/smtp@v0.7.0/mod.ts";

const gateways: Record<string, string> = {
  jio: "@jio.com",
  airtel: "@airtelmail.com",
  vi: "@vodafone.com",
  bsnl: "@bsnl.in",
};

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
};

serve(async (req) => {
  // Preflight
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders });
  }

  try {
    const { phone, network, message } = await req.json();
    if (!phone || !message) {
      return new Response(JSON.stringify({ error: "Missing phone or message" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    let toEmail = "";
    if (network && gateways[network]) {
      toEmail = phone + gateways[network];
    } else {
      const addresses = Object.values(gateways).map((g) => phone + g);
      toEmail = addresses.join(",");
    }

    const client = new SmtpClient();
    await client.connectTLS({
      hostname: Deno.env.get("SMTP_HOST")!,
      port: Number(Deno.env.get("SMTP_PORT")),
      username: Deno.env.get("SMTP_USER"),
      password: Deno.env.get("SMTP_PASS"),
    });

    await client.send({
      from: Deno.env.get("SMTP_USER")!,
      to: toEmail,
      subject: "ShreeVidhya Academy",
      content: message,
    });

    await client.close();
    return new Response(JSON.stringify({ success: true }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});