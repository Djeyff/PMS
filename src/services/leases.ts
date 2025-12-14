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

export async function fetchLeases(params: { role: Role | null; userId: string | null; agencyId: string | null; }) {
  const { role, userId, agencyId } = params;
  if (!role) return [];

  // RLS will enforce correct visibility; for admins we optionally filter by agency's properties
  if (role === "agency_admin") {
    if (!agencyId) return [];
    const { data, error } = await supabase
      .from("leases")
      .select("id, property_id, tenant_id, start_date, end_date, rent_amount, rent_currency, deposit_amount, status, created_at")
      .order("created_at", { ascending: false });
    if (error) throw error;
    return (data ?? []) as LeaseRow[];
  }

  if (role === "owner") {
    // Owner will see leases for properties they own via RLS
    const { data, error } = await supabase
      .from("leases")
      .select("id, property_id, tenant_id, start_date, end_date, rent_amount, rent_currency, deposit_amount, status, created_at")
      .order("created_at", { ascending: false });
    if (error) throw error;
    return (data ?? []) as LeaseRow[];
  }

  if (role === "tenant") {
    if (!userId) return [];
    const { data, error } = await supabase
      .from("leases")
      .select("id, property_id, tenant_id, start_date, end_date, rent_amount, rent_currency, deposit_amount, status, created_at")
      .eq("tenant_id", userId)
      .order("created_at", { ascending: false });
    if (error) throw error;
    return (data ?? []) as LeaseRow[];
  }

  return [];
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
    .select("id, property_id, tenant_id, start_date, end_date, rent_amount, rent_currency, deposit_amount, status, created_at")
    .single();

  if (error) throw error;
  return data as LeaseRow;
}