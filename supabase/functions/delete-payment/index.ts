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

  // Verify caller
  const anon = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, { global: { headers: { Authorization: authHeader } } });
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
  if (profile.role !== "agency_admin") {
    return new Response(JSON.stringify({ error: "Forbidden" }), { status: 403, headers: corsHeaders });
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

  // Resolve target agency via explicit steps (no nested embeddings)
  let leaseId: string | null = pay.lease_id ?? null;
  if (!leaseId && pay.invoice_id) {
    const { data: inv, error: invErr } = await service
      .from("invoices")
      .select("id, lease_id")
      .eq("id", pay.invoice_id)
      .maybeSingle();
    if (invErr) {
      return new Response(JSON.stringify({ error: invErr.message }), { status: 500, headers: corsHeaders });
    }
    leaseId = inv?.lease_id ?? null;
  }

  if (!leaseId) {
    return new Response(JSON.stringify({ error: "Unable to resolve lease for payment" }), { status: 403, headers: corsHeaders });
  }

  const { data: lease, error: leaseErr } = await service
    .from("leases")
    .select("id, property_id")
    .eq("id", leaseId)
    .maybeSingle();
  if (leaseErr || !lease) {
    return new Response(JSON.stringify({ error: "Lease not found" }), { status: 404, headers: corsHeaders });
  }

  const { data: property, error: propErr } = await service
    .from("properties")
    .select("id, agency_id")
    .eq("id", lease.property_id)
    .maybeSingle();
  if (propErr || !property) {
    return new Response(JSON.stringify({ error: "Property not found" }), { status: 404, headers: corsHeaders });
  }

  if (!profile.agency_id || profile.agency_id !== property.agency_id) {
    return new Response(JSON.stringify({ error: "Forbidden: cross-agency" }), { status: 403, headers: corsHeaders });
  }

  const { error: delErr } = await service.from("payments").delete().eq("id", paymentId);
  if (delErr) {
    return new Response(JSON.stringify({ error: delErr.message }), { status: 500, headers: corsHeaders });
  }

  return new Response(JSON.stringify({ ok: true }), { status: 200, headers: corsHeaders });
});