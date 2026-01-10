declare const Deno: {
  serve: (handler: (req: Request) => Response | Promise<Response>) => void;
  env: { get: (name: string) => string | undefined };
};

// Hoist CORS headers to top-level so the file begins with valid code
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const authHeader = req.headers.get("Authorization");
  if (!authHeader) {
    console.error("[calendar-sync] Missing Authorization header");
    return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: corsHeaders });
  }

  let payload: any = {};
  try {
    payload = await req.json();
    console.log("[calendar-sync] payload received", {
      hasEventIds: Array.isArray(payload?.eventIds),
      calendarId: payload?.calendarId ? "provided" : "default",
      hasProviderToken: !!payload?.providerToken,
    });
  } catch (_e) {
    console.error("[calendar-sync] Invalid JSON body");
    return new Response(JSON.stringify({ error: "Invalid JSON" }), { status: 400, headers: corsHeaders });
  }

  const calendarId = (payload?.calendarId || "primary") as string;
  const providerToken: string | undefined = payload?.providerToken;
  const cleanupFromCalendarId: string | undefined = payload?.cleanupFromCalendarId;
  const timeZone: string | undefined = payload?.timeZone;

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY")!;

  const select = "id,title,description,start,end,all_day,alert_minutes_before,type";
  const baseUrl = `${supabaseUrl}/rest/v1/calendar_events`;
  const params = new URLSearchParams({ select, order: "start.asc" });

  if (Array.isArray(payload?.eventIds) && payload.eventIds.length > 0) {
    const list = payload.eventIds.join(",");
    params.set("id", `in.(${list})`);
  }

  const eventsRes = await fetch(`${baseUrl}?${params.toString()}`, {
    method: "GET",
    headers: {
      Authorization: authHeader,
      apikey: supabaseAnonKey,
    },
  });

  if (!eventsRes.ok) {
    const errBody = await eventsRes.json().catch(() => ({}));
    console.error("[calendar-sync] Failed to fetch events", { status: eventsRes.status, errBody });
    return new Response(JSON.stringify({ error: "Failed to fetch events" }), { status: 500, headers: corsHeaders });
  }

  const events = await eventsRes.json().catch(() => []);
  const sanitized = (events ?? []).filter((e: any) => {
    const s = new Date(e.start);
    const f = new Date(e.end);
    return !Number.isNaN(s.getTime()) && !Number.isNaN(f.getTime());
  });

  async function upsertGoogleEventByKey(calId: string, key: string, keyValue: string, body: any) {
    const listUrl = `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calId)}/events?privateExtendedProperty=${encodeURIComponent(`${key}=${keyValue}`)}`;
    const listRes = await fetch(listUrl, { method: "GET", headers: { Authorization: `Bearer ${providerToken}` } });
    if (!listRes.ok) {
      const errBody = await listRes.json().catch(() => ({}));
      console.error("[calendar-sync] list error", { key, keyValue, status: listRes.status, errBody });
      return { inserted: 0, updated: 0, error: `List failed: ${listRes.status}` };
    }
    const listed = await listRes.json().catch(() => ({ items: [] }));
    if (Array.isArray(listed.items) && listed.items.length > 0) {
      const eventId = listed.items[0].id;
      const updUrl = `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calId)}/events/${encodeURIComponent(eventId)}`;
      const updRes = await fetch(updUrl, {
        method: "PATCH",
        headers: { Authorization: `Bearer ${providerToken}`, "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!updRes.ok) {
        const errBody = await updRes.json().catch(() => ({}));
        console.error("[calendar-sync] update error", { key, keyValue, eventId, status: updRes.status, errBody });
        return { inserted: 0, updated: 0, error: `Update failed: ${updRes.status}` };
      }
      return { inserted: 0, updated: 1 };
    } else {
      const insUrl = `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calId)}/events`;
      const insRes = await fetch(insUrl, {
        method: "POST",
        headers: { Authorization: `Bearer ${providerToken}`, "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!insRes.ok) {
        const errBody = await insRes.json().catch(() => ({}));
        console.error("[calendar-sync] insert error", { key, keyValue, status: insRes.status, errBody });
        return { inserted: 0, updated: 0, error: `Insert failed: ${insRes.status}` };
      }
      return { inserted: 1, updated: 0 };
    }
  }

  if (cleanupFromCalendarId) {
    for (const e of sanitized) {
      for (const pair of [
        { key: "pms_event_id", val: e.id },
        { key: "pms_reminder_for", val: e.id },
      ]) {
        try {
          const listUrlOld = `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(cleanupFromCalendarId)}/events?privateExtendedProperty=${encodeURIComponent(`${pair.key}=${pair.val}`)}`;
          const listOldRes = await fetch(listUrlOld, { method: "GET", headers: { Authorization: `Bearer ${providerToken}` } });
          if (listOldRes.ok) {
            const listedOld = await listOldRes.json().catch(() => ({ items: [] }));
            if (Array.isArray(listedOld.items)) {
              for (const item of listedOld.items) {
                const delUrl = `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(cleanupFromCalendarId)}/events/${encodeURIComponent(item.id)}`;
                const delRes = await fetch(delUrl, { method: "DELETE", headers: { Authorization: `Bearer ${providerToken}` } });
                if (!delRes.ok) {
                  const errBody = await delRes.json().catch(() => ({}));
                  console.error("[calendar-sync] delete old error", { id: e.id, status: delRes.status, errBody, key: pair.key });
                } else {
                  console.log("[calendar-sync] deleted old", { id: e.id, eventId: item.id, key: pair.key });
                }
              }
            }
          }
        } catch (err) {
          console.error("[calendar-sync] cleanup exception", { id: e.id, error: String(err), key: pair.key });
        }
      }
    }
  }

  let inserted = 0;
  let updated = 0;
  const errors: Array<{ id: string; message: string }> = [];

  function buildMainEventBody(e: any): any {
    const minutes = typeof e.alert_minutes_before === "number" && e.alert_minutes_before > 0 ? e.alert_minutes_before : 0;
    const body: any = {
      summary: e.title,
      description: e.description ?? "",
      extendedProperties: { private: { pms_event_id: e.id } },
      reminders: {
        useDefault: false,
        overrides: minutes > 0 ? [{ method: "popup", minutes }] : [],
      },
    };
    const startDate = new Date(e.start).toISOString().slice(0, 10);
    const endDate = new Date(e.end).toISOString().slice(0, 10);
    body.start = { date: startDate };
    body.end = { date: endDate };
    return body;
  }

  function buildReminderEventBody(e: any): any {
    const total = typeof e.alert_minutes_before === "number" ? e.alert_minutes_before : 0;
    const days = Math.floor(total / 1440);
    const hm = total % 1440;
    const hh = Math.floor(hm / 60);
    const mm = hm % 60;

    const expiryDate = new Date(e.start);
    const reminderDate = new Date(expiryDate);
    reminderDate.setDate(reminderDate.getDate() - days);
    const y = reminderDate.getFullYear();
    const m = String(reminderDate.getMonth() + 1).padStart(2, "0");
    const d = String(reminderDate.getDate()).padStart(2, "0");
    const hhStr = String(hh).padStart(2, "0");
    const mmStr = String(mm).padStart(2, "0");
    const dateTimeStr = `${y}-${m}-${d}T${hhStr}:${mmStr}:00`;

    const body: any = {
      summary: `Reminder: ${e.title}`,
      description: e.description ?? "",
      extendedProperties: { private: { pms_reminder_for: e.id } },
      start: { dateTime: dateTimeStr, timeZone: timeZone || undefined },
      end: { dateTime: dateTimeStr, timeZone: timeZone || undefined },
      reminders: { useDefault: false, overrides: [] },
    };
    return body;
  }

  for (const e of sanitized) {
    try {
      const mainBody = buildMainEventBody(e);
      const mainResult = await upsertGoogleEventByKey(calendarId, "pms_event_id", e.id, mainBody);
      if (mainResult.error) errors.push({ id: e.id, message: mainResult.error });
      inserted += mainResult.inserted;
      updated += mainResult.updated;

      if (typeof e.alert_minutes_before === "number" && e.alert_minutes_before > 0) {
        const reminderBody = buildReminderEventBody(e);
        const remResult = await upsertGoogleEventByKey(calendarId, "pms_reminder_for", e.id, reminderBody);
        if (remResult.error) errors.push({ id: e.id, message: `Reminder: ${remResult.error}` });
        inserted += remResult.inserted;
        updated += remResult.updated;
      }
    } catch (err) {
      console.error("[calendar-sync] exception", { id: e.id, error: String(err) });
      errors.push({ id: e.id, message: String(err) });
    }
  }

  console.log("[calendar-sync] done", { inserted, updated, errorsCount: errors.length });

  return new Response(JSON.stringify({ ok: true, calendarId, inserted, updated, errors }), {
    status: 200,
    headers: corsHeaders,
  });
});