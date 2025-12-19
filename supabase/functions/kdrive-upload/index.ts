// @ts-ignore: Deno runtime remote import
import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
// @ts-ignore: Deno runtime remote import
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

// Minimal Deno declaration for TypeScript (web build)
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
  const KDRIVE_ROOT_PATH = Deno.env.get("KDRIVE_ROOT_PATH") || ""; // optional, e.g. "Contracts"

  if (!KDRIVE_WEBDAV_URL || !KDRIVE_USERNAME || !KDRIVE_PASSWORD) {
    return new Response(JSON.stringify({ error: "kDrive WebDAV secrets missing" }), { status: 500, headers: corsHeaders });
  }

  // Verify user
  const anon = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, { global: { headers: { Authorization: authHeader } } });
  const { data: userRes, error: userErr } = await anon.auth.getUser();
  if (userErr || !userRes?.user) {
    return new Response(JSON.stringify({ error: "Invalid token" }), { status: 401, headers: corsHeaders });
  }
  const authedUserId = userRes.user.id;

  const body = await req.json().catch(() => null) as {
    leaseId?: string;
    fileName?: string;
    mimeType?: string;
    fileBase64?: string;
    targetFolder?: string | null;
  } | null;

  if (!body?.leaseId || !body?.fileName || !body?.fileBase64) {
    return new Response(JSON.stringify({ error: "Missing leaseId, fileName or fileBase64" }), { status: 400, headers: corsHeaders });
  }

  const service = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

  // Only agency admins can upload
  const { data: profile } = await service.from("profiles").select("role, agency_id").eq("id", authedUserId).maybeSingle();
  if (!profile || profile.role !== "agency_admin" || !profile.agency_id) {
    return new Response(JSON.stringify({ error: "Forbidden" }), { status: 403, headers: corsHeaders });
  }
  const adminAgencyId = profile.agency_id as string;

  // Verify lease belongs to admin's agency via join
  const { data: leaseCheck, error: leaseErr } = await service
    .from("leases")
    .select("id, property:properties ( agency_id )")
    .eq("id", body.leaseId)
    .maybeSingle();

  if (leaseErr || !leaseCheck || (leaseCheck as any)?.property?.agency_id !== adminAgencyId) {
    return new Response(JSON.stringify({ error: "Lease not found or not in your agency" }), { status: 404, headers: corsHeaders });
  }

  const basicAuth = "Basic " + btoa(`${KDRIVE_USERNAME}:${KDRIVE_PASSWORD}`);

  function joinPath(...parts: (string | null | undefined)[]) {
    return parts.filter(Boolean).map((p) => (p as string).replace(/^\/+|\/+$/g, "")).join("/");
  }

  const targetFolder = body.targetFolder ?? "";
  const fileName = body.fileName!;
  const mimeType = body.mimeType || "application/octet-stream";
  const bytes = fromBase64(body.fileBase64!);

  // Ensure folder path
  const fullFolderPath = joinPath(KDRIVE_ROOT_PATH, targetFolder);
  const folderUrl = `${KDRIVE_WEBDAV_URL}/${fullFolderPath}`;
  if (fullFolderPath) {
    // Try to create folder (MKCOL); ignore errors if it exists
    try {
      await fetch(folderUrl, { method: "MKCOL", headers: { Authorization: basicAuth } });
    } catch {}
  }

  // Upload file via PUT
  const fileUrl = `${folderUrl}/${fileName}`.replace(/\/+$/, "");
  const putRes = await fetch(fileUrl, {
    method: "PUT",
    headers: {
      Authorization: basicAuth,
      "Content-Type": mimeType,
    },
    body: bytes,
  });

  if (!putRes.ok) {
    const msg = await putRes.text().catch(() => "Upload failed");
    return new Response(JSON.stringify({ error: `WebDAV upload failed: ${msg}` }), { status: 500, headers: corsHeaders });
  }

  // Save URLs on lease
  await service
    .from("leases")
    .update({
      contract_kdrive_folder_url: fullFolderPath ? folderUrl : null,
      contract_kdrive_file_url: fileUrl,
    })
    .eq("id", body.leaseId);

  // Audit
  await anon.from("activity_logs").insert({
    user_id: authedUserId,
    action: "kdrive_upload",
    entity_type: "leases",
    entity_id: body.leaseId,
    metadata: { fileUrl, folderUrl: fullFolderPath ? folderUrl : null },
  });

  return new Response(JSON.stringify({ ok: true, fileUrl, folderUrl: fullFolderPath ? folderUrl : null }), {
    status: 200,
    headers: corsHeaders,
  });
});