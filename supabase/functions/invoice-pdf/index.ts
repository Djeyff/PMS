import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { PDFDocument, StandardFonts } from "https://esm.sh/pdf-lib@1.17.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-job-token",
};

function toBase64(bytes: Uint8Array) {
  let binary = "";
  for (let i = 0; i < bytes.byteLength; i++) binary += String.fromCharCode(bytes[i]);
  return btoa(binary);
}

type Lang = "en" | "es";

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  // Require Authorization header and verify JWT
  const authHeader = req.headers.get("Authorization");
  if (!authHeader) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: corsHeaders });
  }

  let body: { invoiceId: string; sendEmail?: boolean; lang?: Lang };
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

  // Verify the user from the provided token
  const anon = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: authHeader } },
  });
  const { data: userRes, error: userErr } = await anon.auth.getUser();
  if (userErr || !userRes?.user) {
    return new Response(JSON.stringify({ error: "Invalid token" }), { status: 401, headers: corsHeaders });
  }
  const authedUserId = userRes.user.id;

  // Use service role for server-side DB/storage work after verifying user
  const service = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

  // Ensure the caller is allowed to access this invoice:
  // - agency_admin for the property's agency, OR
  // - the tenant on the invoice, OR
  // - an owner of the property
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

  // Fetch caller's profile
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
    // Check if caller is an owner for the property
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

  const EMAIL_TO = "contact@lasterrenas.properties";

  async function ensureBrandingBucket() {
    const { data: buckets } = await service.storage.listBuckets();
    const exists = (buckets ?? []).some((b: any) => b.name === "branding");
    if (!exists) {
      // Create branding bucket as PRIVATE (not public)
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
      } catch {
        // ignore and try next method
      }
      try {
        // As a fallback only if bucket was historically public
        const { data: pub } = service.storage.from("branding").getPublicUrl(name);
        const url = pub.publicUrl;
        if (url) {
          const res = await fetch(url);
          if (res.ok) {
            const ab = await res.arrayBuffer();
            return new Uint8Array(ab);
          }
        }
      } catch {
        // ignore
      }
    }
    return null;
  }

  // Load invoice data for PDF content
  const { data: inv, error } = await service
    .from("invoices")
    .select(`
      id, number, issue_date, due_date, currency, total_amount,
      lease:leases (
        id,
        property:properties ( id, name, agency_id )
      ),
      tenant:profiles ( id, first_name, last_name )
    `)
    .eq("id", body.invoiceId)
    .single();

  if (error || !inv) {
    return new Response(JSON.stringify({ error: error?.message || "Invoice not found" }), { status: 404, headers: corsHeaders });
  }

  // Fetch agency for name/address (fallback if missing)
  let agencyName = "Las Terrenas Properties";
  let agencyAddress = "278 calle Duarte, LTI building, Las Terrenas";
  try {
    const agencyIdForPdf = inv.lease?.property?.agency_id ?? null;
    if (agencyIdForPdf) {
      const { data: ag } = await service.from("agencies").select("name, address").eq("id", agencyIdForPdf).single();
      if (ag?.name) agencyName = ag.name;
      if (ag?.address) agencyAddress = ag.address;
    }
  } catch {
    // ignore
  }

  const t = lang === "es" ? {
    title: "Factura",
    number: "Número",
    issue: "Fecha de emisión",
    due: "Fecha de vencimiento",
    property: "Propiedad",
    tenant: "Inquilino",
    total: "Importe total",
    thanks: "Gracias por su pago puntual.",
    signature: agencyName,
    emailSubject: (n: string) => `Factura ${n}`,
    emailText: (prop: string, tenant: string, amountText: string) =>
      `Estimado equipo,\n\nAdjuntamos la factura generada:\nPropiedad: ${prop}\nInquilino: ${tenant}\nImporte: ${amountText}\n\nGracias,\n${agencyName}`,
  } : {
    title: "Invoice",
    number: "Number",
    issue: "Issue Date",
    due: "Due Date",
    property: "Property",
    tenant: "Billed To",
    total: "Total Amount",
    thanks: "Thank you for your prompt payment.",
    signature: agencyName,
    emailSubject: (n: string) => `Invoice ${n}`,
    emailText: (prop: string, tenant: string, amountText: string) =>
      `Dear team,\n\nAttached is the generated invoice:\nProperty: ${prop}\nTenant: ${tenant}\nAmount: ${amountText}\n\nRegards,\n${agencyName}`,
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

    // Branding header with logo and address
    const logoBytes = await getLogoBytes();
    let y = 800;
    if (logoBytes) {
      const img = await pdf.embedPng(logoBytes);
      const w = 495;
      const h = (img.height / img.width) * w;
      page.drawImage(img, { x: 50, y: 820 - h, width: w, height: h });

      let textY = 820 - h - 12;
      page.drawText(agencyName, { x: 50, y: textY, size: 14, font: fontBold });
      const addr = agencyAddress;
      const lines = addr.includes(",") ? addr.split(",") : [addr];
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
      const addr = agencyAddress;
      const lines = addr.includes(",") ? addr.split(",") : [addr];
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

    draw(t.title, { size: 24, bold: true, y });
    draw(`${t.number}: ${invoiceNumber}`, { size: 12 });
    draw(`${t.issue}: ${issueDate}`, { size: 12 });
    draw(`${t.due}: ${dueDate}`, { size: 12 });
    draw("", { size: 12 });

    draw(`${lang === "es" ? "Propiedad" : "Property"}: ${propertyName}`, { size: 12, bold: true });
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

    // Invoices bucket must be PRIVATE
    const bucketName = "invoices";
    const { data: bucketList } = await service.storage.listBuckets();
    const hasBucket = (bucketList ?? []).some((b: any) => b.name === bucketName);
    if (!hasBucket) {
      await service.storage.createBucket(bucketName, { public: false });
    } else {
      // If it exists and was public historically, this call is harmless if already private
      // No direct API to flip to private reliably here; rely on storage policies to restrict access.
    }

    const blob = new Blob([pdfBytes], { type: "application/pdf" });
    const { error: upErr } = await service.storage.from(bucketName).upload(path, blob, {
      contentType: "application/pdf",
      upsert: true,
    });
    if (upErr) {
      return new Response(JSON.stringify({ error: upErr.message }), { status: 500, headers: corsHeaders });
    }

    // Store only the storage path (not a public URL)
    const { error: updErr } = await service
      .from("invoices")
      .update({ pdf_lang: lang, pdf_url: path })
      .eq("id", body.invoiceId);
    if (updErr) {
      return new Response(JSON.stringify({ error: updErr.message }), { status: 500, headers: corsHeaders });
    }

    // Return a short-lived signed URL to the caller
    const { data: signed } = await service.storage.from(bucketName).createSignedUrl(path, 60 * 10); // 10 minutes
    const signedUrl = signed?.signedUrl ?? null;

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
          subject: (lang === "es" ? `Factura ${invoiceNumber}` : `Invoice ${invoiceNumber}`),
          text: (lang === "es"
            ? `Estimado equipo,\n\nAdjuntamos la factura generada:\nPropiedad: ${propertyName}\nInquilino: ${tenantName}\nImporte: ${amountText}\n\nGracias,\n${agencyName}`
            : `Dear team,\n\nAttached is the generated invoice:\nProperty: ${propertyName}\nTenant: ${tenantName}\nAmount: ${amountText}\n\nRegards,\n${agencyName}`),
          attachments: [{ filename: fileName, content: toBase64(new Uint8Array(pdfBytes)) }],
        }),
      });
      if (!res.ok) {
        const msg = await res.text().catch(() => "Resend failed");
        return new Response(JSON.stringify({ error: msg }), { status: 500, headers: corsHeaders });
      }
    }

    return new Response(JSON.stringify({ ok: true, url: signedUrl, path }), { status: 200, headers: corsHeaders });
  } catch (e) {
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : String(e) }), { status: 500, headers: corsHeaders });
  }
});