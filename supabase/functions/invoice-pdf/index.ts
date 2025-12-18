import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { PDFDocument, StandardFonts } from "https://esm.sh/pdf-lib@1.17.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-job-token",
};

type Lang = "en" | "es";

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
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
      id, number, issue_date, due_date, currency, total_amount, status,
      lease:leases (
        id, end_date,
        property:properties ( id, name, agency_id )
      ),
      tenant:profiles ( id, first_name, last_name ),
      payments:payments ( amount, currency )
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
  const paid = payments.filter((p: any) => p.currency === currency).reduce((s: number, p: any) => s + Number(p.amount || 0), 0);
  const balance = paid - amount;

  const today = new Date().toISOString().slice(0, 10);
  let displayStatus: string = inv.status || "sent";
  if (balance >= 0) displayStatus = "paid";
  else if (dueDate < today && inv.status !== "void") displayStatus = "overdue";
  else if (paid > 0) displayStatus = "partial";

  try {
    const pdf = await PDFDocument.create();
    const page = pdf.addPage([595.28, 841.89]); // A4
    const font = await pdf.embedFont(StandardFonts.Helvetica);
    const fontBold = await pdf.embedFont(StandardFonts.HelveticaBold);

    // Header with agency
    let y = 800;
    const logoBytes = await getLogoBytes();
    if (logoBytes) {
      try {
        const img = await pdf.embedPng(logoBytes);
        const w = 140;
        const ratio = img.height / img.width;
        const h = w * ratio;
        page.drawImage(img, { x: 50, y: 820 - h, width: w, height: h });
      } catch {}
    }
    page.drawText(agencyName, { x: 400, y: 800, size: 12, font: fontBold });
    // Split address into two lines
    const addrParts = agencyAddress.split(",");
    const line1 = addrParts[0]?.trim() ?? "";
    const line2 = addrParts.slice(1).join(", ").trim();
    page.drawText(line1, { x: 400, y: 784, size: 10, font });
    if (line2) page.drawText(line2, { x: 400, y: 770, size: 10, font });

    y = 740;

    // Title and number
    page.drawText(t.title, { x: 50, y, size: 22, font: fontBold });
    y -= 26;
    page.drawText(`#${invoiceNumber}`, { x: 50, y, size: 12, font });
    y -= 18;

    // Info grid (two columns)
    const leftX = 50;
    const rightX = 320;
    let rowY = y;

    page.drawText(`${t.billedTo}: ${tenantName}`, { x: leftX, y: rowY, size: 12, font }); rowY -= 16;
    page.drawText(`${t.property}: ${propertyName}`, { x: leftX, y: rowY, size: 12, font }); rowY -= 16;
    if (contractExpiry) {
      page.drawText(`${t.contractExpiry}: ${contractExpiry}`, { x: leftX, y: rowY, size: 12, font }); rowY -= 16;
    }

    page.drawText(`${t.issue}: ${issueDate}`, { x: rightX, y: y, size: 12, font });
    page.drawText(`${t.due}: ${dueDate}`, { x: rightX, y: y - 16, size: 12, font });
    page.drawText(`${t.currency}: ${currency}`, { x: rightX, y: y - 32, size: 12, font });
    page.drawText(`${t.status}: ${String(displayStatus).toUpperCase()}`, { x: rightX, y: y - 48, size: 12, font });

    y = Math.min(rowY, y - 64) - 10;

    // Description table header
    page.drawText(t.description, { x: leftX, y, size: 12, font: fontBold });
    page.drawText(t.amount, { x: rightX + 150, y, size: 12, font: fontBold });
    y -= 14;

    // Single line item: Lease invoice + total
    page.drawText(t.leaseInvoice, { x: leftX, y, size: 12, font });
    page.drawText(fmt(amount, currency), { x: rightX + 150, y, size: 12, font });
    y -= 24;

    // Totals block (align to the right)
    const totalsXLabel = rightX + 60;
    const totalsXValue = rightX + 150;

    page.drawText(t.total, { x: totalsXLabel, y, size: 12, font });
    page.drawText(fmt(amount, currency), { x: totalsXValue, y, size: 12, font: fontBold });
    y -= 16;

    page.drawText(t.paid, { x: totalsXLabel, y, size: 12, font });
    page.drawText(fmt(paid, currency), { x: totalsXValue, y, size: 12, font });
    y -= 16;

    page.drawText(t.balance, { x: totalsXLabel, y, size: 12, font });
    page.drawText(fmt(balance, currency), { x: totalsXValue, y, size: 12, font: fontBold });

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

    return new Response(JSON.stringify({ ok: true, url: signedUrl, path }), { status: 200, headers: corsHeaders });
  } catch (e) {
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : String(e) }), { status: 500, headers: corsHeaders });
  }
});