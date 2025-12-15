import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { PDFDocument, StandardFonts } from "https://esm.sh/pdf-lib@1.17.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

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
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const authHeader = req.headers.get("Authorization");
  if (!authHeader) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: corsHeaders });
  }

  const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
  const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");
  const TWILIO_ACCOUNT_SID = Deno.env.get("TWILIO_ACCOUNT_SID");
  const TWILIO_AUTH_TOKEN = Deno.env.get("TWILIO_AUTH_TOKEN");
  const TWILIO_WHATSAPP_FROM = Deno.env.get("TWILIO_WHATSAPP_FROM");

  const EMAIL_TO = "contact@lasterrenas.properties";
  const WHATSAPP_TO = "whatsapp:+18092044903";

  const force = new URL(req.url).searchParams.get("force") === "true";
  const today = new Date();

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

  const { data: leases, error: leaseErr } = await supabase
    .from("leases")
    .select(`
      id, property_id, tenant_id, start_date, end_date, rent_amount, rent_currency, status,
      auto_invoice_enabled, auto_invoice_day, auto_invoice_interval_months,
      property:properties ( id, name ),
      tenant:profiles ( id, first_name, last_name )
    `)
    .eq("auto_invoice_enabled", true);

  if (leaseErr) {
    return new Response(JSON.stringify({ error: leaseErr.message }), { status: 500, headers: corsHeaders });
  }

  const issueDate = todayStr();
  const dueDate = plusDays(issueDate, 7);

  const bucketName = "invoices";
  const { data: bucketList } = await supabase.storage.listBuckets();
  const hasBucket = (bucketList ?? []).some((b: any) => b.name === bucketName);
  if (!hasBucket) {
    await supabase.storage.createBucket(bucketName, { public: true });
  }

  let sentCount = 0;
  const errors: string[] = [];

  for (const l of leases ?? []) {
    // Only active leases within date range
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
    const { data: inv, error: invErr } = await supabase
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

      let y = 800;
      const draw = (text: string, opts: { x?: number; y?: number; size?: number; bold?: boolean } = {}) => {
        const size = opts.size ?? 12;
        const x = opts.x ?? 50;
        y = opts.y ?? y;
        page.drawText(text, { x, y, size, font: opts.bold ? fontBold : font });
        y -= size + 8;
      };

      draw("Factura", { size: 24, bold: true, y });
      draw(`Número: ${invoiceNumber}`, { size: 12 });
      draw(`Fecha de emisión: ${issueDate}`, { size: 12 });
      draw(`Fecha de vencimiento: ${dueDate}`, { size: 12 });
      draw("", { size: 12 });

      draw(`Propiedad: ${propertyName}`, { size: 12, bold: true });
      draw(`Inquilino: ${tenantName}`, { size: 12 });
      draw("", { size: 12 });

      draw(`Importe total: ${new Intl.NumberFormat("es-ES", { style: "currency", currency }).format(amount)}`, { size: 14, bold: true });
      draw("", { size: 12 });

      draw("Gracias por su pago puntual.", { size: 12 });
      draw("Las Terrenas Properties", { size: 12 });

      const pdfBytes = await pdf.save();
      const fileName = `invoice_${inv.id}.pdf`;
      const path = `${inv.id}/${fileName}`;

      const { error: upErr } = await supabase.storage.from(bucketName).upload(path, pdfBytes, {
        contentType: "application/pdf",
        upsert: true,
      });
      if (upErr) {
        errors.push(`Upload PDF failed for invoice ${inv.id}: ${upErr.message}`);
      }

      const { data: pub } = supabase.storage.from(bucketName).getPublicUrl(path);
      const pdfUrl = pub.publicUrl;

      if (RESEND_API_KEY) {
        const res = await fetch("https://api.resend.com/emails", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${RESEND_API_KEY}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            from: "invoices@lasterrenas.properties",
            to: EMAIL_TO,
            subject: `Factura ${invoiceNumber}`,
            text:
              `Estimado equipo,\n\n` +
              `Adjuntamos la factura generada para el contrato:\n` +
              `Propiedad: ${propertyName}\n` +
              `Inquilino: ${tenantName}\n` +
              `Importe: ${new Intl.NumberFormat("es-ES", { style: "currency", currency }).format(amount)}\n\n` +
              `Gracias,\nLas Terrenas Properties`,
            attachments: [
              { filename: fileName, content: toBase64(new Uint8Array(pdfBytes)) },
            ],
          }),
        });
        if (!res.ok) {
          const msg = await res.text().catch(() => "Resend failed");
          errors.push(`Email failed for invoice ${inv.id}: ${msg}`);
        }
      } else {
        errors.push("RESEND_API_KEY not set — email skipped");
      }

      if (TWILIO_ACCOUNT_SID && TWILIO_AUTH_TOKEN && TWILIO_WHATSAPP_FROM) {
        const bodyText = `Factura ${invoiceNumber}\nPropiedad: ${propertyName}\nInquilino: ${tenantName}\nImporte: ${new Intl.NumberFormat("es-ES", { style: "currency", currency }).format(amount)}\nPDF: ${pdfUrl}`;
        const url = `https://api.twilio.com/2010-04-01/Accounts/${TWILIO_ACCOUNT_SID}/Messages.json`;
        const auth = btoa(`${TWILIO_ACCOUNT_SID}:${TWILIO_AUTH_TOKEN}`);
        const form = new URLSearchParams({
          From: TWILIO_WHATSAPP_FROM,
          To: "whatsapp:+18092044903",
          Body: bodyText,
          MediaUrl: pdfUrl,
        });
        const tw = await fetch(url, {
          method: "POST",
          headers: { Authorization: `Basic ${auth}`, "Content-Type": "application/x-www-form-urlencoded" },
          body: form.toString(),
        });
        if (!tw.ok) {
          const msg = await tw.text().catch(() => "Twilio failed");
          errors.push(`WhatsApp failed for invoice ${inv.id}: ${msg}`);
        }
      } else {
        errors.push("Twilio secrets not set — WhatsApp skipped");
      }

      sentCount++;
    } catch (e) {
      errors.push(`PDF/Send error for lease ${l.id}: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  return new Response(JSON.stringify({ ok: true, sent: sentCount, errors }), { status: 200, headers: corsHeaders });
});