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

  let body: { invoiceId: string; sendEmail?: boolean; lang?: "en" | "es" };
  try {
    body = await req.json();
  } catch {
    return new Response(JSON.stringify({ error: "Invalid JSON" }), { status: 400, headers: corsHeaders });
  }
  const lang = body.lang === "es" ? "es" : "en";

  const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
  const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");

  const EMAIL_TO = "contact@lasterrenas.properties";

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

  const t = lang === "es"
    ? {
        title: "Factura",
        number: "Número",
        issue: "Fecha de emisión",
        due: "Fecha de vencimiento",
        property: "Propiedad",
        tenant: "Inquilino",
        total: "Importe total",
        thanks: "Gracias por su pago puntual.",
        signature: "Las Terrenas Properties",
        emailSubject: (n: string) => `Factura ${n}`,
        emailText: (prop: string, tenant: string, amountText: string) =>
          `Estimado equipo,\n\nAdjuntamos la factura generada:\nPropiedad: ${prop}\nInquilino: ${tenant}\nImporte: ${amountText}\n\nGracias,\nLas Terrenas Properties`,
      }
    : {
        title: "Invoice",
        number: "Number",
        issue: "Issue Date",
        due: "Due Date",
        property: "Property",
        tenant: "Billed To",
        total: "Total Amount",
        thanks: "Thank you for your prompt payment.",
        signature: "Las Terrenas Properties",
        emailSubject: (n: string) => `Invoice ${n}`,
        emailText: (prop: string, tenant: string, amountText: string) =>
          `Dear team,\n\nAttached is the generated invoice:\nProperty: ${prop}\nTenant: ${tenant}\nAmount: ${amountText}\n\nRegards,\nLas Terrenas Properties`,
      };

  const invoiceNumber = inv.number || (lang === "es" ? "SIN-NUMERO" : "NO-NUMBER");
  const tenantName = [inv.tenant?.first_name ?? "", inv.tenant?.last_name ?? ""].filter(Boolean).join(" ") || "—";
  const propertyName = inv.lease?.property?.name ?? (lang === "es" ? "Propiedad" : "Property");
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

    draw(t.title, { size: 24, bold: true, y });
    draw(`${t.number}: ${invoiceNumber}`, { size: 12 });
    draw(`${t.issue}: ${issueDate}`, { size: 12 });
    draw(`${t.due}: ${dueDate}`, { size: 12 });
    draw("", { size: 12 });

    draw(`${t.property}: ${propertyName}`, { size: 12, bold: true });
    draw(`${t.tenant}: ${tenantName}`, { size: 12 });
    draw("", { size: 12 });

    const amountText = new Intl.NumberFormat(lang === "es" ? "es-ES" : "en-US", { style: "currency", currency }).format(amount);
    draw(`${t.total}: ${amountText}`, { size: 14, bold: true });
    draw("", { size: 12 });

    draw(t.thanks, { size: 12 });
    draw(t.signature, { size: 12 });

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

    const { error: updErr } = await supabase
      .from("invoices")
      .update({ pdf_lang: lang, pdf_url: pdfUrl })
      .eq("id", body.invoiceId);
    if (updErr) {
      return new Response(JSON.stringify({ error: updErr.message }), { status: 500, headers: corsHeaders });
    }

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
          subject: t.emailSubject(invoiceNumber),
          text: t.emailText(propertyName, tenantName, amountText),
          attachments: [{ filename: fileName, content: toBase64(new Uint8Array(pdfBytes)) }],
        }),
      });
      if (!res.ok) {
        const msg = await res.text().catch(() => "Resend failed");
        return new Response(JSON.stringify({ error: msg }), { status: 500, headers: corsHeaders });
      }
    }

    return new Response(JSON.stringify({ ok: true, url: pdfUrl }), { status: 200, headers: corsHeaders });
  } catch (e) {
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : String(e) }), { status: 500, headers: corsHeaders });
  }
});