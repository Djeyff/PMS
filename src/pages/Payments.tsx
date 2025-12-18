import React, { useMemo } from "react";
import AppShell from "@/components/layout/AppShell";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useAuth } from "@/contexts/AuthProvider";
import { useQuery } from "@tanstack/react-query";
import { fetchPayments } from "@/services/payments";
import PaymentForm from "@/components/payments/PaymentForm";
import DeletePaymentDialog from "@/components/payments/DeletePaymentDialog";

const Payments = () => {
  const { role, user, profile } = useAuth();

  const { data, isLoading, refetch } = useQuery({
    queryKey: ["payments", role, user?.id, profile?.agency_id],
    queryFn: () => fetchPayments({ role, userId: user?.id ?? null, agencyId: profile?.agency_id ?? null }),
  });

  const canCreate = role === "agency_admin";

  const totals = useMemo(() => {
    const usd = (data ?? []).filter(p => p.currency === "USD").reduce((s, p) => s + Number(p.amount || 0), 0);
    const dop = (data ?? []).filter(p => p.currency === "DOP").reduce((s, p) => s + Number(p.amount || 0), 0);
    return { usd, dop };
  }, [data]);

  const fmt = (amt: number, cur: string) => new Intl.NumberFormat(undefined, { style: "currency", currency: cur }).format(amt);

  return (
    <AppShell>
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h1 className="text-xl font-semibold">Payments</h1>
          {canCreate ? <PaymentForm onCreated={() => refetch()} /> : null}
        </div>

        <div className="grid gap-4 grid-cols-1 sm:grid-cols-2">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm text-muted-foreground">Total USD</CardTitle>
            </CardHeader>
            <CardContent className="text-2xl font-bold">
              {fmt(totals.usd, "USD")}
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm text-muted-foreground">Total DOP</CardTitle>
            </CardHeader>
            <CardContent className="text-2xl font-bold">
              {fmt(totals.dop, "DOP")}
            </CardContent>
          </Card>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>All Payments</CardTitle>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="text-sm text-muted-foreground">Loading...</div>
            ) : (data?.length ?? 0) === 0 ? (
              <div className="text-sm text-muted-foreground">No payments yet.</div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Property</TableHead>
                    <TableHead>Tenant</TableHead>
                    <TableHead>Date</TableHead>
                    <TableHead>Method</TableHead>
                    <TableHead>Amount</TableHead>
                    {canCreate && <TableHead>Actions</TableHead>}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {(data ?? []).map((p: any) => {
                    const propName = p.lease?.property?.name ?? "—";
                    const tenantName = [p.tenant?.first_name, p.tenant?.last_name].filter(Boolean).join(" ") || "—";
                    return (
                      <TableRow key={p.id}>
                        <TableCell className="font-medium">{propName}</TableCell>
                        <TableCell>{tenantName}</TableCell>
                        <TableCell>{p.received_date}</TableCell>
                        <TableCell className="capitalize">{String(p.method).replace("_", " ")}</TableCell>
                        <TableCell>{fmt(Number(p.amount), p.currency)}</TableCell>
                        {canCreate && (
                          <TableCell>
                            <div className="flex gap-2">
                              <DeletePaymentDialog
                                id={p.id}
                                summary={`${tenantName} • ${propName} • ${p.received_date} • ${fmt(Number(p.amount), p.currency)}`}
                                metadata={{
                                  amount: p.amount,
                                  currency: p.currency,
                                  method: p.method,
                                  received_date: p.received_date,
                                  reference: p.reference ?? null,
                                  tenant_id: p.tenant_id,
                                  tenant_name: tenantName,
                                  property_id: p.lease?.property?.id ?? null,
                                  property_name: propName,
                                  lease_id: p.lease_id,
                                  invoice_id: p.invoice_id ?? null,
                                }}
                                onDeleted={() => refetch()}
                              />
                            </div>
                          </TableCell>
                        )}
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

export default Payments;