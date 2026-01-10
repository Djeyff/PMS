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
import { useIsMobile } from "@/hooks/use-mobile";
import OutstandingTenantItemMobile from "@/components/outstanding/OutstandingTenantItemMobile";

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

    // Build a quick lookup for invoice currency by id
    const invoiceById = new Map<string, { currency: "USD" | "DOP"; total_amount: number; tenant_id: string }>();
    (invoices ?? []).forEach((inv: any) => {
      invoiceById.set(inv.id, { currency: inv.currency, total_amount: Number(inv.total_amount || 0), tenant_id: inv.tenant_id });
    });

    // Subtract invoices from balances in their own currency
    (invoices ?? []).forEach((inv: any) => {
      const item = map.get(inv.tenant_id);
      if (!item) return;
      const amt = Number(inv.total_amount || 0);
      if (inv.currency === "USD") item.usd -= amt;
      else if (inv.currency === "DOP") item.dop -= amt;
    });

    // Helper: convert a payment amount to a target currency via a per-payment exchange_rate
    const convert = (amt: number, from: "USD" | "DOP", to: "USD" | "DOP", rate: number | null) => {
      if (from === to) return amt;
      if (!rate || !isFinite(rate) || rate <= 0) return 0;
      if (from === "DOP" && to === "USD") return amt / rate;
      if (from === "USD" && to === "DOP") return amt * rate;
      return 0;
    };

    // Add payments; if linked to an invoice and currencies differ, convert using exchange_rate and apply to invoice currency
    (payments ?? []).forEach((p: any) => {
      const item = map.get(p.tenant_id);
      if (!item) return;
      const amt = Number(p.amount || 0);
      const payCur = p.currency as "USD" | "DOP";
      const rate = typeof p.exchange_rate === "number" ? p.exchange_rate : null;

      const invRef = p.invoice_id ? invoiceById.get(p.invoice_id) : null;
      if (invRef) {
        const invCur = invRef.currency;
        if (payCur === invCur) {
          // Same currency, apply directly to the invoice currency balance
          if (invCur === "USD") item.usd += amt;
          else item.dop += amt;
        } else {
          // Cross-currency: convert with the recorded exchange_rate and apply to the invoice currency
          const converted = convert(amt, payCur, invCur, rate);
          if (invCur === "USD") item.usd += converted;
          else item.dop += converted;
          // IMPORTANT: do not add the original payment to its native currency column,
          // since it settles an invoice in a different currency.
        }
      } else {
        // Unlinked payment: apply to its native currency (no conversion context)
        if (payCur === "USD") item.usd += amt;
        else item.dop += amt;
      }
    });

    return Array.from(map.values()).sort((a, b) => {
      const aTotal = Math.min(a.usd, 0) + Math.min(a.dop, 0);
      const bTotal = Math.min(b.usd, 0) + Math.min(b.dop, 0);
      return aTotal - bTotal;
    });
  }, [tenants, invoices, payments]);

  const isLoading = tenantsLoading || invLoading || payLoading;

  const isMobile = useIsMobile();

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
            ) : isMobile ? (
              <div>
                {rows.map((r) => (
                  <OutstandingTenantItemMobile key={r.id} tenantId={r.id} name={r.name} usd={r.usd} dop={r.dop} />
                ))}
              </div>
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
                      <TableCell className={`text-right ${r.usd < 0 ? "text-red-600" : r.usd > 0 ? "text-green-600" : ""}`}>{fmt(r.usd, "USD")}</TableCell>
                      <TableCell className={`text-right ${r.dop < 0 ? "text-red-600" : r.dop > 0 ? "text-green-600" : ""}`}>{fmt(r.dop, "DOP")}</TableCell>
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