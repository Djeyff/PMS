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

const Maintenance = () => {
  const { role, profile, loading } = useAuth();
  const isAdmin = role === "agency_admin";
  const agencyId = profile?.agency_id ?? null;

  const [statusFilter, setStatusFilter] = useState<"all" | "open" | "in_progress" | "closed">("all");
  const statuses = statusFilter === "all" ? ["open", "in_progress", "closed"] as const : [statusFilter];

  const { data: agency } = useQuery({
    queryKey: ["agency-for-maint", agencyId],
    enabled: !loading && !!agencyId,
    queryFn: () => fetchAgencyById(agencyId!),
  });
  const tz = agency?.timezone ?? "UTC";

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ["maintenance", agencyId, statusFilter, role],
    enabled: !loading && !!agencyId,
    queryFn: () => fetchMaintenanceRequests({ agencyId: agencyId!, status: statuses as any }),
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