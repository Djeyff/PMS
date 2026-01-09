import React, { useMemo, useState } from "react";
import AppShell from "@/components/layout/AppShell";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useAuth } from "@/contexts/AuthProvider";
import { useQuery } from "@tanstack/react-query";
import { fetchActivityLogsByAgency, reinstatePaymentFromLog, reinstateMaintenanceRequestFromLog, logAction } from "@/services/activity-logs";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import MaintenanceHistoryInline from "@/components/activity/MaintenanceHistoryInline";
import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";
import { reinstatePropertyFromLog, reinstateLeaseFromLog, reinstateTenantFromLog } from "@/services/activity-logs";

const ActivityLog = () => {
  const { role, profile } = useAuth();
  const isAdmin = role === "agency_admin";
  const agencyId = profile?.agency_id ?? null;

  const { data, isLoading, refetch } = useQuery({
    queryKey: ["activity-logs", agencyId],
    enabled: isAdmin && !!agencyId,
    queryFn: () => fetchActivityLogsByAgency(agencyId!),
  });

  const queryClient = useQueryClient();

  const [entityFilter, setEntityFilter] = useState<string>("all");
  const [search, setSearch] = useState<string>("");
  const [openHistory, setOpenHistory] = useState<Record<string, boolean>>({});

  const rows = useMemo(() => {
    let r = (data ?? []);
    if (entityFilter !== "all") {
      r = r.filter((x) => x.entity_type === entityFilter);
    }
    if (search.trim()) {
      const q = search.toLowerCase();
      r = r.filter((x) => {
        const parts = [
          x.action,
          x.entity_type,
          x.entity_id ?? "",
          JSON.stringify(x.metadata ?? {}),
          [x.user?.first_name ?? "", x.user?.last_name ?? ""].join(" "),
        ].join(" ").toLowerCase();
        return parts.includes(q);
      });
    }
    return r;
  }, [data, entityFilter, search]);

  const fmt = (d: string) => new Date(d).toISOString().slice(0, 19).replace("T", " ");

  // Remove id-like keys recursively from metadata for display
  const stripIds = (val: any): any => {
    if (Array.isArray(val)) return val.map(stripIds);
    if (val && typeof val === "object") {
      const out: any = {};
      for (const [k, v] of Object.entries(val)) {
        const lk = k.toLowerCase();
        if (lk === "id" || lk.endsWith("_id")) continue;
        out[k] = stripIds(v);
      }
      return out;
    }
    return val;
  };

  const onReinstate = async (logId: string, type: "payment" | "maintenance_request" | "property" | "lease" | "tenant", requestId?: string) => {
    try {
      if (type === "payment") {
        await reinstatePaymentFromLog(logId);
        await logAction({ action: "reinstate_payment", entity_type: "payment", entity_id: null, metadata: { from_log_id: logId } });
        toast.success("Payment reinstated");
      } else if (type === "maintenance_request") {
        await reinstateMaintenanceRequestFromLog(logId);
        await logAction({ action: "reinstate_maintenance_request", entity_type: "maintenance_request", entity_id: requestId ?? null, metadata: { from_log_id: logId } });
        toast.success("Maintenance request reinstated");
        if (requestId) {
          await queryClient.invalidateQueries({ queryKey: ["activity-maint-logs", requestId] });
        }
      } else if (type === "property") {
        await reinstatePropertyFromLog(logId);
        await logAction({ action: "reinstate_property", entity_type: "property", entity_id: null, metadata: { from_log_id: logId } });
        toast.success("Property reinstated");
      } else if (type === "lease") {
        await reinstateLeaseFromLog(logId);
        await logAction({ action: "reinstate_lease", entity_type: "lease", entity_id: null, metadata: { from_log_id: logId } });
        toast.success("Lease reinstated");
      } else {
        await reinstateTenantFromLog(logId);
        await logAction({ action: "reinstate_tenant", entity_type: "profile", entity_id: null, metadata: { from_log_id: logId } });
        toast.success("Tenant reinstated");
      }
      refetch();
    } catch (e: any) {
      toast.error(e?.message ?? "Failed to reinstate");
    }
  };

  return (
    <AppShell>
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h1 className="text-xl font-semibold">Activity Log</h1>
        </div>
        <Card>
          <CardHeader>
            <CardTitle>All actions</CardTitle>
          </CardHeader>
          <CardContent>
            {!isAdmin ? (
              <div className="text-sm text-muted-foreground">Only agency admins can view activity logs.</div>
            ) : isLoading ? (
              <div className="text-sm text-muted-foreground">Loading...</div>
            ) : (rows?.length ?? 0) === 0 ? (
              <div className="text-sm text-muted-foreground">No activity yet.</div>
            ) : (
              <div className="space-y-3">
                <div className="flex flex-col sm:flex-row gap-3">
                  <Select value={entityFilter} onValueChange={setEntityFilter}>
                    <SelectTrigger className="w-[220px]">
                      <SelectValue placeholder="Filter by entity" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All</SelectItem>
                      <SelectItem value="payment">Payment</SelectItem>
                      <SelectItem value="maintenance_request">Maintenance Request</SelectItem>
                      <SelectItem value="maintenance_log">Maintenance Log</SelectItem>
                      <SelectItem value="invoice">Invoice</SelectItem>
                      <SelectItem value="lease">Lease</SelectItem>
                      <SelectItem value="property">Property</SelectItem>
                      <SelectItem value="profile">Profile</SelectItem>
                    </SelectContent>
                  </Select>
                  <Input placeholder="Search..." value={search} onChange={(e) => setSearch(e.target.value)} />
                </div>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>When</TableHead>
                      <TableHead>User</TableHead>
                      <TableHead>Action</TableHead>
                      <TableHead>Entity</TableHead>
                      <TableHead>Details</TableHead>
                      <TableHead>Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {rows.map((x) => {
                      const userName = [x.user?.first_name ?? "", x.user?.last_name ?? ""].filter(Boolean).join(" ") || x.user_id.slice(0, 6);
                      const safeMeta = stripIds(x.metadata ?? {});
                      const canReinstatePayment = x.action === "delete_payment" && x.entity_type === "payment";
                      const canReinstateMaint = x.action === "delete_maintenance_request" && x.entity_type === "maintenance_request";
                      const canReinstateProperty = x.action === "delete_property" && x.entity_type === "property";
                      const canReinstateLease = x.action === "delete_lease" && x.entity_type === "lease";
                      const canReinstateTenant = x.action === "delete_tenant" && x.entity_type === "profile";
                      const isMaint = x.entity_type === "maintenance_request";
                      const showHistory = !!openHistory[x.id];
                      const reqId = x.entity_id as string | undefined;

                      return (
                        <TableRow key={x.id}>
                          <TableCell className="whitespace-nowrap align-top">{fmt(x.created_at)}</TableCell>
                          <TableCell className="align-top">{userName}</TableCell>
                          <TableCell className="capitalize align-top">{x.action.replace(/_/g, " ")}</TableCell>
                          <TableCell className="capitalize align-top">
                            {x.entity_type.replace(/_/g, " ")} {x.entity_id ? `(${x.entity_id.slice(0,8)})` : ""}
                          </TableCell>
                          <TableCell className="align-top">
                            <pre className="text-xs whitespace-pre-wrap">{JSON.stringify(safeMeta, null, 2)}</pre>
                            {isMaint && reqId ? (
                              <div className="mt-2">
                                <Button
                                  size="sm"
                                  variant="outline"
                                  onClick={() => setOpenHistory((prev) => ({ ...prev, [x.id]: !prev[x.id] }))}
                                >
                                  {showHistory ? "Hide maintenance history" : "Show maintenance history"}
                                </Button>
                                {showHistory ? <MaintenanceHistoryInline requestId={reqId} /> : null}
                              </div>
                            ) : null}
                          </TableCell>
                          <TableCell className="align-top">
                            <div className="flex flex-col gap-2">
                              {canReinstatePayment ? (
                                <Button size="sm" onClick={() => onReinstate(x.id, "payment")}>Reinstate</Button>
                              ) : null}
                              {canReinstateMaint ? (
                                <Button size="sm" onClick={() => onReinstate(x.id, "maintenance_request", reqId)}>Reinstate</Button>
                              ) : null}
                              {canReinstateProperty ? (
                                <Button size="sm" onClick={() => onReinstate(x.id, "property")}>Reinstate</Button>
                              ) : null}
                              {canReinstateLease ? (
                                <Button size="sm" onClick={() => onReinstate(x.id, "lease")}>Reinstate</Button>
                              ) : null}
                              {canReinstateTenant ? (
                                <Button size="sm" onClick={() => onReinstate(x.id, "tenant")}>Reinstate</Button>
                              ) : null}
                            </div>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </AppShell>
  );
};

export default ActivityLog;