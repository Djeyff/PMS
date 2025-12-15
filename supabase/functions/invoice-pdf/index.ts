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

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const authHeader = req.headers.get("Authorization");
  if (!authHeader) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: corsHeaders });
  }

  let body: { invoiceId: string; sendEmail?: boolean; sendWhatsApp?: boolean };
  try {
    body = await req.json();
  } catch {
    return new Response(JSON.stringify({ error: "Invalid JSON" }), { status: 400, headers: corsHeaders });
  }

  const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
  const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");
  const TWILIO_ACCOUNT_SID = Deno.env.get("TWILIO_ACCOUNT_SID");
  const TWILIO_AUTH_TOKEN = Deno.env.get("TWILIO_AUTH_TOKEN");
  const TWILIO_WHATSAPP_FROM = Deno.env.get("TWILIO_WHATSAPP_FROM");

  const EMAIL_TO = "contact@lasterrenas.properties";
  const WHATSAPP_TO = "whatsapp:+18092044903";

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

  const { data: inv, error } = await supabase
    .from("invoices")
    .select(`
      id, number, issue_date, due_date, currency, total_amount,
      lease:leases (
        id,
        property:properties ( id, name )
      ),
      tenant:profiles ( id, first_name, last_name )
    `)
    .eq("id", body.invoiceId)
    .single();

  if (error || !inv) {
    return new Response(JSON.stringify({ error: error?.message || "Invoice not found" }), { status: 404, headers: corsHeaders });
  }

  const invoiceNumber = inv.number || "SIN-NUMERO";
  const tenantName = [inv.tenant?.first_name ?? "", inv.tenant?.last_name ?? ""].filter(Boolean).join(" ") || "—";
  const propertyName = inv.lease?.property?.name ?? "Propiedad";
  const amount = Number(inv.total_amount || 0);
  const currency = inv.currency;
  const issueDate = inv.issue_date;
  const dueDate = inv.due_date;

  try {
    const pdf = await PDFDocument.create();
    const page = pdf.addPage([595.28, 841.89]); // A4
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

    const bucketName = "invoices";
    const { data: bucketList } = await supabase.storage.listBuckets();
    const hasBucket = (bucketList ?? []).some((b: any) => b.name === bucketName);
    if (!hasBucket) {
      await supabase.storage.createBucket(bucketName, { public: true });
    }

    const { error: upErr } = await supabase.storage.from(bucketName).upload(path, pdfBytes, {
      contentType: "application/pdf",
      upsert: true,
    });
    if (upErr) {
      return new Response(JSON.stringify({ error: upErr.message }), { status: 500, headers: corsHeaders });
    }

    const { data: pub } = supabase.storage.from(bucketName).getPublicUrl(path);
    const pdfUrl = pub.publicUrl;

    // Optional email
    if (body.sendEmail && RESEND_API_KEY) {
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
            `Adjuntamos la factura generada:\n` +
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
        return new Response(JSON.stringify({ error: msg }), { status: 500, headers: corsHeaders });
      }
    }

    // Optional WhatsApp
    if (body.sendWhatsApp && TWILIO_ACCOUNT_SID && TWILIO_AUTH_TOKEN && TWILIO_WHATSAPP_FROM) {
      const bodyText = `Factura ${invoiceNumber}\nPropiedad: ${propertyName}\nInquilino: ${tenantName}\nImporte: ${new Intl.NumberFormat("es-ES", { style: "currency", currency }).format(amount)}\nPDF: ${pdfUrl}`;
      const url = `https://api.twilio.com/2010-04-01/Accounts/${TWILIO_ACCOUNT_SID}/Messages.json`;
      const auth = btoa(`${TWILIO_ACCOUNT_SID}:${TWILIO_AUTH_TOKEN}`);
      const form = new URLSearchParams({
        From: TWILIO_WHATSAPP_FROM,
        To: WHATSAPP_TO,
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
        return new Response(JSON.stringify({ error: msg }), { status: 500, headers: corsHeaders });
      }
    }

    return new Response(JSON.stringify({ ok: true, url: pdfUrl }), { status: 200, headers: corsHeaders });
  } catch (e) {
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : String(e) }), { status: 500, headers: corsHeaders });
  }
});