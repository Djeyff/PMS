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
    console.log("[calendar-sync] payload received", payload);
  } catch (_e) {
    console.error("[calendar-sync] Invalid JSON body");
    return new Response(JSON.stringify({ error: "Invalid JSON" }), { status: 400, headers: corsHeaders });
  }

  const calendarId = payload?.calendarId || "primary";
  console.log("[calendar-sync] Target calendar:", calendarId);

  // TODO: Integrate Google Calendar API using stored credentials:
  // - Use Supabase secrets to store GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, GOOGLE_REFRESH_TOKEN
  // - Exchange refresh token to access token, then upsert events by ID
  // This function currently acts as a stub and returns success.
  console.log("[calendar-sync] Sync initiated");
  return new Response(JSON.stringify({ ok: true, message: "Sync initiated", calendarId }), { status: 200, headers: corsHeaders });
});