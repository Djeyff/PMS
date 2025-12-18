import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { PDFDocument, StandardFonts } from "https://esm.sh/pdf-lib@1.17.1";

// Build CORS headers based on optional allowlist
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
  if (list.length === 0) return true; // allow all if not configured
  if (!origin) return true; // allow non-browser clients
  return list.includes(origin);
}

function toBase64(bytes: Uint8Array) {
  let binary = "";
  for (let i = 0; i < bytes.byteLength; i++) binary += String.fromCharCode(bytes[i]);
  return btoa(binary);
}

function todayStr() {
  return new Date().toISOString().slice(0, 10);
}
function plusDays(dateStr: string, days: number) {
  const d = new Date(dateStr);
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}
function autoNumber(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  const rand = Math.random().toString(36).slice(2, 6).toUpperCase();
  return `FAC-${y}${m}${day}-${rand}`;
}
function monthsBetween(startDate: string, refDate: Date) {
  const s = new Date(startDate);
  return (refDate.getFullYear() - s.getFullYear()) * 12 + (refDate.getMonth() - s.getMonth());
}

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

  // Verify Authorization header and JWT
  const authHeader = req.headers.get("Authorization");
  if (!authHeader) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: corsHeaders });
  }

  const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
  const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
  const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");

  // Verify token and get user
  const anon = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: authHeader } },
  });
  const { data: userRes, error: userErr } = await anon.auth.getUser();
  if (userErr || !userRes?.user) {
    return new Response(JSON.stringify({ error: "Invalid token" }), { status: 401, headers: corsHeaders });
  }
  const authedUserId = userRes.user.id;

  const urlForce = new URL(req.url).searchParams.get("force") === "true";
  let bodyForce = false;
  try {
    const b = await req.json();
    if (typeof b?.force === "boolean") bodyForce = b.force;
  } catch {
    // ignore (no JSON body is fine)
  }
  const force = urlForce || bodyForce;
  const today = new Date();

  const service = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

  // Only agency_admin may trigger auto-invoice, and only for their agency's properties
  const { data: profile } = await service.from("profiles").select("role, agency_id").eq("id", authedUserId).maybeSingle();
  if (!profile || profile.role !== "agency_admin" || !profile.agency_id) {
    return new Response(JSON.stringify({ error: "Forbidden" }), { status: 403, headers: corsHeaders });
  }
  const adminAgencyId = profile.agency_id as string;

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

  // Only leases under admin's agency
  const { data: leases, error: leaseErr } = await service
    .from("leases")
    .select(`
      id, property_id, tenant_id, start_date, end_date, rent_amount, rent_currency, status,
      auto_invoice_enabled, auto_invoice_day, auto_invoice_interval_months,
      property:properties ( id, name, agency_id ),
      tenant:profiles ( id, first_name, last_name )
    `)
    .filter("property.agency_id", "eq", adminAgencyId)
    .eq("auto_invoice_enabled", true);

  if (leaseErr) {
    return new Response(JSON.stringify({ error: leaseErr.message }), { status: 500, headers: corsHeaders });
  }

  const issueDate = todayStr();
  const dueDate = plusDays(issueDate, 7);

  const bucketName = "invoices";
  const { data: bucketList } = await service.storage.listBuckets();
  const hasBucket = (bucketList ?? []).some((b: any) => b.name === bucketName);
  if (!hasBucket) {
    await service.storage.createBucket(bucketName, { public: false });
  }

  // Agency name/address
  let agencyName = "Las Terrenas Properties";
  let agencyAddress = "278 calle Duarte, LTI building, Las Terrenas";
  try {
    const { data: ag } = await service.from("agencies").select("name, address").eq("id", adminAgencyId).single();
    if (ag?.name) agencyName = ag.name;
    if (ag?.address) agencyAddress = ag.address;
  } catch {}

  let sentCount = 0;
  const errors: string[] = [];
  const emailAttachments: Array<{ filename: string; content: string }> = [];

  for (const l of leases ?? []) {
    const todayStrIso = today.toISOString().slice(0, 10);
    if (l.status !== "active" || l.start_date > todayStrIso || l.end_date < todayStrIso) continue;

    const day = typeof l.auto_invoice_day === "number" ? l.auto_invoice_day : 5;
    const interval = typeof l.auto_invoice_interval_months === "number" ? l.auto_invoice_interval_months : 1;

    const okDay = today.getDate() === day;
    const monthsDiff = monthsBetween(l.start_date, today);
    const okInterval = monthsDiff >= 0 && monthsDiff % Math.max(1, interval) === 0;

    if (!force && (!okDay || !okInterval)) continue;

    const tenantName = [l.tenant?.first_name ?? "", l.tenant?.last_name ?? ""].filter(Boolean).join(" ") || "—";
    const propertyName = l.property?.name ?? (l.property_id?.slice(0, 8) || "Propiedad");
    const amount = Number(l.rent_amount || 0);
    const currency = l.rent_currency;

    const invoiceNumber = autoNumber();
    const { data: inv, error: invErr } = await service
      .from("invoices")
      .insert({
        lease_id: l.id,
        tenant_id: l.tenant_id,
        number: invoiceNumber,
        issue_date: issueDate,
        due_date: dueDate,
        currency,
        total_amount: amount,
        status: "sent",
      })
      .select("id")
      .single();

    if (invErr) {
      errors.push(`Insert invoice failed for lease ${l.id}: ${invErr.message}`);
      continue;
    }

    try {
      const pdf = await PDFDocument.create();
      const page = pdf.addPage([595.28, 841.89]);
      const font = await pdf.embedFont(StandardFonts.Helvetica);
      const fontBold = await pdf.embedFont(StandardFonts.HelveticaBold);

      // Branding header
      const logoBytes = await getLogoBytes();
      let y = 800;
      if (logoBytes) {
        const img = await pdf.embedPng(logoBytes);
        const w = 495;
        const h = (img.height / img.width) * w;
        page.drawImage(img, { x: 50, y: 820 - h, width: w, height: h });

        // Agency name/address beneath the logo
        let textY = 820 - h - 12;
        page.drawText(agencyName, { x: 50, y: textY, size: 14, font: fontBold });
        const lines = agencyAddress.includes(",") ? agencyAddress.split(",") : [agencyAddress];
        const line1 = lines[0] ?? "";
        const line2 = lines.slice(1).join(", ").trim();
        textY -= 16;
        page.drawText(line1, { x: 50, y: textY, size: 10, font });
        if (line2) {
          textY -= 14;
          page.drawText(line2, { x: 50, y: textY, size: 10, font });
        }
        y = textY - 24;
      } else {
        page.drawText(agencyName, { x: 400, y: 800, size: 14, font: fontBold });
        const lines = agencyAddress.includes(",") ? agencyAddress.split(",") : [agencyAddress];
        const line1 = lines[0] ?? "";
        const line2 = lines.slice(1).join(", ").trim();
        page.drawText(line1, { x: 400, y: 784, size: 10, font });
        if (line2) page.drawText(line2, { x: 400, y: 770, size: 10, font });
        y = 740;
      }

      const draw = (text: string, opts: { x?: number; y?: number; size?: number; bold?: boolean } = {}) => {
        const size = opts.size ?? 12;
        const x = opts.x ?? 50;
        y = opts.y ?? y;
        page.drawText(text, { x, y, size, font: opts.bold ? fontBold : font });
        y -= size + 8;
      };

      // Invoice meta (Spanish)
      draw("Factura", { size: 24, bold: true, y });
      draw(`Número: ${invoiceNumber}`, { size: 12 });
      draw(`Fecha de emisión: ${issueDate}`, { size: 12 });
      draw(`Fecha de vencimiento: ${dueDate}`, { size: 12 });
      draw("", { size: 12 });

      draw(`Propiedad: ${propertyName}`, { size: 12, bold: true });
      draw(`Inquilino: ${tenantName}`, { size: 12 });
      draw("", { size: 12 });

      const fmtAmount = new Intl.NumberFormat("es-ES", { style: "currency", currency }).format(amount);
      draw(`Importe total: ${fmtAmount}`, { size: 14, bold: true });
      draw("", { size: 12 });

      draw("Gracias por su pago puntual.", { size: 12 });
      draw(agencyName, { size: 12 });

      const pdfBytes = await pdf.save();
      const fileName = `invoice_${inv.id}.pdf`;
      const path = `${inv.id}/${fileName}`;

      const { error: upErr } = await service.storage.from(bucketName).upload(path, new Blob([pdfBytes], { type: "application/pdf" }), {
        contentType: "application/pdf",
        upsert: true,
      });
      if (upErr) {
        errors.push(`Upload PDF failed for invoice ${inv.id}: ${upErr.message}`);
      }

      const { error: updErr } = await service.from("invoices").update({ pdf_lang: "es", pdf_url: path }).eq("id", inv.id);
      if (updErr) {
        errors.push(`Update invoice path/lang failed for invoice ${inv.id}: ${updErr.message}`);
      }

      // Collect attachment for single email
      emailAttachments.push({ filename: fileName, content: toBase64(new Uint8Array(pdfBytes)) });

      sentCount++;
    } catch (e) {
      errors.push(`PDF error for lease ${l.id}: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  // Send one email with all attachments
  if (RESEND_API_KEY && emailAttachments.length > 0) {
    const subject = `Facturas generadas automáticamente (${issueDate})`;
    const textBody =
      `Estimado equipo,\n\nSe han generado ${sentCount} factura(s) automáticamente.\n` +
      `Adjuntamos todos los PDF en este correo.\n\n` +
      `Gracias,\n${agencyName}`;

    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${RESEND_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: "invoices@lasterrenas.properties",
        to: "contact@lasterrenas.properties",
        subject,
        text: textBody,
        attachments: emailAttachments,
      }),
    });

    if (!res.ok) {
      const msg = await res.text().catch(() => "Resend failed");
      errors.push(`Bulk email failed: ${msg}`);
    }
  }

  // Audit log (RLS-safe with caller token)
  await anon.from("activity_logs").insert({
    user_id: authedUserId,
    action: "auto_invoice_run",
    entity_type: "invoices",
    entity_id: null,
    metadata: { sent: sentCount, errors_count: errors.length, force },
  });

  return new Response(JSON.stringify({ ok: true, sent: sentCount, errors }), { status: 200, headers: corsHeaders });
});