import React from "react";
import AppShell from "@/components/layout/AppShell";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useAuth } from "@/contexts/AuthProvider";
import { useQuery } from "@tanstack/react-query";
import { fetchMaintenanceRequests, updateMaintenanceStatus } from "@/services/maintenance";
import NewRequestDialog from "@/components/maintenance/NewRequestDialog";
import LogsDialog from "@/components/maintenance/LogsDialog";
import { toast } from "sonner";

const Maintenance = () => {
  const { role, profile } = useAuth();
  const isAdmin = role === "agency_admin";
  const agencyId = profile?.agency_id ?? null;

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
                        <LogsDialog request={m} onUpdated={() => refetch()} />
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