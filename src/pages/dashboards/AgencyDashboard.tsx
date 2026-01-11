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
import { Link } from "react-router-dom";

const Stat = ({ title, value, children, className }: { title: string; value?: string; children?: React.ReactNode; className?: string }) => (
  <Card className={className}>
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

  const { data: maintenance, refetch: refetchMaintenance } = useQuery({
    queryKey: ["dashboard-maintenance", role, user?.id, profile?.agency_id],
    queryFn: () => fetchMaintenanceRequests({ agencyId: profile!.agency_id!, status: ["open", "in_progress"] }),
    enabled: !!role && !!user && !!profile?.agency_id,
  });

  const occupancyPercent = (() => {
    const totalProps = properties?.length ?? 0;
    if (totalProps === 0) return 0;
    const occupiedIds = new Set<string>();
    (leases ?? []).forEach((l: any) => {
      if (l?.tenant_id && String(l.status) !== "terminated") {
        occupiedIds.add(l.property_id);
      }
    });
    return Math.round((occupiedIds.size / totalProps) * 100);
  })();

  const monthlyByMethod = (() => {
    const d = new Date();
    const ym = d.toISOString().slice(0, 7); // YYYY-MM
    const list = (payments ?? []).filter((p: any) => (p.received_date ?? "").startsWith(ym));
    const sum = (method: string, currency: "USD" | "DOP") =>
      list
        .filter((p: any) => String(p.method) === method && p.currency === currency)
        .reduce((s: number, p: any) => s + Number(p.amount || 0), 0);
    return {
      bankUsd: sum("bank_transfer", "USD"),
      bankDop: sum("bank_transfer", "DOP"),
      cashUsd: sum("cash", "USD"),
      cashDop: sum("cash", "DOP"),
    };
  })();

  const overdueCount = (() => {
    const today = new Date().toISOString().slice(0, 10);
    return (invoices ?? []).filter((inv: any) => inv.due_date < today && inv.status !== "paid" && inv.status !== "void").length;
  })();

  const overdueAmounts = (() => {
    const today = new Date().toISOString().slice(0, 10);
    let usd = 0;
    let dop = 0;
    (invoices ?? []).forEach((inv: any) => {
      if (inv.due_date >= today || inv.status === "paid" || inv.status === "void") return;
      const currency = inv.currency as "USD" | "DOP";
      const total = Number(inv.total_amount || 0);
      const paidConverted = (inv.payments ?? []).reduce((sum: number, p: any) => {
        const amt = Number(p.amount || 0);
        if (p.currency === currency) return sum + amt;
        const rate = typeof p.exchange_rate === "number" ? p.exchange_rate : null;
        if (!rate || rate <= 0) return sum;
        if (currency === "USD" && p.currency === "DOP") return sum + amt / rate; // DOP -> USD
        if (currency === "DOP" && p.currency === "USD") return sum + amt * rate; // USD -> DOP
        return sum;
      }, 0);
      const remaining = Math.max(0, total - paidConverted);
      if (remaining > 0) {
        if (currency === "USD") usd += remaining;
        else dop += remaining;
      }
    });
    return { usd, dop };
  })();

  // NEW: overdue maintenance count
  const overdueMaintenanceCount = (() => {
    const today = new Date().toISOString().slice(0, 10);
    return (maintenance ?? []).filter((m: any) => m.due_date && m.due_date < today && m.status !== "closed").length;
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

  // NEW: Helper for converted remaining and last partial date
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

  // NEW: All partial invoices
  const partialInvoices = (invoices ?? []).filter((inv: any) => String(inv.status) === "partial");

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
        <Stat title="Bank Transfer">
          <div className="flex flex-col text-base font-normal">
            <span className="text-lg font-semibold">{new Intl.NumberFormat(undefined, { style: "currency", currency: "USD" }).format(monthlyByMethod.bankUsd)} USD</span>
            <span className="text-lg font-semibold">{new Intl.NumberFormat(undefined, { style: "currency", currency: "DOP" }).format(monthlyByMethod.bankDop)} DOP</span>
          </div>
        </Stat>
        <Stat title="Cash">
          <div className="flex flex-col text-base font-normal">
            <span className="text-lg font-semibold">{new Intl.NumberFormat(undefined, { style: "currency", currency: "USD" }).format(monthlyByMethod.cashUsd)} USD</span>
            <span className="text-lg font-semibold">{new Intl.NumberFormat(undefined, { style: "currency", currency: "DOP" }).format(monthlyByMethod.cashDop)} DOP</span>
          </div>
        </Stat>
        <Stat title="Overdue Invoices" className={(overdueAmounts.usd > 0 || overdueAmounts.dop > 0 || overdueCount > 0) ? "border-red-500/30 dark:border-red-400/30 bg-red-500/10 dark:bg-red-400/10" : undefined}>
          <div className="flex flex-col text-base font-normal">
            <span className={`text-lg font-semibold ${overdueAmounts.usd > 0 ? "text-red-600 dark:text-red-300" : ""}`}>{new Intl.NumberFormat(undefined, { style: "currency", currency: "USD" }).format(overdueAmounts.usd)} USD</span>
            <span className={`text-lg font-semibold ${overdueAmounts.dop > 0 ? "text-red-600 dark:text-red-300" : ""}`}>{new Intl.NumberFormat(undefined, { style: "currency", currency: "DOP" }).format(overdueAmounts.dop)} DOP</span>
            <span className={`text-xs mt-1 ${overdueCount > 0 ? "text-red-600 dark:text-red-300" : "text-muted-foreground"}`}>Count: {overdueCount}</span>
          </div>
        </Stat>
        <Stat title="Open Maintenance" className={overdueMaintenanceCount > 0 ? "border-red-500/30 dark:border-red-400/30 bg-red-500/10 dark:bg-red-400/10" : undefined}>
          <div className="flex flex-col">
            <span className="text-2xl font-bold">{maintenance?.length ?? 0}</span>
            <span className="text-xs mt-1">
              Overdue: <Link to="/maintenance?overdue=1" className="underline text-red-600 dark:text-red-300">{overdueMaintenanceCount}</Link>
            </span>
          </div>
        </Stat>
      </div>
      <div className="grid gap-4 grid-cols-1">
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
                  <li key={l.id} className="space-y-1 sm:space-y-0 sm:flex sm:items-center sm:justify-between">
                    <div className="truncate">
                      <div className="font-medium">{l.property?.name ?? (l.property_id ? l.property_id.slice(0, 8) : "Property")}</div>
                      <div className="text-sm text-muted-foreground">
                        {[(l.tenant?.first_name ?? ""), (l.tenant?.last_name ?? "")]
                          .filter(Boolean)
                          .join(" ") || (l.tenant_id ? l.tenant_id.slice(0, 6) : "Tenant")}
                      </div>
                    </div>
                    <div className="text-sm text-muted-foreground">
                      {format(parseISO(l.end_date), "yyyy-MM-dd")}
                      {String(l.status) === "pending_renewal" ? (
                        <span className="ml-2 text-orange-600 text-xs">Pending renewal</span>
                      ) : differenceInCalendarDays(parseISO(l.end_date), new Date()) < 0 && String(l.status) !== "terminated" ? (
                        <span className="ml-2 text-red-600 text-xs">Expired</span>
                      ) : null}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

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
                      <div className="text-xs">
                        <Link to={`/invoices/${inv.id}`} className="underline">View invoice</Link>
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>

      {/* NEW: Partial Invoices (ALL) */}
      <div className="grid gap-4 grid-cols-1">
        <Card>
          <CardHeader>
            <CardTitle className="text-orange-600">Partial Invoices</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {partialInvoices.length === 0 ? (
              <div className="text-sm text-muted-foreground">No partial invoices.</div>
            ) : (
              <ul className="space-y-3">
                {partialInvoices.map((inv: any) => {
                  const remaining = computeRemaining(inv);
                  const remainingText = new Intl.NumberFormat(undefined, { style: "currency", currency: inv.currency }).format(remaining);
                  const propName = inv.lease?.property?.name ?? (inv.lease_id ? inv.lease_id.slice(0, 8) : "Property");
                  const tenantName =
                    [inv.tenant?.first_name ?? "", inv.tenant?.last_name ?? ""].filter(Boolean).join(" ") ||
                    (inv.tenant_id ? inv.tenant_id.slice(0, 6) : "Tenant");
                  const partialDate = lastPaymentDate(inv);
                  return (
                    <li key={inv.id} className="space-y-1">
                      <div className="font-medium">{propName} — {tenantName}</div>
                      <div className="text-sm text-muted-foreground">Invoice: {inv.issue_date} • Due: {inv.due_date}</div>
                      <div className="text-sm">Last partial payment: {partialDate ?? "—"}</div>
                      <div className="text-sm">Remaining: {remainingText}</div>
                      <div className="text-xs">
                        <Link to={`/invoices/${inv.id}`} className="underline">View invoice</Link>
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 grid-cols-1">
        <Card>
          <CardHeader className="flex items-center justify-between">
            <CardTitle>Upcoming Maintenance</CardTitle>
            <button
              type="button"
              className="text-xs underline"
              onClick={() => refetchMaintenance()}
              aria-label="Refresh maintenance"
            >
              Refresh
            </button>
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
                      <div className="text-xs">
                        <Link to={`/maintenance?id=${m.id}`} className="underline">View</Link>
                      </div>
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