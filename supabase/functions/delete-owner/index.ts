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
    if (!authHeader) return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: corsHeaders });

    const anon = createClient(supabaseUrl, anonKey, { global: { headers: { Authorization: authHeader } } });
    const { data: caller, error: callerErr } = await anon.auth.getUser();
    if (callerErr || !caller?.user) return new Response(JSON.stringify({ error: "Invalid auth token" }), { status: 401, headers: corsHeaders });
    const adminUserId = caller.user.id;

    const body = await req.json().catch(() => ({}));
    const ownerId: string | undefined = body?.ownerId ?? body?.tenantId; // backward compatible
    if (!ownerId) return new Response(JSON.stringify({ error: "ownerId is required" }), { status: 400, headers: corsHeaders });

    const admin = createClient(supabaseUrl, serviceKey);
    const { data: adminProfile } = await admin.from("profiles").select("role, agency_id").eq("id", adminUserId).single();
    if (!adminProfile || adminProfile.role !== "agency_admin" || !adminProfile.agency_id) {
      return new Response(JSON.stringify({ error: "Forbidden" }), { status: 403, headers: corsHeaders });
    }
    const agencyId = adminProfile.agency_id;

    const { data: ownerProfile, error: ownerErr } = await admin.from("profiles").select("agency_id, role").eq("id", ownerId).single();
    if (ownerErr || !ownerProfile) return new Response(JSON.stringify({ error: "Owner not found" }), { status: 404, headers: corsHeaders });
    if (ownerProfile.role !== "owner") return new Response(JSON.stringify({ error: "User is not an owner" }), { status: 400, headers: corsHeaders });
    if (ownerProfile.agency_id !== agencyId) return new Response(JSON.stringify({ error: "Owner not in your agency" }), { status: 403, headers: corsHeaders });

    const { error: delErr } = await admin.auth.admin.deleteUser(ownerId);
    if (delErr) return new Response(JSON.stringify({ error: delErr.message || "Delete failed" }), { status: 400, headers: corsHeaders });

    // Audit log
    await anon.from("activity_logs").insert({
      user_id: adminUserId,
      action: "delete_owner",
      entity_type: "profile",
      entity_id: ownerId,
      metadata: null,
    });

    return new Response(JSON.stringify({ ok: true }), { status: 200, headers: { "Content-Type": "application/json", ...corsHeaders } });
  } catch (e) {
    return new Response(JSON.stringify({ error: e?.message || "Unexpected error" }), { status: 500, headers: corsHeaders });
  }
});