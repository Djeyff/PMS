import { supabase, getAuthedClient } from "@/integrations/supabase/client";
import type { Role } from "@/contexts/AuthProvider";

export type Property = {
  id: string;
  agency_id: string;
  name: string;
  type: "villa" | "apartment" | "house" | "studio" | "office" | "other" | "restaurant" | "banca" | "business" | "land" | "colmado" | "rentacar";
  city: string | null;
  bedrooms: number | null;
  status: "active" | "rented" | "vacant" | "maintenance" | "sold";
  created_at: string;
};

export async function fetchProperties(params: { role: Role | null; userId: string | null; agencyId: string | null; }) {
  const { role, userId, agencyId } = params;

  if (!role) return [];

  const { data: sess } = await supabase.auth.getSession();
  const db = getAuthedClient(sess.session?.access_token);

  if (role === "agency_admin") {
    if (!agencyId) return [];
    const { data, error } = await db
      .from("properties")
      .select("id, agency_id, name, type, city, bedrooms, status, created_at")
      .eq("agency_id", agencyId)
      .order("created_at", { ascending: false });
    if (error) throw error;
    // Type the embedded relation and strip it out for return
    const rows = (data ?? []) as Array<Property & { property_owners?: { owner_id: string }[] }>;
    return rows.map(({ property_owners: _rel, ...rest }) => rest as Property);
  }

  if (role === "owner") {
    if (!userId) return [];
    // Join via foreign table embedding
    const { data, error } = await db
      .from("properties")
      .select("id, agency_id, name, type, city, bedrooms, status, created_at, property_owners!inner(owner_id)")
      .eq("property_owners.owner_id", userId)
      .order("created_at", { ascending: false });
    if (error) throw error;
    // Type the embedded relation and strip it out for return
    const rows = (data ?? []) as Array<Property & { property_owners?: { owner_id: string }[] }>;
    return rows.map(({ property_owners: _rel, ...rest }) => rest as Property);
  }

  // Tenants: no property list for now
  return [];
}

export async function createProperty(input: {
  agency_id: string;
  name: string;
  type: Property["type"];
  city?: string;
  bedrooms?: number;
  status?: Property["status"];
}) {
  const payload = {
    agency_id: input.agency_id,
    name: input.name,
    type: input.type,
    city: input.city ?? null,
    bedrooms: typeof input.bedrooms === "number" ? input.bedrooms : null,
    status: input.status ?? "active",
  };

  const { data: sess } = await supabase.auth.getSession();
  const db = getAuthedClient(sess.session?.access_token);

  const { data, error } = await db
    .from("properties")
    .insert(payload)
    .select("id, agency_id, name, type, city, bedrooms, status, created_at")
    .single();

  if (error) throw error;
  return data as Property;
}

export async function updateProperty(
  id: string,
  input: {
    name?: string;
    type?: Property["type"];
    status?: Property["status"];
    city?: string;
    bedrooms?: number;
  }
) {
  const payload: any = {};
  if (typeof input.name !== "undefined") payload.name = input.name;
  if (typeof input.type !== "undefined") payload.type = input.type;
  if (typeof input.status !== "undefined") payload.status = input.status;
  if (typeof input.city !== "undefined") payload.city = input.city ?? null;
  if (typeof input.bedrooms !== "undefined") payload.bedrooms = typeof input.bedrooms === "number" ? input.bedrooms : null;

  const { data: sess } = await supabase.auth.getSession();
  const db = getAuthedClient(sess.session?.access_token);

  const { data, error } = await db
    .from("properties")
    .update(payload)
    .eq("id", id)
    .select("id, agency_id, name, type, city, bedrooms, status, created_at")
    .single();

  if (error) throw error;
  return data as Property;
}

export async function deleteProperty(id: string) {
  const { data: sess } = await supabase.auth.getSession();
  const db = getAuthedClient(sess.session?.access_token);
  const { error } = await db.from("properties").delete().eq("id", id);
  if (error) throw error;
  return true;
}