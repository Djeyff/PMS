import React from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useAuth } from "@/contexts/AuthProvider";
import { useQuery } from "@tanstack/react-query";
import { fetchProperties } from "@/services/properties";
import { fetchLeases } from "@/services/leases";
import { fetchPayments } from "@/services/payments";

const Stat = ({ title, value, children }: { title: string; value?: string; children?: React.ReactNode }) => (
  <Card>
    <CardHeader className="pb-2">
      <CardTitle className="text-sm text-muted-foreground">{title}</CardTitle>
    </CardHeader>
    <CardContent className="text-2xl font-bold">{value ?? children}</CardContent>
  </Card>
);

const OwnerDashboard = () => {
  const { role, user, profile } = useAuth();

  const { data: props } = useQuery({
    queryKey: ["owner-props", role, user?.id],
    queryFn: () => fetchProperties({ role, userId: user?.id ?? null, agencyId: profile?.agency_id ?? null }),
    enabled: role === "owner" && !!user,
  });

  const { data: leases } = useQuery({
    queryKey: ["owner-leases", role, user?.id],
    queryFn: () => fetchLeases({ role, userId: user?.id ?? null, agencyId: profile?.agency_id ?? null }),
    enabled: role === "owner" && !!user,
  });

  const { data: payments } = useQuery({
    queryKey: ["owner-payments", role, user?.id],
    queryFn: () => fetchPayments({ role, userId: user?.id ?? null, agencyId: profile?.agency_id ?? null }),
    enabled: role === "owner" && !!user,
  });

  const occupancy = (() => {
    const totalProps = props?.length ?? 0;
    const activeLeases = leases?.length ?? 0;
    if (totalProps === 0) return "0%";
    return `${Math.round((activeLeases / totalProps) * 100)}%`;
  })();

  const monthly = (() => {
    const d = new Date().toISOString().slice(0, 7);
    const list = (payments ?? []).filter((p: any) => (p.received_date ?? "").startsWith(d));
    const usd = list.filter((p: any) => p.currency === "USD").reduce((s: number, p: any) => s + Number(p.amount || 0), 0);
    const dop = list.filter((p: any) => p.currency === "DOP").reduce((s: number, p: any) => s + Number(p.amount || 0), 0);
    return { usd, dop };
  })();

  return (
    <div className="space-y-6">
      <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3">
        <Stat title="My Occupancy" value={occupancy} />
        <Stat title="My Revenue">
          <div className="flex flex-col text-base font-normal">
            <span className="text-lg font-semibold">{new Intl.NumberFormat(undefined, { style: "currency", currency: "USD" }).format(monthly.usd)} USD</span>
            <span className="text-muted-foreground text-sm">{new Intl.NumberFormat(undefined, { style: "currency", currency: "DOP" }).format(monthly.dop)} DOP</span>
          </div>
        </Stat>
        <Stat title="Open Maintenance" value="0" />
      </div>
      <Card>
        <CardHeader>
          <CardTitle>Recent Payments</CardTitle>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground">
          {(payments ?? []).slice(0, 5).length === 0
            ? "No payments yet."
            : (payments ?? []).slice(0, 5).map((p: any) => (
                <div key={p.id} className="flex justify-between">
                  <span>{p.received_date}</span>
                  <span>{new Intl.NumberFormat(undefined, { style: "currency", currency: p.currency }).format(p.amount)}</span>
                </div>
              ))}
        </CardContent>
      </Card>
    </div>
  );
};

export default OwnerDashboard;