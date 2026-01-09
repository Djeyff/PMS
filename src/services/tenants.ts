import { supabase } from "@/integrations/supabase/client";

const INVITE_FN_URL = "https://tsfswvmwkfairaoccfqa.supabase.co/functions/v1/invite-tenant";
const DELETE_FN_URL = "https://tsfswvmwkfairaoccfqa.supabase.co/functions/v1/delete-tenant";

export async function inviteTenant(input: { email?: string; first_name?: string; last_name?: string; phone?: string }) {
  const { data: sess } = await supabase.auth.getSession();
  const token = sess.session?.access_token;
  if (!token) throw new Error("Not authenticated");

  const res = await fetch(INVITE_FN_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(input),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err?.error || `Add tenant failed (${res.status})`);
  }

  const body = (await res.json()) as { id: string };
  return body;
}

export async function updateTenantProfile(tenantId: string, fields: { first_name?: string | null; last_name?: string | null; phone?: string | null }) {
  const { data, error } = await supabase
    .from("profiles")
    .update({ 
      first_name: fields.first_name ?? null, 
      last_name: fields.last_name ?? null,
      phone: typeof fields.phone === "string" ? fields.phone : fields.phone ?? null
    })
    .eq("id", tenantId)
    .select("id")
    .single();

  if (error) throw error;
  return data;
}

export async function deleteTenant(tenantId: string) {
  const { data: sess } = await supabase.auth.getSession();
  const token = sess.session?.access_token;
  if (!token) throw new Error("Not authenticated");

  const res = await fetch(DELETE_FN_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ tenantId }),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err?.error || `Delete tenant failed (${res.status})`);
  }

  return { ok: true };
}