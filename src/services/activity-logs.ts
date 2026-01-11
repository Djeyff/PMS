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
  const { error } = await supabase
    .from("activity_logs")
    .insert({
      user_id: uid,
      action: params.action,
      entity_type: params.entity_type,
      entity_id: params.entity_id ?? null,
      metadata: params.metadata ?? null,
    });
  if (error) throw error;
  return true;
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
  const originalId = (log as any).entity_id as string | null;

  const insertObj: any = {
    property_id: m.property_id,
    title: m.title || "Restored request",
    description: m.description ?? null,
    priority: m.priority ?? "medium",
    status: m.status ?? "open",
    due_date: m.due_date ?? null,
  };
  if (!insertObj.property_id) {
    throw new Error("Missing property_id in log metadata.");
  }
  if (originalId) {
    insertObj.id = originalId; // preserve original id to re-link
  }

  const { data: inserted, error: insErr } = await supabase
    .from("maintenance_requests")
    .insert(insertObj)
    .select("id")
    .single();
  if (insErr) throw insErr;

  const requestIdToUse: string = originalId || inserted.id;

  // Recreate logs if we captured them
  const logs: any[] = Array.isArray(m.logs) ? m.logs : [];
  if (logs.length > 0) {
    const toInsert = logs.map((l) => ({
      request_id: requestIdToUse,
      user_id: l.user_id ?? null,
      note: String(l.note ?? ""),
      created_at: l.created_at, // keep original timestamps if allowed
    }));
    const { error: logsErr } = await supabase
      .from("maintenance_logs")
      .insert(toInsert);
    if (logsErr) throw logsErr;
  }

  return true;
}

// Reinstate a deleted property using captured metadata
export async function reinstatePropertyFromLog(logId: string) {
  const { data: log, error } = await supabase
    .from("activity_logs")
    .select("id, action, entity_type, entity_id, metadata")
    .eq("id", logId)
    .single();
  if (error) throw error;
  if (!log || log.action !== "delete_property" || log.entity_type !== "property") {
    throw new Error("This log entry is not a deletable property action.");
  }
  const m = (log as any).metadata || {};
  const originalId = (log as any).entity_id as string | null;

  const payload: any = {
    agency_id: m.agency_id,
    name: m.name,
    type: m.type,
    city: m.city ?? null,
    bedrooms: typeof m.bedrooms === "number" ? m.bedrooms : null,
    status: m.status ?? "active",
    location_group: m.location_group ?? null,
  };

  if (!payload.agency_id || !payload.name || !payload.type) {
    throw new Error("Missing required property fields in log metadata.");
  }
  if (originalId) payload.id = originalId;

  const { error: insErr } = await supabase
    .from("properties")
    .insert(payload)
    .select("id")
    .single();
  if (insErr) throw insErr;

  return true;
}

// Reinstate a deleted lease using captured metadata
export async function reinstateLeaseFromLog(logId: string) {
  const { data: log, error } = await supabase
    .from("activity_logs")
    .select("id, action, entity_type, entity_id, metadata")
    .eq("id", logId)
    .single();
  if (error) throw error;
  if (!log || log.action !== "delete_lease" || log.entity_type !== "lease") {
    throw new Error("This log entry is not a deletable lease action.");
  }
  const m = (log as any).metadata || {};
  const originalId = (log as any).entity_id as string | null;

  const payload: any = {
    property_id: m.property_id,
    tenant_id: m.tenant_id,
    start_date: m.start_date,
    end_date: m.end_date,
    rent_amount: Number(m.rent_amount || 0),
    rent_currency: m.rent_currency,
    deposit_amount: typeof m.deposit_amount === "number" ? m.deposit_amount : null,
    status: m.status ?? "active",
    auto_invoice_enabled: !!m.auto_invoice_enabled,
    auto_invoice_day: typeof m.auto_invoice_day === "number" ? m.auto_invoice_day : 5,
    auto_invoice_interval_months: typeof m.auto_invoice_interval_months === "number" ? m.auto_invoice_interval_months : 1,
    auto_invoice_hour: typeof m.auto_invoice_hour === "number" ? m.auto_invoice_hour : 9,
    auto_invoice_minute: typeof m.auto_invoice_minute === "number" ? m.auto_invoice_minute : 0,
    contract_kdrive_folder_url: m.contract_kdrive_folder_url ?? null,
    contract_kdrive_file_url: m.contract_kdrive_file_url ?? null,
    annual_increase_enabled: !!m.annual_increase_enabled,
    annual_increase_percent: typeof m.annual_increase_percent === "number" ? m.annual_increase_percent : null,
  };

  if (!payload.property_id || !payload.tenant_id || !payload.start_date || !payload.end_date || !payload.rent_currency) {
    throw new Error("Missing required lease fields in log metadata.");
  }
  if (originalId) payload.id = originalId;

  const { error: insErr } = await supabase
    .from("leases")
    .insert(payload)
    .select("id")
    .single();
  if (insErr) throw insErr;

  return true;
}

// Reinstate a deleted tenant using the captured metadata via edge function
export async function reinstateTenantFromLog(logId: string) {
  const { data: sess } = await supabase.auth.getSession();
  const token = sess.session?.access_token;
  if (!token) throw new Error("Not authenticated");

  const url = "https://tsfswvmwkfairaoccfqa.supabase.co/functions/v1/reinstate-tenant";
  const res = await fetch(url, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ logId }),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err?.error || `Failed to reinstate tenant (${res.status})`);
  }

  const out = await res.json().catch(() => ({}));
  return out?.id as string | null;
}

// ADD: logManagerReport utility to record create/delete actions
export async function logManagerReport(action: "created" | "deleted", userId: string, report: {
  id?: string;
  month: string;
  start_date: string;
  end_date: string;
  avg_rate?: number | null;
  fee_percent?: number;
}) {
  const { error } = await supabase.from("activity_logs").insert({
    user_id: userId,
    action: `manager_report_${action}`,
    entity_type: "manager_report",
    entity_id: report.id ?? null,
    metadata: {
      month: report.month,
      start_date: report.start_date,
      end_date: report.end_date,
      avg_rate: report.avg_rate ?? null,
      fee_percent: report.fee_percent ?? null,
    }
  } as any);
  if (error) throw error;
  return true;
}