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

  // Resolve target agency via explicit steps
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

  // Audit log
  await anon.from("activity_logs").insert({
    user_id: userId,
    action: "delete_payment",
    entity_type: "payment",
    entity_id: paymentId,
    metadata: null,
  });

  return new Response(JSON.stringify({ ok: true }), { status: 200, headers: corsHeaders });
});