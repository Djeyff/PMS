import React, { useMemo, useState } from "react";
import AppShell from "@/components/layout/AppShell";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useAuth } from "@/contexts/AuthProvider";
import { useQuery } from "@tanstack/react-query";
import { fetchActivityLogsByAgency } from "@/services/activity-logs";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

const ActivityLog = () => {
  const { role, profile } = useAuth();
  const isAdmin = role === "agency_admin";
  const agencyId = profile?.agency_id ?? null;

  const { data, isLoading } = useQuery({
    queryKey: ["activity-logs", agencyId],
    enabled: isAdmin && !!agencyId,
    queryFn: () => fetchActivityLogsByAgency(agencyId!),
  });

  const [entityFilter, setEntityFilter] = useState<string>("all");
  const [search, setSearch] = useState<string>("");

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
                      <SelectItem value="invoice">Invoice</SelectItem>
                      <SelectItem value="lease">Lease</SelectItem>
                      <SelectItem value="property">Property</SelectItem>
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
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {rows.map((x) => {
                      const userName = [x.user?.first_name ?? "", x.user?.last_name ?? ""].filter(Boolean).join(" ") || x.user_id.slice(0, 6);
                      const safeMeta = stripIds(x.metadata ?? {});
                      return (
                        <TableRow key={x.id}>
                          <TableCell className="whitespace-nowrap">{fmt(x.created_at)}</TableCell>
                          <TableCell>{userName}</TableCell>
                          <TableCell className="capitalize">{x.action.replace(/_/g, " ")}</TableCell>
                          <TableCell className="capitalize">{x.entity_type.replace(/_/g, " ")} {x.entity_id ? `(${x.entity_id.slice(0,8)})` : ""}</TableCell>
                          <TableCell className="max-w-[520px]">
                            <pre className="text-xs whitespace-pre-wrap">{JSON.stringify(safeMeta, null, 2)}</pre>
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