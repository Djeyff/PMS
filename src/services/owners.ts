import { supabase } from "@/integrations/supabase/client";

const INVITE_OWNER_URL = "https://tsfswvmwkfairaoccfqa.supabase.co/functions/v1/invite-owner";
const DELETE_OWNER_URL = "https://tsfswvmwkfairaoccfqa.supabase.co/functions/v1/delete-owner";

export async function inviteOwner(input: { email?: string; first_name?: string; last_name?: string }) {
  const { data: sess } = await supabase.auth.getSession();
  const token = sess.session?.access_token;
  if (!token) throw new Error("Not authenticated");
  const res = await fetch(INVITE_OWNER_URL, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err?.error || `Add owner failed (${res.status})`);
  }
  return (await res.json()) as { id: string };
}

export async function updateOwnerProfile(ownerId: string, fields: { first_name?: string | null; last_name?: string | null }) {
  const { data, error } = await supabase
    .from("profiles")
    .update({ first_name: fields.first_name ?? null, last_name: fields.last_name ?? null })
    .eq("id", ownerId)
    .select("id")
    .single();
  if (error) throw error;
  return data;
}

export async function deleteOwner(ownerId: string) {
  const { data: sess } = await supabase.auth.getSession();
  const token = sess.session?.access_token;
  if (!token) throw new Error("Not authenticated");
  const res = await fetch(DELETE_OWNER_URL, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ tenantId: ownerId }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err?.error || `Delete owner failed (${res.status})`);
  }
  return { ok: true };
}