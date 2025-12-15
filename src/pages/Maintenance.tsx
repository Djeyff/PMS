import React, { useState } from "react";
import AppShell from "@/components/layout/AppShell";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import { useAuth } from "@/contexts/AuthProvider";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { fetchMaintenanceRequests, updateMaintenanceStatus, addMaintenanceLog } from "@/services/maintenance";
import NewRequestDialog from "@/components/maintenance/NewRequestDialog";
import { toast } from "sonner";
import { fetchAgencyById } from "@/services/agencies";
import { formatDateTimeInTZ } from "@/utils/datetime";

const Maintenance = () => {
  const { role, profile } = useAuth();
  const isAdmin = role === "agency_admin";
  const agencyId = profile?.agency_id ?? null;
  const queryClient = useQueryClient();

  const [noteById, setNoteById] = useState<Record<string, string>>({});

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

  const onUpdateStatus = async (id: string, status: "open" | "in_progress" | "closed") => {
    try {
      await updateMaintenanceStatus(id, status);
      toast.success("Status updated");
      refetch();
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
    setNoteById((prev) => ({ ...prev, [id]: "" }));

    // Optimistic update: append a temp note to the request logs
    const tempId = `temp-${Date.now()}`;
    const createdAt = new Date().toISOString();
    queryClient.setQueryData(["maintenance", agencyId], (old: any) => {
      const list = Array.isArray(old) ? [...old] : [];
      return list.map((req: any) =>
        req.id === id
          ? {
              ...req,
              logs: [
                ...(req.logs ?? []),
                { id: tempId, note, created_at: createdAt, user: { first_name: null, last_name: null } },
              ],
            }
          : req
      );
    });

    try {
      const created = await addMaintenanceLog(id, note);
      // Replace temp note with the server note
      queryClient.setQueryData(["maintenance", agencyId], (old: any) => {
        const list = Array.isArray(old) ? [...old] : [];
        return list.map((req: any) =>
          req.id === id
            ? {
                ...req,
                logs: (req.logs ?? []).map((ln: any) =>
                  ln.id === tempId
                    ? { id: created.id, note: created.note, created_at: created.created_at, user: { first_name: null, last_name: null } }
                    : ln
                ),
              }
            : req
        );
      });
      toast.success("Note saved");
    } catch (e: any) {
      // Rollback: remove the temp note
      queryClient.setQueryData(["maintenance", agencyId], (old: any) => {
        const list = Array.isArray(old) ? [...old] : [];
        return list.map((req: any) =>
          req.id === id
            ? { ...req, logs: (req.logs ?? []).filter((ln: any) => ln.id !== tempId) }
            : req
        );
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
                            {((m.logs?.length ?? 0) > 0) ? (
                              <ul className="mt-1 space-y-1">
                                {(m.logs ?? []).slice(-3).reverse().map((ln: any) => (
                                  <li key={ln.id} className="text-sm">
                                    <div className="flex justify-between text-xs text-muted-foreground">
                                      <span>{[ln.user?.first_name ?? "", ln.user?.last_name ?? ""].filter(Boolean).join(" ") || "—"}</span>
                                      <span>{formatDateTimeInTZ(ln.created_at, tz)}</span>
                                    </div>
                                    <div>{ln.note}</div>
                                  </li>
                                ))}
                              </ul>
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