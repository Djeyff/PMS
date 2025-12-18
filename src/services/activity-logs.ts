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