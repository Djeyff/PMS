import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const authHeader = req.headers.get("Authorization");
  if (!authHeader) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: corsHeaders });
  }

  let body: { id?: string };
  try {
    body = await req.json();
  } catch {
    return new Response(JSON.stringify({ error: "Invalid JSON" }), { status: 400, headers: corsHeaders });
  }
  const paymentId = body.id;
  if (!paymentId) {
    return new Response(JSON.stringify({ error: "Missing payment id" }), { status: 400, headers: corsHeaders });
  }

  const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
  const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
  const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

  const anon = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: authHeader } },
  });
  const { data: userRes, error: userErr } = await anon.auth.getUser();
  if (userErr || !userRes?.user) {
    return new Response(JSON.stringify({ error: "Invalid token" }), { status: 401, headers: corsHeaders });
  }
  const userId = userRes.user.id;

  const service = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

  // Caller profile
  const { data: profile, error: profErr } = await service
    .from("profiles")
    .select("id, role, agency_id")
    .eq("id", userId)
    .maybeSingle();
  if (profErr || !profile) {
    return new Response(JSON.stringify({ error: "Profile not found" }), { status: 403, headers: corsHeaders });
  }

  // Load payment
  const { data: pay, error: payErr } = await service
    .from("payments")
    .select("id, lease_id, invoice_id")
    .eq("id", paymentId)
    .maybeSingle();
  if (payErr || !pay) {
    return new Response(JSON.stringify({ error: "Payment not found" }), { status: 404, headers: corsHeaders });
  }

  // Determine agency of the payment via lease/property (or invoice->lease->property)
  let targetAgencyId: string | null = null;

  if (pay.lease_id) {
    const { data: lease } = await service
      .from("leases")
      .select("id, property:properties(id, agency_id)")
      .eq("id", pay.lease_id)
      .maybeSingle();
    targetAgencyId = lease?.property?.agency_id ?? null;
  } else if (pay.invoice_id) {
    const { data: inv } = await service
      .from("invoices")
      .select("id, lease:leases(id, property:properties(id, agency_id))")
      .eq("id", pay.invoice_id)
      .maybeSingle();
    targetAgencyId = inv?.lease?.property?.agency_id ?? null;
  }

  if (!targetAgencyId) {
    return new Response(JSON.stringify({ error: "Unable to resolve payment agency" }), { status: 403, headers: corsHeaders });
  }

  const isAdmin = profile.role === "agency_admin";
  const sameAgency = profile.agency_id && profile.agency_id === targetAgencyId;

  if (!isAdmin || !sameAgency) {
    return new Response(JSON.stringify({ error: "Forbidden" }), { status: 403, headers: corsHeaders });
  }

  const { error: delErr } = await service.from("payments").delete().eq("id", paymentId);
  if (delErr) {
    return new Response(JSON.stringify({ error: delErr.message }), { status: 500, headers: corsHeaders });
  }

  return new Response(JSON.stringify({ ok: true }), { status: 200, headers: corsHeaders });
});