import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function toBase64(str: string) {
  const bytes = new TextEncoder().encode(str);
  let binary = "";
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const authHeader = req.headers.get("Authorization");
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
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

  // Verify JWT and require admin role
  const anon = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, { global: { headers: { Authorization: authHeader } } });
  const { data: userRes, error: userErr } = await anon.auth.getUser();
  if (userErr || !userRes?.user?.id) {
    return new Response(JSON.stringify({ error: "Invalid token" }), { status: 401, headers: corsHeaders });
  }
  const userId = userRes.user.id;
  const { data: prof } = await anon.from("profiles").select("role").eq("id", userId).single();
  const isAdmin = prof?.role === "agency_admin";
  if (!isAdmin) {
    return new Response(JSON.stringify({ error: "Forbidden: admin only" }), { status: 403, headers: corsHeaders });
  }

  // Get owner email using service role
  const serviceClient = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
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