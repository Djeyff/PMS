import { supabase } from "@/integrations/supabase/client";
import { fetchLeases } from "@/services/leases";
import type { Role } from "@/contexts/AuthProvider";

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
  if (!userRes.user?.id) {
    // Not authenticated yet; return empty list to avoid UI crashes
    return [];
  }
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

export async function syncEventsToGoogle(
  eventIds?: string[],
  calendarId?: string,
  providerToken?: string,
  cleanupFromCalendarId?: string,
  timeZone?: string
) {
  const { data: sess } = await supabase.auth.getSession();
  const token = sess.session?.access_token;
  if (!token) throw new Error("Not authenticated");
  const url = "https://tsfswvmwkfairaoccfqa.supabase.co/functions/v1/calendar-sync";
  const res = await fetch(url, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ eventIds, calendarId, providerToken, cleanupFromCalendarId, timeZone }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err?.error || `Sync failed (${res.status})`);
  }
  const out = await res.json().catch(() => ({}));
  return out;
}

// Ensure ALL-DAY expiry; set reminders X days before at HH:MM via alert_minutes_before
export async function upsertLeaseExpiryEvents(params: {
  role: Role | null;
  userId: string | null;
  agencyId: string | null;
  alertDays: number;
  alertTime?: string;
  timezone?: string;
}) {
  const leases = await fetchLeases(params);
  const { data: userRes } = await supabase.auth.getUser();
  const uid = userRes.user?.id;
  if (!uid) throw new Error("Not authenticated");

  const { data: existing, error: exErr } = await supabase
    .from("calendar_events")
    .select("id, lease_id, title, start, end, all_day, alert_minutes_before, type")
    .eq("user_id", uid)
    .eq("type", "lease_expiry");
  if (exErr) throw exErr;

  const byLease: Record<string, any[]> = {};
  (existing ?? []).forEach((e: any) => {
    const key = e.lease_id || "__no_lease__";
    byLease[key] = byLease[key] || [];
    byLease[key].push(e);
  });
  const duplicateIds: string[] = [];
  Object.entries(byLease).forEach(([key, arr]) => {
    if (key === "__no_lease__") {
      duplicateIds.push(...arr.map((e) => e.id));
    } else if (arr.length > 1) {
      duplicateIds.push(...arr.slice(1).map((e) => e.id));
    }
  });
  if (duplicateIds.length > 0) {
    const { error: dedErr } = await supabase.from("calendar_events").delete().in("id", duplicateIds);
    if (dedErr) throw dedErr;
  }

  const cleanExisting = (existing ?? []).filter((e: any) => !duplicateIds.includes(e.id));
  const existingByLease = new Map<string, any>();
  cleanExisting.forEach((e: any) => {
    if (e.lease_id) existingByLease.set(e.lease_id, e);
  });

  const timeStr = (params.alertTime ?? "09:00").slice(0, 5);
  const [hhStr, mmStr] = timeStr.split(":");
  const hh = Math.max(0, Math.min(23, Number(hhStr) || 0));
  const mm = Math.max(0, Math.min(59, Number(mmStr) || 0));
  // Minutes before midnight on expiry date, so reminder occurs at HH:MM on (expiry - alertDays)
  const minutesBefore = Math.max(0, Math.floor(params.alertDays * 24 * 60) + hh * 60 + mm);

  const toInsert: any[] = [];
  const toUpdate: { id: string; patch: any }[] = [];
  const terminatedLeaseEventIds: string[] = [];

  leases.forEach((l) => {
    const leaseId = l.id;
    const isTerminated = l.status === "terminated";
    const endDateOnly = String(l.end_date).slice(0, 10);
    const startIso = new Date(`${endDateOnly}T00:00:00`).toISOString();
    const endIso = new Date(new Date(startIso).getTime() + 24 * 60 * 60 * 1000).toISOString();
    const existingEvt = existingByLease.get(leaseId);

    if (isTerminated) {
      if (existingEvt?.id) terminatedLeaseEventIds.push(existingEvt.id);
      return;
    }

    const title = `Lease expires: ${l.property?.name ?? l.property_id}`;
    const patch = {
      title,
      start: startIso,
      end: endIso,
      all_day: true,
      alert_minutes_before: minutesBefore,
      type: "lease_expiry",
      lease_id: leaseId,
      property_id: l.property_id,
    };

    if (!existingEvt) {
      toInsert.push(patch);
    } else {
      toUpdate.push({ id: existingEvt.id, patch });
    }
  });

  if (toInsert.length > 0) {
    const { error: insErr } = await supabase.from("calendar_events").insert(
      toInsert.map((e) => ({ ...e, user_id: uid }))
    );
    if (insErr) throw insErr;
  }

  for (const u of toUpdate) {
    const { error: updErr } = await supabase.from("calendar_events").update(u.patch).eq("id", u.id);
    if (updErr) throw updErr;
  }

  if (terminatedLeaseEventIds.length > 0) {
    const { error: delErr } = await supabase.from("calendar_events").delete().in("id", terminatedLeaseEventIds);
    if (delErr) throw delErr;
  }

  return true;
}