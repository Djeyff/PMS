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
};

export type PaymentWithMeta = PaymentRow & {
  lease?: { id: string; property?: { id: string; name: string } | null } | null;
  tenant?: { id: string; first_name: string | null; last_name: string | null } | null;
};

export async function fetchPayments(params: { role: Role | null; userId: string | null; agencyId: string | null }) {
  const { role } = params;
  if (!role) return [];
  const { data, error } = await supabase
    .from("payments")
    .select(`
      id, lease_id, tenant_id, amount, currency, method, received_date, reference, created_at,
      lease:leases (
        id,
        property:properties ( id, name )
      ),
      tenant:profiles ( id, first_name, last_name )
    `)
    .order("received_date", { ascending: false });
  if (error) throw error;
  return (data ?? []) as PaymentWithMeta[];
}

export async function createPayment(input: {
  lease_id: string;
  tenant_id: string;
  amount: number;
  currency: "USD" | "DOP";
  method: string;
  received_date: string;
  reference?: string;
}) {
  const payload = {
    lease_id: input.lease_id,
    tenant_id: input.tenant_id,
    amount: input.amount,
    currency: input.currency,
    method: input.method,
    received_date: input.received_date,
    reference: input.reference ?? null,
  };

  const { data, error } = await supabase
    .from("payments")
    .insert(payload)
    .select("id, lease_id, tenant_id, amount, currency, method, received_date, reference, created_at")
    .single();

  if (error) throw error;
  return data as PaymentRow;
}