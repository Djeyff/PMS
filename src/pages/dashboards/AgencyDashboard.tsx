import React from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import Money from "@/components/Money";
import { useAuth } from "@/contexts/AuthProvider";
import { useQuery } from "@tanstack/react-query";
import { fetchLeases } from "@/services/leases";
import { fetchPayments } from "@/services/payments";
import { fetchInvoices } from "@/services/invoices";
import { fetchProperties } from "@/services/properties";
import { fetchMaintenanceRequests } from "@/services/maintenance";
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

  const { data: properties } = useQuery({
    queryKey: ["dashboard-properties", role, user?.id, profile?.agency_id],
    queryFn: () => fetchProperties({ role, userId: user?.id ?? null, agencyId: profile?.agency_id ?? null }),
    enabled: !!role && !!user && !!profile?.agency_id,
  });

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

  const { data: maintenance } = useQuery({
    queryKey: ["dashboard-maintenance", role, user?.id, profile?.agency_id],
    queryFn: () => fetchMaintenanceRequests({ agencyId: profile!.agency_id!, status: ["open", "in_progress"] }),
    enabled: !!role && !!user && !!profile?.agency_id,
  });

  const occupancyPercent = (() => {
    const totalProps = properties?.length ?? 0;
    if (totalProps === 0) return 0;
    const activeProps = new Set<string>();
    (leases ?? []).forEach((l: any) => {
      const today = new Date().toISOString().slice(0, 10);
      if (l.start_date <= today && l.end_date >= today) {
        activeProps.add(l.property_id);
      }
    });
    return Math.round((activeProps.size / totalProps) * 100);
  })();

  const monthly = (() => {
    const d = new Date();
    const ym = d.toISOString().slice(0, 7);
    const list = (payments ?? []).filter((p: any) => (p.received_date ?? "").startsWith(ym));
    const usd = list.filter((p: any) => p.currency === "USD").reduce((s: number, p: any) => s + Number(p.amount || 0), 0);
    const dop = list.filter((p: any) => p.currency === "DOP").reduce((s: number, p: any) => s + Number(p.amount || 0), 0);
    return { usd, dop };
  })();

  const overdueCount = (() => {
    const today = new Date().toISOString().slice(0, 10);
    return (invoices ?? []).filter((inv: any) => inv.due_date < today && inv.status !== "paid" && inv.status !== "void").length;
  })();

  const pendingInvoices = (() => {
    const list = (invoices ?? [])
      .filter((inv: any) => inv.status === "sent" || inv.status === "partial" || inv.status === "overdue")
      .map((inv: any) => {
        const paid = (inv.payments ?? [])
          .filter((p: any) => p.currency === inv.currency)
          .reduce((s: number, p: any) => s + Number(p.amount || 0), 0);
        const remaining = Math.max(0, Number(inv.total_amount || 0) - paid);
        return { ...inv, paid, remaining };
      })
      .filter((inv: any) => inv.remaining > 0)
      .sort((a: any, b: any) => (a.due_date < b.due_date ? -1 : 1))
      .slice(0, 6);
    return list;
  })();

  const upcomingExpirations = (() => {
    const now = new Date();
    const list = (leases ?? []).filter((l: any) => {
      if (!l?.end_date) return false;
      const end = parseISO(l.end_date);
      const diff = differenceInCalendarDays(end, now);
      const isExpiringSoon = diff >= 0 && diff <= 45;
      const isExpiredNotTerminated = diff < 0 && String(l.status) !== "terminated";
      return isExpiringSoon || isExpiredNotTerminated;
    });
    return list.sort((a: any, b: any) => (a.end_date < b.end_date ? -1 : 1)).slice(0, 6);
  })();

  const upcomingMaintenance = (() => {
    const today = new Date().toISOString().slice(0, 10);
    const list = (maintenance ?? [])
      .filter((m: any) => m.due_date && m.due_date >= today)
      .sort((a: any, b: any) => (a.due_date < b.due_date ? -1 : 1))
      .slice(0, 6);
    return list;
  })();

  return (
    <div className="space-y-6">
      <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-4">
        <Stat title="Occupancy" value={`${occupancyPercent}%`} />
        <Stat title="Monthly Revenue">
          <div className="flex flex-col text-base font-normal">
            <span className="text-lg font-semibold">{new Intl.NumberFormat(undefined, { style: "currency", currency: "USD" }).format(monthly.usd)} USD</span>
            <span className="text-muted-foreground text-sm">{new Intl.NumberFormat(undefined, { style: "currency", currency: "DOP" }).format(monthly.dop)} DOP</span>
          </div>
        </Stat>
        <Stat title="Overdue Invoices" value={String(overdueCount)} />
        <Stat title="Open Maintenance" value={String(maintenance?.length ?? 0)} />
      </div>
      <div className="grid gap-4 grid-cols-1">
        <Card>
          <CardHeader>
            <CardTitle>Pending Invoices</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {pendingInvoices.length === 0 ? (
              <div className="text-sm text-muted-foreground">No pending invoices.</div>
            ) : (
              <ul className="space-y-4">
                {pendingInvoices.map((inv: any) => {
                  const propName = inv.lease?.property?.name ?? (inv.lease_id ? inv.lease_id.slice(0, 8) : "Property");
                  const tenantName =
                    [inv.tenant?.first_name ?? "", inv.tenant?.last_name ?? ""].filter(Boolean).join(" ") ||
                    (inv.tenant_id ? inv.tenant_id.slice(0, 6) : "Tenant");
                  const amtText = new Intl.NumberFormat(undefined, { style: "currency", currency: inv.currency }).format(inv.remaining);
                  const remainingText = inv.currency === "DOP" ? `DOP ${amtText}` : amtText;
                  return (
                    <li key={inv.id} className="space-y-1">
                      <div className="font-medium">{propName} — {tenantName}</div>
                      <div className="text-sm text-muted-foreground">{inv.due_date}</div>
                      <div className="text-sm">Remaining: {remainingText}</div>
                    </li>
                  );
                })}
              </ul>
            )}
          </CardContent>
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
                    <div className="text-sm text-muted-foreground">
                      {format(parseISO(l.end_date), "yyyy-MM-dd")}
                      {differenceInCalendarDays(parseISO(l.end_date), new Date()) < 0 && String(l.status) !== "terminated" ? (
                        <span className="ml-2 text-red-600 text-xs">Expired</span>
                      ) : null}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>
      <div className="grid gap-4 grid-cols-1">
        <Card>
          <CardHeader>
            <CardTitle>Upcoming Maintenance</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {(upcomingMaintenance ?? []).length === 0 ? (
              <div className="text-sm text-muted-foreground">No upcoming maintenance deadlines.</div>
            ) : (
              <ul className="space-y-2">
                {(upcomingMaintenance ?? []).map((m: any) => (
                  <li key={m.id} className="flex items-center justify-between">
                    <div className="truncate">
                      <span className="font-medium">
                        {m.property?.name ?? (m.property_id ? m.property_id.slice(0, 8) : "Property")}
                      </span>
                      <span className="text-muted-foreground">
                        {" — "}
                        {m.title}
                      </span>
                    </div>
                    <div className="text-right">
                      <div className="text-sm text-muted-foreground">{m.due_date}</div>
                      <div className="text-xs capitalize text-muted-foreground">{m.status.replace("_", " ")}</div>
                    </div>
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