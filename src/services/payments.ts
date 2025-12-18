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
};

export type PaymentWithMeta = PaymentRow & {
  lease?: { id: string; property?: { id: string; name: string } | null } | null;
  tenant?: { id: string; first_name: string | null; last_name: string | null } | null;
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
    lease: leaseRel
      ? {
          id: leaseRel.id,
          property: leaseRel.property ? { id: leaseRel.property.id, name: leaseRel.property.name } : null,
        }
      : null,
    tenant: tenantRel ? { id: tenantRel.id, first_name: tenantRel.first_name ?? null, last_name: tenantRel.last_name ?? null } : null,
  };
}

export async function fetchPayments(params: { role: Role | null; userId: string | null; agencyId: string | null }) {
  const { role } = params;
  if (!role) return [];
  const { data, error } = await supabase
    .from("payments")
    .select(`
      id, lease_id, tenant_id, amount, currency, method, received_date, reference, created_at,
      lease:leases ( id, property:properties ( id, name ) ),
      tenant:profiles ( id, first_name, last_name )
    `)
    .order("received_date", { ascending: false });
  if (error) throw error;

  return (data ?? []).map(normalizePaymentRow);
}

export async function fetchPaymentsByTenant(tenantId: string) {
  const { data, error } = await supabase
    .from("payments")
    .select("id, lease_id, tenant_id, amount, currency, method, received_date, reference, created_at, invoice_id")
    .eq("tenant_id", tenantId)
    .order("received_date", { ascending: true });

  if (error) throw error;
  return (data ?? []).map((row: any) => row as PaymentRow);
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
  };

  const { data, error } = await supabase
    .from("payments")
    .insert(payload)
    .select("id, lease_id, tenant_id, amount, currency, method, received_date, reference, created_at, invoice_id")
    .single();

  if (error) throw error;
  return data as PaymentRow;
}

export async function deletePayment(id: string) {
  // 1) Try direct RLS-protected delete (agency_admin is allowed by policy)
  const direct = await supabase.from("payments").delete().eq("id", id);
  if (!direct.error) {
    return true;
  }

  // 2) Fallback to edge function with explicit token
  const { data: sess } = await supabase.auth.getSession();
  const token = sess.session?.access_token;
  if (!token) throw new Error(`Not authenticated: ${direct.error.message || "No session"}`);

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
    let detail = "";
    try {
      const err = await res.json();
      detail = err?.error || "";
    } catch {}
    throw new Error(detail || `Failed to delete payment (${res.status})`);
  }

  const out = await res.json().catch(() => ({}));
  if (!out?.ok) {
    throw new Error("Failed to delete payment (edge function returned not ok)");
  }
  return true;
}