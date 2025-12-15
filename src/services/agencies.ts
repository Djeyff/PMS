import { supabase } from "@/integrations/supabase/client";

const FUNCTIONS_URL = "https://tsfswvmwkfairaoccfqa.supabase.co/functions/v1/create-agency";

export async function createAgency(input: { name: string; default_currency: "USD" | "DOP"; address?: string; timezone?: string }) {
  const { data: sess } = await supabase.auth.getSession();
  const token = sess.session?.access_token;
  // Try edge function first
  if (token) {
    try {
      const res = await fetch(FUNCTIONS_URL, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ name: input.name, default_currency: input.default_currency }),
      });
      if (res.ok) {
        const body = (await res.json()) as { id: string };
        return body;
      } else {
        // Try to parse function error, but continue to fallback
        await res.json().catch(() => ({}));
      }
    } catch {
      // Network failure -> fallback below
    }
  }

  // Fallback: direct DB insert (RLS allows INSERT for authenticated)
  const { data: agency, error: insertErr } = await supabase
    .from("agencies")
    .insert({ name: input.name, default_currency: input.default_currency })
    .select("id")
    .single();
  if (insertErr || !agency?.id) {
    throw insertErr || new Error("Create agency failed");
  }

  // Assign current user to agency
  const { data: userRes } = await supabase.auth.getUser();
  const uid = userRes.user?.id;
  if (!uid) throw new Error("No user session");

  const { error: assignErr } = await supabase
    .from("profiles")
    .upsert({ id: uid, agency_id: agency.id }, { onConflict: "id" });
  if (assignErr) {
    throw assignErr;
  }

  return { id: agency.id as string };
}

export async function assignSelfToAgency(agencyId: string) {
  // Edge function / fallback already assigns; this is a no-op.
  return { id: agencyId };
}

// New: fetch agency by id (name, currency, timezone)
export async function fetchAgencyById(id: string) {
  const { data, error } = await supabase
    .from("agencies")
    .select("id, name, default_currency, timezone")
    .eq("id", id)
    .single();
  if (error) throw error;
  return data as { id: string; name: string; default_currency: string; timezone: string | null };
}

// New: update agency timezone
export async function updateAgencyTimezone(id: string, timezone: string) {
  const { data, error } = await supabase
    .from("agencies")
    .update({ timezone })
    .eq("id", id)
    .select("id")
    .single();
  if (error) throw error;
  return data as { id: string };
}