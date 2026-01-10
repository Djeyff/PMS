import { supabase } from "@/integrations/supabase/client";

export type CalendarSettings = {
  user_id: string;
  google_account_email?: string | null;
  google_calendar_id?: string | null;
  lease_alert_days: number;
  updated_at?: string;
};

export async function getMyCalendarSettings(): Promise<CalendarSettings | null> {
  const { data: userRes } = await supabase.auth.getUser();
  const uid = userRes.user?.id;
  if (!uid) throw new Error("Not authenticated");
  const { data, error } = await supabase
    .from("calendar_settings")
    .select("*")
    .eq("user_id", uid)
    .single();
  if (error && (error as any).code !== "PGRST116") throw error;
  return (data ?? null) as CalendarSettings | null;
}

export async function saveMyCalendarSettings(patch: Partial<Omit<CalendarSettings, "user_id">>) {
  const { data: userRes } = await supabase.auth.getUser();
  const uid = userRes.user?.id;
  if (!uid) throw new Error("Not authenticated");

  // Try update; if not exists, insert
  const { data: existing, error: selErr } = await supabase
    .from("calendar_settings")
    .select("user_id")
    .eq("user_id", uid)
    .single();

  if (selErr && (selErr as any).code !== "PGRST116") throw selErr;

  if (!existing) {
    const { error } = await supabase
      .from("calendar_settings")
      .insert({ user_id: uid, ...patch });
    if (error) throw error;
    return true;
  }

  const { error } = await supabase
    .from("calendar_settings")
    .update({ ...patch, updated_at: new Date().toISOString() })
    .eq("user_id", uid);
  if (error) throw error;
  return true;
}