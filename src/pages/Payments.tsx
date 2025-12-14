import React, { useMemo } from "react";
import AppShell from "@/components/layout/AppShell";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useAuth } from "@/contexts/AuthProvider";
import { useQuery } from "@tanstack/react-query";
import { fetchPayments } from "@/services/payments";
import PaymentForm from "@/components/payments/PaymentForm";

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
              {new Intl.NumberFormat(undefined, { style: "currency", currency: "USD" }).format(totals.usd)}
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm text-muted-foreground">Total DOP</CardTitle>
            </CardHeader>
            <CardContent className="text-2xl font-bold">
              {new Intl.NumberFormat(undefined, { style: "currency", currency: "DOP" }).format(totals.dop)}
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
                    <TableHead>Lease</TableHead>
                    <TableHead>Tenant</TableHead>
                    <TableHead>Date</TableHead>
                    <TableHead>Method</TableHead>
                    <TableHead>Amount</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {(data ?? []).map((p) => (
                    <TableRow key={p.id}>
                      <TableCell className="font-mono text-xs">{p.lease_id.slice(0, 8)}</TableCell>
                      <TableCell className="font-mono text-xs">{p.tenant_id.slice(0, 8)}</TableCell>
                      <TableCell>{p.received_date}</TableCell>
                      <TableCell className="capitalize">{p.method.replace("_", " ")}</TableCell>
                      <TableCell>
                        {new Intl.NumberFormat(undefined, { style: "currency", currency: p.currency }).format(p.amount)}
                      </TableCell>
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

export default Payments;