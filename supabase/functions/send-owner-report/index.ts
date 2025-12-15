import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function toBase64(str: string) {
  // Convert string to base64 safely
  const bytes = new TextEncoder().encode(str);
  let binary = "";
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  // btoa works with binary strings
  return btoa(binary);
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const authHeader = req.headers.get("Authorization");
  if (!authHeader) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: corsHeaders });
  }

  // ADDED: Validate JWT and ensure caller is agency_admin
  const SUPABASE_URL_ANON = Deno.env.get("SUPABASE_URL")!;
  const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
  const anon = createClient(SUPABASE_URL_ANON, SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: authHeader } },
  });
  const { data: userRes } = await anon.auth.getUser();
  if (!userRes?.user) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: corsHeaders });
  }
  const userId = userRes.user.id;

  const { data: callerProfile } = await anon
    .from("profiles")
    .select("role, agency_id")
    .eq("id", userId)
    .single();

  if (callerProfile?.role !== "agency_admin" || !callerProfile?.agency_id) {
    return new Response(JSON.stringify({ error: "Forbidden" }), { status: 403, headers: corsHeaders });
  }
  const adminAgencyId = callerProfile.agency_id;

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

  // ADDED: Ensure the owner belongs to the same agency as the admin
  const serviceClient = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
  const { data: ownerProfile } = await serviceClient
    .from("profiles")
    .select("agency_id")
    .eq("id", payload.ownerId)
    .single();

  if (!ownerProfile || ownerProfile.agency_id !== adminAgencyId) {
    return new Response(JSON.stringify({ error: "Forbidden" }), { status: 403, headers: corsHeaders });
  }

  // Get owner email using service role
  const { data: ownerData, error: ownerErr } = await serviceClient.auth.admin.getUserById(payload.ownerId);
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

  return new Response(JSON.stringify({ ok: true }), { status: 200, headers: corsHeaders });
});