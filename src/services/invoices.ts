import { supabase } from "@/integrations/supabase/client";

export type InvoiceRow = {
  id: string;
  lease_id: string;
  tenant_id: string;
  number: string | null;
  issue_date: string;
  due_date: string;
  currency: "USD" | "DOP";
  total_amount: number;
  status: "draft" | "sent" | "partial" | "paid" | "overdue" | "void";
  created_at: string;
  pdf_lang?: "en" | "es";
  // NOTE: This field will now store a storage path (not a public URL)
  pdf_url?: string | null;
};

export type InvoiceWithMeta = InvoiceRow & {
  lease?: { id: string; property?: { id: string; name: string; agency_id?: string } | null } | null;
  tenant?: { id: string; first_name: string | null; last_name: string | null } | null;
  payments?: { amount: number; currency: "USD" | "DOP" }[] | null;
  // Computed property for convenience
  signed_pdf_url?: string | null;
};

function normalizeInvoiceRow(row: any): InvoiceWithMeta {
  let leaseRel: any = Array.isArray(row.lease) ? row.lease[0] : row.lease ?? null;
  if (leaseRel && Array.isArray(leaseRel.property)) {
    leaseRel = { ...leaseRel, property: leaseRel.property[0] ?? null };
  }
  const tenantRel = Array.isArray(row.tenant) ? row.tenant[0] : row.tenant ?? null;

  return {
    id: row.id,
    lease_id: row.lease_id,
    tenant_id: row.tenant_id,
    number: row.number ?? null,
    issue_date: row.issue_date,
    due_date: row.due_date,
    currency: row.currency,
    total_amount: row.total_amount,
    status: row.status,
    created_at: row.created_at,
    pdf_lang: row.pdf_lang === "es" ? "es" : "en",
    // pdf_url now holds storage path (if any)
    pdf_url: row.pdf_url ?? null,
    lease: leaseRel
      ? {
          id: leaseRel.id,
          property: leaseRel.property
            ? { id: leaseRel.property.id, name: leaseRel.property.name, agency_id: leaseRel.property.agency_id }
            : null,
        }
      : null,
    tenant: tenantRel ? { id: tenantRel.id, first_name: tenantRel.first_name ?? null, last_name: tenantRel.last_name ?? null } : null,
    payments: row.payments ?? [],
    signed_pdf_url: null,
  };
}

export async function fetchInvoices() {
  const { data, error } = await supabase
    .from("invoices")
    .select(`
      id, lease_id, tenant_id, number, issue_date, due_date, currency, total_amount, status, created_at, pdf_lang, pdf_url,
      lease:leases (
        id,
        property:properties ( id, name, agency_id )
      ),
      tenant:profiles ( id, first_name, last_name ),
      payments:payments ( amount, currency )
    `)
  .order("due_date", { ascending: true });

  if (error) throw error;
  return (data ?? []).map(normalizeInvoiceRow);
}

function autoNumber(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  const rand = Math.random().toString(36).slice(2, 6).toUpperCase();
  return `FAC-${y}${m}${day}-${rand}`;
}

export async function createInvoice(input: {
  lease_id: string;
  tenant_id: string;
  number?: string | null;
  issue_date: string;
  due_date: string;
  currency: "USD" | "DOP";
  total_amount: number;
  status?: InvoiceRow["status"];
}) {
  const payload = {
    lease_id: input.lease_id,
    tenant_id: input.tenant_id,
    number: input.number && input.number.trim() !== "" ? input.number : autoNumber(),
    issue_date: input.issue_date,
    due_date: input.due_date,
    currency: input.currency,
    total_amount: input.total_amount,
    status: input.status ?? "sent",
    pdf_lang: "en",
    // store null until generated; when generated, it will hold the storage path
    pdf_url: null,
  };

  const { data, error } = await supabase
    .from("invoices")
    .insert(payload)
    .select(`
      id, lease_id, tenant_id, number, issue_date, due_date, currency, total_amount, status, created_at, pdf_lang, pdf_url,
      lease:leases (
        id,
        property:properties ( id, name )
      ),
      tenant:profiles ( id, first_name, last_name ),
      payments:payments ( amount, currency )
    `)
    .single();

  if (error) throw error;
  return normalizeInvoiceRow(data);
}

