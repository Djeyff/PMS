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

  const authHeader = req.headers.get("Authorization");
  if (!authHeader) {
    console.error("[calendar-list] Missing Authorization header");
    return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: corsHeaders });
  }

  let payload: any = {};
  try {
    payload = await req.json();
    console.log("[calendar-list] payload received", { hasProviderToken: !!payload?.providerToken });
  } catch (_e) {
    console.error("[calendar-list] Invalid JSON body");
    return new Response(JSON.stringify({ error: "Invalid JSON" }), { status: 400, headers: corsHeaders });
  }

  const providerToken: string | undefined = payload?.providerToken;
  if (!providerToken) {
    console.error("[calendar-list] Missing providerToken");
    return new Response(JSON.stringify({ error: "Missing provider token" }), { status: 400, headers: corsHeaders });
  }

  try {
    // Get user info (email)
    const userInfoRes = await fetch("https://www.googleapis.com/oauth2/v2/userinfo", {
      headers: { Authorization: `Bearer ${providerToken}` },
    });
    if (!userInfoRes.ok) {
      const err = await userInfoRes.json().catch(() => ({}));
      console.error("[calendar-list] userinfo error", { status: userInfoRes.status, err });
      return new Response(JSON.stringify({ error: "Failed to fetch Google user info" }), { status: 400, headers: corsHeaders });
    }
    const userInfo = await userInfoRes.json();

    // Get calendars
    const calRes = await fetch("https://www.googleapis.com/calendar/v3/users/me/calendarList", {
      headers: { Authorization: `Bearer ${providerToken}` },
    });
    if (!calRes.ok) {
      const err = await calRes.json().catch(() => ({}));
      console.error("[calendar-list] calendarList error", { status: calRes.status, err });
      return new Response(JSON.stringify({ error: "Failed to list calendars" }), { status: 400, headers: corsHeaders });
    }
    const calList = await calRes.json();

    console.log("[calendar-list] fetched calendars", { count: Array.isArray(calList.items) ? calList.items.length : 0 });
    return new Response(
      JSON.stringify({
        email: userInfo?.email ?? null,
        calendars: (calList?.items ?? []).map((c: any) => ({
          id: c.id,
          summary: c.summary,
          primary: !!c.primary,
        })),
      }),
      { status: 200, headers: corsHeaders }
    );
  } catch (e) {
    console.error("[calendar-list] unexpected error", { error: String(e) });
    return new Response(JSON.stringify({ error: "Unexpected error" }), { status: 500, headers: corsHeaders });
  }
});