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

function parsePropfind(xml: string, baseUrl: string) {
  const responses: any[] = [];
  const blocks = xml.split("<d:response").slice(1);
  for (const b of blocks) {
    const hrefMatch = b.match(/<d:href>([^<]+)<\/d:href>/) || b.match(/<href>([^<]+)<\/href>/);
    const typeIsCollection = /<d:collection\/>/.test(b) || /<collection\/>/.test(b);
    const modifiedMatch = b.match(/<d:getlastmodified>([^<]+)<\/d:getlastmodified>/) || b.match(/<getlastmodified>([^<]+)<\/getlastmodified>/);
    const sizeMatch = b.match(/<d:getcontentlength>([^<]+)<\/d:getcontentlength>/) || b.match(/<getcontentlength>([^<]+)<\/getcontentlength>/);
    const contentTypeMatch = b.match(/<d:getcontenttype>([^<]+)<\/d:getcontenttype>/) || b.match(/<getcontenttype>([^<]+)<\/getcontenttype>/);

    const href = hrefMatch?.[1] ?? "";
    if (!href) continue;

    const fullHref = href.startsWith("http") ? href : (baseUrl.replace(/\/+$/, "") + "/" + href.replace(/^\/+/, ""));
    const name = decodeURIComponent(fullHref.split("/").filter(Boolean).pop() || "");

    responses.push({
      href: fullHref.replace(/\/+$/, ""),
      name,
      type: typeIsCollection ? "folder" : "file",
      modified: modifiedMatch?.[1] ?? null,
      size: sizeMatch?.[1] ? Number(sizeMatch[1]) : null,
      contentType: contentTypeMatch?.[1] ?? null,
    });
  }
  return responses;
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
  const path = sanitizePath(body?.path ?? "");
  const folderPath = joinPath(KDRIVE_ROOT_PATH, path);
  const url = `${KDRIVE_WEBDAV_URL}/${folderPath}`;
  const basicAuth = "Basic " + btoa(`${KDRIVE_USERNAME}:${KDRIVE_PASSWORD}`);

  const res = await fetch(url, {
    method: "PROPFIND",
    headers: {
      Authorization: basicAuth,
      Depth: "1",
      "Content-Type": "text/xml",
    },
    body: `<?xml version="1.0" encoding="utf-8" ?><d:propfind xmlns:d="DAV:"><d:allprop/></d:propfind>`,
  });

  if (!res.ok) {
    const msg = await res.text().catch(() => "List failed");
    return new Response(JSON.stringify({ error: `List failed: ${msg}` }), { status: 500, headers: corsHeaders });
  }

  const xml = await res.text();
  const items = parsePropfind(xml, `${KDRIVE_WEBDAV_URL}`);
  // Filter out the current directory itself (first entry often points to itself)
  const filtered = items.filter((it) => it.href.replace(/\/+$/, "") !== url.replace(/\/+$/, ""));
  return new Response(JSON.stringify({ ok: true, items, folderUrl: url, itemsFiltered: filtered }), { status: 200, headers: corsHeaders });
});