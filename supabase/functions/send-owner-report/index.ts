import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

function buildCorsHeaders(origin: string | null) {
  return {
    "Access-Control-Allow-Origin": origin ?? "*",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-job-token",
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

function toBase64(str: string) {
  const bytes = new TextEncoder().encode(str);
  let binary = "";
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
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

  let payload: {
    ownerId: string;
    ownerName?: string;
    startDate: string;
    endDate: string;
    totals: { usd: number; dop: number };
    csv?: string;
  };
  try {
    payload = await req.json();
  } catch {
    return new Response(JSON.stringify({ error: "Invalid JSON" }), { status: 400, headers: corsHeaders });
  }

  const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
  const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
  const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");

  if (!RESEND_API_KEY) {
    return new Response(JSON.stringify({ error: "Missing RESEND_API_KEY secret" }), { status: 500, headers: corsHeaders });
  }

  // Verify JWT and get caller
  const anon = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: authHeader } },
  });
  const { data: userRes, error: userErr } = await anon.auth.getUser();
  if (userErr || !userRes?.user) {
    return new Response(JSON.stringify({ error: "Invalid token" }), { status: 401, headers: corsHeaders });
  }
  const callerId = userRes.user.id;

  // Service client for privileged operations
  const service = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

  // Enforce that only an agency_admin can email owner reports, and the owner must belong to their agency
  const { data: callerProfile } = await service.from("profiles").select("role, agency_id").eq("id", callerId).maybeSingle();
  if (!callerProfile || callerProfile.role !== "agency_admin" || !callerProfile.agency_id) {
    return new Response(JSON.stringify({ error: "Forbidden" }), { status: 403, headers: corsHeaders });
  }

  // Validate that the owner is tied to at least one property in this admin's agency
  const { data: ownerProps } = await service.from("property_owners").select("property_id").eq("owner_id", payload.ownerId);
  const ownerPropertyIds = (ownerProps ?? []).map((r: any) => r.property_id);
  if (ownerPropertyIds.length === 0) {
    return new Response(JSON.stringify({ error: "Owner not in your agency" }), { status: 403, headers: corsHeaders });
  }
  const { data: ownerAny } = await service
    .from("properties")
    .select("id")
    .eq("agency_id", callerProfile.agency_id)
    .in("id", ownerPropertyIds)
    .limit(1);

  if (!ownerAny || ownerAny.length === 0) {
    return new Response(JSON.stringify({ error: "Owner not in your agency" }), { status: 403, headers: corsHeaders });
  }

  // Get owner email using service role safely
  const { data: ownerData, error: ownerErr } = await service.auth.admin.getUserById(payload.ownerId);
  if (ownerErr || !ownerData?.user?.email) {
    return new Response(JSON.stringify({ error: "Owner email not found" }), { status: 404, headers: corsHeaders });
  }
  const toEmail = ownerData.user.email;

  const subject = `Owner payout report (${payload.startDate} to ${payload.endDate})`;
  const textBody =
    `Hello ${payload.ownerName ?? "Owner"},\n\n` +
    `Here are your payout totals for the selected period:\n` +
    `• USD: ${payload.totals.usd.toFixed(2)}\n` +
    `• DOP: ${payload.totals.dop.toFixed(2)}\n\n` +
    `We have attached a CSV with the details if provided.\n\n` +
    `Best regards,\n` +
    `Your Property Management Team`;

  const attachments = payload.csv
    ? [{ filename: `owner_payout_${payload.startDate}_${payload.endDate}.csv`, content: toBase64(payload.csv) }]
    : [];

  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${RESEND_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: "reports@yourdomain.com",
      to: toEmail,
      subject,
      text: textBody,
      attachments,
    }),
  });

  if (!res.ok) {
    const errMsg = await res.text().catch(() => "Email send failed");
    return new Response(JSON.stringify({ error: errMsg }), { status: 500, headers: corsHeaders });
  }

  // Audit log
  await anon.from("activity_logs").insert({
    user_id: callerId,
    action: "owner_report_sent",
    entity_type: "owner",
    entity_id: payload.ownerId,
    metadata: { startDate: payload.startDate, endDate: payload.endDate },
  });

  return new Response(JSON.stringify({ ok: true }), { status: 200, headers: corsHeaders });
});