export async function updateInvoice(
  id: string,
  input: Partial<{
    number: string | null;
    issue_date: string;
    due_date: string;
    currency: "USD" | "DOP";
    total_amount: number;
    status: InvoiceRow["status"];
    pdf_lang: "en" | "es";
    pdf_url: string | null; // storage path
  }>
) {
  const payload: any = {};
  if (typeof input.number !== "undefined") payload.number = input.number;
  if (typeof input.issue_date !== "undefined") payload.issue_date = input.issue_date;
  if (typeof input.due_date !== "undefined") payload.due_date = input.due_date;
  if (typeof input.currency !== "undefined") payload.currency = input.currency;
  if (typeof input.total_amount !== "undefined") payload.total_amount = input.total_amount;
  if (typeof input.status !== "undefined") payload.status = input.status;
  if (typeof input.pdf_lang !== "undefined") payload.pdf_lang = input.pdf_lang;
  if (typeof input.pdf_url !== "undefined") payload.pdf_url = input.pdf_url;

  const { data, error } = await supabase
    .from("invoices")
    .update(payload)
    .eq("id", id)
    .select(`
      id, lease_id, tenant_id, number, issue_date, due_date, currency, total_amount, status, created_at, pdf_lang, pdf_url,
      lease:leases (
        id,
        property:properties ( id, name )
      ),
      tenant:profiles ( id, first_name, last_name ),
      payments:payments ( amount, currency )
    `)
    .single();

  if (error) throw error;
  return normalizeInvoiceRow(data);
}

export async function deleteInvoice(id: string) {
  const { error } = await supabase.from("invoices").delete().eq("id", id);
  if (error) throw error;
  return true;
}

export async function fetchPendingInvoicesByLease(leaseId: string) {
  const { data, error } = await supabase
    .from("invoices")
    .select(`
      id, number, lease_id, tenant_id, due_date, currency, total_amount, status,
      tenant:profiles ( first_name, last_name )
    `)
    .eq("lease_id", leaseId)
    .in("status", ["sent", "partial", "overdue"])
    .order("due_date", { ascending: true });
  if (error) throw error;
  return (data ?? []).map((row: any) => {
    const tenantRel = Array.isArray(row.tenant) ? row.tenant[0] : row.tenant ?? null;
    return { ...row, tenant: tenantRel };
  });
}

// Generate a short-lived signed URL for a stored invoice PDF path
export async function getInvoiceSignedUrl(storagePath: string, expiresInSeconds = 600) {
  if (!storagePath) return null;
  const { data, error } = await supabase.storage.from("invoices").createSignedUrl(storagePath, expiresInSeconds);
  if (error) throw error;
  return data?.signedUrl ?? null;
}

export async function generateInvoicePDF(invoiceId: string, lang: "en" | "es", opts: { sendEmail?: boolean; sendWhatsApp?: boolean } = {}) {
  const { data: sess } = await supabase.auth.getSession();
  const token = sess.session?.access_token;
  if (!token) throw new Error("Not authenticated");

  const url = "https://tsfswvmwkfairaoccfqa.supabase.co/functions/v1/invoice-pdf";
  const res = await fetch(url, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ invoiceId, lang, sendEmail: !!opts.sendEmail, sendWhatsApp: !!opts.sendWhatsApp }),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err?.error || `Generate invoice PDF failed (${res.status})`);
  }

  return (await res.json()) as { ok: true; url: string | null; path: string };
}

export async function generateSpanishInvoicePDF(invoiceId: string, opts: { sendEmail?: boolean; sendWhatsApp?: boolean } = {}) {
  const { data: sess } = await supabase.auth.getSession();
  const token = sess.session?.access_token;
  if (!token) throw new Error("Not authenticated");

  const url = "https://tsfswvmwkfairaoccfqa.supabase.co/functions/v1/invoice-pdf";
  const res = await fetch(url, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ invoiceId, sendEmail: !!opts.sendEmail, sendWhatsApp: !!opts.sendWhatsApp }),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err?.error || `Generate invoice PDF failed (${res.status})`);
  }

  return (await res.json()) as { ok: true; url: string | null; path: string };
}