import React from "react";
import AppShell from "@/components/layout/AppShell";
import { useAuth } from "@/contexts/AuthProvider";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { listEvents, createEvent, updateEvent, deleteEvent, type CalendarEvent, syncEventsToGoogle } from "@/services/calendar";
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
  const { role } = useAuth();
  const { toast } = useToast();
  const qc = useQueryClient();

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

  const syncToGoogle = async () => {
    try {
      await syncEventsToGoogle();
      toast({ title: "Sync started", description: "Events are being synced to Google Calendar." });
    } catch (e: any) {
      toast({ title: "Sync failed", description: e.message, variant: "destructive" });
    }
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