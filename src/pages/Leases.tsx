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
  const { role, user, profile } = useAuth();

  const { data, isLoading, refetch } = useQuery({
    queryKey: ["leases", role, user?.id, profile?.agency_id],
    queryFn: () => fetchLeases({ role, userId: user?.id ?? null, agencyId: profile?.agency_id ?? null }),
  });

  const canCreate = role === "agency_admin";

  const fullName = (t?: { first_name: string | null; last_name: string | null } | null) => {
    if (!t) return "—";
    const name = [t.first_name, t.last_name].filter(Boolean).join(" ");
    return name || "—";
  };

  // ADDED: helper to display status with color coding
  const todayIso = new Date().toISOString().slice(0, 10);
  const getDisplayStatus = (l: any): { label: string; cls: string } => {
    const status = String(l.status);
    if (status === "terminated") return { label: "Terminated", cls: "text-red-600" };
    if (status === "pending_renewal") return { label: "Pending renewal", cls: "text-orange-600" };
    if (l.end_date && l.end_date < todayIso) return { label: "Expired", cls: "text-orange-600" };
    if (status === "active") return { label: "Active", cls: "text-green-600" };
    if (status === "draft") return { label: "Draft", cls: "text-gray-600" };
    return { label: status.replace("_", " "), cls: "text-gray-600" };
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
                    <TableHead>Contract</TableHead>
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
                      <TableCell>
                        {(() => {
                          const ds = getDisplayStatus(l);
                          return <span className={`${ds.cls} font-medium`}>{ds.label}</span>;
                        })()}
                      </TableCell>
                      <TableCell>
                        {l.contract_kdrive_file_url ? (
                          <a href={l.contract_kdrive_file_url} target="_blank" rel="noreferrer" className="text-blue-600 hover:underline">
                            Open
                          </a>
                        ) : l.contract_kdrive_folder_url ? (
                          <a href={l.contract_kdrive_folder_url} target="_blank" rel="noreferrer" className="text-blue-600 hover:underline">
                            Folder
                          </a>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </TableCell>
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