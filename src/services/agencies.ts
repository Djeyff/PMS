import { supabase } from "@/integrations/supabase/client";

const FUNCTIONS_URL = "https://tsfswvmwkfairaoccfqa.supabase.co/functions/v1/create-agency";

export async function createAgency(input: { name: string; default_currency: "USD" | "DOP"; address?: string; timezone?: string }) {
  const { data: sess } = await supabase.auth.getSession();
  const token = sess.session?.access_token;
  if (!token) throw new Error("Not authenticated");

  const res = await fetch(FUNCTIONS_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ name: input.name, default_currency: input.default_currency }),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err?.error || `Create agency failed (${res.status})`);
  }

  const body = (await res.json()) as { id: string };
  return body;
}

export async function assignSelfToAgency(agencyId: string) {
  // Assignment is handled by the edge function.
  return { id: agencyId };
}