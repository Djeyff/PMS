import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

function buildCorsHeaders(origin: string | null) {
  return {
    "Access-Control-Allow-Origin": origin ?? "*",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
  };
}
function isOriginAllowed(origin: string | null) {
  const raw = Deno.env.get("ALLOWED_ORIGINS") ?? "";
  const list = raw.split(",").map(s => s.trim()).filter(Boolean);
  if (list.length === 0) return true;
  if (!origin) return true;
  return list.includes(origin);
}

serve(async (req) => {
  const origin = req.headers.get("Origin");
  const corsHeaders = buildCorsHeaders(origin);

  if (req.method === "OPTIONS") {
    if (!isOriginAllowed(origin)) {
      return new Response("Origin not allowed", { status: 403, headers: corsHeaders });
    }
    return new Response(null, { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method Not Allowed" }), { status: 405, headers: corsHeaders });
  }

  if (!isOriginAllowed(origin)) {
    return new Response(JSON.stringify({ error: "Origin not allowed" }), { status: 403, headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: corsHeaders });
    }

    // Validate caller using anon client + Authorization header
    const anon = createClient(supabaseUrl, anonKey, { global: { headers: { Authorization: authHeader } } });
    const { data: userRes, error: userErr } = await anon.auth.getUser();
    if (userErr || !userRes?.user) {
      return new Response(JSON.stringify({ error: "Invalid auth token" }), { status: 401, headers: corsHeaders });
    }
    const userId = userRes.user.id;

    const body = await req.json().catch(() => ({}));
    const name = body?.name;
    const default_currency = body?.default_currency;
    if (!name || !["USD", "DOP"].includes(default_currency)) {
      return new Response(JSON.stringify({ error: "Invalid body. Expect { name, default_currency: 'USD' | 'DOP' }" }), {
        status: 400,
        headers: corsHeaders,
      });
    }

    // Service client bypasses RLS securely
    const admin = createClient(supabaseUrl, serviceKey);

    const { data: agency, error: insertErr } = await admin
      .from("agencies")
      .insert({ name, default_currency })
      .select("id")
      .single();

    if (insertErr || !agency?.id) {
      return new Response(JSON.stringify({ error: insertErr?.message || "Failed to create agency" }), {
        status: 400,
        headers: corsHeaders,
      });
    }

    const { error: assignErr } = await admin
      .from("profiles")
      .upsert({ id: userId, agency_id: agency.id }, { onConflict: "id" });

    if (assignErr) {
      return new Response(JSON.stringify({ error: assignErr.message || "Failed to assign profile" }), {
        status: 400,
        headers: corsHeaders,
      });
    }

    // Audit log
    await anon.from("activity_logs").insert({
      user_id: userId,
      action: "create_agency",
      entity_type: "agency",
      entity_id: agency.id,
      metadata: { name, default_currency },
    });

    return new Response(JSON.stringify({ id: agency.id }), {
      status: 200,
      headers: { "Content-Type": "application/json", ...corsHeaders },
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: e?.message || "Unexpected error" }), {
      status: 500,
      headers: corsHeaders,
    });
  }
});