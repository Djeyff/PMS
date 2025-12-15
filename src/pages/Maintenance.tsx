import React, { useState, useEffect } from "react";
import AppShell from "@/components/layout/AppShell";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import { useAuth } from "@/contexts/AuthProvider";
import { useQuery } from "@tanstack/react-query";
import { fetchMaintenanceRequests, updateMaintenanceStatus, addMaintenanceLog, fetchMaintenanceLogsBulk } from "@/services/maintenance";
import NewRequestDialog from "@/components/maintenance/NewRequestDialog";
import { toast } from "sonner";
import { fetchAgencyById } from "@/services/agencies";
import { formatDateTimeInTZ } from "@/utils/datetime";

const Maintenance = () => {
  const { role, profile } = useAuth();
  const isAdmin = role === "agency_admin";
  const agencyId = profile?.agency_id ?? null;

  const [noteById, setNoteById] = useState<Record<string, string>>({});
  const [localNotesById, setLocalNotesById] = useState<Record<string, Array<{ id: string; note: string; created_at: string }>>>({});

  const { data: agency } = useQuery({
    queryKey: ["agency", agencyId],
    enabled: !!agencyId,
    queryFn: () => fetchAgencyById(agencyId!),
  });

  const tz = agency?.timezone ?? "UTC";

  const { data, isLoading, refetch } = useQuery({
    queryKey: ["maintenance", agencyId],
    enabled: !!agencyId,
    queryFn: () => fetchMaintenanceRequests({ agencyId: agencyId!, status: ["open", "in_progress", "closed"] }),
  });

  // Cache notes in localStorage so they show instantly and persist across refresh/restart
  const cacheKey = "maint_notes_cache";
  const getCache = (): Record<string, Array<{ id: string; note: string; created_at: string }>> => {
    try {
      const raw = localStorage.getItem(cacheKey);
      return raw ? JSON.parse(raw) : {};
    } catch {
      return {};
    }
  };
  const setCache = (map: Record<string, Array<{ id: string; note: string; created_at: string }>>) => {
    try {
      localStorage.setItem(cacheKey, JSON.stringify(map));
    } catch {
      // ignore storage errors
    }
  };

  // Load cached notes for visible requests on mount/data change
  const requestIds = (data ?? []).map((m) => m.id);
  useEffect(() => {
    const cache = getCache();
    const next: Record<string, Array<{ id: string; note: string; created_at: string }>> = {};
    requestIds.forEach((rid) => {
      if (cache[rid]?.length) next[rid] = cache[rid];
    });
    setLocalNotesById(next);
  }, [requestIds.length]);

  const { data: bulkLogs, isLoading: logsLoading, refetch: refetchBulkLogs } = useQuery({
    queryKey: ["maint-logs-bulk", agencyId, requestIds],
    enabled: !!agencyId && requestIds.length > 0,
    queryFn: () => fetchMaintenanceLogsBulk(requestIds),
  });

  // Merge server logs into local cache without blocking UI
  useEffect(() => {
    if (!bulkLogs) return;
    const merged: Record<string, Array<{ id: string; note: string; created_at: string }>> = { ...localNotesById };
    Object.entries(bulkLogs).forEach(([rid, logs]) => {
      const existing = merged[rid] ?? [];
      const union = new Map<string, { id: string; note: string; created_at: string }>();
      [...logs.map((l: any) => ({ id: l.id, note: l.note, created_at: l.created_at })), ...existing].forEach((ln) => {
        union.set(ln.id, ln);
      });
      merged[rid] = Array.from(union.values());
    });
    setLocalNotesById(merged);
    setCache(merged);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bulkLogs]);

  const onUpdateStatus = async (id: string, status: "open" | "in_progress" | "closed") => {
    try {
      await updateMaintenanceStatus(id, status);
      toast.success("Status updated");
      refetch();
      refetchBulkLogs();
    } catch (e: any) {
      toast.error(e?.message ?? "Failed to update status");
    }
  };

  const onSaveNote = async (id: string) => {
    const note = (noteById[id] ?? "").trim();
    if (!note) {
      toast.error("Please write a note");
      return;
    }
    // Optimistic: add locally and cache immediately
    const tempId = `local-${Date.now()}`;
    const createdAt = new Date().toISOString();
    setLocalNotesById((prev) => {
      const arr = prev[id] ? [...prev[id]] : [];
      arr.push({ id: tempId, note, created_at: createdAt });
      const next = { ...prev, [id]: arr };
      setCache(next);
      return next;
    });
    setNoteById((prev) => ({ ...prev, [id]: "" }));

    try {
      const created = await addMaintenanceLog(id, note);
      // Replace temp note with server note (keep order)
      setLocalNotesById((prev) => {
        const arr = (prev[id] ?? []).map((ln) => (ln.id === tempId ? { id: created.id, note: created.note, created_at: created.created_at } : ln));
        const next = { ...prev, [id]: arr };
        setCache(next);
        return next;
      });
      toast.success("Note saved");
      // Background refresh (no await) to bring author names if needed
      refetchBulkLogs();
    } catch (e: any) {
      // Roll back optimistic insert on error
      setLocalNotesById((prev) => {
        const arr = (prev[id] ?? []).filter((ln) => ln.id !== tempId);
        const next = { ...prev, [id]: arr };
        setCache(next);
        return next;
      });
      toast.error(e?.message ?? "Failed to save note");
    }
  };

  return (
    <AppShell>
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h1 className="text-xl font-semibold">Maintenance</h1>
          {isAdmin && agencyId ? <NewRequestDialog onCreated={() => refetch()} /> : null}
        </div>
        <Card>
          <CardHeader>
            <CardTitle>Requests</CardTitle>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="text-sm text-muted-foreground">Loading...</div>
            ) : (data?.length ?? 0) === 0 ? (
              <div className="text-sm text-muted-foreground">No maintenance requests.</div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Title</TableHead>
                    <TableHead>Property</TableHead>
                    <TableHead>Priority</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Due</TableHead>
                    <TableHead>Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {(data ?? []).map((m) => (
                    <TableRow key={m.id}>
                      <TableCell className="font-medium">{m.title}</TableCell>
                      <TableCell>{m.property?.name ?? m.property_id.slice(0, 8)}</TableCell>
                      <TableCell className="capitalize">{m.priority}</TableCell>
                      <TableCell className="capitalize">{m.status.replace("_", " ")}</TableCell>
                      <TableCell>{m.due_date ?? "—"}</TableCell>
                      <TableCell className="space-y-2">
                        <div className="flex flex-wrap gap-2">
                          {isAdmin ? (
                            <>
                              {m.status !== "in_progress" && (
                                <Button size="sm" variant="outline" onClick={() => onUpdateStatus(m.id, "in_progress")}>Start</Button>
                              )}
                              {m.status !== "closed" && (
                                <Button size="sm" variant="outline" onClick={() => onUpdateStatus(m.id, "closed")}>Close</Button>
                              )}
                            </>
                          ) : null}
                        </div>
                        <div className="space-y-2">
                          <Textarea
                            value={noteById[m.id] ?? ""}
                            onChange={(e) => setNoteById((prev) => ({ ...prev, [m.id]: e.target.value }))}
                            placeholder="Add a quick progress note..."
                            className="min-w-[280px]"
                          />
                          <div className="flex justify-end">
                            <Button size="sm" onClick={() => onSaveNote(m.id)}>Save note</Button>
                          </div>
                          <div className="mt-2">
                            <div className="text-xs text-muted-foreground">Recent notes</div>
                            {(localNotesById[m.id]?.length ?? 0) > 0 || (bulkLogs?.[m.id]?.length ?? 0) > 0 ? (
                              <ul className="mt-1 space-y-1">
                                {[...(localNotesById[m.id] ?? []), ...(bulkLogs?.[m.id] ?? [])]
                                  .slice(-3)
                                  .reverse()
                                  .map((ln) => (
                                    <li key={ln.id} className="text-sm">
                                      <div className="flex justify-between text-xs text-muted-foreground">
                                        <span>{[ln.user?.first_name ?? "", ln.user?.last_name ?? ""].filter(Boolean).join(" ") || "—"}</span>
                                        <span>{formatDateTimeInTZ(ln.created_at, tz)}</span>
                                      </div>
                                      <div>{ln.note}</div>
                                    </li>
                                  ))}
                              </ul>
                            ) : logsLoading ? (
                              <div className="text-xs text-muted-foreground mt-1">Loading notes...</div>
                            ) : (
                              <div className="text-xs text-muted-foreground mt-1">No notes yet.</div>
                            )}
                          </div>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </div>
    </AppShell>
  );
};

export default Maintenance;