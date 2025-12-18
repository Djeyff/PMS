import { supabase } from "@/integrations/supabase/client";

export type ActivityLog = {
  id: string;
  user_id: string;
  agency_id: string | null;
  action: string;
  entity_type: string;
  entity_id: string | null;
  metadata: any | null;
  created_at: string;
  user?: { first_name: string | null; last_name: string | null } | null;
};

export async function logAction(params: {
  action: string;
  entity_type: string;
  entity_id?: string | null;
  metadata?: any | null;
}) {
  const { data: userRes } = await supabase.auth.getUser();
  const uid = userRes.user?.id;
  if (!uid) throw new Error("Not authenticated");
  const { data, error } = await supabase
    .from("activity_logs")
    .insert({
      user_id: uid,
      action: params.action,
      entity_type: params.entity_type,
      entity_id: params.entity_id ?? null,
      metadata: params.metadata ?? null,
    })
    .select("id")
    .single();
  if (error) throw error;
  return data.id as string;
}

export async function fetchActivityLogsByAgency(agencyId: string) {
  // Fetch raw logs (no embeds) for the agency
  const { data, error } = await supabase
    .from("activity_logs")
    .select("id, user_id, agency_id, action, entity_type, entity_id, metadata, created_at")
    .eq("agency_id", agencyId)
    .order("created_at", { ascending: false });
  if (error) throw error;

  const logs = (data ?? []) as Array<Omit<ActivityLog, "user">>;

  // Collect unique user_ids to resolve names
  const userIds = Array.from(new Set(logs.map((l) => l.user_id).filter(Boolean)));

  let profilesMap = new Map<string, { first_name: string | null; last_name: string | null }>();
  if (userIds.length > 0) {
    const { data: profs, error: profErr } = await supabase
      .from("profiles")
      .select("id, first_name, last_name")
      .in("id", userIds as string[]);
    if (profErr) throw profErr;

    profilesMap = new Map(
      (profs ?? []).map((p: any) => [
        p.id,
        { first_name: p.first_name ?? null, last_name: p.last_name ?? null },
      ])
    );
  }

  // Attach user names to logs
  return logs.map((l) => ({
    ...l,
    user: profilesMap.get(l.user_id) ?? null,
  })) as ActivityLog[];
}

// Reinstate a deleted payment using the metadata captured in the activity log
export async function reinstatePaymentFromLog(logId: string) {
  const { data: log, error } = await supabase
    .from("activity_logs")
    .select("id, action, entity_type, entity_id, metadata")
    .eq("id", logId)
    .single();
  if (error) throw error;
  if (!log || log.action !== "delete_payment" || log.entity_type !== "payment") {
    throw new Error("This log entry is not a deletable payment action.");
  }
  const m = (log as any).metadata || {};
  const payload = {
    lease_id: m.lease_id as string,
    tenant_id: m.tenant_id as string,
    amount: Number(m.amount),
    currency: m.currency as "USD" | "DOP",
    method: String(m.method || "bank_transfer"),
    received_date: String(m.received_date),
    reference: m.reference ?? null,
    invoice_id: m.invoice_id ?? null,
  };
  if (!payload.lease_id || !payload.tenant_id || !payload.amount || !payload.currency || !payload.received_date) {
    throw new Error("Missing required payment fields in log metadata.");
  }
  const { error: insErr } = await supabase
    .from("payments")
    .insert(payload)
    .select("id")
    .single();
  if (insErr) throw insErr;
  return true;
}

// Reinstate a deleted maintenance request using the metadata captured; reuse the original id to reattach logs
export async function reinstateMaintenanceRequestFromLog(logId: string) {
  const { data: log, error } = await supabase
    .from("activity_logs")
    .select("id, action, entity_type, entity_id, metadata")
    .eq("id", logId)
    .single();
  if (error) throw error;
  if (!log || log.action !== "delete_maintenance_request" || log.entity_type !== "maintenance_request") {
    throw new Error("This log entry is not a deletable maintenance request action.");
  }
  const m = (log as any).metadata || {};
  const id = (log as any).entity_id as string | null;

  const insertObj: any = {
    property_id: m.property_id,
    title: m.title || "Restored request",
    description: m.description ?? null,
    priority: m.priority ?? "medium",
    status: m.status ?? "open",
    due_date: m.due_date ?? null,
  };
  if (id) {
    insertObj.id = id; // preserve original id to re-link existing maintenance logs
  }
  if (!insertObj.property_id) {
    throw new Error("Missing property_id in log metadata.");
  }
  const { error: insErr } = await supabase
    .from("maintenance_requests")
    .insert(insertObj)
    .select("id")
    .single();
  if (insErr) throw insErr;
  return true;
}