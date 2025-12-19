// @ts-nocheck

import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { PDFDocument, StandardFonts } from "https://esm.sh/pdf-lib@1.17.1";

function buildCorsHeaders(origin: string | null) {
  return {
    "Access-Control-Allow-Origin": origin ?? "*",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-job-token",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
  };
}
function isOriginAllowed(origin: string | null) {
  const raw = Deno.env.get("ALLOWED_ORIGINS") ?? "";
  const list = raw.split(",").map(s => s.trim()).filter(Boolean);
  if (list.length === 0) return true;
  if (!origin) return true;
  return list.includes(origin);
}

type Lang = "en" | "es";

serve(async (req) => {
  const origin = req.headers.get("Origin");
  const corsHeaders = buildCorsHeaders(origin);

  if (req.method === "OPTIONS") {
    if (!isOriginAllowed(origin)) {
      return new Response("Origin not allowed", { status: 403, headers: corsHeaders });
    }
    return new Response(null, { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method Not Allowed" }), { status: 405, headers: corsHeaders });
  }

  if (!isOriginAllowed(origin)) {
    return new Response(JSON.stringify({ error: "Origin not allowed" }), { status: 403, headers: corsHeaders });
  }

  const authHeader = req.headers.get("Authorization");
  if (!authHeader) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: corsHeaders });
  }

  let body: { invoiceId: string; sendEmail?: boolean; sendWhatsApp?: boolean; lang?: Lang };
  try {
    body = await req.json();
  } catch {
    return new Response(JSON.stringify({ error: "Invalid JSON" }), { status: 400, headers: corsHeaders });
  }
  const lang: Lang = body.lang === "es" ? "es" : "en";

  const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
  const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
  const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");

  // Verify user from token
  const anon = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, { global: { headers: { Authorization: authHeader } } });
  const { data: userRes, error: userErr } = await anon.auth.getUser();
  if (userErr || !userRes?.user) {
    return new Response(JSON.stringify({ error: "Invalid token" }), { status: 401, headers: corsHeaders });
  }
  const authedUserId = userRes.user.id;

  // Service role for server-side work
  const service = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

  // Authorization on the resource
  const { data: invMeta, error: invMetaErr } = await service
    .from("invoices")
    .select(`
      id, tenant_id, lease:leases (
        id, property_id, property:properties ( id, agency_id )
      )
    `)
    .eq("id", body.invoiceId)
    .single();

  if (invMetaErr || !invMeta) {
    return new Response(JSON.stringify({ error: "Invoice not found" }), { status: 404, headers: corsHeaders });
  }

  const propertyId: string | null = invMeta.lease?.property?.id ?? null;
  const agencyId: string | null = invMeta.lease?.property?.agency_id ?? null;

  const { data: callerProfile } = await service
    .from("profiles")
    .select("id, role, agency_id")
    .eq("id", authedUserId)
    .maybeSingle();

  let allowed = false;
  if (callerProfile?.role === "agency_admin" && agencyId && callerProfile.agency_id === agencyId) {
    allowed = true;
  } else if (invMeta.tenant_id === authedUserId) {
    allowed = true;
  } else if (propertyId) {
    const { data: ownerRow } = await service
      .from("property_owners")
      .select("owner_id")
      .eq("property_id", propertyId)
      .eq("owner_id", authedUserId)
      .maybeSingle();
    if (ownerRow) allowed = true;
  }
  if (!allowed) {
    return new Response(JSON.stringify({ error: "Forbidden" }), { status: 403, headers: corsHeaders });
  }

  // Branding helpers
  async function ensureBrandingBucket() {
    const { data: buckets } = await service.storage.listBuckets();
    const exists = (buckets ?? []).some((b: any) => b.name === "branding");
    if (!exists) {
      await service.storage.createBucket("branding", { public: false });
    }
  }
  async function getLogoBytes(): Promise<Uint8Array | null> {
    const candidates = ["logo.png", "LTP_transp copy.png"];
    for (const name of candidates) {
      try {
        await ensureBrandingBucket();
        const { data: blob } = await service.storage.from("branding").download(name);
        if (blob) {
          const ab = await blob.arrayBuffer();
          return new Uint8Array(ab);
        }
      } catch {}
      try {
        const { data: pub } = service.storage.from("branding").getPublicUrl(name);
        const url = pub.publicUrl;
        if (url) {
          const res = await fetch(url);
          if (res.ok) {
            const ab = await res.arrayBuffer();
            return new Uint8Array(ab);
          }
        }
      } catch {}
    }
    return null;
  }

  // Load invoice with relations and payments
  const { data: inv, error } = await service
    .from("invoices")
    .select(`
      id, number, issue_date, due_date, currency, total_amount, status, pdf_lang,
      lease:leases (
        id, end_date,
        property:properties ( id, name, agency_id )
      ),
      tenant:profiles ( id, first_name, last_name ),
      payments:payments ( amount, currency, method, exchange_rate, received_date )
    `)
    .eq("id", body.invoiceId)
    .single();

  if (error || !inv) {
    return new Response(JSON.stringify({ error: error?.message || "Invoice not found" }), { status: 404, headers: corsHeaders });
  }

  // Agency info
  let agencyName = "Las Terrenas Properties";
  let agencyAddress = "278 calle Duarte, LTI building, Las Terrenas";
  try {
    const agencyIdForPdf = inv.lease?.property?.agency_id ?? null;
    if (agencyIdForPdf) {
      const { data: ag } = await service.from("agencies").select("name, address").eq("id", agencyIdForPdf).single();
      if (ag?.name) agencyName = ag.name;
      if (ag?.address) agencyAddress = ag.address;
    }
  } catch {}

  const t = lang === "es" ? {
    title: "Factura",
    number: "Número",
    billedTo: "Facturado a",
    property: "Propiedad",
    issue: "Fecha de emisión",
    due: "Fecha de vencimiento",
    currency: "Moneda",
    status: "Estado",
    description: "Descripción",
    leaseInvoice: "Factura de contrato",
    amount: "Importe",
    total: "Total",
    paid: "Pagado",
    balance: "Saldo",
    contractExpiry: "Vencimiento del contrato",
    emailSubject: (n: string) => `Factura ${n}`,
    emailText: (prop: string, tenant: string, amountText: string) =>
      `Estimado equipo,\n\nAdjuntamos la factura generada:\nPropiedad: ${prop}\nInquilino: ${tenant}\nImporte: ${amountText}\n\nGracias,\n${agencyName}`,
  } : {
    title: "Invoice",
    number: "Number",
    billedTo: "Billed To",
    property: "Property",
    issue: "Issue Date",
    due: "Due Date",
    currency: "Currency",
    status: "Status",
    description: "Description",
    leaseInvoice: "Lease invoice",
    amount: "Amount",
    total: "Total",
    paid: "Paid",
    balance: "Balance",
    contractExpiry: "Contract Expiry",
    emailSubject: (n: string) => `Invoice ${n}`,
    emailText: (prop: string, tenant: string, amountText: string) =>
      `Dear team,\n\nAttached is the generated invoice:\nProperty: ${prop}\nTenant: ${tenant}\nAmount: ${amountText}\n\nRegards,\n${agencyName}`,
  };

  const fmt = (amt: number, cur: string) =>
    new Intl.NumberFormat(lang === "es" ? "es-ES" : "en-US", { style: "currency", currency: cur }).format(amt);

  const invoiceNumber = inv.number || (lang === "es" ? "SIN-NUMERO" : "NO-NUMBER");
  const tenantName = [inv.tenant?.first_name ?? "", inv.tenant?.last_name ?? ""].filter(Boolean).join(" ") || "—";
  const propertyName = inv.lease?.property?.name ?? (lang === "es" ? "Propiedad" : "Property");
  const amount = Number(inv.total_amount || 0);
  const currency = inv.currency;
  const issueDate = inv.issue_date;
  const dueDate = inv.due_date;
  const contractExpiry = inv.lease?.end_date ?? null;

  const payments = Array.isArray(inv.payments) ? inv.payments : [];
  // Cross-currency converted paid using exchange_rate
  const paidConverted = payments.reduce((sum: number, p: any) => {
    const amt = Number(p.amount || 0);
    if (p.currency === currency) return sum + amt;
    const rate = typeof p.exchange_rate === "number" ? p.exchange_rate : null;
    if (!rate || rate <= 0) return sum;
    if (currency === "USD" && p.currency === "DOP") return sum + amt / rate;
    if (currency === "DOP" && p.currency === "USD") return sum + amt * rate;
    return sum;
  }, 0);
  const methodsDisplay = (() => {
    const list = payments.map((p: any) => p.method).filter(Boolean);
    const uniq = Array.from(new Set(list));
    return uniq.length ? uniq.join(", ") : "—";
  })();
  const exchangeRateDisplay = (() => {
    const diffPay = payments.find((p: any) => p.exchange_rate && p.currency !== currency);
    return diffPay?.exchange_rate ? String(diffPay.exchange_rate) : "—";
  })();

  const balance = amount - paidConverted;

  const today = new Date().toISOString().slice(0, 10);
  let displayStatus: string = inv.status || "sent";
  if (balance <= 0) displayStatus = "paid";
  else if (dueDate < today && inv.status !== "void") displayStatus = "overdue";
  else if (paidConverted > 0) displayStatus = "partial";

  try {
    const pdf = await PDFDocument.create();
    const page = pdf.addPage([595.28, 841.89]); // A4
    const font = await pdf.embedFont(StandardFonts.Helvetica);
    const fontBold = await pdf.embedFont(StandardFonts.HelveticaBold);

    // Centered logo + agency name (closer to on-screen header style)
    let y = 800;
    const logoBytes = await getLogoBytes();
    if (logoBytes) {
      try {
        const img = await pdf.embedPng(logoBytes);
        const w = 140;
        const ratio = img.height / img.width;
        const h = w * ratio;
        const x = (595.28 - w) / 2;
        page.drawImage(img, { x, y: 820 - h, width: w, height: h });
      } catch {}
    }
    page.drawText(agencyName, { x: (595.28 - font.widthOfTextAtSize(agencyName, 14)) / 2, y: 800, size: 14, font: fontBold });
    const addrParts = agencyAddress.split(",");
    const line1 = addrParts[0]?.trim() ?? "";
    const line2 = addrParts.slice(1).join(", ").trim();
    page.drawText(line1, { x: (595.28 - font.widthOfTextAtSize(line1, 10)) / 2, y: 786, size: 10, font });
    if (line2) page.drawText(line2, { x: (595.28 - font.widthOfTextAtSize(line2, 10)) / 2, y: 772, size: 10, font });

    // Bilingual header titles (Receipt + Invoice)
    page.drawText(lang === "es" ? "Recibo" : "Receipt", { x: 50, y: 740, size: 22, font: fontBold });
    page.drawText(lang === "es" ? "Factura" : "Invoice", { x: 50, y: 722, size: 12, font });

    // Info grid
    const leftX = 50;
    const rightX = 320;
    y = 690;
    page.drawText(`${t.billedTo}: ${tenantName}`, { x: leftX, y, size: 12, font }); y -= 16;
    page.drawText(`${t.property}: ${propertyName}`, { x: leftX, y, size: 12, font }); y -= 16;

    // Month text like the page ("For month of")
    const monthText = (() => {
      const iso = issueDate;
      if (!iso) return "—";
      const d = new Date(iso);
      const m = d.toLocaleString(lang === "es" ? "es-ES" : "en-US", { month: "long" });
      const yStr = String(d.getFullYear());
      return lang === "es" ? `${m} ${yStr.slice(-2)}` : `${m} ${yStr}`;
    })();

    page.drawText(`${t.issue}: ${issueDate}`, { x: rightX, y: 690, size: 12, font });
    page.drawText(`${lang === "es" ? "Para el mes de" : "For month of"}: ${monthText}`, { x: rightX, y: 674, size: 12, font });

    // Summary header-style row (Rent/Overdue/Lease end)
    y = 640;
    page.drawText(lang === "es" ? "Alquiler DOP" : "Rent DOP", { x: leftX, y, size: 10, font: fontBold });
    page.drawText(lang === "es" ? "Alquiler USD" : "Rent USD", { x: leftX + 140, y, size: 10, font: fontBold });
    page.drawText(lang === "es" ? "Importe Anterior USD" : "Overdue USD", { x: leftX + 280, y, size: 10, font: fontBold });
    page.drawText(lang === "es" ? "Importe Anterior DOP" : "Overdue DOP", { x: leftX + 420, y, size: 10, font: fontBold });

    const rentUsd = currency === "USD" ? amount : 0;
    const rentDop = currency === "DOP" ? amount : 0;

    // Compute previous balance (same tenant, same currency, before issue date)
    let prevBalance = 0;
    try {
      const { data: invs } = await service
        .from("invoices")
        .select("id, tenant_id, issue_date, total_amount, currency")
        .eq("tenant_id", inv.tenant?.id ?? inv.tenant_id)
        .order("issue_date", { ascending: true });
      const { data: pays } = await service
        .from("payments")
        .select("amount, currency, received_date, tenant_id")
        .eq("tenant_id", inv.tenant?.id ?? inv.tenant_id)
        .order("received_date", { ascending: true });
      const invCurrency = currency;
      const prevInvs = (invs ?? []).filter((i: any) => i.currency === invCurrency && i.issue_date < issueDate && i.id !== inv.id);
      const prevTotals = prevInvs.reduce((s: number, i: any) => s + Number(i.total_amount || 0), 0);
      const prevPays = (pays ?? []).filter((p: any) => p.currency === invCurrency && p.received_date < issueDate)
        .reduce((s: number, p: any) => s + Number(p.amount || 0), 0);
      prevBalance = prevPays - prevTotals;
    } catch {}

    page.drawText(rentDop ? new Intl.NumberFormat(lang === "es" ? "es-ES" : "en-US", { style: "currency", currency: "DOP" }).format(rentDop) : "—", { x: leftX, y: 622, size: 11, font });
    page.drawText(rentUsd ? new Intl.NumberFormat(lang === "es" ? "es-ES" : "en-US", { style: "currency", currency: "USD" }).format(rentUsd) : "—", { x: leftX + 140, y: 622, size: 11, font });
    page.drawText(currency === "USD" ? new Intl.NumberFormat(lang === "es" ? "es-ES" : "en-US", { style: "currency", currency: "USD" }).format(Math.max(0, prevBalance)) : "—", { x: leftX + 280, y: 622, size: 11, font });
    page.drawText(currency === "DOP" ? new Intl.NumberFormat(lang === "es" ? "es-ES" : "en-US", { style: "currency", currency: "DOP" }).format(Math.max(0, prevBalance)) : "—", { x: leftX + 420, y: 622, size: 11, font });

    // Lease end
    page.drawText(`${lang === "es" ? "Fin del contrato" : "Lease End Date"}: ${contractExpiry ?? "—"}`, { x: leftX, y: 600, size: 11, font });

    // Description line item
    y = 570;
    page.drawText(t.description, { x: leftX, y, size: 12, font: fontBold });
    page.drawText(t.amount, { x: rightX + 150, y, size: 12, font: fontBold });
    y -= 16;
    page.drawText(t.leaseInvoice, { x: leftX, y, size: 12, font });
    page.drawText(fmt(amount, currency), { x: rightX + 150, y, size: 12, font });

    // Payment summary
    y -= 40;
    page.drawText(lang === "es" ? "Total a pagar" : "Amount to be Paid", { x: leftX, y, size: 12, font: fontBold });
    page.drawText(fmt(amount, currency), { x: rightX + 150, y, size: 12, font: fontBold });
    y -= 16;

    page.drawText(t.paid, { x: leftX, y, size: 12, font });
    page.drawText(fmt(paidConverted, currency), { x: rightX + 150, y, size: 12, font });
    y -= 16;

    page.drawText(lang === "es" ? "Tasa de Cambio" : "Exchange Rate", { x: leftX, y, size: 12, font });
    page.drawText(exchangeRateDisplay, { x: rightX + 150, y, size: 12, font });
    y -= 16;

    page.drawText(lang === "es" ? "Método de pago" : "Payment Method", { x: leftX, y, size: 12, font });
    page.drawText(methodsDisplay, { x: rightX + 150, y, size: 12, font });
    y -= 24;

    // Balance + previous/overall (overall omitted for brevity)
    page.drawText(t.balance, { x: leftX, y, size: 12, font: fontBold });
    page.drawText(fmt(balance, currency), { x: rightX + 150, y, size: 12, font: fontBold });
    y -= 28;

    // Reminder
    page.drawText(lang === "es" ? "Recordatorio" : "Reminder", { x: leftX, y, size: 12, font: fontBold });
    y -= 16;
    page.drawText(lang === "es" ? "Por favor, pague antes del día 5 de cada mes." : "Please pay before the 5th of each month.", { x: leftX, y, size: 12, font });

    const pdfBytes = await pdf.save();

    // Upload to private invoices bucket
    const bucketName = "invoices";
    const { data: bucketList } = await service.storage.listBuckets();
    const hasBucket = (bucketList ?? []).some((b: any) => b.name === bucketName);
    if (!hasBucket) {
      await service.storage.createBucket(bucketName, { public: false });
    }

    const fileName = `invoice_${inv.id}.pdf`;
    const path = `${inv.id}/${fileName}`;
    const blob = new Blob([pdfBytes], { type: "application/pdf" });
    const { error: upErr } = await service.storage.from(bucketName).upload(path, blob, { contentType: "application/pdf", upsert: true });
    if (upErr) {
      return new Response(JSON.stringify({ error: upErr.message }), { status: 500, headers: corsHeaders });
    }

    const { error: updErr } = await service.from("invoices").update({ pdf_lang: lang, pdf_url: path }).eq("id", body.invoiceId);
    if (updErr) {
      return new Response(JSON.stringify({ error: updErr.message }), { status: 500, headers: corsHeaders });
    }

    const { data: signed } = await service.storage.from(bucketName).createSignedUrl(path, 60 * 10);
    const signedUrl = signed?.signedUrl ?? null;

    if (body.sendEmail && RESEND_API_KEY) {
      const res = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: { Authorization: `Bearer ${RESEND_API_KEY}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          from: "invoices@lasterrenas.properties",
          to: "contact@lasterrenas.properties",
          subject: (lang === "es" ? `Factura ${invoiceNumber}` : `Invoice ${invoiceNumber}`),
          text: t.emailText(propertyName, tenantName, fmt(amount, currency)),
          attachments: [{ filename: fileName, content: btoa(String.fromCharCode(...new Uint8Array(pdfBytes))) }],
        }),
      });
      if (!res.ok) {
        const msg = await res.text().catch(() => "Resend failed");
        return new Response(JSON.stringify({ error: msg }), { status: 500, headers: corsHeaders });
      }
    }

    // Audit logs
    await anon.from("activity_logs").insert({
      user_id: authedUserId,
      action: "invoice_pdf_generated",
      entity_type: "invoice",
      entity_id: inv.id,
      metadata: { lang, path, emailed: !!body.sendEmail },
    });

    return new Response(JSON.stringify({ ok: true, url: signedUrl, path }), { status: 200, headers: corsHeaders });
  } catch (e) {
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : String(e) }), { status: 500, headers: corsHeaders });
  }
});