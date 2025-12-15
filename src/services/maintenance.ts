import { supabase } from "@/integrations/supabase/client";

export type MaintenanceRow = {
  id: string;
  property_id: string;
  title: string;
  description?: string | null;
  priority: "low" | "medium" | "high";
  status: "open" | "in_progress" | "closed";
  due_date?: string | null;
  created_at: string;
  property?: { id: string; name: string } | null;
};

type MaintenanceLogRow = {
  id: string;
  request_id: string;
  user_id: string | null;
  note: string;
  created_at: string;
  user?: { first_name: string | null; last_name: string | null } | null;
};

function normalize(row: any): MaintenanceRow {
  const propRel = Array.isArray(row.property) ? row.property[0] : row.property ?? null;
  return {
    id: row.id,
    property_id: row.property_id,
    title: row.title,
    description: row.description ?? null,
    priority: row.priority,
    status: row.status,
    due_date: row.due_date ?? null,
    created_at: row.created_at,
    property: propRel ? { id: propRel.id, name: propRel.name } : null,
  };
}

export async function fetchMaintenanceRequests(params: { agencyId: string; status?: ("open" | "in_progress" | "closed")[] }) {
  let query = supabase
    .from("maintenance_requests")
    .select(`id, property_id, title, description, priority, status, due_date, created_at, property:properties!inner ( id, name, agency_id )`)
    .eq("property.agency_id", params.agencyId)
    .order("due_date", { ascending: true })
    .order("created_at", { ascending: false });

  if (params.status && params.status.length > 0) {
    query = query.in("status", params.status);
  }

  const { data, error } = await query;
  if (error) throw error;
  return (data ?? []).map(normalize);
}

export async function createMaintenanceRequest(input: { property_id: string; title: string; description?: string; priority: "low" | "medium" | "high"; due_date?: string }) {
  const { data, error } = await supabase
    .from("maintenance_requests")
    .insert({
      property_id: input.property_id,
      title: input.title,
      description: input.description ?? null,
      priority: input.priority,
      status: "open",
      due_date: input.due_date ?? null,
    })
    .select(`id, property_id, title, description, priority, status, due_date, created_at`)
    .single();
  if (error) throw error;
  return data as MaintenanceRow;
}

export async function updateMaintenanceStatus(id: string, status: "open" | "in_progress" | "closed") {
  const { data, error } = await supabase
    .from("maintenance_requests")
    .update({ status })
    .eq("id", id)
    .select(`id, property_id, title, description, priority, status, due_date, created_at`)
    .single();
  if (error) throw error;
  return data as MaintenanceRow;
}

export async function updateMaintenanceRequest(
  id: string,
  input: Partial<{ title: string; description: string | null; priority: "low" | "medium" | "high"; status: "open" | "in_progress" | "closed"; due_date: string | null }>
) {
  const payload: any = {};
  if (typeof input.title !== "undefined") payload.title = input.title;
  if (typeof input.description !== "undefined") payload.description = input.description;
  if (typeof input.priority !== "undefined") payload.priority = input.priority;
  if (typeof input.status !== "undefined") payload.status = input.status;
  if (typeof input.due_date !== "undefined") payload.due_date = input.due_date;

  const { data, error } = await supabase
    .from("maintenance_requests")
    .update(payload)
    .eq("id", id)
    .select(`id, property_id, title, description, priority, status, due_date, created_at`)
    .single();
  if (error) throw error;
  return data as MaintenanceRow;
}

export async function fetchMaintenanceLogs(requestId: string) {
  const { data, error } = await supabase
    .from("maintenance_logs")
    .select(`id, request_id, user_id, note, created_at, user:profiles ( first_name, last_name )`)
    .eq("request_id", requestId)
    .order("created_at", { ascending: true });
  if (error) throw error;
  return (data ?? []).map((row: any) => {
    const userRel = Array.isArray(row.user) ? row.user[0] : row.user ?? null;
    return {
      id: row.id,
      request_id: row.request_id,
      user_id: row.user_id ?? null,
      note: row.note,
      created_at: row.created_at,
      user: userRel ? { first_name: userRel.first_name ?? null, last_name: userRel.last_name ?? null } : null,
    } as MaintenanceLogRow;
  });
}

export async function addMaintenanceLog(requestId: string, note: string) {
  const { data: user } = await supabase.auth.getUser();
  const uid = user.user?.id ?? null;
  const { data, error } = await supabase
    .from("maintenance_logs")
    .insert({ request_id: requestId, user_id: uid, note })
    .select(`id`)
    .single();
  if (error) throw error;
  return data;
}