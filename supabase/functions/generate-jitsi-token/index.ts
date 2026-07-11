// supabase/functions/generate-jitsi-token/index.ts
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { SignJWT, importPKCS8 } from "https://esm.sh/jose@5";

const corsHeaders = {
  "Access-Control-Allow-Origin": Deno.env.get("ALLOWED_ORIGIN") || "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
};

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization")?.split(" ")[1];
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Missing token" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: `Bearer ${authHeader}` } } }
    );

    const { data: { user }, error: authError } = await supabaseClient.auth.getUser();
    if (authError || !user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { roomName, displayName } = await req.json();
    const appId = Deno.env.get("JITSI_APP_ID");
    const privateKeyPem = Deno.env.get("JITSI_PRIVATE_KEY");
    const keyId = Deno.env.get("JITSI_KEY_ID"); // full kid from dashboard

    if (!appId || !privateKeyPem || !keyId) {
      console.error("Missing JITSI_APP_ID, JITSI_PRIVATE_KEY, or JITSI_KEY_ID");
      return new Response(JSON.stringify({ error: "Server configuration error" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const cleanedKey = privateKeyPem
      .replace(/\\n/g, "\n")
      .replace(/\r\n/g, "\n")
      .replace(/\r/g, "\n")
      .trim();

    if (!cleanedKey.includes("BEGIN PRIVATE KEY")) {
      return new Response(JSON.stringify({ error: "Invalid private key format" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const now = Math.floor(Date.now() / 1000);
    const payload = {
      aud: "jitsi",
      iss: "chat",
      sub: appId,
      room: roomName, // use actual room name, not "*"
      exp: now + 3600, // 1 hour expiration
      nbf: now,
      context: {
        user: {
          id: user.id,                          // ✅ required by Jitsi
          name: displayName || "Guest",
          email: user.email || "guest@example.com", // ✅ required by Jitsi
          moderator: "true",
        },
        features: {
          recording: false,
          livestreaming: false,
          transcription: false,
          "outbound-call": false,
        },
        room: {
          regex: false,
        },
      },
    };

    const privateKey = await importPKCS8(cleanedKey, "RS256");
    const jwt = await new SignJWT(payload)
      .setProtectedHeader({
        alg: "RS256",
        typ: "JWT",
        kid: keyId,
      })
      .sign(privateKey);

    return new Response(JSON.stringify({ token: jwt }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("Error:", error.message);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
