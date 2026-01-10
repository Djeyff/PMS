import React from "react";
import AppShell from "@/components/layout/AppShell";
import { useAuth } from "@/contexts/AuthProvider";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { listEvents, createEvent, updateEvent, deleteEvent, type CalendarEvent, syncEventsToGoogle, upsertLeaseExpiryEvents } from "@/services/calendar";
import { getMyCalendarSettings, saveMyCalendarSettings } from "@/services/calendar-settings";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useToast } from "@/components/ui/use-toast";
import { Calendar as RBCalendar, dateFnsLocalizer, View } from "react-big-calendar";
import { format, parse, startOfWeek, getDay } from "date-fns";
import { enUS } from "date-fns/locale";
import "react-big-calendar/lib/css/react-big-calendar.css";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast as notify } from "sonner";
import { fetchAgencyById } from "@/services/agencies";

const locales = { "en-US": enUS };
const localizer = dateFnsLocalizer({ format, parse, startOfWeek, getDay, locales });

type UiEvent = {
  id?: string;
  title: string;
  start: Date;
  end: Date;
  allDay?: boolean;
};

function toUiEvent(e: CalendarEvent): UiEvent {
  return {
    id: e.id,
    title: e.title,
    start: new Date(e.start),
    end: new Date(e.end),
    allDay: !!e.all_day,
  };
}

function toDbEvent(e: UiEvent): Omit<CalendarEvent, "id" | "user_id" | "created_at"> {
  return {
    title: e.title,
    start: e.start.toISOString(),
    end: e.end.toISOString(),
    all_day: !!e.allDay,
  };
}

