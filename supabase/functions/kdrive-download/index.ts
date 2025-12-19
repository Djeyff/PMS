// @ts-ignore: Deno runtime remote import
import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
// @ts-ignore: Deno runtime remote import
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

declare const Deno: { env: { get(name: string): string | undefined } };

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function sanitizePath(p: string) {
  return (p || "").replace(/^\/*|\/*$/g, "").replace(/\.\./g, "");
}
function joinPath(...parts: (string | null | undefined)[]) {
  return parts.filter(Boolean).map((p) => sanitizePath(String(p))).join("/");
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method Not Allowed" }), { status: 405, headers: corsHeaders });
  }

  const authHeader = req.headers.get("Authorization");
  if (!authHeader) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: corsHeaders });
  }

  const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
  const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
  const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

  const KDRIVE_WEBDAV_URL = Deno.env.get("KDRIVE_WEBDAV_URL") || "";
  const KDRIVE_USERNAME = Deno.env.get("KDRIVE_USERNAME") || "";
  const KDRIVE_PASSWORD = Deno.env.get("KDRIVE_PASSWORD") || "";
  const KDRIVE_ROOT_PATH = Deno.env.get("KDRIVE_ROOT_PATH") || "";

  if (!KDRIVE_WEBDAV_URL || !KDRIVE_USERNAME || !KDRIVE_PASSWORD) {
    return new Response(JSON.stringify({ error: "kDrive WebDAV secrets missing" }), { status: 500, headers: corsHeaders });
  }

  const anon = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, { global: { headers: { Authorization: authHeader } } });
  const { data: userRes, error: userErr } = await anon.auth.getUser();
  if (userErr || !userRes?.user) {
    return new Response(JSON.stringify({ error: "Invalid token" }), { status: 401, headers: corsHeaders });
  }

  const service = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
  const { data: profile } = await service.from("profiles").select("role, agency_id").eq("id", userRes.user.id).maybeSingle();
  if (!profile || profile.role !== "agency_admin" || !profile.agency_id) {
    return new Response(JSON.stringify({ error: "Forbidden" }), { status: 403, headers: corsHeaders });
  }

  const body = await req.json().catch(() => null) as { path?: string } | null;
  if (!body?.path) {
    return new Response(JSON.stringify({ error: "Missing path" }), { status: 400, headers: corsHeaders });
  }
  const rel = sanitizePath(body.path);
  const fileUrl = `${KDRIVE_WEBDAV_URL}/${joinPath(KDRIVE_ROOT_PATH, rel)}`;

  const basicAuth = "Basic " + btoa(`${KDRIVE_USERNAME}:${KDRIVE_PASSWORD}`);
  const res = await fetch(fileUrl, {
    method: "GET",
    headers: { Authorization: basicAuth },
  });

  if (!res.ok) {
    const msg = await res.text().catch(() => "Download failed");
    return new Response(JSON.stringify({ error: `Download failed: ${msg}` }), { status: 500, headers: corsHeaders });
  }

  const blob = await res.arrayBuffer();
  const ct = res.headers.get("Content-Type") || "application/octet-stream";
  return new Response(blob, {
    status: 200,
    headers: {
      ...corsHeaders,
      "Content-Type": ct,
      "Content-Length": String(blob.byteLength),
    },
  });
});