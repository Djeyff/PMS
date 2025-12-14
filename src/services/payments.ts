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

export async function fetchPayments(params: { role: Role | null; userId: string | null; agencyId: string | null }) {
  const { role, userId } = params;
  if (!role) return [];
  // RLS restricts rows appropriately; we fetch consistently for any role
  const { data, error } = await supabase
    .from("payments")
    .select("id, lease_id, tenant_id, amount, currency, method, received_date, reference, created_at")
    .order("received_date", { ascending: false });
  if (error) throw error;
  return (data ?? []) as PaymentRow[];
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