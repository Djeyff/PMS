import { supabase } from "@/integrations/supabase/client";

const FUNCTIONS_URL = "https://tsfswvmwkfairaoccfqa.supabase.co/functions/v1/invite-tenant";

export async function inviteTenant(input: { email: string; first_name?: string; last_name?: string }) {
  const { data: sess } = await supabase.auth.getSession();
  const token = sess.session?.access_token;
  if (!token) throw new Error("Not authenticated");

  const res = await fetch(FUNCTIONS_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(input),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err?.error || `Invite tenant failed (${res.status})`);
  }

  const body = (await res.json()) as { id: string };
  return body;
}