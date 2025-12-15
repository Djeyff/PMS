import React from "react";
import AppShell from "@/components/layout/AppShell";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useAuth } from "@/contexts/AuthProvider";
import { useQuery } from "@tanstack/react-query";
import { fetchOwnerProfilesInAgency } from "@/services/users";
import AddOwnerDialog from "@/components/owners/AddOwnerDialog";
import EditOwnerDialog from "@/components/owners/EditOwnerDialog";
import DeleteOwnerDialog from "@/components/owners/DeleteOwnerDialog";

const Owners = () => {
  const { profile, loading } = useAuth();
  const isAdminReady = !loading && profile?.role === "agency_admin" && !!profile?.agency_id;

  const { data, isLoading, refetch } = useQuery({
    queryKey: ["owners", profile?.agency_id, profile?.role],
    enabled: isAdminReady,
    queryFn: () => fetchOwnerProfilesInAgency(profile!.agency_id!),
  });

  return (
    <AppShell>
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h1 className="text-xl font-semibold">Owners</h1>
          {isAdminReady ? <AddOwnerDialog onCreated={() => refetch()} /> : null}
        </div>
        <Card>
          <CardHeader><CardTitle>All Owners</CardTitle></CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="text-sm text-muted-foreground">Loading...</div>
            ) : (data?.length ?? 0) === 0 ? (
              <div className="text-sm text-muted-foreground">No owners yet.</div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Owner</TableHead>
                    <TableHead>Agency</TableHead>
                    <TableHead>Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {(data ?? []).map((o) => {
                    const displayName = [o.first_name, o.last_name].filter(Boolean).join(" ") || "—";
                    return (
                      <TableRow key={o.id}>
                        <TableCell>{displayName}</TableCell>
                        <TableCell>{o.agency_id ? "Assigned" : "Unassigned"}</TableCell>
                        <TableCell>
                          <div className="flex gap-2">
                            <EditOwnerDialog owner={{ id: o.id, first_name: o.first_name, last_name: o.last_name }} onUpdated={() => refetch()} />
                            <DeleteOwnerDialog id={o.id} displayName={displayName} onDeleted={() => refetch()} />
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </div>
    </AppShell>
  );
};

export default Owners;