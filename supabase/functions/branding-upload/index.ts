// @ts-nocheck
import { serve } from "https://deno.land/std@0.190.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0"

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
}

type UploadBody = {
  kind: "logo" | "favicon",
  contentType?: string,
  content: string // base64 string of file content (no data URL prefix)
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders })
  }

  try {
    const authHeader = req.headers.get("Authorization")
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: corsHeaders })
    }
    const token = authHeader.replace("Bearer ", "")

    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!
    const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    const supabase = createClient(SUPABASE_URL, SERVICE_KEY, {
      auth: { autoRefreshToken: false, persistSession: false }
    })

    const { data: userRes, error: userErr } = await supabase.auth.getUser(token)
    if (userErr || !userRes?.user?.id) {
      console.error("[branding-upload] getUser failed", { error: userErr })
      return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: corsHeaders })
    }

    const userId = userRes.user.id
    // Optional: enforce agency admin
    const { data: isAdmin, error: adminErr } = await supabase.rpc("is_agency_admin", { u: userId })
    if (adminErr) {
      console.error("[branding-upload] is_agency_admin rpc failed", { error: adminErr })
      return new Response(JSON.stringify({ error: "Authorization check failed" }), { status: 403, headers: corsHeaders })
    }
    if (!isAdmin) {
      return new Response(JSON.stringify({ error: "Forbidden" }), { status: 403, headers: corsHeaders })
    }

    const body = await req.json() as UploadBody
    if (!body || !body.kind || !body.content) {
      return new Response(JSON.stringify({ error: "Invalid payload" }), { status: 400, headers: corsHeaders })
    }
    if (body.kind !== "logo" && body.kind !== "favicon") {
      return new Response(JSON.stringify({ error: "Invalid kind" }), { status: 400, headers: corsHeaders })
    }

    const bucketName = "branding"
    // Ensure bucket exists and is public
    const { data: buckets } = await supabase.storage.listBuckets()
    const existing = (buckets ?? []).find((b: any) => b.name === bucketName)
    if (!existing) {
      console.log("[branding-upload] creating public bucket")
      const { error: createErr } = await supabase.storage.createBucket(bucketName, { public: true })
      if (createErr) {
        console.error("[branding-upload] createBucket failed", { error: createErr })
        return new Response(JSON.stringify({ error: "Failed to create bucket" }), { status: 500, headers: corsHeaders })
      }
    } else if (!existing.public) {
      console.log("[branding-upload] updating bucket to public")
      const { error: updateErr } = await supabase.storage.updateBucket(bucketName, { public: true })
      if (updateErr) {
        console.error("[branding-upload] updateBucket failed", { error: updateErr })
        // Continue anyway; upload may still work
      }
    }

    const path = body.kind === "logo" ? "logo.png" : "favicon.png"
    const contentType = body.contentType || "image/png"

    // Decode base64 to bytes
    const binaryString = atob(body.content)
    const bytes = new Uint8Array(binaryString.length)
    for (let i = 0; i < binaryString.length; i++) {
      bytes[i] = binaryString.charCodeAt(i)
    }

    // Upload with upsert
    const { error: uploadErr } = await supabase.storage.from(bucketName).upload(path, bytes, {
      contentType,
      upsert: true,
    })
    if (uploadErr) {
      console.error("[branding-upload] upload failed", { error: uploadErr })
      return new Response(JSON.stringify({ error: "Upload failed" }), { status: 500, headers: corsHeaders })
    }

    const { data: pub } = supabase.storage.from(bucketName).getPublicUrl(path)
    console.log("[branding-upload] uploaded", { path, publicUrl: pub.publicUrl })

    return new Response(JSON.stringify({ ok: true, publicUrl: pub.publicUrl }), {
      status: 200,
      headers: { "Content-Type": "application/json", ...corsHeaders }
    })
  } catch (e) {
    console.error("[branding-upload] exception", { error: String(e) })
    return new Response(JSON.stringify({ error: "Server error" }), { status: 500, headers: corsHeaders })
  }
})