import { supabase, getAuthedClient } from "@/integrations/supabase/client";

export type PropertyOwnerRow = {
  property_id: string;
  owner_id: string;
  ownership_percent: number | null;
};

export async function fetchPropertyOwners(propertyId: string) {
  const { data: sess } = await supabase.auth.getSession();
  const db = getAuthedClient(sess.session?.access_token);
  const { data, error } = await db
    .from("property_owners")
    .select("property_id, owner_id, ownership_percent")
    .eq("property_id", propertyId);
  if (error) throw error;
  return (data ?? []) as PropertyOwnerRow[];
}

export async function addPropertyOwner(params: { property_id: string; owner_id: string; ownership_percent?: number }) {
  const { data: sess } = await supabase.auth.getSession();
  const db = getAuthedClient(sess.session?.access_token);
  const { data, error } = await db
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
  const { data: sess } = await supabase.auth.getSession();
  const db = getAuthedClient(sess.session?.access_token);
  const { data, error } = await db
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
  const { data: sess } = await supabase.auth.getSession();
  const db = getAuthedClient(sess.session?.access_token);
  const { error } = await db
    .from("property_owners")
    .delete()
    .eq("property_id", params.property_id)
    .eq("owner_id", params.owner_id);
  if (error) throw error;
  return true;
}

export async function fetchMyOwnerships(userId: string) {
  const { data: sess } = await supabase.auth.getSession();
  const db = getAuthedClient(sess.session?.access_token);
  const { data, error } = await db
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

export async function fetchAgencyOwnerships(agencyId: string) {
  const { data: sess } = await supabase.auth.getSession();
  const db = getAuthedClient(sess.session?.access_token);
  const { data, error } = await db
    .from("property_owners")
    .select(`
      property_id,
      owner_id,
      ownership_percent,
      owner:profiles ( first_name, last_name ),
      property:properties!inner ( id, agency_id )
    `)
    .eq("property.agency_id", agencyId);
  if (error) throw error;
  return (data ?? []).map((row: any) => {
    const ownerRel = Array.isArray(row.owner) ? row.owner[0] : row.owner ?? null;
    return {
      property_id: row.property_id,
      owner_id: row.owner_id,
      ownership_percent: row.ownership_percent == null ? null : Number(row.ownership_percent),
      owner: ownerRel ? {
        first_name: ownerRel.first_name ?? null,
        last_name: ownerRel.last_name ?? null
      } : null
    } as {
      property_id: string;
      owner_id: string;
      ownership_percent: number | null;
      owner: { first_name: string | null; last_name: string | null } | null;
    };
  });
}