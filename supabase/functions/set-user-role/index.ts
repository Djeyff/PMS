// @ts-nocheck
import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

type Role = "agency_admin" | "owner" | "tenant";

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    console.warn("[set-user-role] Method not allowed");
    return new Response(JSON.stringify({ error: "Method Not Allowed" }), {
      status: 405,
      headers: corsHeaders,
    });
  }

  const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
  const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
  const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

  const authHeader = req.headers.get("Authorization");
  if (!authHeader) {
    console.warn("[set-user-role] Missing auth header");
    return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: corsHeaders });
  }

  let body: { userId?: string; role?: Role };
  try {
    body = await req.json();
  } catch {
    console.error("[set-user-role] Invalid JSON");
    return new Response(JSON.stringify({ error: "Invalid JSON" }), { status: 400, headers: corsHeaders });
  }

  const userId = String(body.userId || "").trim();
  const role = body.role === "agency_admin" || body.role === "owner" || body.role === "tenant" ? body.role : null;

  if (!userId || !role) {
    console.warn("[set-user-role] Missing userId or role");
    return new Response(JSON.stringify({ error: "userId and role are required" }), { status: 400, headers: corsHeaders });
  }

  try {
    // Verify caller
    const anon = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: userRes } = await anon.auth.getUser();
    const requester = userRes?.user;
    if (!requester) {
      console.warn("[set-user-role] Invalid token");
      return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: corsHeaders });
    }

    const service = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // Ensure requester is agency admin
    const { data: adminProfile } = await service
      .from("profiles")
      .select("id, role, agency_id")
      .eq("id", requester.id)
      .single();

    if (!adminProfile || adminProfile.role !== "agency_admin" || !adminProfile.agency_id) {
      console.warn("[set-user-role] Forbidden: not agency_admin");
      return new Response(JSON.stringify({ error: "Forbidden" }), { status: 403, headers: corsHeaders });
    }

    const agencyId = adminProfile.agency_id as string;

    // Prevent self-demotion in the app to avoid lockouts
    if (requester.id === userId && role !== "agency_admin") {
      console.warn("[set-user-role] Refusing self-demotion", { requester: requester.id, role });
      return new Response(JSON.stringify({ error: "You cannot remove your own agency admin role from the app." }), {
        status: 400,
        headers: corsHeaders,
      });
    }

    // Load target profile (if any)
    const { data: targetProfile, error: targetErr } = await service
      .from("profiles")
      .select("id, role, agency_id, email")
      .eq("id", userId)
      .maybeSingle();

    if (targetErr) {
      console.error("[set-user-role] Fetch target profile error", targetErr);
      return new Response(JSON.stringify({ error: targetErr.message || "Failed to load user" }), { status: 400, headers: corsHeaders });
    }

    // If target belongs to another agency, block
    if (targetProfile?.agency_id && targetProfile.agency_id !== agencyId) {
      console.warn("[set-user-role] Cross-agency update blocked", { userId, targetAgency: targetProfile.agency_id, agencyId });
      return new Response(JSON.stringify({ error: "Cannot modify users outside your agency" }), { status: 403, headers: corsHeaders });
    }

    // If demoting an agency admin, make sure there is at least one other admin
    if (targetProfile?.role === "agency_admin" && role !== "agency_admin") {
      const { count } = await service
        .from("profiles")
        .select("id", { count: "exact", head: true })
        .eq("agency_id", agencyId)
        .eq("role", "agency_admin");

      const adminCount = Number(count || 0);
      if (adminCount <= 1) {
        console.warn("[set-user-role] Refusing to demote last agency admin", { agencyId, adminCount });
        return new Response(JSON.stringify({ error: "Cannot remove the last Agency Admin from an agency." }), {
          status: 400,
          headers: corsHeaders,
        });
      }
    }

    // Apply role + ensure agency_id is set to requester's agency
    const { error: upsertErr } = await service
      .from("profiles")
      .upsert(
        {
          id: userId,
          role,
          agency_id: agencyId,
        },
        { onConflict: "id" }
      );

    if (upsertErr) {
      console.error("[set-user-role] Upsert error", upsertErr);
      return new Response(JSON.stringify({ error: upsertErr.message || "Failed to set role" }), { status: 400, headers: corsHeaders });
    }

    console.log("[set-user-role] Role updated", { userId, role, agencyId });
    return new Response(JSON.stringify({ ok: true, userId, role, agencyId }), { status: 200, headers: corsHeaders });
  } catch (e) {
    console.error("[set-user-role] Unexpected error", e);
    const msg = e instanceof Error ? e.message : String(e);
    return new Response(JSON.stringify({ error: msg }), { status: 500, headers: corsHeaders });
  }
});
