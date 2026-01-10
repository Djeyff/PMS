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
import "react-big-calendar/lib/css/react-big-calendar.css";

const locales = {};
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
  const { role, user, profile } = useAuth();
  const { toast } = useToast();
  const qc = useQueryClient();

  const { data: settings, refetch: refetchSettings } = useQuery({
    queryKey: ["calendar-settings"],
    queryFn: getMyCalendarSettings,
  });

  const [showLeaseExpiry, setShowLeaseExpiry] = React.useState(true);
  const [alertDays, setAlertDays] = React.useState<number>(settings?.lease_alert_days ?? 7);
  const [googleEmail, setGoogleEmail] = React.useState<string>(settings?.google_account_email ?? "");
  const [googleCalendarId, setGoogleCalendarId] = React.useState<string>(settings?.google_calendar_id ?? "");

  React.useEffect(() => {
    if (settings) {
      setAlertDays(settings.lease_alert_days ?? 7);
      setGoogleEmail(settings.google_account_email ?? "");
      setGoogleCalendarId(settings.google_calendar_id ?? "");
    }
  }, [settings]);

  const { data: events, isLoading } = useQuery({
    queryKey: ["calendar-events"],
    queryFn: listEvents,
  });

  const createMut = useMutation({
    mutationFn: (evt: UiEvent) => createEvent(toDbEvent(evt)),
    onSuccess: () => {
      toast({ title: "Event added" });
      qc.invalidateQueries({ queryKey: ["calendar-events"] });
    },
  });

  const updateMut = useMutation({
    mutationFn: (payload: { id: string; patch: Partial<UiEvent> }) => {
      const patchDb: any = {};
      if (payload.patch.title != null) patchDb.title = payload.patch.title;
      if (payload.patch.start) patchDb.start = payload.patch.start.toISOString();
      if (payload.patch.end) patchDb.end = payload.patch.end.toISOString();
      if (payload.patch.allDay != null) patchDb.all_day = !!payload.patch.allDay;
      return updateEvent(payload.id, patchDb);
    },
    onSuccess: () => {
      toast({ title: "Event updated" });
      qc.invalidateQueries({ queryKey: ["calendar-events"] });
    },
  });

  const deleteMut = useMutation({
    mutationFn: (id: string) => deleteEvent(id),
    onSuccess: () => {
      toast({ title: "Event deleted" });
      qc.invalidateQueries({ queryKey: ["calendar-events"] });
    },
  });

  const ensureLeaseExpiry = async () => {
    if (!showLeaseExpiry) return;
    await upsertLeaseExpiryEvents({
      role,
      userId: user?.id ?? null,
      agencyId: profile?.agency_id ?? null,
      alertDays,
    });
    await qc.invalidateQueries({ queryKey: ["calendar-events"] });
  };

  React.useEffect(() => {
    // On load and when toggled, ensure lease expiry events are up-to-date
    ensureLeaseExpiry().catch(() => {});
  }, [showLeaseExpiry]);

  const saveSettings = async () => {
    await saveMyCalendarSettings({
      google_account_email: googleEmail || null,
      google_calendar_id: googleCalendarId || null,
      lease_alert_days: alertDays,
    });
    toast({ title: "Settings saved" });
    refetchSettings();
    // Re-ensure events with new alertDays
    await ensureLeaseExpiry();
  };

  const connectGoogle = async () => {
    try {
      const { data, error } = await supabase.auth.signInWithOAuth({
        provider: "google",
        options: {
          redirectTo: `${window.location.origin}/calendar`,
          scopes: "https://www.googleapis.com/auth/calendar https://www.googleapis.com/auth/userinfo.email",
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

  const syncToGoogle = async () => {
    try {
      await syncEventsToGoogle(undefined, googleCalendarId || undefined);
      toast({ title: "Sync started", description: googleCalendarId ? `Target calendar: ${googleCalendarId}` : "Default calendar" });
    } catch (e: any) {
      toast({ title: "Sync failed", description: e.message, variant: "destructive" });
    }
  };

  const [open, setOpen] = React.useState(false);
  const [active, setActive] = React.useState<UiEvent | null>(null);
  const [view, setView] = React.useState<View>("month");

  const uiEvents: UiEvent[] = (events ?? []).map(toUiEvent);

  const onSelectSlot = (slot: { start: Date; end: Date; action: "select" }) => {
    setActive({ title: "", start: slot.start, end: slot.end, allDay: false });
    setOpen(true);
  };

  const onSelectEvent = (event: UiEvent) => {
    setActive(event);
    setOpen(true);
  };

  const saveEvent = () => {
    if (!active) return;
    if (!active.id) {
      createMut.mutate(active);
    } else {
      updateMut.mutate({ id: active.id, patch: active });
    }
    setOpen(false);
  };

  const removeEvent = () => {
    if (active?.id) deleteMut.mutate(active.id);
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
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <div className="text-xs text-muted-foreground">Alert lead time (days)</div>
                    <Input
                      type="number"
                      min={0}
                      value={alertDays}
                      onChange={(e) => setAlertDays(Math.max(0, Number(e.target.value || 0)))}
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
                  <div className="text-xs text-muted-foreground">Target Calendar ID</div>
                  <Input
                    placeholder="primary or calendarId@group.calendar.google.com"
                    value={googleCalendarId}
                    onChange={(e) => setGoogleCalendarId(e.target.value)}
                  />
                </div>
                <div className="mt-2 flex items-center gap-2">
                  <Button variant="outline" size="sm" onClick={connectGoogle}>Connect Google</Button>
                  <Button size="sm" onClick={saveSettings}>Save</Button>
                </div>
                <div className="mt-2 text-xs text-muted-foreground">
                  If you see "Unsupported provider", enable Google in Supabase (Auth → Providers), add Client ID/Secret, and set Redirect URL to {window.location.origin}/calendar.
                </div>
              </div>
            </div>

            {isLoading ? (
              <div className="text-sm text-muted-foreground">Loading calendar...</div>
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