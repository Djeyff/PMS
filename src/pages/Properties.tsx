import React from "react";
import AppShell from "@/components/layout/AppShell";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useAuth } from "@/contexts/AuthProvider";
import { useQuery } from "@tanstack/react-query";
import { fetchProperties } from "@/services/properties";
import PropertyForm from "@/components/properties/PropertyForm";
import EditPropertyDialog from "@/components/properties/EditPropertyDialog";
import DeletePropertyDialog from "@/components/properties/DeletePropertyDialog";
import PropertyOwnersDialog from "@/components/properties/PropertyOwnersDialog";

const data = [
  { name: "Ocean View Villa", type: "villa", status: "rented", bedrooms: 4, city: "Punta Cana" },
  { name: "Downtown Apartment 12B", type: "apartment", status: "vacant", bedrooms: 2, city: "Santo Domingo" },
  { name: "Hillside House", type: "house", status: "maintenance", bedrooms: 3, city: "Puerto Plata" },
];

const Properties = () => {
  const { role, user, profile, loading } = useAuth();

  const { data, isLoading, refetch } = useQuery({
    queryKey: ["properties", role, user?.id, profile?.agency_id],
    queryFn: () => fetchProperties({ role: role, userId: user?.id ?? null, agencyId: profile?.agency_id ?? null }),
    enabled: !loading && !!role && !!user && (role === "agency_admin" ? !!profile?.agency_id : true),
  });

  const canCreate = role === "agency_admin";

  return (
    <AppShell>
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h1 className="text-xl font-semibold">Properties</h1>
          {canCreate && profile?.agency_id ? <PropertyForm agencyId={profile.agency_id} onCreated={() => refetch()} /> : null}
        </div>

        {canCreate && !profile?.agency_id ? (
          <Card>
            <CardHeader>
              <CardTitle>Set up your agency</CardTitle>
            </CardHeader>
            <CardContent className="text-sm text-muted-foreground">
              You need to assign your user to an agency before creating properties. Go to Settings → Agency Settings to set your default currency and agency.
            </CardContent>
          </Card>
        ) : null}

        <Card>
          <CardHeader>
            <CardTitle>All Properties</CardTitle>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="text-sm text-muted-foreground">Loading...</div>
            ) : (data?.length ?? 0) === 0 ? (
              <div className="text-sm text-muted-foreground">No properties yet.</div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Name</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Bedrooms</TableHead>
                    <TableHead>City</TableHead>
                    {canCreate && <TableHead>Actions</TableHead>}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {(data ?? []).map((p) => (
                    <TableRow key={p.id}>
                      <TableCell className="font-medium">{p.name}</TableCell>
                      <TableCell className="capitalize">{p.type}</TableCell>
                      <TableCell className="capitalize">{p.status}</TableCell>
                      <TableCell>{p.bedrooms ?? "-"}</TableCell>
                      <TableCell>{p.city ?? "-"}</TableCell>
                      {canCreate && (
                        <TableCell>
                          <div className="flex gap-2">
                            <EditPropertyDialog property={p} onUpdated={() => refetch()} />
                            <PropertyOwnersDialog propertyId={p.id} />
                            <DeletePropertyDialog id={p.id} name={p.name} onDeleted={() => refetch()} />
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

export default Properties;