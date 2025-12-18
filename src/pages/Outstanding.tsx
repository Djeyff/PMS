import React, { useMemo } from "react";
import AppShell from "@/components/layout/AppShell";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useAuth } from "@/contexts/AuthProvider";
import { useQuery } from "@tanstack/react-query";
import { fetchTenantProfilesInAgency } from "@/services/users";
import { fetchInvoices } from "@/services/invoices";
import { fetchPayments } from "@/services/payments";
import { Button } from "@/components/ui/button";
import { Link } from "react-router-dom";

const fmt = (amt: number, cur: string) =>
  new Intl.NumberFormat(undefined, { style: "currency", currency: cur }).format(amt);

const Outstanding = () => {
  const { role, user, profile } = useAuth();
  const agencyId = profile?.agency_id ?? null;
  const isAdmin = role === "agency_admin";

  const { data: tenants, isLoading: tenantsLoading } = useQuery({
    queryKey: ["outstanding-tenants", agencyId],
    enabled: !!agencyId && isAdmin,
    queryFn: () => fetchTenantProfilesInAgency(agencyId!),
  });

  const { data: invoices, isLoading: invLoading } = useQuery({
    queryKey: ["outstanding-invoices"],
    enabled: isAdmin,
    queryFn: fetchInvoices, // RLS will scope to agency
  });

  const { data: payments, isLoading: payLoading } = useQuery({
    queryKey: ["outstanding-payments", role, user?.id, agencyId],
    enabled: isAdmin,
    queryFn: () => fetchPayments({ role, userId: user?.id ?? null, agencyId }),
  });

  const rows = useMemo(() => {
    const map = new Map<string, { id: string; name: string; usd: number; dop: number }>();
    (tenants ?? []).forEach((t) => {
      const name = [t.first_name, t.last_name].filter(Boolean).join(" ") || "—";
      map.set(t.id, { id: t.id, name, usd: 0, dop: 0 });
    });

    (invoices ?? []).forEach((inv: any) => {
      const item = map.get(inv.tenant_id);
      if (!item) return;
      if (inv.currency === "USD") item.usd -= Number(inv.total_amount || 0);
      if (inv.currency === "DOP") item.dop -= Number(inv.total_amount || 0);
    });

    (payments ?? []).forEach((p: any) => {
      const item = map.get(p.tenant_id);
      if (!item) return;
      if (p.currency === "USD") item.usd += Number(p.amount || 0);
      if (p.currency === "DOP") item.dop += Number(p.amount || 0);
    });

    return Array.from(map.values()).sort((a, b) => {
      const aTotal = Math.min(a.usd, 0) + Math.min(a.dop, 0);
      const bTotal = Math.min(b.usd, 0) + Math.min(b.dop, 0);
      return aTotal - bTotal;
    });
  }, [tenants, invoices, payments]);

  const isLoading = tenantsLoading || invLoading || payLoading;

  return (
    <AppShell>
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h1 className="text-xl font-semibold">Outstanding</h1>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Per-tenant balances</CardTitle>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="text-sm text-muted-foreground">Loading...</div>
            ) : (rows?.length ?? 0) === 0 ? (
              <div className="text-sm text-muted-foreground">No tenants found.</div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Tenant</TableHead>
                    <TableHead className="text-right">USD Balance</TableHead>
                    <TableHead className="text-right">DOP Balance</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.map((r) => (
                    <TableRow key={r.id}>
                      <TableCell className="font-medium">{r.name}</TableCell>
                      <TableCell className={`text-right ${r.usd < 0 ? "text-red-600" : ""}`}>{fmt(r.usd, "USD")}</TableCell>
                      <TableCell className={`text-right ${r.dop < 0 ? "text-red-600" : ""}`}>{fmt(r.dop, "DOP")}</TableCell>
                      <TableCell className="text-right">
                        <Button asChild size="sm" variant="outline">
                          <Link to={`/tenants/${r.id}/overdue`}>View</Link>
                        </Button>
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

export default Outstanding;