// @ts-ignore: Deno runtime remote import
import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
// @ts-ignore: Deno runtime remote import
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

// Minimal Deno declaration for web type-check
declare const Deno: { env: { get(name: string): string | undefined } };

function buildCorsHeaders(origin: string | null) {
  return {
    "Access-Control-Allow-Origin": origin ?? "*",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
  };
}
function isOriginAllowed(origin: string | null) {
  const raw = Deno.env.get("ALLOWED_ORIGINS") ?? "";
  const list = raw.split(",").map((s) => s.trim()).filter(Boolean);
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

    const anon = createClient(supabaseUrl, anonKey, { global: { headers: { Authorization: authHeader } } });
    const { data: userRes, error: userErr } = await anon.auth.getUser();
    if (userErr || !userRes?.user) {
      return new Response(JSON.stringify({ error: "Invalid auth token" }), { status: 401, headers: corsHeaders });
    }
    const adminUserId = userRes.user.id;

    const body = await req.json().catch(() => ({}));
    const logId: string | undefined = body?.logId;
    if (!logId) {
      return new Response(JSON.stringify({ error: "logId is required" }), { status: 400, headers: corsHeaders });
    }

    const admin = createClient(supabaseUrl, serviceKey);

    // Verify caller is agency_admin and get their agency_id
    const { data: adminProfile } = await admin
      .from("profiles")
      .select("role, agency_id")
      .eq("id", adminUserId)
      .single();

    if (!adminProfile || adminProfile.role !== "agency_admin" || !adminProfile.agency_id) {
      return new Response(JSON.stringify({ error: "Forbidden: only agency admins can reinstate tenants" }), {
        status: 403,
        headers: corsHeaders,
      });
    }
    const agencyId = adminProfile.agency_id as string;

    // Fetch the deletion log entry for tenant
    const { data: log, error: logErr } = await admin
      .from("activity_logs")
      .select("id, action, entity_type, entity_id, metadata")
      .eq("id", logId)
      .single();
    if (logErr || !log) {
      return new Response(JSON.stringify({ error: "Log not found" }), { status: 404, headers: corsHeaders });
    }
    if (log.action !== "delete_tenant" || log.entity_type !== "profile") {
      return new Response(JSON.stringify({ error: "Log is not a tenant deletion" }), { status: 400, headers: corsHeaders });
    }

    const m: any = (log as any).metadata || {};
    const first_name: string | null = m.first_name ?? null;
    const last_name: string | null = m.last_name ?? null;
    const phone: string | null = m.phone ?? null;
    const email: string | null = m.email ?? null;

    // Create a new auth user (cannot reuse original id); prefer email if available
    let newUserId: string | null = null;
    if (email && email.trim().length > 0) {
      const { data: createRes, error: createErr } = await admin.auth.admin.createUser({
        email,
        email_confirm: true,
        user_metadata: { first_name, last_name, phone, reinstated: true },
      });
      if (createErr || !createRes?.user?.id) {
        return new Response(JSON.stringify({ error: createErr?.message || "Failed to recreate tenant" }), {
          status: 400,
          headers: corsHeaders,
        });
      }
      newUserId = createRes.user.id;
    } else {
      const placeholderEmail = `tenant+restored_${Date.now()}_${Math.random().toString(36).slice(2,8)}@placeholder.local`;
      const { data: createRes, error: createErr } = await admin.auth.admin.createUser({
        email: placeholderEmail,
        email_confirm: true,
        user_metadata: { first_name, last_name, phone, placeholder: true, reinstated: true },
      });
      if (createErr || !createRes?.user?.id) {
        return new Response(JSON.stringify({ error: createErr?.message || "Failed to create placeholder tenant" }), {
          status: 400,
          headers: corsHeaders,
        });
      }
      newUserId = createRes.user.id;
    }

    // Restore profile
    const { error: upsertErr } = await admin
      .from("profiles")
      .upsert(
        { id: newUserId, role: "tenant", agency_id: agencyId, first_name, last_name, phone },
        { onConflict: "id" }
      );
    if (upsertErr) {
      return new Response(JSON.stringify({ error: upsertErr.message || "Failed to restore tenant profile" }), {
        status: 400,
        headers: corsHeaders,
      });
    }

    // Audit log
    await anon.from("activity_logs").insert({
      user_id: adminUserId,
      action: "reinstate_tenant",
      entity_type: "profile",
      entity_id: newUserId,
      metadata: { from_log_id: logId },
    });

    return new Response(JSON.stringify({ ok: true, id: newUserId }), {
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