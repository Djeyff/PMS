import { supabase } from "@/integrations/supabase/client";

export type UserRow = {
  id: string;
  role: "agency_admin" | "owner" | "tenant" | null;
  agency_id: string | null;
  first_name: string | null;
  last_name: string | null;
  avatar_url: string | null;
};

export async function fetchUsersForAdmin() {
  const { data, error } = await supabase
    .from("profiles")
    .select("id, role, agency_id, first_name, last_name, avatar_url")
    .order("updated_at", { ascending: false });
  if (error) throw error;
  return (data ?? []) as UserRow[];
}

export async function fetchTenantProfilesInAgency(agencyId: string) {
  const { data, error } = await supabase
    .from("profiles")
    .select("id, role, agency_id, first_name, last_name, avatar_url, updated_at")
    .eq("role", "tenant")
    .or(`agency_id.eq.${agencyId},agency_id.is.null`)
    .order("updated_at", { ascending: false });
  if (error) throw error;
  return (data ?? []) as UserRow[];
}

export async function updateUserRoleAndAgency(params: {
  userId: string;
  role: "agency_admin" | "owner" | "tenant";
  agencyId: string;
}) {
  const { userId, role, agencyId } = params;
  const { data, error } = await supabase
    .from("profiles")
    .update({ role, agency_id: agencyId })
    .eq("id", userId)
    .select("id")
    .single();
  if (error) throw error;
  return data;
}