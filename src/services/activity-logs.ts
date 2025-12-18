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
  const { data, error } = await supabase
    .from("activity_logs")
    .select(`
      id, user_id, agency_id, action, entity_type, entity_id, metadata, created_at,
      user:profiles ( first_name, last_name )
    `)
    .eq("agency_id", agencyId)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return (data ?? []).map((row: any) => {
    const userRel = Array.isArray(row.user) ? row.user[0] : row.user ?? null;
    return {
      id: row.id,
      user_id: row.user_id,
      agency_id: row.agency_id,
      action: row.action,
      entity_type: row.entity_type,
      entity_id: row.entity_id,
      metadata: row.metadata ?? null,
      created_at: row.created_at,
      user: userRel ? { first_name: userRel.first_name ?? null, last_name: userRel.last_name ?? null } : null,
    } as ActivityLog;
  });
}