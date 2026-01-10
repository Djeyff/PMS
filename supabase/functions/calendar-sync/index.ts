declare const Deno: {
  serve: (handler: (req: Request) => Response | Promise<Response>) => void;
};

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  // Manual authentication
  const authHeader = req.headers.get("Authorization");
  if (!authHeader) {
    console.error("[calendar-sync] Missing Authorization header");
    return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: corsHeaders });
  }

  let payload: any = {};
  try {
    payload = await req.json();
    console.log("[calendar-sync] payload received", { hasEventIds: Array.isArray(payload?.eventIds), calendarId: payload?.calendarId ? "provided" : "default", hasProviderToken: !!payload?.providerToken });
  } catch (_e) {
    console.error("[calendar-sync] Invalid JSON body");
    return new Response(JSON.stringify({ error: "Invalid JSON" }), { status: 400, headers: corsHeaders });
  }

  const calendarId = payload?.calendarId || "primary";
  const providerToken: string | undefined = payload?.providerToken;
  const maskedToken = providerToken ? `${providerToken.slice(0, 8)}...(${providerToken.length})` : "none";
  console.log("[calendar-sync] Target calendar:", calendarId);
  console.log("[calendar-sync] Provider token:", maskedToken);

  // TODO: Use providerToken to call Google Calendar API on behalf of the user.
  // Example: fetch('https://www.googleapis.com/calendar/v3/calendars/' + calendarId + '/events', { headers: { Authorization: 'Bearer ' + providerToken } })
  console.log("[calendar-sync] Sync initiated");
  return new Response(JSON.stringify({ ok: true, message: "Sync initiated", calendarId, providerTokenReceived: !!providerToken }), { status: 200, headers: corsHeaders });
});