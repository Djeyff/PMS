import React from "react";
import AppShell from "@/components/layout/AppShell";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useAuth } from "@/contexts/AuthProvider";
import { useQuery } from "@tanstack/react-query";
import { fetchLeases } from "@/services/leases";
import LeaseForm from "@/components/leases/LeaseForm";
import EditLeaseDialog from "@/components/leases/EditLeaseDialog";
import DeleteLeaseDialog from "@/components/leases/DeleteLeaseDialog";

const Leases = () => {
  const { user, profile, loading } = useAuth();

  const isReady = !loading && !!user && profile?.role === "agency_admin" && !!profile?.agency_id;

  const { data, isLoading, refetch } = useQuery({
    queryKey: ["leases", user?.id, profile?.role, profile?.agency_id],
    queryFn: () => fetchLeases({ role: profile?.role ?? null, userId: user?.id ?? null, agencyId: profile?.agency_id ?? null }),
    enabled: isReady,
  });

  const canCreate = profile?.role === "agency_admin";

  const fullName = (t?: { first_name: string | null; last_name: string | null } | null) => {
    if (!t) return "—";
    const name = [t.first_name, t.last_name].filter(Boolean).join(" ");
    return name || "—";
  };

  return (
    <AppShell>
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h1 className="text-xl font-semibold">Leases</h1>
          {canCreate ? <LeaseForm onCreated={() => refetch()} /> : null}
        </div>
        <Card>
          <CardHeader>
            <CardTitle>All Leases</CardTitle>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="text-sm text-muted-foreground">Loading...</div>
            ) : (data?.length ?? 0) === 0 ? (
              <div className="text-sm text-muted-foreground">No leases yet.</div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Property</TableHead>
                    <TableHead>Tenant</TableHead>
                    <TableHead>Start</TableHead>
                    <TableHead>End</TableHead>
                    <TableHead>Rent</TableHead>
                    <TableHead>Status</TableHead>
                    {canCreate && <TableHead>Actions</TableHead>}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {(data ?? []).map((l: any) => (
                    <TableRow key={l.id}>
                      <TableCell className="font-medium">
                        {l.property?.name || (l.property_id ? l.property_id.slice(0, 8) : "—")}
                      </TableCell>
                      <TableCell>{fullName(l.tenant) || (l.tenant_id ? l.tenant_id.slice(0, 6) : "—")}</TableCell>
                      <TableCell>{l.start_date}</TableCell>
                      <TableCell>{l.end_date}</TableCell>
                      <TableCell>
                        {new Intl.NumberFormat(undefined, { style: "currency", currency: l.rent_currency }).format(l.rent_amount)}
                      </TableCell>
                      <TableCell className="capitalize">{String(l.status).replace("_", " ")}</TableCell>
                      {canCreate && (
                        <TableCell>
                          <div className="flex gap-2">
                            <EditLeaseDialog lease={l} onUpdated={() => refetch()} />
                            <DeleteLeaseDialog id={l.id} onDeleted={() => refetch()} />
                          </div>
                        </TableCell>
                      )}
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

export default Leases;