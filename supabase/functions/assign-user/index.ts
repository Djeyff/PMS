// @ts-nocheck
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

  if (req.method !== "POST") {
    console.warn("[assign-user] Method not allowed");
    return new Response(JSON.stringify({ error: "Method Not Allowed" }), { status: 405, headers: corsHeaders });
  }

  const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
  const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
  const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

  const authHeader = req.headers.get("Authorization");
  if (!authHeader) {
    console.warn("[assign-user] Missing auth header");
    return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: corsHeaders });
  }

  let body: { email?: string; role?: "owner" | "tenant" };
  try {
    body = await req.json();
  } catch {
    console.error("[assign-user] Invalid JSON");
    return new Response(JSON.stringify({ error: "Invalid JSON" }), { status: 400, headers: corsHeaders });
  }
  const email = (body.email || "").trim().toLowerCase();
  const role = body.role === "owner" ? "owner" : body.role === "tenant" ? "tenant" : null;
  if (!email || !role) {
    console.warn("[assign-user] Missing email or role");
    return new Response(JSON.stringify({ error: "email and role are required" }), { status: 400, headers: corsHeaders });
  }

  try {
    // Verify caller and get agency
    const anon = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, { global: { headers: { Authorization: authHeader } } });
    const { data: userRes } = await anon.auth.getUser();
    const requester = userRes?.user;
    if (!requester) {
      console.warn("[assign-user] Invalid token");
      return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: corsHeaders });
    }

    const service = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
    const { data: adminProfile } = await service
      .from("profiles")
      .select("id, role, agency_id")
      .eq("id", requester.id)
      .single();

    if (!adminProfile || adminProfile.role !== "agency_admin" || !adminProfile.agency_id) {
      console.warn("[assign-user] Forbidden: not agency_admin");
      return new Response(JSON.stringify({ error: "Forbidden" }), { status: 403, headers: corsHeaders });
    }
    const agencyId = adminProfile.agency_id as string;

    // Find auth user by email via admin.listUsers
    let targetUserId: string | null = null;
    let page = 1;
    const perPage = 200;
    for (let i = 0; i < 5; i++) {
      const { data: usersPage, error: listErr } = await service.auth.admin.listUsers({ page, perPage });
      if (listErr) {
        console.error("[assign-user] listUsers error", listErr);
        break;
      }
      const found = usersPage?.users?.find((u: any) => String(u.email || "").toLowerCase() === email);
      if (found?.id) {
        targetUserId = found.id;
        break;
      }
      if (!usersPage || (usersPage.users || []).length < perPage) {
        break; // no more pages
      }
      page++;
    }

    if (!targetUserId) {
      console.warn("[assign-user] User not found by email", email);
      return new Response(JSON.stringify({ error: "User not found" }), { status: 404, headers: corsHeaders });
    }

    // Upsert profile with agency and role; also store email so admins can see it
    const { error: upsertErr } = await service
      .from("profiles")
      .upsert({ id: targetUserId, agency_id: agencyId, role, email }, { onConflict: "id" });

    if (upsertErr) {
      console.error("[assign-user] Upsert profile error", upsertErr);
      return new Response(JSON.stringify({ error: upsertErr.message || "Failed to assign user" }), { status: 400, headers: corsHeaders });
    }

    console.log("[assign-user] Assigned user", { userId: targetUserId, role, agencyId });
    return new Response(JSON.stringify({ ok: true, id: targetUserId }), { status: 200, headers: corsHeaders });
  } catch (e) {
    console.error("[assign-user] Unexpected error", e);
    const msg = e instanceof Error ? e.message : String(e);
    return new Response(JSON.stringify({ error: msg }), { status: 500, headers: corsHeaders });
  }
});