const CalendarPage: React.FC = () => {
  const { role, user, profile, providerToken } = useAuth();
  const { toast } = useToast();
  const qc = useQueryClient();

  // Load agency timezone
  const { data: agency } = useQuery({
    queryKey: ["calendar-agency", profile?.agency_id],
    enabled: !!profile?.agency_id,
    queryFn: () => fetchAgencyById(profile!.agency_id!),
  });

  // Google calendars state
  const [googleCalendars, setGoogleCalendars] = React.useState<Array<{ id: string; summary: string; primary?: boolean }>>([]);

  const { data: settings, refetch: refetchSettings } = useQuery({
    queryKey: ["calendar-settings"],
    queryFn: getMyCalendarSettings,
    enabled: !!user?.id,
  });

  const [showLeaseExpiry, setShowLeaseExpiry] = React.useState(true);
  const [alertDays, setAlertDays] = React.useState<number>(settings?.lease_alert_days ?? 7);
  const [alertTime, setAlertTime] = React.useState<string>(settings?.lease_alert_time ?? "09:00"); // NEW: HH:MM
  const [googleEmail, setGoogleEmail] = React.useState<string>(settings?.google_account_email ?? "");
  const [googleCalendarId, setGoogleCalendarId] = React.useState<string>(settings?.google_calendar_id ?? "");

  React.useEffect(() => {
    if (settings) {
      setAlertDays(settings.lease_alert_days ?? 7);
      setAlertTime(settings.lease_alert_time ?? "09:00");
      setGoogleEmail(settings.google_account_email ?? "");
      setGoogleCalendarId(settings.google_calendar_id ?? "");
    }
  }, [settings]);

  const { data: events, isLoading, isError, error } = useQuery({
    queryKey: ["calendar-events", user?.id],
    queryFn: listEvents,
    enabled: !!user?.id,
  });

  // Ensure lease expiry events with chosen lead time + time
  const ensureLeaseExpiry = async () => {
    if (!showLeaseExpiry || !user?.id) return;
    await upsertLeaseExpiryEvents({
      role,
      userId: user?.id ?? null,
      agencyId: profile?.agency_id ?? null,
      alertDays,
      alertTime,
      timezone: agency?.timezone ?? "UTC",
    });
    await qc.invalidateQueries({ queryKey: ["calendar-events"] });
    notify.success(`Reminder settings updated (${alertDays} day(s) before at ${alertTime}${agency?.timezone ? ` • ${agency.timezone}` : ""})`, { position: "bottom-right" });
  };

  React.useEffect(() => {
    ensureLeaseExpiry().catch(() => {});
  }, [showLeaseExpiry, user?.id]);

  const syncToGoogle = async () => {
    try {
      const previousCalendarId = settings?.google_calendar_id ?? null;
      const changedCalendar = previousCalendarId && previousCalendarId !== googleCalendarId;

      await syncEventsToGoogle(
        undefined,
        googleCalendarId || undefined,
        providerToken || undefined,
        changedCalendar ? previousCalendarId || undefined : undefined,
        agency?.timezone || undefined
      );

      const target = googleCalendarId ? `Target calendar: ${googleCalendarId}` : "Default calendar";
      notify.success(
        providerToken ? (changedCalendar ? "Old calendar cleaned and new calendar synced" : `Sync started • ${target}`) : "Connect Google first to use your account token.",
        { position: "bottom-right" }
      );
    } catch (e: any) {
      notify.error(`Sync failed: ${e.message}`, { position: "bottom-right" });
    }
  };

  const saveSettings = async () => {
    const previousCalendarId = settings?.google_calendar_id ?? null;
    const changedCalendar = previousCalendarId && previousCalendarId !== googleCalendarId;

    await saveMyCalendarSettings({
      google_account_email: googleEmail || null,
      google_calendar_id: googleCalendarId || null,
      lease_alert_days: alertDays,
      lease_alert_time: alertTime,
    });

    notify.success("Settings saved", { position: "bottom-right" });
    refetchSettings();

    // Re-ensure events with new alertDays/time
    await ensureLeaseExpiry();

    // If calendar changed, remove events from previous target and sync to new
    if (changedCalendar && providerToken) {
      try {
        await syncEventsToGoogle(
          undefined,
          googleCalendarId || undefined,
          providerToken || undefined,
          previousCalendarId || undefined,
          agency?.timezone || undefined
        );
        notify.success("Old calendar cleaned and new calendar synced", { position: "bottom-right" });
      } catch (e: any) {
        notify.error(`Cleanup/sync failed: ${e.message}`, { position: "bottom-right" });
      }
    }
  };

  const connectGoogle = async () => {
    try {
      const { data, error } = await supabase.auth.signInWithOAuth({
        provider: "google",
        options: {
          redirectTo: "https://app.lasterrenas.properties/calendar",
          scopes: "https://www.googleapis.com/auth/calendar https://www.googleapis.com/auth/userinfo.email",
          queryParams: {
            access_type: "offline",           // request refresh + access token
            prompt: "consent",                // force consent screen to grant scopes
            include_granted_scopes: "true",   // merge previously granted scopes
          },
        },
      });
      if (error) {
        const msg = error.message || "Google sign-in failed";
        toast({ title: "Google connect error", description: msg, variant: "destructive" });
      }
    } catch (e: any) {
      const msg = e?.message || "Google sign-in failed";
      toast({ title: "Google connect error", description: msg, variant: "destructive" });
    }
  };

  const loadCalendars = async () => {
    if (!providerToken) {
      toast({
        title: "Google not fully connected",
        description:
          "No provider token received. Please enable 'Retrieve provider tokens' in Supabase and re-connect with consent.",
        variant: "destructive",
      });
      return;
    }
    try {
      const { data: sess } = await supabase.auth.getSession();
      const token = sess.session?.access_token;
      if (!token) throw new Error("Not authenticated");
      const url = "https://tsfswvmwkfairaoccfqa.supabase.co/functions/v1/calendar-list";
      const res = await fetch(url, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ providerToken }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err?.error || `Failed to load calendars (${res.status})`);
      }
      const out = await res.json();
      setGoogleCalendars(out?.calendars ?? []);
      if (out?.email) setGoogleEmail(out.email);
      const primary = (out?.calendars ?? []).find((c: any) => c.primary);
      if (!googleCalendarId && primary?.id) setGoogleCalendarId(primary.id);
      toast({ title: "Loaded Google calendars", description: `${(out?.calendars ?? []).length} calendars found.` });
    } catch (e: any) {
      toast({
        title: "Failed to load calendars",
        description: e.message.includes("provider token")
          ? "Provider token missing. Enable token retrieval in Supabase and re-consent."
          : e.message,
        variant: "destructive",
      });
    }
  };

  // Auto-load after connect
  React.useEffect(() => {
    if (providerToken && googleCalendars.length === 0) {
      loadCalendars().catch(() => {});
    }
  }, [providerToken]);

  const [open, setOpen] = React.useState(false);
  const [active, setActive] = React.useState<UiEvent | null>(null);
  const [view, setView] = React.useState<View>("month");

  // Filter invalid events to avoid calendar crashes
  const uiEvents: UiEvent[] = ((events ?? []).map(toUiEvent)).filter((e) => {
    return e.start instanceof Date && !Number.isNaN(e.start.getTime()) &&
           e.end instanceof Date && !Number.isNaN(e.end.getTime());
  });

  const onSelectSlot = (slot: { start: Date; end: Date; action: "select" }) => {
    setActive({ title: "", start: slot.start, end: slot.end, allDay: false });
    setOpen(true);
  };

  const onSelectEvent = (event: UiEvent) => {
    setActive(event);
    setOpen(true);
  };

  const saveEvent = async () => {
    if (!active) return;
    if (!active.id) {
      await createEvent(toDbEvent(active));
      notify.success("Event added", { position: "bottom-right" });
    } else {
      await updateEvent(active.id, {
        title: active.title,
        start: active.start.toISOString(),
        end: active.end.toISOString(),
        all_day: !!active.allDay,
      } as any);
      notify.success("Event updated", { position: "bottom-right" });
    }
    await qc.invalidateQueries({ queryKey: ["calendar-events"] });
    setOpen(false);
  };

  const removeEvent = async () => {
    if (active?.id) {
      await deleteEvent(active.id);
      notify.success("Event deleted", { position: "bottom-right" });
      await qc.invalidateQueries({ queryKey: ["calendar-events"] });
    }
    setOpen(false);
  };

  return (
    <AppShell>
      <div className="space-y-6">
        <Card>
          <CardHeader className="flex items-center justify-between">
            <CardTitle>Calendar</CardTitle>
            <div className="flex items-center gap-2">
              <Button variant="outline" size="sm" onClick={() => setView("month")}>Month</Button>
              <Button variant="outline" size="sm" onClick={() => setView("week")}>Week</Button>
              <Button variant="outline" size="sm" onClick={() => setView("day")}>Day</Button>
              <Button size="sm" onClick={syncToGoogle}>Sync to Google</Button>
            </div>
          </CardHeader>
          <CardContent>
            <div className="mb-4 grid grid-cols-1 md:grid-cols-3 gap-3">
              <div className="p-3 border rounded-md">
                <div className="font-medium text-sm mb-2">Lease expiry events</div>
                <div className="flex items-center gap-2 mb-2">
                  <label className="text-sm">Show in calendar</label>
                  <Button variant={showLeaseExpiry ? "default" : "outline"} size="sm" onClick={() => setShowLeaseExpiry((v) => !v)}>
                    {showLeaseExpiry ? "On" : "Off"}
                  </Button>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
                  <div>
                    <div className="text-xs text-muted-foreground">Alert lead time (days)</div>
                    <Input
                      type="number"
                      min={0}
                      value={alertDays}
                      onChange={(e) => setAlertDays(Math.max(0, Number(e.target.value || 0)))}
                    />
                  </div>
                  <div>
                    <div className="text-xs text-muted-foreground">
                      Reminder time {agency?.timezone ? `(${agency.timezone})` : ""}
                    </div>
                    <Input
                      type="time"
                      value={alertTime}
                      onChange={(e) => setAlertTime(e.target.value)}
                    />
                  </div>
                  <div className="flex items-end">
                    <Button className="w-full" variant="outline" onClick={ensureLeaseExpiry}>Apply</Button>
                  </div>
                </div>
              </div>
              <div className="p-3 border rounded-md">
                <div className="font-medium text-sm mb-2">Google Sync Settings</div>
                <div>
                  <div className="text-xs text-muted-foreground">Google account (email)</div>
                  <Input
                    placeholder="name@example.com"
                    value={googleEmail}
                    onChange={(e) => setGoogleEmail(e.target.value)}
                  />
                </div>
                <div className="mt-2">
                  <div className="text-xs text-muted-foreground">Target Calendar</div>
                  <Select
                    value={googleCalendarId}
                    onValueChange={setGoogleCalendarId}
                  >
                    <SelectTrigger className="w-full">
                      <SelectValue placeholder="Choose calendar" />
                    </SelectTrigger>
                    <SelectContent>
                      {googleCalendars.length === 0 ? (
                        // Use a non-empty disabled placeholder to satisfy Radix Select requirements
                        <SelectItem value="__placeholder__" disabled>
                          No calendars loaded
                        </SelectItem>
                      ) : (
                        googleCalendars.map((c) => (
                          <SelectItem key={c.id} value={c.id}>
                            {c.summary} {c.primary ? "(primary)" : ""}
                          </SelectItem>
                        ))
                      )}
                    </SelectContent>
                  </Select>
                </div>
                <div className="mt-2 flex items-center gap-2">
                  <Button variant="outline" size="sm" onClick={connectGoogle}>Connect Google</Button>
                  <Button variant="outline" size="sm" onClick={loadCalendars}>Load my calendars</Button>
                  <Button size="sm" onClick={saveSettings}>Save</Button>
                </div>
                <div className="mt-2 text-xs text-muted-foreground">
                  Redirect URL: https://app.lasterrenas.properties/calendar. {providerToken ? "Google connected." : "Not connected yet."}
                </div>
              </div>
            </div>

            {isLoading ? (
              <div className="text-sm text-muted-foreground">Loading calendar...</div>
            ) : isError ? (
              <div className="text-sm text-destructive">
                Failed to load events: {error instanceof Error ? error.message : "Unknown error"}
              </div>
            ) : uiEvents.length === 0 ? (
              <div className="text-sm text-muted-foreground">
                No events yet. Use the calendar to add one or enable lease expiry events above.
              </div>
            ) : (
              <div className="h-[70vh]">
                <RBCalendar
                  localizer={localizer}
                  events={uiEvents}
                  startAccessor="start"
                  endAccessor="end"
                  views={["month", "week", "day"]}
                  view={view}
                  onView={(v) => setView(v)}
                  selectable
                  onSelectSlot={onSelectSlot}
                  onSelectEvent={onSelectEvent}
                  popup
                  style={{ height: "100%" }}
                />
              </div>
            )}
          </CardContent>
        </Card>

        <Dialog open={open} onOpenChange={setOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{active?.id ? "Edit Event" : "Add Event"}</DialogTitle>
            </DialogHeader>
            <div className="space-y-3">
              <div>
                <div className="text-xs text-muted-foreground">Title</div>
                <Input
                  value={active?.title ?? ""}
                  onChange={(e) => setActive((prev) => prev ? { ...prev, title: e.target.value } : prev)}
                  placeholder="Enter title"
                />
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div>
                  <div className="text-xs text-muted-foreground">Start</div>
                  <Input
                    type="datetime-local"
                    value={active ? format(active.start, "yyyy-MM-dd'T'HH:mm") : ""}
                    onChange={(e) => {
                      const dt = new Date(e.target.value);
                      setActive((prev) => prev ? { ...prev, start: dt } : prev);
                    }}
                  />
                </div>
                <div>
                  <div className="text-xs text-muted-foreground">End</div>
                  <Input
                    type="datetime-local"
                    value={active ? format(active.end, "yyyy-MM-dd'T'HH:mm") : ""}
                    onChange={(e) => {
                      const dt = new Date(e.target.value);
                      setActive((prev) => prev ? { ...prev, end: dt } : prev);
                    }}
                  />
                </div>
              </div>
              <div className="flex items-center justify-end gap-2">
                {active?.id ? <Button variant="destructive" onClick={removeEvent}>Delete</Button> : null}
                <Button onClick={saveEvent}>{active?.id ? "Save" : "Add"}</Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      </div>
    </AppShell>
  );
};

export default CalendarPage;