import { supabase } from "@/integrations/supabase/client";

export async function createAgency(input: { name: string; default_currency: "USD" | "DOP"; address?: string; timezone?: string }) {
  const { data, error } = await supabase
    .from("agencies")
    .insert({
      name: input.name,
      default_currency: input.default_currency,
      address: input.address ?? null,
      timezone: input.timezone ?? null,
    })
    .select("id")
    .single();
  if (error) throw error;
  return data as { id: string };
}

export async function assignSelfToAgency(agencyId: string) {
  const { data: auth } = await supabase.auth.getUser();
  const uid = auth.user?.id;
  if (!uid) throw new Error("No user session");

  const { data, error } = await supabase
    .from("profiles")
    .update({ agency_id: agencyId })
    .eq("id", uid)
    .select("id")
    .single();
  if (error) throw error;
  return data;
}