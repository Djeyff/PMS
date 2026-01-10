import { supabase } from "@/integrations/supabase/client";

export type CalendarEvent = {
  id: string;
  user_id: string;
  title: string;
  description?: string | null;
  start: string; // ISO
  end: string;   // ISO
  all_day?: boolean;
  alert_minutes_before?: number | null;
  property_id?: string | null;
  type?: string | null;
  created_at?: string;
};

export async function listEvents(): Promise<CalendarEvent[]> {
  const { data: userRes } = await supabase.auth.getUser();
  if (!userRes.user?.id) throw new Error("Not authenticated");
  const { data, error } = await supabase
    .from("calendar_events")
    .select("*")
    .order("start", { ascending: true });
  if (error) throw error;
  return (data ?? []) as CalendarEvent[];
}

export async function createEvent(evt: Omit<CalendarEvent, "id" | "user_id" | "created_at">) {
  const { data: userRes } = await supabase.auth.getUser();
  const uid = userRes.user?.id;
  if (!uid) throw new Error("Not authenticated");
  const { data, error } = await supabase
    .from("calendar_events")
    .insert({ ...evt, user_id: uid })
    .select("*")
    .single();
  if (error) throw error;
  return data as CalendarEvent;
}

export async function updateEvent(id: string, patch: Partial<Omit<CalendarEvent, "id" | "user_id">>) {
  const { data, error } = await supabase
    .from("calendar_events")
    .update(patch)
    .eq("id", id)
    .select("*")
    .single();
  if (error) throw error;
  return data as CalendarEvent;
}

export async function deleteEvent(id: string) {
  const { error } = await supabase
    .from("calendar_events")
    .delete()
    .eq("id", id);
  if (error) throw error;
  return true;
}

export async function syncEventsToGoogle(eventIds?: string[]) {
  const { data: sess } = await supabase.auth.getSession();
  const token = sess.session?.access_token;
  if (!token) throw new Error("Not authenticated");
  const url = "https://tsfswvmwkfairaoccfqa.supabase.co/functions/v1/calendar-sync";
  const res = await fetch(url, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ eventIds }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err?.error || `Sync failed (${res.status})`);
  }
  const out = await res.json().catch(() => ({}));
  return out;
}