import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: corsHeaders });
    }

    // Identify caller with anon client
    const anon = createClient(supabaseUrl, anonKey, { global: { headers: { Authorization: authHeader } } });
    const { data: callerRes, error: callerErr } = await anon.auth.getUser();
    if (callerErr || !callerRes?.user) {
      return new Response(JSON.stringify({ error: "Invalid auth token" }), { status: 401, headers: corsHeaders });
    }
    const adminUserId = callerRes.user.id;

    const body = await req.json().catch(() => ({}));
    const tenantId: string | undefined = body?.tenantId;
    if (!tenantId) {
      return new Response(JSON.stringify({ error: "tenantId is required" }), { status: 400, headers: corsHeaders });
    }

    // Service client for privileged checks and deletion
    const admin = createClient(supabaseUrl, serviceKey);

    // Verify caller is agency admin
    const { data: callerProfile, error: profErr } = await admin
      .from("profiles")
      .select("role, agency_id")
      .eq("id", adminUserId)
      .single();

    if (profErr || !callerProfile || callerProfile.role !== "agency_admin" || !callerProfile.agency_id) {
      return new Response(JSON.stringify({ error: "Forbidden: only agency admins with agency can delete tenants" }), {
        status: 403,
        headers: corsHeaders,
      });
    }

    // Verify tenant belongs to the same agency
    const { data: tenantProfile, error: tenantErr } = await admin
      .from("profiles")
      .select("agency_id, role")
      .eq("id", tenantId)
      .single();

    if (tenantErr || !tenantProfile) {
      return new Response(JSON.stringify({ error: "Tenant not found" }), { status: 404, headers: corsHeaders });
    }
    if (tenantProfile.role !== "tenant") {
      return new Response(JSON.stringify({ error: "User is not a tenant" }), { status: 400, headers: corsHeaders });
    }
    if (tenantProfile.agency_id !== callerProfile.agency_id) {
      return new Response(JSON.stringify({ error: "Tenant does not belong to your agency" }), { status: 403, headers: corsHeaders });
    }

    // Delete auth user (will cascade to profiles via FK and to rows referencing profiles with ON DELETE CASCADE)
    const { error: delErr } = await admin.auth.admin.deleteUser(tenantId);
    if (delErr) {
      return new Response(JSON.stringify({ error: delErr.message || "Failed to delete user" }), { status: 400, headers: corsHeaders });
    }

    return new Response(JSON.stringify({ ok: true }), { status: 200, headers: { "Content-Type": "application/json", ...corsHeaders } });
  } catch (e) {
    return new Response(JSON.stringify({ error: e?.message || "Unexpected error" }), { status: 500, headers: corsHeaders });
  }
});