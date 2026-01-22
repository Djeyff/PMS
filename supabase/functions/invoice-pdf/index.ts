// @ts-nocheck

import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { PDFDocument, StandardFonts, rgb } from "https://esm.sh/pdf-lib@1.17.1";

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

function hexToRgb(hex: string) {
  const s = hex.replace("#", "");
  const r = parseInt(s.substring(0, 2), 16) / 255;
  const g = parseInt(s.substring(2, 4), 16) / 255;
  const b = parseInt(s.substring(4, 6), 16) / 255;
  return rgb(r, g, b);
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
    billedTo: "Facturado a",
    property: "Propiedad",
    issue: "Fecha de emisión",
    due: "Fecha de vencimiento",
    description: "Descripción",
    leaseInvoice: "Factura de contrato",
    amount: "Importe",
    totalToPay: "Total a pagar",
    paid: "Pagado",
    exchange: "Tasa de Cambio",
    method: "Método de pago",
    balance: "Saldo",
    prevBalance: "Saldo previo (mismo inquilino)",
    overallBalance: "Saldo total (incluye esta factura)",
    monthOf: "Para el mes de",
    receipt: "Recibo",
    invoice: "Factura",
    paymentDate: "Fecha de pago",
    emailSubject: (n: string) => `Factura ${n}`,
    emailText: (prop: string, tenant: string, amountText: string) =>
      `Estimado equipo,\n\nAdjuntamos la factura generada:\nPropiedad: ${prop}\nInquilino: ${tenant}\nImporte: ${amountText}\n\nGracias,\n${agencyName}`,
  } : {
    title: "Invoice",
    billedTo: "Billed To",
    property: "Property",
    issue: "Issue Date",
    due: "Due Date",
    description: "Description",
    leaseInvoice: "Lease invoice",
    amount: "Amount",
    totalToPay: "Amount to be Paid",
    paid: "Paid",
    exchange: "Exchange Rate",
    method: "Payment Method",
    balance: "Balance",
    prevBalance: "Previous balance (same tenant)",
    overallBalance: "Overall balance (includes this invoice)",
    monthOf: "For month of",
    receipt: "Receipt",
    invoice: "Invoice",
    paymentDate: "Payment date",
    emailSubject: (n: string) => `Invoice ${n}`,
    emailText: (prop: string, tenant: string, amountText: string) =>
      `Dear team,\n\nAttached is the generated invoice:\nProperty: ${prop}\nTenant: ${tenant}\nAmount: ${amountText}\n\nRegards,\n${agencyName}`,
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
  };

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
    const list = payments.map((p: any) => formatMethod(p.method, lang)).filter(Boolean);
    const uniq = Array.from(new Set(list));
    return uniq.length ? uniq.join(", ") : "—";
  })();
  const exchangeRateDisplay = (() => {
    const diffPay = payments.find((p: any) => p.exchange_rate && p.currency !== currency);
    return diffPay?.exchange_rate ? String(diffPay.exchange_rate) : "—";
  })();
  // Unique, sorted payment dates (YYYY-MM-DD)
  const paymentDatesText = (() => {
    const raw = (payments ?? [])
      .map((p: any) => p.received_date)
      .filter((d: any) => typeof d === "string");
    const uniqSorted = Array.from(new Set(raw)).sort();
    return uniqSorted.length ? uniqSorted.join(", ") : "—";
  })();

  const balance = amount - paidConverted;

  // Previous & overall balances (match InvoiceDetail)
  const tenantIdForBalances = invMeta.tenant_id;
  let previousBalance = 0;
  let overallBalance = 0;
  if (tenantIdForBalances) {
    const { data: tenantInvs } = await service
      .from("invoices")
      .select("id, issue_date, currency, total_amount")
      .eq("tenant_id", tenantIdForBalances);

    const { data: tenantPays } = await service
      .from("payments")
      .select("amount, currency, exchange_rate, received_date, tenant_id")
      .eq("tenant_id", tenantIdForBalances);

    const invCurrency = currency as "USD" | "DOP";
    const invIssue = issueDate;

    const convertToInvCur = (amt: number, cur: "USD" | "DOP", rate: number | null) => {
      if (cur === invCurrency) return amt;
      if (!rate || rate <= 0) return 0;
      if (invCurrency === "USD" && cur === "DOP") return amt / rate;
      if (invCurrency === "DOP" && cur === "USD") return amt * rate;
      return 0;
    };

    const prevTotals = (tenantInvs ?? [])
      .filter((i: any) => i.currency === invCurrency && i.issue_date < invIssue && i.id !== inv.id)
      .reduce((s: number, i: any) => s + Number(i.total_amount || 0), 0);

    const prevPaymentsConverted = (tenantPays ?? [])
      .filter((p: any) => p.received_date < invIssue)
      .reduce((s: number, p: any) => s + convertToInvCur(Number(p.amount || 0), p.currency, typeof p.exchange_rate === "number" ? p.exchange_rate : null), 0);

    previousBalance = prevPaymentsConverted - prevTotals;

    const allTotalsToDate = (tenantInvs ?? [])
      .filter((i: any) => i.currency === invCurrency && i.issue_date <= invIssue)
      .reduce((s: number, i: any) => s + Number(i.total_amount || 0), 0);

    const allPaymentsToDateConverted = (tenantPays ?? [])
      .filter((p: any) => p.received_date <= invIssue)
      .reduce((s: number, p: any) => s + convertToInvCur(Number(p.amount || 0), p.currency, typeof p.exchange_rate === "number" ? p.exchange_rate : null), 0);

    overallBalance = allPaymentsToDateConverted - allTotalsToDate;
  }

  const today = new Date().toISOString().slice(0, 10);
  let displayStatus: string = inv.status || "sent";
  if (balance <= 0) displayStatus = "paid";
  else if (dueDate < today && inv.status !== "void") displayStatus = "overdue";
  else if (paidConverted > 0) displayStatus = "partial";

  try {
    const pdf = await PDFDocument.create();
    // Letter size: 8.5in x 11in = 612 x 792 points
    const W = 612;
    const H = 792;
    const M = 36; // 0.5" margins
    const page = pdf.addPage([W, H]);
    const font = await pdf.embedFont(StandardFonts.Helvetica);
    const fontBold = await pdf.embedFont(StandardFonts.HelveticaBold);

    // Colors to match Tailwind UI
    const COL_TEXT = rgb(0, 0, 0);
    const COL_MUTED = hexToRgb("#4B5563"); // gray-600
    const COL_BORDER = hexToRgb("#E5E7EB"); // gray-200 (tailwind border in light mode)
    const COL_GRAY50 = hexToRgb("#F9FAFB"); // gray-50

    function measure(text: string, size: number, f = font) {
      return f.widthOfTextAtSize(text, size);
    }
    function drawTextRight(text: string, xRight: number, y: number, size: number, f = font, color = COL_TEXT) {
      const w = f.widthOfTextAtSize(text, size);
      page.drawText(text, { x: xRight - w, y, size, font: f, color });
    }
    // Add a helper to wrap text within a maximum width and return height used
    function drawWrappedText({
      text,
      x,
      y,
      maxWidth,
      size,
      f = font,
      color = COL_TEXT,
      lineGap = 3,
    }: {
      text: string;
      x: number;
      y: number;
      maxWidth: number;
      size: number;
      f?: any;
      color?: any;
      lineGap?: number;
    }) {
      const words = String(text || "").split(/\s+/);
      const lines: string[] = [];
      let line = "";
      for (const w of words) {
        const test = line ? line + " " + w : w;
        const width = f.widthOfTextAtSize(test, size);
        if (width <= maxWidth || line === "") {
          line = test;
        } else {
          lines.push(line);
          line = w;
        }
      }
      if (line) lines.push(line);
      const lineHeight = size + lineGap;
      lines.forEach((ln, i) => {
        page.drawText(ln, { x, y: y - i * lineHeight, size, font: f, color });
      });
      return lines.length * lineHeight - lineGap;
    }

    // Header: logo + agency name/address on left, titles on right
    let yCursor = H - M;

    // Left brand block
    const logoBytes = await getLogoBytes();
    let leftBlockX = M;
    let textX = leftBlockX;
    let blockTop = yCursor;

    if (logoBytes) {
      try {
        const img = await pdf.embedPng(logoBytes);
        const w = 32; // small logo height like UI
        const ratio = img.height / img.width || 1;
        const h = w * ratio;
        page.drawImage(img, { x: leftBlockX, y: blockTop - h, width: w, height: h });
        textX = leftBlockX + w + 8;
        // agency name
        page.drawText(agencyName, { x: textX, y: blockTop - 12, size: 12, font: fontBold });
        page.drawText(agencyAddress, { x: textX, y: blockTop - 26, size: 9, font, color: COL_MUTED });
      } catch {
        page.drawText(agencyName, { x: textX, y: blockTop - 12, size: 12, font: fontBold });
        page.drawText(agencyAddress, { x: textX, y: blockTop - 26, size: 9, font, color: COL_MUTED });
      }
    } else {
      page.drawText(agencyName, { x: textX, y: blockTop - 12, size: 12, font: fontBold });
      page.drawText(agencyAddress, { x: textX, y: blockTop - 26, size: 9, font, color: COL_MUTED });
    }

    // Title: show only Factura/Invoice
    drawTextRight(lang === "es" ? "Factura" : "Invoice", W - M, blockTop - 10, 18, fontBold);

    // Move cursor below header
    yCursor = blockTop - 52;

    // Info grid (two columns) matching screen labels
    const leftLabelX = M;
    const leftValueX = M + 120;
    const rightLabelX = W / 2 + 24;
    const rightValueX = rightLabelX + 120;

    // Month text (capitalize first letter in ES to match UI)
    const monthText = (() => {
      const iso = issueDate;
      if (!iso) return "—";
      const d = new Date(iso);
      let m = d.toLocaleString(lang === "es" ? "es-ES" : "en-US", { month: "long" });
      if (lang === "es" && m) m = m.charAt(0).toUpperCase() + m.slice(1);
      const y = String(d.getFullYear());
      return lang === "es" ? `${m} ${y.slice(-2)}` : `${m} ${y}`;
    })();

    // Left column
    page.drawText(lang === "es" ? "Facturado a" : "Billed to", { x: leftLabelX, y: yCursor, size: 10, font, color: COL_MUTED });
    page.drawText(tenantName, { x: leftValueX, y: yCursor, size: 11, font: fontBold });
    yCursor -= 16;

    page.drawText(lang === "es" ? "Para" : "For", { x: leftLabelX, y: yCursor, size: 10, font, color: COL_MUTED });
    page.drawText(propertyName, { x: leftValueX, y: yCursor, size: 11, font });
    yCursor -= 16;

    // Right column (stays on first row baseline)
    page.drawText(lang === "es" ? "Fecha" : "Date", { x: rightLabelX, y: blockTop - 52, size: 10, font, color: COL_MUTED });
    page.drawText(issueDate, { x: rightValueX, y: blockTop - 52, size: 11, font });

    page.drawText(t.due, { x: rightLabelX, y: blockTop - 68, size: 10, font, color: COL_MUTED });
    page.drawText(dueDate, { x: rightValueX, y: blockTop - 68, size: 11, font });

    page.drawText(t.monthOf, { x: rightLabelX, y: blockTop - 84, size: 10, font, color: COL_MUTED });
    page.drawText(monthText, { x: rightValueX, y: blockTop - 84, size: 11, font });

    // Move below info rows
    yCursor = Math.min(yCursor, blockTop - 100) - 16;

    // Summary table (5 columns) with gray header and full border
    const tableX = M;
    const tableW = W - M * 2;
    const cols = 5;
    const colW = tableW / cols;
    const headerH = 20;
    const rowH = 22;

    // Outer border
    page.drawRectangle({
      x: tableX,
      y: yCursor - headerH - rowH - 4,
      width: tableW,
      height: headerH + rowH + 4,
      borderColor: COL_BORDER,
      borderWidth: 1,
    });

    // Header background
    page.drawRectangle({
      x: tableX,
      y: yCursor - headerH,
      width: tableW,
      height: headerH,
      color: COL_GRAY50,
      borderColor: COL_BORDER,
      borderWidth: 0.5,
    });

    // Header labels
    const headers = [
      lang === "es" ? "Alquiler DOP" : "Rent DOP",
      lang === "es" ? "Alquiler USD" : "Rent USD",
      lang === "es" ? "Importe Anterior USD" : "Overdue USD",
      lang === "es" ? "Importe Anterior DOP" : "Overdue DOP",
      lang === "es" ? "Fin del contrato" : "Lease End Date",
    ];
    headers.forEach((h, i) => {
      page.drawText(h, {
        x: tableX + i * colW + 6,
        y: yCursor - headerH + 6,
        size: 9,
        font: fontBold,
        color: COL_MUTED,
      });
    });

    // Row separator
    page.drawLine({
      start: { x: tableX, y: yCursor - headerH },
      end: { x: tableX + tableW, y: yCursor - headerH },
      color: COL_BORDER,
      thickness: 1,
    });

    // Vertical lines
    for (let i = 1; i < cols; i++) {
      const x = tableX + i * colW;
      // Keep the vertical lines inside the outer border (avoid overshoot)
      const topY = yCursor; // top edge of the outer border
      const bottomY = yCursor - headerH - rowH - 4; // bottom edge of the outer border
      const inset = 1; // stay within the 1pt border
      page.drawLine({
        start: { x, y: bottomY + inset },
        end: { x, y: topY - inset },
        color: COL_BORDER,
        thickness: 1,
      });
    }

    // Row values
    const rentUsd = currency === "USD" ? amount : 0;
    const rentDop = currency === "DOP" ? amount : 0;
    const prevUsd = currency === "USD" ? Math.max(0, previousBalance) : 0;
    const prevDop = currency === "DOP" ? Math.max(0, previousBalance) : 0;

    const rowY = yCursor - headerH - 14;
    const values = [
      rentDop ? new Intl.NumberFormat(lang === "es" ? "es-ES" : "en-US", { style: "currency", currency: "DOP" }).format(rentDop) : "—",
      rentUsd ? new Intl.NumberFormat(lang === "es" ? "es-ES" : "en-US", { style: "currency", currency: "USD" }).format(rentUsd) : "—",
      prevUsd ? new Intl.NumberFormat(lang === "es" ? "es-ES" : "en-US", { style: "currency", currency: "USD" }).format(prevUsd) : "—",
      prevDop ? new Intl.NumberFormat(lang === "es" ? "es-ES" : "en-US", { style: "currency", currency: "DOP" }).format(prevDop) : "—",
      contractExpiry ?? "—",
    ];
    values.forEach((v, i) => {
      page.drawText(v, { x: tableX + i * colW + 6, y: rowY, size: 10, font });
    });

    // Move cursor below table
    yCursor = yCursor - headerH - rowH - 24;

    // Line items block with border and header row
    const liX = M;
    const liW = W - M * 2;
    const liHeaderH = 24;
    const liRowH = 22;

    // Outer border
    page.drawRectangle({
      x: liX,
      y: yCursor - liHeaderH - liRowH,
      width: liW,
      height: liHeaderH + liRowH,
      borderColor: COL_BORDER,
      borderWidth: 1,
    });

    // Header row separator
    page.drawLine({
      start: { x: liX, y: yCursor - liHeaderH },
      end: { x: liX + liW, y: yCursor - liHeaderH },
      color: COL_BORDER,
      thickness: 1,
    });

    // Header labels
    page.drawText(t.description, { x: liX + 8, y: yCursor - 16, size: 11, font: fontBold });
    drawTextRight(t.amount, liX + liW - 8, yCursor - 16, 11, fontBold);

    // Row
    page.drawText(t.leaseInvoice, { x: liX + 8, y: yCursor - liHeaderH - 14, size: 11, font });
    drawTextRight(fmt(amount, currency), liX + liW - 8, yCursor - liHeaderH - 14, 11, font);

    // Move cursor below line item
    yCursor = yCursor - liHeaderH - liRowH - 18;

    // Two cards (gray bg) side-by-side
    const gap = 16;
    const cardW = (W - M * 2 - gap) / 2;
    const cardH = 164;

    // Left card background
    page.drawRectangle({ x: M, y: yCursor - cardH, width: cardW, height: cardH, color: COL_GRAY50, borderColor: COL_GRAY50 });
    // Right card background
    page.drawRectangle({ x: M + cardW + gap, y: yCursor - cardH, width: cardW, height: cardH, color: COL_GRAY50, borderColor: COL_GRAY50 });

    // Left card content
    let lx = M + 12;
    let ly = yCursor - 18;
    page.drawText(`${t.totalToPay} :`, { x: lx, y: ly, size: 11, font: fontBold }); ly -= 16;
    page.drawText(fmt(amount, currency), { x: lx, y: ly, size: 13, font: fontBold }); ly -= 18;

    page.drawText(`${t.paid} :`, { x: lx, y: ly, size: 11, font }); ly -= 14;
    page.drawText(fmt(paidConverted, currency), { x: lx, y: ly, size: 11, font }); ly -= 16;
    // Payment dates
    page.drawText(`${t.paymentDate} :`, { x: lx, y: ly, size: 11, font }); ly -= 14;
    page.drawText(paymentDatesText, { x: lx, y: ly, size: 10, font }); ly -= 16;

    page.drawText(`${t.exchange} :`, { x: lx, y: ly, size: 11, font }); ly -= 14;
    page.drawText(exchangeRateDisplay, { x: lx, y: ly, size: 10, font }); ly -= 16;

    page.drawText(`${t.method} :`, { x: lx, y: ly, size: 11, font }); ly -= 14;
    page.drawText(methodsDisplay, { x: lx, y: ly, size: 10, font });

    // Right card content
    let rx = M + cardW + gap + 12;
    let ry = yCursor - 18;
    const valueRightX = M + cardW + gap + cardW - 12;

    // Previous balance row (wrapped label)
    {
      const prevValText = fmt(previousBalance, currency);
      const prevValW = font.widthOfTextAtSize(prevValText, 11);
      const labelMaxW = Math.max(60, valueRightX - prevValW - 8 - rx);
      const usedH = drawWrappedText({
        text: t.prevBalance,
        x: rx,
        y: ry,
        maxWidth: labelMaxW,
        size: 11,
        f: font,
        color: COL_MUTED,
        lineGap: 2,
      });
      drawTextRight(prevValText, valueRightX, ry, 11, font);
      ry -= Math.max(16, usedH + 2);
    }

    // Overall balance row (wrapped label, bold)
    {
      const overallValText = fmt(overallBalance, currency);
      const overallValW = fontBold.widthOfTextAtSize(overallValText, 11);
      const labelMaxW = Math.max(60, valueRightX - overallValW - 8 - rx);
      const overallUsedH = drawWrappedText({
        text: t.overallBalance,
        x: rx,
        y: ry,
        maxWidth: labelMaxW,
        size: 11,
        f: fontBold,
        color: COL_TEXT,
        lineGap: 2,
      });
      drawTextRight(overallValText, valueRightX, ry, 11, fontBold);
      ry -= Math.max(16, overallUsedH + 2);
    }

    // Divider (border-t) before final Balance
    page.drawLine({
      start: { x: M + cardW + gap + 12, y: ry - 6 },
      end:   { x: M + cardW + gap + cardW - 12, y: ry - 6 },
      color: COL_BORDER,
      thickness: 1,
    });
    ry -= 24;

    // Final Balance row (saldo) shown last
    const finalBalanceLabel = lang === "es" ? "Saldo Actual" : "Current Balance";
    page.drawText(`${finalBalanceLabel} :`, { x: rx, y: ry, size: 11, font: fontBold });
    drawTextRight(fmt(balance, currency), valueRightX, ry, 13, fontBold);

    // Move cursor below cards
    yCursor = yCursor - cardH - 20;

    // Reminder block
    page.drawText(lang === "es" ? "Recordatorio" : "Reminder", { x: M, y: yCursor, size: 11, font: fontBold });
    yCursor -= 14;
    page.drawText(
      lang === "es" ? "Por favor, pague antes del día 5 de cada mes." : "Please pay before the 5th of each month.",
      { x: M, y: yCursor, size: 11, font }
    );

    const pdfBytes = await pdf.save();

    // Upload to private invoices bucket
    const bucketName = "invoices";
    const { data: bucketList } = await service.storage.listBuckets();
    const hasBucket = (bucketList ?? []).some((b: any) => b.name === bucketName);
    if (!hasBucket) {
      await service.storage.createBucket(bucketName, { public: false });
    }

    // filename invoicenumber-tenantname-mm-yyyy.pdf
    const sanitize = (s: string) => s.replace(/\s+/g, "-").replace(/[^\p{L}\p{N}\-_.]/gu, "");
    const d = new Date(issueDate);
    const mm = String(d.getMonth() + 1).padStart(2, "0");
    const yyyy = String(d.getFullYear());
    const fileName = `${sanitize(invoiceNumber)}-${sanitize(tenantName)}-${mm}-${yyyy}.pdf`;
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