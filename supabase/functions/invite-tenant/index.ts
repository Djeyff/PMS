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

    // Identify caller
    const anon = createClient(supabaseUrl, anonKey, { global: { headers: { Authorization: authHeader } } });
    const { data: userRes, error: userErr } = await anon.auth.getUser();
    if (userErr || !userRes?.user) {
      return new Response(JSON.stringify({ error: "Invalid auth token" }), { status: 401, headers: corsHeaders });
    }
    const adminUserId = userRes.user.id;

    const body = await req.json().catch(() => ({}));
    const email: string | undefined = body?.email;
    const first_name: string | undefined = body?.first_name;
    const last_name: string | undefined = body?.last_name;
    if (!email) {
      return new Response(JSON.stringify({ error: "Email is required" }), { status: 400, headers: corsHeaders });
    }

    // Service client (bypass RLS)
    const admin = createClient(supabaseUrl, serviceKey);

    // Verify caller is agency_admin and get their agency_id
    const { data: adminProfile, error: profErr } = await admin
      .from("profiles")
      .select("role, agency_id")
      .eq("id", adminUserId)
      .single();

    if (profErr || !adminProfile || adminProfile.role !== "agency_admin") {
      return new Response(JSON.stringify({ error: "Forbidden: only agency admins can invite tenants" }), {
        status: 403,
        headers: corsHeaders,
      });
    }
    const agencyId = adminProfile.agency_id;

    // Invite user by email (sends invite if SMTP configured)
    const { data: inviteRes, error: inviteErr } = await admin.auth.admin.inviteUserByEmail(email, {
      data: { first_name, last_name },
    });

    if (inviteErr || !inviteRes?.user?.id) {
      return new Response(JSON.stringify({ error: inviteErr?.message || "Failed to invite user" }), {
        status: 400,
        headers: corsHeaders,
      });
    }
    const newUserId = inviteRes.user.id;

    // Ensure profile row exists and assign role/agency
    const { error: upsertErr } = await admin
      .from("profiles")
      .upsert(
        { id: newUserId, role: "tenant", agency_id: agencyId, first_name: first_name ?? null, last_name: last_name ?? null },
        { onConflict: "id" }
      );

    if (upsertErr) {
      return new Response(JSON.stringify({ error: upsertErr.message || "Failed to assign tenant profile" }), {
        status: 400,
        headers: corsHeaders,
      });
    }

    return new Response(JSON.stringify({ id: newUserId }), {
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