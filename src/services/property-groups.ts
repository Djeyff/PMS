import { supabase } from "@/integrations/supabase/client";

export type LocationGroup = {
  id: string;
  agency_id: string;
  name: string;
  created_at: string;
};

export async function fetchLocationGroups(agencyId: string) {
  const { data, error } = await supabase
    .from("location_groups")
    .select("id, agency_id, name, created_at")
    .eq("agency_id", agencyId)
    .order("name", { ascending: true });

  if (error) throw error;
  return (data ?? []) as LocationGroup[];
}

export async function createLocationGroup(params: { agencyId: string; name: string }) {
  const { agencyId, name } = params;
  const { data, error } = await supabase
    .from("location_groups")
    .insert({ agency_id: agencyId, name })
    .select("id, agency_id, name, created_at")
    .single();

  if (error) throw error;
  return data as LocationGroup;
}