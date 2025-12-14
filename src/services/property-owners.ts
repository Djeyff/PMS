import { supabase } from "@/integrations/supabase/client";

export type PropertyOwnerRow = {
  property_id: string;
  owner_id: string;
  ownership_percent: number | null;
};

export async function fetchPropertyOwners(propertyId: string) {
  const { data, error } = await supabase
    .from("property_owners")
    .select("property_id, owner_id, ownership_percent")
    .eq("property_id", propertyId);
  if (error) throw error;
  return (data ?? []) as PropertyOwnerRow[];
}

export async function addPropertyOwner(params: { property_id: string; owner_id: string; ownership_percent?: number }) {
  const { data, error } = await supabase
    .from("property_owners")
    .insert({
      property_id: params.property_id,
      owner_id: params.owner_id,
      ownership_percent: typeof params.ownership_percent === "number" ? params.ownership_percent : null,
    })
    .select("property_id, owner_id, ownership_percent")
    .single();
  if (error) throw error;
  return data as PropertyOwnerRow;
}

export async function updatePropertyOwner(params: { property_id: string; owner_id: string; ownership_percent: number | null }) {
  const { data, error } = await supabase
    .from("property_owners")
    .update({ ownership_percent: params.ownership_percent })
    .eq("property_id", params.property_id)
    .eq("owner_id", params.owner_id)
    .select("property_id, owner_id, ownership_percent")
    .single();
  if (error) throw error;
  return data as PropertyOwnerRow;
}

export async function deletePropertyOwner(params: { property_id: string; owner_id: string }) {
  const { error } = await supabase
    .from("property_owners")
    .delete()
    .eq("property_id", params.property_id)
    .eq("owner_id", params.owner_id);
  if (error) throw error;
  return true;
}

export async function fetchMyOwnerships(userId: string) {
  const { data, error } = await supabase
    .from("property_owners")
    .select("property_id, ownership_percent")
    .eq("owner_id", userId);
  if (error) throw error;
  const map = new Map<string, number>();
  (data ?? []).forEach((row: any) => {
    const percent = row.ownership_percent == null ? 100 : Number(row.ownership_percent);
    map.set(row.property_id, percent);
  });
  return map;
}