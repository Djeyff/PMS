// @ts-nocheck
import { serve } from "https://deno.land/std@0.190.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0"

const corsHeaders: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders })
  }

  // Manual authentication handling (verify_jwt is false)
  const authHeader = req.headers.get("Authorization")
  if (!authHeader) {
    console.error("[owner-tenant-names] Missing Authorization header")
    return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: corsHeaders })
  }
  const token = authHeader.replace("Bearer ", "").trim()
  if (!token) {
    console.error("[owner-tenant-names] Empty bearer token")
    return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: corsHeaders })
  }

  // Create client bound to the incoming token to read the user id
  const supabaseAuth = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_ANON_KEY")!,
    { global: { headers: { Authorization: `Bearer ${token}` } } }
  )

  const { data: userRes, error: userErr } = await supabaseAuth.auth.getUser()
  if (userErr || !userRes?.user?.id) {
    console.error("[owner-tenant-names] Failed to get user", { error: userErr })
    return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: corsHeaders })
  }
  const ownerId = userRes.user.id

  let body: any = null
  try {
    body = await req.json()
  } catch {
    console.error("[owner-tenant-names] Invalid JSON body")
    return new Response(JSON.stringify({ error: "Invalid JSON" }), { status: 400, headers: corsHeaders })
  }

  const invoiceIds: string[] = Array.isArray(body?.invoiceIds) ? body.invoiceIds.filter((v: any) => typeof v === "string") : []
  if (invoiceIds.length === 0) {
    console.error("[owner-tenant-names] Missing invoiceIds")
    return new Response(JSON.stringify({ error: "invoiceIds required" }), { status: 400, headers: corsHeaders })
  }

  // Use service role to query with custom authorization (do NOT expose broader data)
  const supabaseAdmin = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  )

  // Authorized invoices: owner must own the property linked to the invoice's lease
  const { data, error } = await supabaseAdmin
    .from("invoices")
    .select(`
      id,
      tenant_id,
      tenant:profiles ( first_name, last_name ),
      lease:leases ( property_id )
    `)
    .in("id", invoiceIds)

  if (error) {
    console.error("[owner-tenant-names] Query error", { error })
    return new Response(JSON.stringify({ error: "Query failed" }), { status: 500, headers: corsHeaders })
  }

  // Fetch ownerships for all property_ids in the result in one shot
  const propertyIds = Array.from(
    new Set(
      (data ?? [])
        .map((row: any) => {
          const leaseRel = Array.isArray(row.lease) ? row.lease[0] : row.lease ?? null
          return leaseRel?.property_id || null
        })
        .filter(Boolean)
    )
  )

  let authorizedProps = new Set<string>()
  if (propertyIds.length > 0) {
    const { data: ownersData, error: ownersErr } = await supabaseAdmin
      .from("property_owners")
      .select("property_id, owner_id")
      .in("property_id", propertyIds)
      .eq("owner_id", ownerId)

    if (ownersErr) {
      console.error("[owner-tenant-names] Ownership query error", { error: ownersErr })
      return new Response(JSON.stringify({ error: "Ownership check failed" }), { status: 500, headers: corsHeaders })
    }
    authorizedProps = new Set((ownersData ?? []).map((r: any) => r.property_id))
  }

  // Build mapping only for invoices linked to properties the owner owns
  const names: Record<string, string> = {}

  for (const row of (data ?? [])) {
    const leaseRel = Array.isArray(row.lease) ? row.lease[0] : row.lease ?? null
    const propId = leaseRel?.property_id || null
    if (!propId || !authorizedProps.has(propId)) continue

    const tenantRel = Array.isArray(row.tenant) ? row.tenant[0] : row.tenant ?? null
    const first = tenantRel?.first_name ?? ""
    const last = tenantRel?.last_name ?? ""
    const full = [first, last].filter(Boolean).join(" ")
    names[row.id] = full || row.tenant_id
  }

  console.log("[owner-tenant-names] Returning names", { count: Object.keys(names).length })
  return new Response(JSON.stringify({ names }), { status: 200, headers: corsHeaders })
})