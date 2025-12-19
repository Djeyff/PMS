// @ts-nocheck

import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { PDFDocument, StandardFonts } from "https://esm.sh/pdf-lib@1.17.1";

function cors(origin: string | null) {
  return {
    "Access-Control-Allow-Origin": origin ?? "*",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Content-Type": "application/json",
  };
}

type Lang = "en" | "es";

serve(async (req) => {
  const origin = req.headers.get("Origin");
  const headers = cors(origin);

  if (req.method === "OPTIONS") {
    return new Response(null, { headers });
  }

  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method Not Allowed" }), { status: 405, headers });
  }

  const authHeader = req.headers.get("Authorization");
  if (!authHeader) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers });
  }

  let body: { paymentId?: string; lang?: Lang };
  try {
    body = await req.json();
  } catch {
    return new Response(JSON.stringify({ error: "Invalid JSON" }), { status: 400, headers });
  }
  const paymentId = body.paymentId;
  const lang: Lang = body.lang === "es" ? "es" : "en";
  if (!paymentId) {
    return new Response(JSON.stringify({ error: "paymentId is required" }), { status: 400, headers });
  }

  try {
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    // Verify caller
    const anon = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, { global: { headers: { Authorization: authHeader } } });
    const { data: userRes } = await anon.auth.getUser();
    const requester = userRes?.user;
    if (!requester) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers });
    }

    // Service role for data access
    const service = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // Load payment with relations
    const { data: pay, error: payErr } = await service
      .from("payments")
      .select(`
        id, amount, currency, method, received_date, reference, tenant_id, lease_id, invoice_id, exchange_rate,
        tenant:profiles ( id, first_name, last_name ),
        lease:leases ( id, property:properties ( id, name, agency_id ) )
      `)
      .eq("id", paymentId)
      .single();
    if (payErr || !pay) {
      return new Response(JSON.stringify({ error: payErr?.message || "Payment not found" }), { status: 404, headers });
    }

    const tenantId: string = pay.tenant_id;
    const propertyId: string | null = pay.lease?.property?.id ?? null;
    const agencyId: string | null = pay.lease?.property?.agency_id ?? null;

    // Authorization: tenant, owner of property, or admin of same agency
    let authorized = false;
    if (tenantId === requester.id) {
      authorized = true;
    } else if (propertyId) {
      const { data: ownerRow } = await service
        .from("property_owners")
        .select("owner_id")
        .eq("property_id", propertyId)
        .eq("owner_id", requester.id)
        .maybeSingle();
      if (ownerRow) authorized = true;

      if (!authorized && agencyId) {
        const { data: profile } = await service
          .from("profiles")
          .select("id, role, agency_id")
          .eq("id", requester.id)
          .maybeSingle();
        if (profile?.role === "agency_admin" && profile.agency_id === agencyId) {
          authorized = true;
        }
      }
    }

    if (!authorized) {
      return new Response(JSON.stringify({ error: "Forbidden" }), { status: 403, headers });
    }

    // Agency info
    let agencyName = "Las Terrenas Properties";
    let agencyAddress = "278 calle Duarte, LTI building, Las Terrenas";
    try {
      if (agencyId) {
        const { data: ag } = await service.from("agencies").select("name, address").eq("id", agencyId).single();
        if (ag?.name) agencyName = ag.name;
        if (ag?.address) agencyAddress = ag.address;
      }
    } catch {}

    // Branding: try download logo from branding bucket
    async function getLogoBytes(): Promise<Uint8Array | null> {
      const candidates = ["logo.png", "LTP_transp copy.png"];
      for (const name of candidates) {
        try {
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

    // Localized strings aligned with invoice PDF style
    const t = lang === "es" ? {
      receiptTitleTop: "Recibo",
      invoiceTitleSub: "Factura",
      billedTo: "Facturado a",
      property: "Propiedad",
      date: "Fecha",
      method: "Método de pago",
      reference: "Referencia",
      amountReceived: "Importe recibido",
      exchangeRate: "Tasa de Cambio",
      thankYou: "Gracias por su pago puntual.",
    } : {
      receiptTitleTop: "Receipt",
      invoiceTitleSub: "Invoice",
      billedTo: "Billed To",
      property: "Property",
      date: "Date",
      method: "Payment Method",
      reference: "Reference",
      amountReceived: "Amount Received",
      exchangeRate: "Exchange Rate",
      thankYou: "Thank you for your prompt payment.",
    };

    const fmt = (amt: number, cur: string) =>
      new Intl.NumberFormat(lang === "es" ? "es-ES" : "en-US", { style: "currency", currency: cur }).format(amt);

    const toTitle = (s: string) => s.split(" ").map((w) => (w ? w[0].toUpperCase() + w.slice(1) : w)).join(" ");
    const formatMethod = (method: string | null, lng: Lang) => {
      const key = String(method ?? "").toLowerCase();
      const mapEn: Record<string, string> = {
        bank_transfer: "Bank Transfer",
        cash: "Cash",
        card: "Card",
        check: "Check",
      };
      const mapEs: Record<string, string> = {
        bank_transfer: "Transferencia bancaria",
        cash: "Efectivo",
        card: "Tarjeta",
        check: "Cheque",
      };
      const fromMap = lng === "es" ? mapEs[key] : mapEn[key];
      if (fromMap) return fromMap;
      const cleaned = key.replace(/_/g, " ").trim();
      return cleaned ? toTitle(cleaned) : "—";
    }

    // Prepare data
    const tenantName = [pay.tenant?.first_name ?? "", pay.tenant?.last_name ?? ""].filter(Boolean).join(" ") || "—";
    const propertyName = pay.lease?.property?.name ?? "—";
    const amount = Number(pay.amount || 0);
    const currency = pay.currency;
    const method = pay.method || "—";
    const ref = pay.reference ?? "—";
    const receivedDate = pay.received_date;
    const exchangeRate = typeof pay.exchange_rate === "number" ? pay.exchange_rate : null;

    const methodDisplay = formatMethod(method, lang);

    // Build PDF
    const pdf = await PDFDocument.create();
    // Letter size: 8.5in x 11in = 612 x 792 points
    const W = 612;
    const H = 792;
    const M = 36; // 0.5" margins
    const page = pdf.addPage([W, H]);
    const font = await pdf.embedFont(StandardFonts.Helvetica);
    const fontBold = await pdf.embedFont(StandardFonts.HelveticaBold);

    // Header: agency name + address, then logo placed safely below
    const headerTop = H - M;
    const nameY = headerTop - 14;
    page.drawText(agencyName, { x: (W - font.widthOfTextAtSize(agencyName, 14)) / 2, y: nameY, size: 14, font: fontBold });
    const addrParts = agencyAddress.split(",");
    const line1 = addrParts[0]?.trim() ?? "";
    const line2 = addrParts.slice(1).join(", ").trim();
    page.drawText(line1, { x: (W - font.widthOfTextAtSize(line1, 10)) / 2, y: nameY - 16, size: 10, font });
    if (line2) page.drawText(line2, { x: (W - font.widthOfTextAtSize(line2, 10)) / 2, y: nameY - 30, size: 10, font });

    // Logo (cap width to 120pt), positioned at least 60pt below header text
    let contentStartY = nameY - 60;
    const logoBytes = await getLogoBytes();
    if (logoBytes) {
      try {
        const img = await pdf.embedPng(logoBytes);
        const w = 120;
        const ratio = img.height / img.width || 1;
        const h = w * ratio;
        const x = (W - w) / 2;
        const logoBottomY = contentStartY - h;
        page.drawImage(img, { x, y: logoBottomY, width: w, height: h });
        contentStartY = logoBottomY - 24; // add spacing after logo
      } catch {}
    }

    // Titles
    page.drawText(t.receiptTitleTop, { x: M, y: contentStartY, size: 22, font: fontBold });
    page.drawText(t.invoiceTitleSub, { x: M, y: contentStartY - 18, size: 12, font });

    // Info grid aligned to margins with shared baseline
    const leftX = M;
    const rightLabelX = W - M - 220;
    const rightValueX = W - M - 100;
    let y = contentStartY - 48;

    page.drawText(`${t.billedTo}: ${tenantName}`, { x: leftX, y, size: 12, font }); y -= 16;
    page.drawText(`${t.property}: ${propertyName}`, { x: leftX, y, size: 12, font });

    // Date aligned to same first row baseline used above
    page.drawText(`${t.date}:`, { x: rightLabelX, y: contentStartY - 48, size: 12, font });
    page.drawText(receivedDate, { x: rightValueX, y: contentStartY - 48, size: 12, font });

    // Summary block with right-aligned values
    y = contentStartY - 88;
    page.drawText(t.amountReceived, { x: leftX, y, size: 12, font: fontBold });
    page.drawText(fmt(amount, currency), { x: rightValueX, y, size: 12, font: fontBold });
    y -= 18;

    page.drawText(t.method, { x: leftX, y, size: 12, font });
    page.drawText(methodDisplay, { x: rightValueX, y, size: 12, font });
    y -= 16;

    page.drawText(t.reference, { x: leftX, y, size: 12, font });
    page.drawText(ref, { x: rightValueX, y, size: 12, font });
    y -= 16;

    page.drawText(t.exchangeRate, { x: leftX, y, size: 12, font });
    page.drawText(exchangeRate ? String(exchangeRate) : "—", { x: rightValueX, y, size: 12, font });
    y -= 28;

    // Footer note
    page.drawText(t.thankYou, { x: leftX, y, size: 12, font });

    const pdfBytes = await pdf.save();

    // Upload to private "payments" bucket
    const bucketName = "payments";
    const { data: bucketList } = await service.storage.listBuckets();
    const hasBucket = (bucketList ?? []).some((b: any) => b.name === bucketName);
    if (!hasBucket) await service.storage.createBucket(bucketName, { public: false });

    const fileName = `receipt_${paymentId}.pdf`;
    const path = `${paymentId}/${fileName}`;
    const blob = new Blob([pdfBytes], { type: "application/pdf" });
    const { error: upErr } = await service.storage.from(bucketName).upload(path, blob, { contentType: "application/pdf", upsert: true });
    if (upErr) {
      return new Response(JSON.stringify({ error: upErr.message }), { status: 500, headers });
    }

    const { data: signed } = await service.storage.from(bucketName).createSignedUrl(path, 60 * 10);
    const signedUrl = signed?.signedUrl ?? null;

    // Audit logs
    await anon.from("activity_logs").insert({
      user_id: requester.id,
      action: "payment_receipt_generated",
      entity_type: "payment",
      entity_id: paymentId,
      metadata: { path },
    });

    return new Response(JSON.stringify({ ok: true, url: signedUrl, path }), { status: 200, headers });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return new Response(JSON.stringify({ error: msg }), { status: 500, headers });
  }
});