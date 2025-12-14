import React from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import Money from "@/components/Money";
import { useAuth } from "@/contexts/AuthProvider";
import { useQuery } from "@tanstack/react-query";
import { fetchLeases } from "@/services/leases";
import { fetchPayments } from "@/services/payments";
import { fetchInvoices } from "@/services/invoices";
import { parseISO, differenceInCalendarDays, format } from "date-fns";

const Stat = ({ title, value, children }: { title: string; value?: string; children?: React.ReactNode }) => (
  <Card>
    <CardHeader className="pb-2">
      <CardTitle className="text-sm text-muted-foreground">{title}</CardTitle>
    </CardHeader>
    <CardContent className="text-2xl font-bold">{value ?? children}</CardContent>
  </Card>
);

const AgencyDashboard = () => {
  const { role, user, profile } = useAuth();

  const { data: leases } = useQuery({
    queryKey: ["dashboard-leases", role, user?.id, profile?.agency_id],
    queryFn: () => fetchLeases({ role, userId: user?.id ?? null, agencyId: profile?.agency_id ?? null }),
    enabled: !!role && !!user && !!profile?.agency_id,
  });

  const { data: payments } = useQuery({
    queryKey: ["dashboard-payments", role, user?.id, profile?.agency_id],
    queryFn: () => fetchPayments({ role, userId: user?.id ?? null, agencyId: profile?.agency_id ?? null }),
    enabled: !!role && !!user && !!profile?.agency_id,
  });

  const { data: invoices } = useQuery({
    queryKey: ["dashboard-invoices", role, user?.id, profile?.agency_id],
    queryFn: fetchInvoices,
    enabled: !!role && !!user && !!profile?.agency_id,
  });

  // Monthly revenue by currency (current month)
  const monthly = (() => {
    const d = new Date();
    const ym = d.toISOString().slice(0, 7); // YYYY-MM
    const list = (payments ?? []).filter((p: any) => (p.received_date ?? "").startsWith(ym));
    const usd = list.filter((p: any) => p.currency === "USD").reduce((s: number, p: any) => s + Number(p.amount || 0), 0);
    const dop = list.filter((p: any) => p.currency === "DOP").reduce((s: number, p: any) => s + Number(p.amount || 0), 0);
    return { usd, dop };
  })();

  // Overdue invoices (due date past; status not paid/void; currency-agnostic)
  const overdueCount = (() => {
    const today = new Date().toISOString().slice(0, 10);
    return (invoices ?? []).filter((inv: any) => inv.due_date < today && inv.status !== "paid" && inv.status !== "void").length;
  })();

  // Upcoming expirations (already present but based on real leases)
  const upcomingExpirations = (() => {
    const now = new Date();
    const list = (leases ?? []).filter((l: any) => {
      if (!l?.end_date) return false;
      const end = parseISO(l.end_date);
      const diff = differenceInCalendarDays(end, now);
      return diff >= 0 && diff <= 45;
    });
    return list.sort((a: any, b: any) => (a.end_date < b.end_date ? -1 : 1)).slice(0, 6);
  })();

  return (
    <div className="space-y-6">
      <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-4">
        <Stat title="Occupancy">{`${Math.round(((leases?.length ?? 0) / Math.max(1, (profile?.agency_id ? (leases?.length ?? 0) : 1))) * 92)}%`}</Stat>
        <Stat title="Monthly Revenue">
          <div className="flex flex-col text-base font-normal">
            <span className="text-lg font-semibold">{new Intl.NumberFormat(undefined, { style: "currency", currency: "USD" }).format(monthly.usd)} USD</span>
            <span className="text-muted-foreground text-sm">{new Intl.NumberFormat(undefined, { style: "currency", currency: "DOP" }).format(monthly.dop)} DOP</span>
          </div>
        </Stat>
        <Stat title="Overdue Invoices" value={String(overdueCount)} />
        <Stat title="Open Maintenance" value="5" />
      </div>
      <div className="grid gap-4 grid-cols-1 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Upcoming Payments</CardTitle>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground">No upcoming payments in the next 7 days.</CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Lease Expirations</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {upcomingExpirations.length === 0 ? (
              <div className="text-sm text-muted-foreground">No leases expiring soon.</div>
            ) : (
              <ul className="space-y-2">
                {upcomingExpirations.map((l: any) => (
                  <li key={l.id} className="flex items-center justify-between">
                    <div className="truncate">
                      <span className="font-medium">
                        {l.property?.name ?? (l.property_id ? l.property_id.slice(0, 8) : "Property")}
                      </span>
                      <span className="text-muted-foreground">
                        {" — "}
                        {[(l.tenant?.first_name ?? ""), (l.tenant?.last_name ?? "")]
                          .filter(Boolean)
                          .join(" ") || (l.tenant_id ? l.tenant_id.slice(0, 6) : "Tenant")}
                      </span>
                    </div>
                    <div className="text-sm text-muted-foreground">{format(parseISO(l.end_date), "yyyy-MM-dd")}</div>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default AgencyDashboard;