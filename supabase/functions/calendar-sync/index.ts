declare const Deno: {
  serve: (handler: (req: Request) => Response | Promise<Response>) => void;
  env: { get: (name: string) => string | undefined };
};

Deno.serve(async (req: Request) => {
  const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  };

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
  if (!providerToken) {
    console.error("[calendar-sync] Missing providerToken");
    return new Response(JSON.stringify({ error: "Missing provider token from Google OAuth" }), { status: 400, headers: corsHeaders });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY")!;

  const select =
    "id,title,description,start,end,all_day,alert_minutes_before";
  const baseUrl = `${supabaseUrl}/rest/v1/calendar_events`;
  const params = new URLSearchParams({
    select,
    "order": "start.asc",
  });

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

  let inserted = 0;
  let updated = 0;
  const errors: Array<{ id: string; message: string }> = [];

  function buildGoogleEventBody(e: any): any {
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
    if (e.all_day) {
      const startDate = new Date(e.start).toISOString().slice(0, 10);
      const endDate = new Date(e.end).toISOString().slice(0, 10);
      body.start = { date: startDate };
      body.end = { date: endDate };
    } else {
      body.start = { dateTime: e.start };
      body.end = { dateTime: e.end };
    }
    return body;
  }

  for (const e of sanitized) {
    try {
      const listUrl = `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(
        calendarId
      )}/events?privateExtendedProperty=${encodeURIComponent(`pms_event_id=${e.id}`)}`;

      const listRes = await fetch(listUrl, {
        method: "GET",
        headers: { Authorization: `Bearer ${providerToken}` },
      });

      if (!listRes.ok) {
        const errBody = await listRes.json().catch(() => ({}));
        console.error("[calendar-sync] list error", { id: e.id, status: listRes.status, errBody });
        errors.push({ id: e.id, message: `List failed: ${listRes.status}` });
        continue;
      }

      const listed = await listRes.json().catch(() => ({ items: [] }));
      const body = buildGoogleEventBody(e);

      if (Array.isArray(listed.items) && listed.items.length > 0) {
        const eventId = listed.items[0].id;
        const updUrl = `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(
          calendarId
        )}/events/${encodeURIComponent(eventId)}`;
        const updRes = await fetch(updUrl, {
          method: "PATCH",
          headers: { Authorization: `Bearer ${providerToken}`, "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });
        if (!updRes.ok) {
          const errBody = await updRes.json().catch(() => ({}));
          console.error("[calendar-sync] update error", { id: e.id, eventId, status: updRes.status, errBody });
          errors.push({ id: e.id, message: `Update failed: ${updRes.status}` });
          continue;
        }
        updated += 1;
        console.log("[calendar-sync] updated", { id: e.id, eventId });
      } else {
        const insUrl = `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(
          calendarId
        )}/events`;
        const insRes = await fetch(insUrl, {
          method: "POST",
          headers: { Authorization: `Bearer ${providerToken}`, "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });
        if (!insRes.ok) {
          const errBody = await insRes.json().catch(() => ({}));
          console.error("[calendar-sync] insert error", { id: e.id, status: insRes.status, errBody });
          errors.push({ id: e.id, message: `Insert failed: ${insRes.status}` });
          continue;
        }
        inserted += 1;
        console.log("[calendar-sync] inserted", { id: e.id });
      }
    } catch (err) {
      console.error("[calendar-sync] exception", { id: e.id, error: String(err) });
      errors.push({ id: e.id, message: String(err) });
    }
  }

  console.log("[calendar-sync] done", { inserted, updated, errorsCount: errors.length });

  return new Response(
    JSON.stringify({ ok: true, calendarId, inserted, updated, errors }),
    { status: 200, headers: corsHeaders }
  );
});