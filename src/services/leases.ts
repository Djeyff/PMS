import { supabase } from "@/integrations/supabase/client";
import type { Role } from "@/contexts/AuthProvider";
import { logAction } from "@/services/activity-logs";

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
  auto_invoice_enabled?: boolean;
  auto_invoice_day?: number;
  auto_invoice_interval_months?: number;
  auto_invoice_hour?: number;
  auto_invoice_minute?: number;
  auto_invoice_due_day?: number; // NEW
  contract_kdrive_folder_url?: string | null;
  contract_kdrive_file_url?: string | null;
  annual_increase_enabled?: boolean;
  annual_increase_percent?: number | null;
};

export type LeaseWithMeta = LeaseRow & {
  property?: { id: string; name: string } | null;
  tenant?: { id: string; first_name: string | null; last_name: string | null } | null;
};

function normalizeLeaseRow(row: any): LeaseWithMeta {
  const property = Array.isArray(row?.property) ? row.property[0] : row?.property ?? null;
  const tenant = Array.isArray(row?.tenant) ? row.tenant[0] : row?.tenant ?? null;
  return {
    id: row.id,
    property_id: row.property_id,
    tenant_id: row.tenant_id,
    start_date: row.start_date,
    end_date: row.end_date,
    rent_amount: row.rent_amount,
    rent_currency: row.rent_currency,
    deposit_amount: row.deposit_amount,
    status: row.status,
    created_at: row.created_at,
    auto_invoice_enabled: row.auto_invoice_enabled ?? false,
    auto_invoice_day: typeof row.auto_invoice_day === "number" ? row.auto_invoice_day : 5,
    auto_invoice_interval_months: typeof row.auto_invoice_interval_months === "number" ? row.auto_invoice_interval_months : 1,
    auto_invoice_hour: typeof row.auto_invoice_hour === "number" ? row.auto_invoice_hour : 9,
    auto_invoice_minute: typeof row.auto_invoice_minute === "number" ? row.auto_invoice_minute : 0,
    auto_invoice_due_day: typeof row.auto_invoice_due_day === "number" ? row.auto_invoice_due_day : undefined, // NEW
    contract_kdrive_folder_url: row.contract_kdrive_folder_url ?? null,
    contract_kdrive_file_url: row.contract_kdrive_file_url ?? null,
    annual_increase_enabled: row.annual_increase_enabled ?? false,
    annual_increase_percent: typeof row.annual_increase_percent === "number" ? row.annual_increase_percent : null,
    property: property ? { id: property.id, name: property.name } : null,
    tenant: tenant ? { id: tenant.id, first_name: tenant.first_name ?? null, last_name: tenant.last_name ?? null } : null,
  };
}

