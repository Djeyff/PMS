import React from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useAuth } from "@/contexts/AuthProvider";
import { useQuery } from "@tanstack/react-query";
import { fetchLeases } from "@/services/leases";
import { fetchInvoices } from "@/services/invoices";

const TenantDashboard = () => {
  const { role, user, loading } = useAuth();

  const { data: leases } = useQuery({
    queryKey: ["tenant-leases", role, user?.id],
    queryFn: () => fetchLeases({ role, userId: user?.id ?? null, agencyId: null }),
    enabled: !loading && role === "tenant" && !!user,
  });

  const { data: invoices } = useQuery({
    queryKey: ["tenant-invoices", role, user?.id],
    queryFn: fetchInvoices,
    enabled: !loading && role === "tenant" && !!user,
  });

  const lease = (leases ?? [])[0];

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>My Lease</CardTitle>
        </CardHeader>
        <CardContent className="text-sm">
          {lease ? (
            <div className="space-y-1">
              <div>
                Property: <strong>{lease.property?.name ?? lease.property_id?.slice(0, 8)}</strong>
              </div>
              <div>From {lease.start_date} to {lease.end_date}</div>
              <div>
                Rent: {new Intl.NumberFormat(undefined, { style: "currency", currency: lease.rent_currency }).format(lease.rent_amount)}
              </div>
            </div>
          ) : (
            <div className="text-muted-foreground">No active lease.</div>
          )}
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>Invoices</CardTitle>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground">
          {(invoices ?? []).filter((i: any) => i.tenant_id === user?.id).slice(0, 6).length === 0
            ? "No invoices."
            : (invoices ?? []).filter((i: any) => i.tenant_id === user?.id).slice(0, 6).map((i: any) => (
                <div key={i.id} className="flex justify-between">
                  <span>{i.due_date}</span>
                  <span>{new Intl.NumberFormat(undefined, { style: "currency", currency: i.currency }).format(i.total_amount)}</span>
                </div>
              ))}
        </CardContent>
      </Card>
    </div>
  );
};

export default TenantDashboard;