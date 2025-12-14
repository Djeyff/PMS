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

    // Verify user token using anon client
    const anon = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: userRes, error: userErr } = await anon.auth.getUser();
    if (userErr || !userRes?.user) {
      return new Response(JSON.stringify({ error: "Invalid auth token" }), { status: 401, headers: corsHeaders });
    }
    const userId = userRes.user.id;

    const { name, default_currency } = await req.json().catch(() => ({}));
    if (!name || !default_currency || !["USD", "DOP"].includes(default_currency)) {
      return new Response(JSON.stringify({ error: "Invalid body. Expect { name, default_currency: 'USD' | 'DOP' }" }), {
        status: 400,
        headers: corsHeaders,
      });
    }

    // Use service role to bypass RLS safely
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
      return new Response(JSON.stringify({ error: assignErr.message || "Failed to assign profile to agency" }), {
        status: 400,
        headers: corsHeaders,
      });
    }

    return new Response(JSON.stringify({ id: agency.id }), { status: 200, headers: { "Content-Type": "application/json", ...corsHeaders } });
  } catch (e) {
    return new Response(JSON.stringify({ error: e?.message || "Unexpected error" }), { status: 500, headers: corsHeaders });
  }
});