export async function fetchLeases(params: { role: Role | null; userId: string | null; agencyId: string | null; }) {
  const { role } = params;
  if (!role) return [];

  const { data, error } = await supabase
    .from("leases")
    .select(`
      id, property_id, tenant_id, start_date, end_date, rent_amount, rent_currency, deposit_amount, status, created_at,
      auto_invoice_enabled, auto_invoice_day, auto_invoice_interval_months, auto_invoice_hour, auto_invoice_minute, auto_invoice_due_day,
      contract_kdrive_folder_url, contract_kdrive_file_url,
      annual_increase_enabled, annual_increase_percent,
      property:properties ( id, name ),
      tenant:profiles ( id, first_name, last_name )
    `)
    .order("created_at", { ascending: false });

  if (error) throw error;
  return (data ?? []).map(normalizeLeaseRow);
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
  auto_invoice_enabled?: boolean;
  auto_invoice_day?: number;
  auto_invoice_interval_months?: number;
  auto_invoice_hour?: number;
  auto_invoice_minute?: number;
  auto_invoice_due_day?: number; // NEW
  contract_kdrive_folder_url?: string | null;
  contract_kdrive_file_url?: string | null;
  annual_increase_enabled?: boolean;
  annual_increase_percent?: number;
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
    auto_invoice_enabled: !!input.auto_invoice_enabled,
    auto_invoice_day: typeof input.auto_invoice_day === "number" ? input.auto_invoice_day : 5,
    auto_invoice_interval_months: typeof input.auto_invoice_interval_months === "number" ? input.auto_invoice_interval_months : 1,
    auto_invoice_hour: typeof input.auto_invoice_hour === "number" ? input.auto_invoice_hour : 9,
    auto_invoice_minute: typeof input.auto_invoice_minute === "number" ? input.auto_invoice_minute : 0,
    auto_invoice_due_day: typeof input.auto_invoice_due_day === "number" ? input.auto_invoice_due_day : null, // NEW
    contract_kdrive_folder_url: input.contract_kdrive_folder_url ?? null,
    contract_kdrive_file_url: input.contract_kdrive_file_url ?? null,
    annual_increase_enabled: !!input.annual_increase_enabled,
    annual_increase_percent: typeof input.annual_increase_percent === "number" ? input.annual_increase_percent : null,
  };

  const { data, error } = await supabase
    .from("leases")
    .insert(payload)
    .select(`
      id, property_id, tenant_id, start_date, end_date, rent_amount, rent_currency, deposit_amount, status, created_at,
      auto_invoice_enabled, auto_invoice_day, auto_invoice_interval_months, auto_invoice_hour, auto_invoice_minute, auto_invoice_due_day,
      contract_kdrive_folder_url, contract_kdrive_file_url,
      annual_increase_enabled, annual_increase_percent,
      property:properties ( id, name ),
      tenant:profiles ( id, first_name, last_name )
    `)
    .single();

  if (error) throw error;
  return normalizeLeaseRow(data);
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
    auto_invoice_enabled: boolean;
    auto_invoice_day: number;
    auto_invoice_interval_months: number;
    auto_invoice_hour: number;
    auto_invoice_minute: number;
    auto_invoice_due_day: number; // NEW
    contract_kdrive_folder_url: string | null;
    contract_kdrive_file_url: string | null;
    annual_increase_enabled: boolean;
    annual_increase_percent: number | null;
    // ADDED: allow assigning tenant
    tenant_id: string | null;
  }>
) {
  const payload: any = {};
  if (typeof input.start_date !== "undefined") payload.start_date = input.start_date;
  if (typeof input.end_date !== "undefined") payload.end_date = input.end_date;
  if (typeof input.rent_amount !== "undefined") payload.rent_amount = input.rent_amount;
  if (typeof input.rent_currency !== "undefined") payload.rent_currency = input.rent_currency;
  if (typeof input.deposit_amount !== "undefined") payload.deposit_amount = input.deposit_amount;
  if (typeof input.status !== "undefined") payload.status = input.status;
  if (typeof input.auto_invoice_enabled !== "undefined") payload.auto_invoice_enabled = input.auto_invoice_enabled;
  if (typeof input.auto_invoice_day !== "undefined") payload.auto_invoice_day = input.auto_invoice_day;
  if (typeof input.auto_invoice_interval_months !== "undefined") payload.auto_invoice_interval_months = input.auto_invoice_interval_months;
  if (typeof input.auto_invoice_hour !== "undefined") payload.auto_invoice_hour = input.auto_invoice_hour;
  if (typeof input.auto_invoice_minute !== "undefined") payload.auto_invoice_minute = input.auto_invoice_minute;
  if (typeof input.auto_invoice_due_day !== "undefined") payload.auto_invoice_due_day = input.auto_invoice_due_day; // NEW
  if (typeof input.contract_kdrive_folder_url !== "undefined") payload.contract_kdrive_folder_url = input.contract_kdrive_folder_url;
  if (typeof input.contract_kdrive_file_url !== "undefined") payload.contract_kdrive_file_url = input.contract_kdrive_file_url;
  if (typeof input.annual_increase_enabled !== "undefined") payload.annual_increase_enabled = input.annual_increase_enabled;
  if (typeof input.annual_increase_percent !== "undefined") payload.annual_increase_percent = input.annual_increase_percent;
  // ADDED: map tenant assignment
  if (typeof input.tenant_id !== "undefined") payload.tenant_id = input.tenant_id;

  const { data, error } = await supabase
    .from("leases")
    .update(payload)
    .eq("id", id)
    .select(`
      id, property_id, tenant_id, start_date, end_date, rent_amount, rent_currency, deposit_amount, status, created_at,
      auto_invoice_enabled, auto_invoice_day, auto_invoice_interval_months, auto_invoice_hour, auto_invoice_minute, auto_invoice_due_day,
      contract_kdrive_folder_url, contract_kdrive_file_url,
      annual_increase_enabled, annual_increase_percent,
      property:properties ( id, name ),
      tenant:profiles ( id, first_name, last_name )
    `)
    .single();

  if (error) throw error;
  return normalizeLeaseRow(data);
}

export async function deleteLease(id: string) {
  // FETCH existing lease to capture metadata for reinstatement
  const { data: existing, error: selErr } = await supabase
    .from("leases")
    .select(`
      id, property_id, tenant_id, start_date, end_date, rent_amount, rent_currency, deposit_amount, status, created_at,
      auto_invoice_enabled, auto_invoice_day, auto_invoice_interval_months, auto_invoice_hour, auto_invoice_minute, auto_invoice_due_day,
      contract_kdrive_folder_url, contract_kdrive_file_url,
      annual_increase_enabled, annual_increase_percent
    `)
    .eq("id", id)
    .single();
  if (selErr) throw selErr;

  const { error } = await supabase.from("leases").delete().eq("id", id);
  if (error) throw error;

  // Log deletion with full metadata
  await logAction({
    action: "delete_lease",
    entity_type: "lease",
    entity_id: id,
    metadata: existing ?? null,
  });

  return true;
}