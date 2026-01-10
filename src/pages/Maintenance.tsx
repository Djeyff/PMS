import React, { useState } from "react";
import AppShell from "@/components/layout/AppShell";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader } from "@/components/ui/table";
import { useAuth } from "@/contexts/AuthProvider";
import { useQuery } from "@tanstack/react-query";
import { fetchMaintenanceRequests, updateMaintenanceStatus } from "@/services/maintenance";
import NewRequestDialog from "@/components/maintenance/NewRequestDialog";
import LogsDialog from "@/components/maintenance/LogsDialog";
import { toast } from "sonner";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { fetchAgencyById } from "@/services/agencies";
import DeleteMaintenanceRequestDialog from "@/components/maintenance/DeleteMaintenanceRequestDialog";
import { useIsMobile } from "@/hooks/use-mobile";

const Maintenance = () => {
  const { role, profile } = useAuth();
  const isAdmin = role === "agency_admin";
  const agencyId = profile?.agency_id ?? null;

  const [statusFilter, setStatusFilter] = useState<"all" | "open" | "in_progress" | "closed">("all");
  const statuses = statusFilter === "all" ? ["open", "in_progress", "closed"] as const : [statusFilter];

  const { data: agency } = useQuery({
    queryKey: ["agency-for-maint", agencyId],
    enabled: !!agencyId,
    queryFn: () => fetchAgencyById(agencyId!),
  });
  const tz = agency?.timezone ?? "UTC";

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ["maintenance", agencyId, statusFilter],
    enabled: !!agencyId,
    queryFn: () => fetchMaintenanceRequests({ agencyId: agencyId!, status: statuses as any }),
  });

  const isMobile = useIsMobile();

  const onUpdateStatus = async (id: string, status: "open" | "in_progress" | "closed") => {
    try {
      await updateMaintenanceStatus(id, status);
      toast.success("Status updated");
      refetch();
    } catch (e: any) {
      toast.error(e?.message ?? "Failed to update status");
    }
  };

  return (
    <AppShell>
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h1 className="text-xl font-semibold">Maintenance</h1>
          <div className="flex items-center gap-2">
            <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v as any)}>
              <SelectTrigger className="w-[180px]">
                <SelectValue placeholder="Filter status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All</SelectItem>
                <SelectItem value="open">Open</SelectItem>
                <SelectItem value="in_progress">In progress</SelectItem>
                <SelectItem value="closed">Closed</SelectItem>
              </SelectContent>
            </Select>
            <Button variant="outline" onClick={() => refetch()}>Refresh</Button>
            {isAdmin && agencyId ? <NewRequestDialog onCreated={() => refetch()} /> : null}
          </div>
        </div>
        <Card>
          <CardHeader className="flex items-center justify-between">
            <CardTitle>Requests</CardTitle>
          </CardHeader>
          <CardContent>
            {error ? (
              <div className="text-sm text-red-600">Failed to load maintenance requests.</div>
            ) : isLoading ? (
              <div className="text-sm text-muted-foreground">Loading...</div>
            ) : (data?.length ?? 0) === 0 ? (
              <div className="text-sm text-muted-foreground">No maintenance requests.</div>
            ) : isMobile ? (
              <div>
                {(data ?? []).map((m) => (
                  <div key={m.id} className="rounded-lg border p-3 bg-card mb-3">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <div className="font-medium">{m.title}</div>
                        <div className="text-sm text-muted-foreground">
                          {m.property?.name ?? m.property_id.slice(0, 8)}
                        </div>
                      </div>
                      <div className="text-right">
                        <div className="text-xs capitalize">{m.priority}</div>
                        <div className="text-xs capitalize">{m.status.replace("_", " ")}</div>
                        <div className="text-xs">{m.due_date ?? "—"}</div>
                      </div>
                    </div>
                    <div className="mt-3 flex flex-wrap gap-2">
                      {isAdmin ? (
                        <>
                          {m.status !== "in_progress" && (
                            <Button size="sm" variant="outline" onClick={() => onUpdateStatus(m.id, "in_progress")}>Start</Button>
                          )}
                          {m.status !== "closed" && (
                            <Button size="sm" variant="outline" onClick={() => onUpdateStatus(m.id, "closed")}>Close</Button>
                          )}
                          <DeleteMaintenanceRequestDialog
                            id={m.id}
                            metadata={{ title: m.title, property_id: m.property?.id ?? m.property_id, status: m.status, due_date: m.due_date }}
                            onDeleted={() => refetch()}
                            size="sm"
                          />
                        </>
                      ) : null}
                      <LogsDialog request={m} tz={tz} onUpdated={() => refetch()} />
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <tr>
                    <TableHead>Title</TableHead>
                    <TableHead>Property</TableHead>
                    <TableHead>Priority</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Due</TableHead>
                    <TableHead>Actions</TableHead>
                  </tr>
                </TableHeader>
                <TableBody>
                  {(data ?? []).map((m) => (
                    <tr key={m.id}>
                      <TableCell className="font-medium">{m.title}</TableCell>
                      <TableCell>{m.property?.name ?? m.property_id.slice(0, 8)}</TableCell>
                      <TableCell className="capitalize">{m.priority}</TableCell>
                      <TableCell className="capitalize">{m.status.replace("_", " ")}</TableCell>
                      <TableCell>{m.due_date ?? "—"}</TableCell>
                      <TableCell className="space-x-2">
                        {isAdmin ? (
                          <>
                            {m.status !== "in_progress" && (
                              <Button size="sm" variant="outline" onClick={() => onUpdateStatus(m.id, "in_progress")}>Start</Button>
                            )}
                            {m.status !== "closed" && (
                              <Button size="sm" variant="outline" onClick={() => onUpdateStatus(m.id, "closed")}>Close</Button>
                            )}
                            <DeleteMaintenanceRequestDialog
                              id={m.id}
                              metadata={{ title: m.title, property_id: m.property?.id ?? m.property_id, status: m.status, due_date: m.due_date }}
                              onDeleted={() => refetch()}
                              size="sm"
                            />
                          </>
                        ) : null}
                        <LogsDialog request={m} tz={tz} onUpdated={() => refetch()} />
                      </TableCell>
                    </tr>
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