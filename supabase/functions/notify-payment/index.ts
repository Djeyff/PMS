// @ts-ignore
import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
// @ts-ignore
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

// Declare Deno for TypeScript type checking
declare const Deno: { env: { get: (key: string) => string | undefined } };

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

type PaymentRow = {
  id: string;
  lease_id: string;
  tenant_id: string;
  amount: number;
  currency: "USD" | "DOP";
  method: string;
  received_date: string;
  reference: string | null;
  created_at: string;
  invoice_id?: string | null;
  exchange_rate?: number | null;
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const authHeader = req.headers.get("Authorization");
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    console.error("[notify-payment] Missing Authorization header");
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
  const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");
  const NOTIFICATION_EMAIL = Deno.env.get("NOTIFICATION_EMAIL");

  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    console.error("[notify-payment] Missing Supabase env vars");
    return new Response(JSON.stringify({ error: "Server misconfigured" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  // Resend setup validation
  if (!RESEND_API_KEY || !NOTIFICATION_EMAIL) {
    console.warn("[notify-payment] RESEND_API_KEY or NOTIFICATION_EMAIL not configured; skipping email send.");
    return new Response(JSON.stringify({ ok: true, skipped: true }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

  let payload: { id?: string; payment?: PaymentRow } = {};
  try {
    payload = await req.json();
  } catch {
    console.error("[notify-payment] Invalid JSON body");
    return new Response(JSON.stringify({ error: "Invalid JSON" }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  // Fetch payment row if only id provided
  let payment: PaymentRow | null = null;
  try {
    if (payload.payment) {
      payment = payload.payment as PaymentRow;
    } else if (payload.id) {
      const { data, error } = await supabase
        .from("payments")
        .select(`
          id, lease_id, tenant_id, amount, currency, method, received_date, reference, created_at, invoice_id, exchange_rate,
          lease:leases ( id, property:properties ( id, name ) ),
          tenant:profiles ( id, first_name, last_name )
        `)
        .eq("id", payload.id)
        .single();
      if (error) throw error;

      // Normalize shape similar to client
      const tenantRel = Array.isArray((data as any).tenant) ? (data as any).tenant[0] : (data as any).tenant ?? null;
      let leaseRel: any = Array.isArray((data as any).lease) ? (data as any).lease[0] : (data as any).lease ?? null;
      if (leaseRel && Array.isArray(leaseRel.property)) {
        leaseRel = { ...leaseRel, property: leaseRel.property[0] ?? null };
      }

      payment = {
        id: (data as any).id,
        lease_id: (data as any).lease_id,
        tenant_id: (data as any).tenant_id,
        amount: Number((data as any).amount || 0),
        currency: (data as any).currency,
        method: (data as any).method,
        received_date: (data as any).received_date,
        reference: (data as any).reference ?? null,
        created_at: (data as any).created_at,
        invoice_id: (data as any).invoice_id ?? null,
        exchange_rate: typeof (data as any).exchange_rate === "number"
          ? (data as any).exchange_rate
          : (data as any).exchange_rate == null
            ? null
            : Number((data as any).exchange_rate),
      } as PaymentRow;

      // Attach convenience fields
      (payment as any).lease = leaseRel;
      (payment as any).tenant = tenantRel;
    } else {
      console.error("[notify-payment] Missing payment id or payload");
      return new Response(JSON.stringify({ error: "Missing payment id" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
  } catch (e) {
    console.error("[notify-payment] Failed to fetch payment", e);
    return new Response(JSON.stringify({ error: "Failed to load payment" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const p = payment as any;
  const tenantName = [p?.tenant?.first_name, p?.tenant?.last_name].filter(Boolean).join(" ") || "—";
  const propertyName = p?.lease?.property?.name ?? "—";

  // Subject amount (prefer DOP). If USD, convert using exchange_rate if present; else use USD as-is.
  let subjectAmountDopText: string;
  if (payment!.currency === "USD") {
    const rate = payment!.exchange_rate && payment!.exchange_rate > 0 ? payment!.exchange_rate : null;
    if (rate) {
      const dop = Number(payment!.amount) * rate;
      subjectAmountDopText = new Intl.NumberFormat(undefined, { style: "currency", currency: "DOP" }).format(dop) + " DOP";
    } else {
      subjectAmountDopText = new Intl.NumberFormat(undefined, { style: "currency", currency: "USD" }).format(payment!.amount) + " USD";
    }
  } else {
    subjectAmountDopText = new Intl.NumberFormat(undefined, { style: "currency", currency: "DOP" }).format(payment!.amount) + " DOP";
  }

  const subject = `New Payment Registered - ${subjectAmountDopText}`;

  const html = `
  <div style="font-family: ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial; color:#111; max-width:600px; margin:0 auto; padding:16px;">
    <div style="border:1px solid #eee; border-radius:8px; overflow:hidden">
      <div style="background:#f7f7f7; padding:12px 16px; font-weight:600">New Payment Registered</div>
      <div style="padding:16px;">
        <table style="width:100%; border-collapse:collapse;">
          <tr>
            <td style="padding:8px 0; color:#666;">Amount</td>
            <td style="padding:8px 0; text-align:right; font-weight:600;">
              ${new Intl.NumberFormat(undefined, { style: "currency", currency: payment!.currency }).format(payment!.amount)} ${payment!.currency}
            </td>
          </tr>
          <tr>
            <td style="padding:8px 0; color:#666;">Date</td>
            <td style="padding:8px 0; text-align:right;">${payment!.received_date}</td>
          </tr>
          <tr>
            <td style="padding:8px 0; color:#666;">Payer</td>
            <td style="padding:8px 0; text-align:right;">${tenantName}</td>
          </tr>
          <tr>
            <td style="padding:8px 0; color:#666;">Property</td>
            <td style="padding:8px 0; text-align:right;">${propertyName}</td>
          </tr>
          <tr>
            <td style="padding:8px 0; color:#666;">Method</td>
            <td style="padding:8px 0; text-align:right;">${String(payment!.method).replace("_", " ")}</td>
          </tr>
          <tr>
            <td style="padding:8px 0; color:#666;">Reference</td>
            <td style="padding:8px 0; text-align:right;">${payment!.reference ?? "—"}</td>
          </tr>
          <tr>
            <td style="padding:8px 0; color:#666;">Payment ID</td>
            <td style="padding:8px 0; text-align:right; font-family:monospace;">${payment!.id}</td>
          </tr>
        </table>
      </div>
    </div>
    <div style="margin-top:12px; color:#777; font-size:12px;">
      This message was sent automatically by PMS.
    </div>
  </div>
  `;

  try {
    const from = "onboarding@resend.dev"; // fallback sender if custom not verified
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${RESEND_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from,
        to: NOTIFICATION_EMAIL,
        subject,
        html,
      }),
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      console.error("[notify-payment] Resend error", { status: res.status, err });
      // Don't fail the flow
    } else {
      const data = await res.json().catch(() => ({}));
      console.log("[notify-payment] Email sent", { id: data?.id });
    }
  } catch (e) {
    console.error("[notify-payment] Email send failed", e);
    // Don't fail the flow
  }

  return new Response(JSON.stringify({ ok: true }), {
    status: 200,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});