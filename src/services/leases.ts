import { supabase } from "@/integrations/supabase/client";
import type { Role } from "@/contexts/AuthProvider";

export type LeaseRow = {
  id: string;
  property_id: string;
  tenant_id: string;
  start_date: string;
  end_date: string;
  rent_amount: number;
  rent_currency: "USD" | "DOP";
  deposit_amount: number | null;
  status: "draft" | "active" | "pending_renewal" | "expired" | "terminated";
  created_at: string;
};

export type LeaseWithMeta = LeaseRow & {
  property?: { id: string; name: string } | null;
  tenant?: { id: string; first_name: string | null; last_name: string | null } | null;
};

export async function fetchLeases(params: { role: Role | null; userId: string | null; agencyId: string | null; }) {
  const { role, userId, agencyId } = params;
  if (!role) return [];

  const { data, error } = await supabase
    .from("leases")
    .select(`
      id, property_id, tenant_id, start_date, end_date, rent_amount, rent_currency, deposit_amount, status, created_at,
      property:properties ( id, name ),
      tenant:profiles ( id, first_name, last_name )
    `)
    .order("created_at", { ascending: false });

  if (error) throw error;
  return (data ?? []) as LeaseWithMeta[];
}

export async function createLease(input: {
  property_id: string;
  tenant_id: string;
  start_date: string;
  end_date: string;
  rent_amount: number;
  rent_currency: "USD" | "DOP";
  deposit_amount?: number;
  status?: "draft" | "active" | "pending_renewal" | "expired" | "terminated";
}) {
  const payload = {
    property_id: input.property_id,
    tenant_id: input.tenant_id,
    start_date: input.start_date,
    end_date: input.end_date,
    rent_amount: input.rent_amount,
    rent_currency: input.rent_currency,
    deposit_amount: typeof input.deposit_amount === "number" ? input.deposit_amount : null,
    status: input.status ?? "active",
  };

  const { data, error } = await supabase
    .from("leases")
    .insert(payload)
    .select(`
      id, property_id, tenant_id, start_date, end_date, rent_amount, rent_currency, deposit_amount, status, created_at,
      property:properties ( id, name ),
      tenant:profiles ( id, first_name, last_name )
    `)
    .single();

  if (error) throw error;
  return data as LeaseWithMeta;
}

export async function updateLease(
  id: string,
  input: Partial<{
    start_date: string;
    end_date: string;
    rent_amount: number;
    rent_currency: "USD" | "DOP";
    deposit_amount: number | null;
    status: "draft" | "active" | "pending_renewal" | "expired" | "terminated";
  }>
) {
  const payload: any = {};
  if (typeof input.start_date !== "undefined") payload.start_date = input.start_date;
  if (typeof input.end_date !== "undefined") payload.end_date = input.end_date;
  if (typeof input.rent_amount !== "undefined") payload.rent_amount = input.rent_amount;
  if (typeof input.rent_currency !== "undefined") payload.rent_currency = input.rent_currency;
  if (typeof input.deposit_amount !== "undefined") payload.deposit_amount = input.deposit_amount;
  if (typeof input.status !== "undefined") payload.status = input.status;

  const { data, error } = await supabase
    .from("leases")
    .update(payload)
    .eq("id", id)
    .select(`
      id, property_id, tenant_id, start_date, end_date, rent_amount, rent_currency, deposit_amount, status, created_at,
      property:properties ( id, name ),
      tenant:profiles ( id, first_name, last_name )
    `)
    .single();

  if (error) throw error;
  return data as LeaseWithMeta;
}

export async function deleteLease(id: string) {
  const { error } = await supabase.from("leases").delete().eq("id", id);
  if (error) throw error;
  return true;
}