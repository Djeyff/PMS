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

function fromBase64(b64: string): Uint8Array {
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}
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

  const body = await req.json().catch(() => null) as { fileName?: string; mimeType?: string; fileBase64?: string; targetFolder?: string | null } | null;
  if (!body?.fileName || !body?.fileBase64) {
    return new Response(JSON.stringify({ error: "Missing fileName or fileBase64" }), { status: 400, headers: corsHeaders });
  }

  const fname = body.fileName!;
  const mimeType = body.mimeType || "application/octet-stream";
  const targetFolder = sanitizePath(body.targetFolder ?? "");
  const fullFolderPath = joinPath(KDRIVE_ROOT_PATH, targetFolder);
  const folderUrl = `${KDRIVE_WEBDAV_URL}/${fullFolderPath}`;
  const basicAuth = "Basic " + btoa(`${KDRIVE_USERNAME}:${KDRIVE_PASSWORD}`);

  if (fullFolderPath) {
    try {
      await fetch(folderUrl, { method: "MKCOL", headers: { Authorization: basicAuth } });
    } catch {}
  }

  const fileUrl = `${folderUrl}/${fname}`.replace(/\/+$/, "");
  const putRes = await fetch(fileUrl, {
    method: "PUT",
    headers: { Authorization: basicAuth, "Content-Type": mimeType },
    body: fromBase64(body.fileBase64!),
  });

  if (!putRes.ok) {
    const msg = await putRes.text().catch(() => "Upload failed");
    return new Response(JSON.stringify({ error: `WebDAV upload failed: ${msg}` }), { status: 500, headers: corsHeaders });
  }

  await anon.from("activity_logs").insert({
    user_id: userRes.user.id,
    action: "kdrive_upload_generic",
    entity_type: "contracts",
    entity_id: null,
    metadata: { fileUrl, folderUrl },
  });

  return new Response(JSON.stringify({ ok: true, fileUrl, folderUrl }), { status: 200, headers: corsHeaders });
});