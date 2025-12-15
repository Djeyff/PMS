import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const MASTER_ADMIN_EMAIL = "djeyff06@gmail.com";

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
    const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: corsHeaders });
    }

    // Identify caller using anon client + Authorization header
    const anon = createClient(SUPABASE_URL, ANON_KEY, { global: { headers: { Authorization: authHeader } } });
    const { data: userRes, error: userErr } = await anon.auth.getUser();
    if (userErr || !userRes?.user) {
      return new Response(JSON.stringify({ error: "Invalid auth token" }), { status: 401, headers: corsHeaders });
    }

    const userId = userRes.user.id;
    const email = (userRes.user.email ?? "").toLowerCase();

    // If not master admin email, no-op
    if (email !== MASTER_ADMIN_EMAIL) {
      return new Response(JSON.stringify({ ok: true, message: "No-op for non-master admin" }), {
        status: 200,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      });
    }

    const admin = createClient(SUPABASE_URL, SERVICE_KEY);

    // Upsert admin role
    const { error: roleErr } = await admin.from("profiles").upsert({ id: userId, role: "agency_admin" }, { onConflict: "id" });
    if (roleErr) {
      return new Response(JSON.stringify({ error: roleErr.message || "Failed to upsert role" }), { status: 400, headers: corsHeaders });
    }

    // Fetch profile to check agency
    const { data: prof, error: profErr } = await admin.from("profiles").select("id, role, agency_id, updated_at").eq("id", userId).single();
    if (profErr) {
      return new Response(JSON.stringify({ error: profErr.message || "Profile fetch failed" }), { status: 400, headers: corsHeaders });
    }

    let agencyId = prof?.agency_id ?? null;
    if (!agencyId) {
      // Create agency and assign
      const { data: agency, error: agErr } = await admin
        .from("agencies")
        .insert({ name: "Master Agency", default_currency: "USD" })
        .select("id")
        .single();

      if (agErr || !agency?.id) {
        return new Response(JSON.stringify({ error: agErr?.message || "Failed to create agency" }), { status: 400, headers: corsHeaders });
      }

      const { error: assignErr } = await admin.from("profiles").upsert({ id: userId, agency_id: agency.id }, { onConflict: "id" });
      if (assignErr) {
        return new Response(JSON.stringify({ error: assignErr.message || "Failed to assign agency" }), { status: 400, headers: corsHeaders });
      }

      agencyId = agency.id;
    }

    return new Response(
      JSON.stringify({
        ok: true,
        profile: { id: userId, role: "agency_admin", agency_id: agencyId },
      }),
      { status: 200, headers: { "Content-Type": "application/json", ...corsHeaders } }
    );
  } catch (e) {
    return new Response(JSON.stringify({ error: e?.message || "Unexpected error" }), { status: 500, headers: corsHeaders });
  }
});