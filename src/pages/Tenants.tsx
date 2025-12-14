import React from "react";
import AppShell from "@/components/layout/AppShell";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useAuth } from "@/contexts/AuthProvider";
import { useQuery } from "@tanstack/react-query";
import { fetchTenantProfilesInAgency } from "@/services/users";
import AddTenantDialog from "@/components/tenants/AddTenantDialog";

const data = [
  { name: "Maria Gomez", email: "maria@example.com", phone: "+1 809-555-1100", property: "Ocean View Villa" },
  { name: "John Smith", email: "john@example.com", phone: "+1 809-555-2200", property: "Downtown Apartment 12B" },
];

const Tenants = () => {
  const { role, profile } = useAuth();
  const agencyId = profile?.agency_id ?? null;
  const isAdmin = role === "agency_admin";

  const { data, isLoading, refetch } = useQuery({
    queryKey: ["tenants", agencyId],
    enabled: !!agencyId,
    queryFn: () => fetchTenantProfilesInAgency(agencyId!),
  });

  return (
    <AppShell>
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h1 className="text-xl font-semibold">Tenants</h1>
          {isAdmin && agencyId ? <AddTenantDialog onCreated={() => refetch()} /> : null}
        </div>
        <Card>
          <CardHeader>
            <CardTitle>All Tenants</CardTitle>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="text-sm text-muted-foreground">Loading...</div>
            ) : (data?.length ?? 0) === 0 ? (
              <div className="text-sm text-muted-foreground">No tenants yet.</div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Tenant</TableHead>
                    <TableHead>Agency</TableHead>
                    <TableHead>User ID</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {(data ?? []).map((t) => (
                    <TableRow key={t.id}>
                      <TableCell>{[t.first_name, t.last_name].filter(Boolean).join(" ") || "—"}</TableCell>
                      <TableCell>{t.agency_id ? "Assigned" : "Unassigned"}</TableCell>
                      <TableCell className="font-mono text-xs">{t.id}</TableCell>
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

export default Tenants;