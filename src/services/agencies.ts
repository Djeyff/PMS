import { supabase } from "@/integrations/supabase/client";

export async function createAgency(input: { name: string; default_currency: "USD" | "DOP"; address?: string; timezone?: string }) {
  const { data, error } = await supabase.functions.invoke("create-agency", {
    body: { name: input.name, default_currency: input.default_currency },
  });
  if (error) throw error;
  return data as { id: string };
}

export async function assignSelfToAgency(agencyId: string) {
  // No-op: assignment is handled in the edge function.
  return { id: agencyId };
}