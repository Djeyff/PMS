// @ts-ignore
import { serve } from "https://deno.land/std@0.190.0/http/server.ts"
// @ts-ignore
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0"

// Minimal Deno declaration for local TypeScript checking
declare const Deno: { env: { get: (key: string) => string | undefined } }

type InvoiceRow = {
  id: string
  number: string | null
  issue_date: string
  due_date: string
  currency: "USD" | "DOP"
  total_amount: number
  status: "draft" | "sent" | "partial" | "paid" | "overdue" | "void"
  lease?: { id: string; property?: { id: string; name: string; agency_id?: string } | null } | null
  tenant?: { first_name: string | null; last_name: string | null } | null
  payments?: { amount: number; currency: "USD" | "DOP"; exchange_rate?: number | null }[] | null
}

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
}

function ymd(d: Date) { return d.toISOString().slice(0,10) }
function startOfMonth(d: Date) { return new Date(d.getFullYear(), d.getMonth(), 1) }
function endOfMonth(d: Date) { return new Date(d.getFullYear(), d.getMonth()+1, 0) }

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders })
  }

  const authHeader = req.headers.get("Authorization")
  if (!authHeader) {
    console.error("[overdue-monthly-digest] Missing Authorization")
    return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } })
  }

  const SUPABASE_URL = Deno.env.get("SUPABASE_URL")
  const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")
  const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")
  const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY")

  if (!SUPABASE_URL || !SUPABASE_ANON_KEY || !SUPABASE_SERVICE_ROLE_KEY) {
    console.error("[overdue-monthly-digest] Missing Supabase env")
    return new Response(JSON.stringify({ error: "Server misconfigured" }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } })
  }

  const anon = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, { global: { headers: { Authorization: authHeader } } })
  const service = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)

  // Verify caller
  const { data: userRes, error: userErr } = await anon.auth.getUser()
  if (userErr || !userRes?.user) {
    console.error("[overdue-monthly-digest] Invalid token", userErr)
    return new Response(JSON.stringify({ error: "Invalid token" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } })
  }
  const uid = userRes.user.id

  // Ensure admin and get agency
  const { data: prof, error: profErr } = await service.from("profiles").select("role, agency_id").eq("id", uid).maybeSingle()
  if (profErr || !prof || prof.role !== "agency_admin" || !prof.agency_id) {
    console.error("[overdue-monthly-digest] Forbidden; not admin or no agency", profErr)
    return new Response(JSON.stringify({ error: "Forbidden" }), { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } })
  }
  const agencyId = prof.agency_id as string

  // Get alerts email
  const { data: agency } = await service.from("agencies").select("alerts_email, name").eq("id", agencyId).maybeSingle()
  const alertsEmail = (agency as any)?.alerts_email as string | null
  if (!alertsEmail) {
    console.warn("[overdue-monthly-digest] No alerts_email configured; skipping email")
  }

  // Compute month window (current month)
  const now = new Date()
  const from = ymd(startOfMonth(now))
  const to = ymd(endOfMonth(now))
  const today = ymd(now)

  // Load invoices for this agency due in current month and not fully paid
  const { data: invs, error: invErr } = await service
    .from("invoices")
    .select(`
      id, number, issue_date, due_date, currency, total_amount, status,
      lease:leases ( id, property:properties ( id, name, agency_id ) ),
      tenant:profiles ( first_name, last_name ),
      payments:payments ( amount, currency, exchange_rate )
    `)
    .gte("due_date", from)
    .lte("due_date", to)

  if (invErr) {
    console.error("[overdue-monthly-digest] Load invoices failed", invErr)
    return new Response(JSON.stringify({ error: invErr.message }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } })
  }

  // Filter by agency
  const all: InvoiceRow[] = (invs ?? []).filter((r: any) => {
    const lease = Array.isArray(r.lease) ? r.lease[0] : r.lease ?? null
    const prop = lease && Array.isArray(lease.property) ? lease.property[0] : lease?.property ?? null
    return prop?.agency_id === agencyId
  }).map((r: any) => {
    let leaseRel: any = Array.isArray(r.lease) ? r.lease[0] : r.lease ?? null
    if (leaseRel && Array.isArray(leaseRel.property)) leaseRel = { ...leaseRel, property: leaseRel.property[0] ?? null }
    const tenantRel = Array.isArray(r.tenant) ? r.tenant[0] : r.tenant ?? null
    const pays = (r.payments ?? []).map((p: any) => ({
      amount: Number(p.amount || 0),
      currency: p.currency,
      exchange_rate: typeof p.exchange_rate === "number" ? p.exchange_rate : (p.exchange_rate == null ? null : Number(p.exchange_rate)),
    }))
    return {
      id: r.id, number: r.number ?? null,
      issue_date: r.issue_date, due_date: r.due_date,
      currency: r.currency, total_amount: Number(r.total_amount || 0),
      status: r.status,
      lease: leaseRel ? { id: leaseRel.id, property: leaseRel.property ? { id: leaseRel.property.id, name: leaseRel.property.name, agency_id: leaseRel.property.agency_id } : null } : null,
      tenant: tenantRel ? { first_name: tenantRel.first_name ?? null, last_name: tenantRel.last_name ?? null } : null,
      payments: pays,
    } as InvoiceRow
  })

  // Compute remaining, determine overdue updates
  const remainingFor = (inv: InvoiceRow) => {
    const cur = inv.currency
    const paid = (inv.payments ?? []).reduce((s, p) => {
      if (p.currency === cur) return s + Number(p.amount || 0)
      const rate = p.exchange_rate && p.exchange_rate > 0 ? p.exchange_rate : null
      if (!rate) return s
      if (cur === "USD" && p.currency === "DOP") return s + Number(p.amount || 0) / rate
      if (cur === "DOP" && p.currency === "USD") return s + Number(p.amount || 0) * rate
      return s
    }, 0)
    return Math.max(0, Number(inv.total_amount || 0) - paid)
  }

  const idsToOverdue: string[] = []
  const rowsForEmail: Array<{ prop: string; tenant: string; number: string; due: string; remaining: string }> = []

  for (const inv of all) {
    const remaining = remainingFor(inv)
    if (remaining <= 0) continue

    const isPastDue = inv.due_date < today
    if (isPastDue && (inv.status === "sent" || inv.status === "partial")) {
      idsToOverdue.push(inv.id)
    }
    const propName = inv.lease?.property?.name ?? "—"
    const tenantName = [inv.tenant?.first_name ?? "", inv.tenant?.last_name ?? ""].filter(Boolean).join(" ") || "—"
    const remText = new Intl.NumberFormat(undefined, { style: "currency", currency: inv.currency }).format(remaining)
    rowsForEmail.push({ prop: propName, tenant: tenantName, number: inv.number ?? inv.id, due: inv.due_date, remaining: `${remText} ${inv.currency}` })
  }

  if (idsToOverdue.length > 0) {
    const { error: updErr } = await service.from("invoices").update({ status: "overdue" }).in("id", idsToOverdue)
    if (updErr) console.error("[overdue-monthly-digest] Update overdue failed", updErr)
  }

  // Send email if configured and there are rows
  if (alertsEmail && rowsForEmail.length > 0 && RESEND_API_KEY) {
    const subject = `Unpaid invoices for ${from} to ${to} (${rowsForEmail.length})`
    const bodyRows = rowsForEmail
      .sort((a, b) => (a.due < b.due ? -1 : 1))
      .map(r => `<tr><td style="padding:6px 8px;">${r.prop}</td><td style="padding:6px 8px;">${r.tenant}</td><td style="padding:6px 8px; font-family:monospace;">${r.number}</td><td style="padding:6px 8px;">${r.due}</td><td style="padding:6px 8px; text-align:right;">${r.remaining}</td></tr>`)
      .join("")
    const html = `
      <div style="font-family:ui-sans-serif,system-ui,-apple-system,Segoe UI,Roboto,Helvetica,Arial; color:#111; max-width:680px; margin:0 auto;">
        <h2 style="font-size:18px; margin:16px 0;">Unpaid invoices (${from} to ${to})</h2>
        <table style="width:100%; border-collapse:collapse;">
          <thead>
            <tr>
              <th style="text-align:left; padding:6px 8px; border-bottom:1px solid #eee;">Property</th>
              <th style="text-align:left; padding:6px 8px; border-bottom:1px solid #eee;">Tenant</th>
              <th style="text-align:left; padding:6px 8px; border-bottom:1px solid #eee;">Number</th>
              <th style="text-align:left; padding:6px 8px; border-bottom:1px solid #eee;">Due</th>
              <th style="text-align:right; padding:6px 8px; border-bottom:1px solid #eee;">Remaining</th>
            </tr>
          </thead>
          <tbody>${bodyRows}</tbody>
        </table>
        <div style="margin-top:12px; color:#777; font-size:12px;">This message was sent automatically by PMS.</div>
      </div>
    `
    try {
      const res = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: { "Authorization": `Bearer ${RESEND_API_KEY}`, "Content-Type": "application/json" },
        body: JSON.stringify({ from: "alerts@yourdomain.com", to: alertsEmail, subject, html }),
      })
      if (!res.ok) {
        const errText = await res.text().catch(() => "")
        console.error("[overdue-monthly-digest] Email send failed", { status: res.status, errText })
      }
    } catch (e) {
      console.error("[overdue-monthly-digest] Email error", e)
    }
  } else {
    if (!alertsEmail) console.warn("[overdue-monthly-digest] Alerts email not set")
    if (!RESEND_API_KEY) console.warn("[overdue-monthly-digest] RESEND_API_KEY not set")
    if (rowsForEmail.length === 0) console.log("[overdue-monthly-digest] No unpaid invoices to report")
  }

  return new Response(JSON.stringify({ ok: true, overdueUpdated: idsToOverdue.length, listed: rowsForEmail.length }), {
    status: 200,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  })
});