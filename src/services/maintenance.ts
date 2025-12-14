import { supabase } from "@/integrations/supabase/client";

export type MaintenanceRow = {
  id: string;
  property_id: string;
  title: string;
  priority: "low" | "medium" | "high";
  status: "open" | "in_progress" | "closed";
  created_at: string;
  property?: { id: string; name: string } | null;
};

function normalize(row: any): MaintenanceRow {
  const propRel = Array.isArray(row.property) ? row.property[0] : row.property ?? null;
  return {
    id: row.id,
    property_id: row.property_id,
    title: row.title,
    priority: row.priority,
    status: row.status,
    created_at: row.created_at,
    property: propRel ? { id: propRel.id, name: propRel.name } : null,
  };
}

export async function fetchMaintenanceRequests(params: { agencyId: string; status?: ("open" | "in_progress" | "closed")[] }) {
  let query = supabase
    .from("maintenance_requests")
    .select(`id, property_id, title, priority, status, created_at, property:properties!inner ( id, name, agency_id )`)
    .eq("property.agency_id", params.agencyId)
    .order("created_at", { ascending: false });

  if (params.status && params.status.length > 0) {
    query = query.in("status", params.status);
  }

  const { data, error } = await query;
  if (error) throw error;
  return (data ?? []).map(normalize);
}

export async function createMaintenanceRequest(input: { property_id: string; title: string; priority: "low" | "medium" | "high" }) {
  const { data, error } = await supabase
    .from("maintenance_requests")
    .insert({ property_id: input.property_id, title: input.title, priority: input.priority, status: "open" })
    .select(`id, property_id, title, priority, status, created_at`)
    .single();
  if (error) throw error;
  return data as MaintenanceRow;
}

export async function updateMaintenanceStatus(id: string, status: "open" | "in_progress" | "closed") {
  const { data, error } = await supabase
    .from("maintenance_requests")
    .update({ status })
    .eq("id", id)
    .select(`id, property_id, title, priority, status, created_at`)
    .single();
  if (error) throw error;
  return data as MaintenanceRow;
}