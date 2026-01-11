import { supabase } from "@/integrations/supabase/client";

export type UserRow = {
  id: string;
  role: "agency_admin" | "owner" | "tenant" | null;
  agency_id: string | null;
  first_name: string | null;
  last_name: string | null;
  avatar_url: string | null;
  email: string | null;
};

export async function fetchUsersForAdmin() {
  // RLS will restrict results to current user and same-agency users
  const { data, error } = await supabase
    .from("profiles")
    .select("id, role, agency_id, first_name, last_name, avatar_url, email")
    .order("updated_at", { ascending: false });
  if (error) throw error;
  return (data ?? []) as UserRow[];
}

export async function fetchTenantProfilesInAgency(agencyId: string) {
  const { data, error } = await supabase
    .from("profiles")
    .select("id, role, agency_id, first_name, last_name, avatar_url, updated_at, email")
    .eq("role", "tenant")
    .eq("agency_id", agencyId) // do not include unassigned users
    .order("updated_at", { ascending: false });
  if (error) throw error;
  return (data ?? []) as UserRow[];
}

export async function fetchOwnerProfilesInAgency(agencyId: string) {
  const { data, error } = await supabase
    .from("profiles")
    .select("id, role, agency_id, first_name, last_name, avatar_url, updated_at, email")
    .eq("role", "owner")
    .eq("agency_id", agencyId) // do not include unassigned users
    .order("updated_at", { ascending: false });
  if (error) throw error;
  return (data ?? []) as UserRow[];
}

export async function updateMyProfile(patch: {
  first_name?: string | null;
  last_name?: string | null;
  phone?: string | null;
  avatar_url?: string | null;
  email?: string | null;
}) {
  const { data: ures } = await supabase.auth.getUser();
  const uid = ures.user?.id;
  if (!uid) throw new Error("Not authenticated");

  // Update only allowed fields; RLS enforces that role and agency_id remain unchanged
  const { data, error } = await supabase
    .from("profiles")
    .update({ ...patch })
    .eq("id", uid)
    .select("id")
    .single();
  if (error) throw error;
  return data;
}

// Restrict client-side updates: only allow changing role within the same agency,
// and disallow elevating to agency_admin from the client.
export async function updateUserRoleAndAgency(params: {
  userId: string;
  role: "agency_admin" | "owner" | "tenant";
  agencyId: string;
}) {
  const { userId, role, agencyId } = params;

  // 1) Must be authenticated
  const { data: ures } = await supabase.auth.getUser();
  const me = ures.user;
  if (!me) throw new Error("Not authenticated");

  // 2) Fetch my profile (always allowed)
  const { data: myProfile, error: myErr } = await supabase
    .from("profiles")
    .select("id, role, agency_id")
    .eq("id", me.id)
    .single();
  if (myErr) throw myErr;

  // 3) Only agency admins can run this from the client, and only within their own agency
  if (myProfile.role !== "agency_admin" || !myProfile.agency_id) {
    throw new Error("Forbidden");
  }
  if (myProfile.agency_id !== agencyId) {
    throw new Error("Cross-agency updates are not allowed");
  }

  // 4) Prevent setting role to agency_admin via client; require server workflow
  if (role === "agency_admin") {
    throw new Error("Assigning agency_admin via client is not allowed");
  }

  // 5) Ensure the target user currently belongs to the same agency (or has null and will be set? Disallow cross-agency takeover)
  const { data: target, error: tgtErr } = await supabase
    .from("profiles")
    .select("id, agency_id")
    .eq("id", userId)
    .single();
  if (tgtErr) throw tgtErr;

  // If the target has a different non-null agency, block; if null, allow attaching to my agency
  if (target.agency_id && target.agency_id !== myProfile.agency_id) {
    throw new Error("Cannot modify users outside your agency");
  }

  // 6) Perform the update (RLS will enforce same-agency)
  const { data, error } = await supabase
    .from("profiles")
    .update({ role, agency_id: agencyId })
    .eq("id", userId)
    .select("id")
    .single();
  if (error) throw error;
  return data;
}

export async function assignUserByEmail(params: { email: string; role: "owner" | "tenant" }) {
  const { data: sess } = await supabase.auth.getSession();
  const token = sess.session?.access_token;
  if (!token) throw new Error("Not authenticated");
  const url = "https://tsfswvmwkfairaoccfqa.supabase.co/functions/v1/assign-user";
  const res = await fetch(url, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ email: params.email, role: params.role }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err?.error || `Failed to assign user (${res.status})`);
  }
  return await res.json();
}