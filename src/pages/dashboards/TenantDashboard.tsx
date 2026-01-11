import React from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useAuth } from "@/contexts/AuthProvider";
import { useQuery } from "@tanstack/react-query";
import { fetchLeases } from "@/services/leases";
import { fetchInvoices } from "@/services/invoices";

const TenantDashboard = () => {
  const { role, user } = useAuth();

  const { data: leases } = useQuery({
    queryKey: ["tenant-leases", user?.id],
    queryFn: () => fetchLeases({ role, userId: user?.id ?? null, agencyId: null }),
    enabled: role === "tenant" && !!user,
  });

  const { data: invoices } = useQuery({
    queryKey: ["tenant-invoices", user?.id],
    queryFn: fetchInvoices,
    enabled: role === "tenant" && !!user,
  });

  const lease = (leases ?? [])[0];

  const myPartialInvoices = (invoices ?? [])
    .filter((i: any) => i.tenant_id === user?.id && String(i.status) === "partial");

  const computeRemaining = (inv: any) => {
    const currency = inv.currency as "USD" | "DOP";
    const total = Number(inv.total_amount || 0);
    const paidConverted = (inv.payments ?? []).reduce((sum: number, p: any) => {
      const amt = Number(p.amount || 0);
      if (p.currency === currency) return sum + amt;
      const rate = typeof p.exchange_rate === "number" ? p.exchange_rate : null;
      if (!rate || rate <= 0) return sum;
      if (currency === "USD" && p.currency === "DOP") return sum + amt / rate;
      if (currency === "DOP" && p.currency === "USD") return sum + amt * rate;
      return sum;
    }, 0);
    return Math.max(0, total - paidConverted);
  };

  const lastPaymentDate = (inv: any) => {
    const dates = (inv.payments ?? []).map((p: any) => String(p.received_date || "")).filter(Boolean);
    return dates.length ? dates.sort().slice(-1)[0] : null;
  };

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
      <Card>
        <CardHeader>
          <CardTitle>Partial Invoices</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {myPartialInvoices.length === 0 ? (
            <div className="text-sm text-muted-foreground">No partial invoices.</div>
          ) : (
            <ul className="space-y-3">
              {myPartialInvoices.map((inv: any) => {
                const remaining = computeRemaining(inv);
                const remainingText = new Intl.NumberFormat(undefined, { style: "currency", currency: inv.currency }).format(remaining);
                const propName = inv.lease?.property?.name ?? (inv.lease_id ? inv.lease_id.slice(0, 8) : "Property");
                const partialDate = lastPaymentDate(inv);
                return (
                  <li key={inv.id} className="space-y-1">
                    <div className="font-medium">{propName} — {inv.number ?? inv.id.slice(0, 8)}</div>
                    <div className="text-sm text-muted-foreground">Invoice: {inv.issue_date} • Due: {inv.due_date}</div>
                    <div className="text-sm">Last partial payment: {partialDate ?? "—"}</div>
                    <div className="text-sm">Remaining: {remainingText}</div>
                  </li>
                );
              })}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default TenantDashboard;