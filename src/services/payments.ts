import { supabase } from "@/integrations/supabase/client";
import type { Role } from "@/contexts/AuthProvider";

export type PaymentRow = {
  id: string;
  lease_id: string;
  tenant_id: string;
  amount: number;
  currency: "USD" | "DOP";
  method: string;
  received_date: string;
  reference: string | null;
  created_at: string;
  invoice_id?: string | null;
  exchange_rate?: number | null;
};

export type PaymentWithMeta = PaymentRow & {
  lease?: { id: string; property?: { id: string; name: string } | null } | null;
  tenant?: { id: string; first_name: string | null; last_name: string | null; phone?: string | null } | null;
};

function normalizePaymentRow(row: any): PaymentWithMeta {
  let leaseRel: any = Array.isArray(row.lease) ? row.lease[0] : row.lease ?? null;
  if (leaseRel && Array.isArray(leaseRel.property)) {
    leaseRel = { ...leaseRel, property: leaseRel.property[0] ?? null };
  }
  const tenantRel = Array.isArray(row.tenant) ? row.tenant[0] : row.tenant ?? null;

  return {
    id: row.id,
    lease_id: row.lease_id,
    tenant_id: row.tenant_id,
    amount: row.amount,
    currency: row.currency,
    method: row.method,
    received_date: row.received_date,
    reference: row.reference,
    created_at: row.created_at,
    invoice_id: row.invoice_id ?? null,
    exchange_rate: typeof row.exchange_rate === "number" ? row.exchange_rate : row.exchange_rate == null ? null : Number(row.exchange_rate),
    lease: leaseRel
      ? {
          id: leaseRel.id,
          property: leaseRel.property ? { id: leaseRel.property.id, name: leaseRel.property.name } : null,
        }
      : null,
    tenant: tenantRel ? { id: tenantRel.id, first_name: tenantRel.first_name ?? null, last_name: tenantRel.last_name ?? null, phone: tenantRel.phone ?? null } : null,
  };
}

export async function fetchPayments(params: { role: Role | null; userId: string | null; agencyId: string | null }) {
  const { role } = params;
  if (!role) return [];
  const { data, error } = await supabase
    .from("payments")
    .select(`
      id, lease_id, tenant_id, amount, currency, method, received_date, reference, created_at, invoice_id, exchange_rate,
      lease:leases ( id, property:properties ( id, name ) ),
      tenant:profiles ( id, first_name, last_name, phone )
    `)
    .order("received_date", { ascending: false });
  if (error) throw error;

  return (data ?? []).map(normalizePaymentRow);
}

export async function fetchPaymentsByTenant(tenantId: string) {
  const { data, error } = await supabase
    .from("payments")
    .select("id, lease_id, tenant_id, amount, currency, method, received_date, reference, created_at, invoice_id, exchange_rate")
    .eq("tenant_id", tenantId)
    .order("received_date", { ascending: true });

  if (error) throw error;
  return (data ?? []).map((row: any) => row as PaymentRow);
}

export async function fetchPaymentsByTenantWithRelations(tenantId: string) {
  const { data, error } = await supabase
    .from("payments")
    .select(`
      id, lease_id, tenant_id, amount, currency, method, received_date, reference, created_at, invoice_id, exchange_rate,
      lease:leases ( id, property:properties ( id, name ) ),
      tenant:profiles ( id, first_name, last_name )
    `)
    .eq("tenant_id", tenantId)
    .order("received_date", { ascending: true });

  if (error) throw error;
  return (data ?? []).map(normalizePaymentRow);
}

export async function createPayment(input: {
  lease_id: string;
  tenant_id: string;
  amount: number;
  currency: "USD" | "DOP";
  method: string;
  received_date: string;
  reference?: string;
  invoice_id?: string;
  exchange_rate?: number;
}) {
  const payload = {
    lease_id: input.lease_id,
    tenant_id: input.tenant_id,
    amount: input.amount,
    currency: input.currency,
    method: input.method,
    received_date: input.received_date,
    reference: input.reference ?? null,
    invoice_id: input.invoice_id ?? null,
    exchange_rate: typeof input.exchange_rate === "number" ? input.exchange_rate : null,
  };

  const { data, error } = await supabase
    .from("payments")
    .insert(payload)
    .select("id, lease_id, tenant_id, amount, currency, method, received_date, reference, created_at, invoice_id, exchange_rate")
    .single();

  if (error) throw error;

  // After successful insert, fire server-side email notification (does not block the flow)
  try {
    const { data: sess } = await supabase.auth.getSession();
    const token = sess.session?.access_token;
    if (token) {
      const url = "https://tsfswvmwkfairaoccfqa.supabase.co/functions/v1/notify-payment";
      await fetch(url, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ id: data.id }),
      });
    } else {
      // No session token; skip notification silently
      console.warn("[payments.createPayment] No session token, skipping notify-payment");
    }
  } catch (e) {
    // Log but do not break payment creation
    console.error("[payments.createPayment] notify-payment failed", e);
  }

  return data as PaymentRow;
}

export async function updatePayment(
  id: string,
  input: Partial<{
    amount: number;
    currency: "USD" | "DOP";
    method: string;
    received_date: string;
    reference: string | null;
    invoice_id: string | null;
    exchange_rate: number | null;
  }>
) {
  const payload: any = {};
  if (typeof input.amount !== "undefined") payload.amount = input.amount;
  if (typeof input.currency !== "undefined") payload.currency = input.currency;
  if (typeof input.method !== "undefined") payload.method = input.method;
  if (typeof input.received_date !== "undefined") payload.received_date = input.received_date;
  if (typeof input.reference !== "undefined") payload.reference = input.reference;
  if (typeof input.invoice_id !== "undefined") payload.invoice_id = input.invoice_id;
  if (typeof input.exchange_rate !== "undefined") payload.exchange_rate = input.exchange_rate;

  const { data, error } = await supabase
    .from("payments")
    .update(payload)
    .eq("id", id)
    .select(`
      id, lease_id, tenant_id, amount, currency, method, received_date, reference, created_at, invoice_id, exchange_rate,
      lease:leases ( id, property:properties ( id, name ) ),
      tenant:profiles ( id, first_name, last_name )
    `)
    .single();

  if (error) throw error;
  return normalizePaymentRow(data);
}

export async function deletePayment(id: string) {
  const { data: sess } = await supabase.auth.getSession();
  const token = sess.session?.access_token;
  if (!token) throw new Error("Not authenticated");

  const url = "https://tsfswvmwkfairaoccfqa.supabase.co/functions/v1/delete-payment";
  const res = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ id }),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err?.error || `Failed to delete payment (${res.status})`);
  }

  const out = await res.json().catch(() => ({}));
  if (!out?.ok) {
    throw new Error("Failed to delete payment");
  }
  return true;
}