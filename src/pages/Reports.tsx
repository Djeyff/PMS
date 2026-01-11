import React, { useMemo, useState } from "react";
import AppShell from "@/components/layout/AppShell";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/contexts/AuthProvider";
import { useIsMobile } from "@/hooks/use-mobile";
import InvoiceAgingBucketMobile from "@/components/reports/InvoiceAgingBucketMobile";
import TenantPaymentHistoryItemMobile from "@/components/reports/TenantPaymentHistoryItemMobile";
import OwnerPayoutItemMobile from "@/components/reports/OwnerPayoutItemMobile";
import { useQuery } from "@tanstack/react-query";
import { fetchLeases } from "@/services/leases";
import { fetchPayments } from "@/services/payments";
import { fetchInvoices } from "@/services/invoices";
import { fetchProperties } from "@/services/properties";
import { fetchTenantProfilesInAgency, fetchOwnerProfilesInAgency } from "@/services/users";
import { fetchAgencyOwnerships } from "@/services/property-owners";
import { sendOwnerReport } from "@/services/reports";
import { useToast } from "@/components/ui/use-toast";
import { fetchMyOwnerships } from "@/services/property-owners";
import { supabase } from "@/integrations/supabase/client";

function fmtMoney(amount: number, currency: "USD" | "DOP") {
  return new Intl.NumberFormat(undefined, { style: "currency", currency }).format(amount);
}

function overlapLease(lease: any, start: string, end: string) {
  // overlap if lease.start <= end && lease.end >= start
  return lease.start_date <= end && lease.end_date >= start;
}

function exportCSV(filename: string, headers: string[], rows: (string | number)[][]) {
  const csv = [headers.join(","), ...rows.map(r => r.map(v => `"${String(v).replace(/"/g, '""')}"`).join(","))].join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

const Reports = () => {
  const { role, user, profile } = useAuth();
  const agencyId = profile?.agency_id ?? null;
  const isAdmin = role === "agency_admin";
  const { toast } = useToast();
  const isMobile = useIsMobile();

  // Filters
  const today = new Date().toISOString().slice(0, 10);
  const startDefault = new Date(); startDefault.setMonth(startDefault.getMonth() - 1);
  const [startDate, setStartDate] = useState<string>(startDefault.toISOString().slice(0, 10));
  const [endDate, setEndDate] = useState<string>(today);
  const [quickMonth, setQuickMonth] = useState<string>("custom");
  const [tenantFilter, setTenantFilter] = useState<string>("all");
  const [ownerFilter, setOwnerFilter] = useState<string>("all");

  // Build last 12 months list (closest first)
  const monthOptions = useMemo(() => {
    const opts: Array<{ value: string; label: string; start: string; end: string }> = [];
    const now = new Date();
    for (let i = 0; i < 12; i++) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const year = d.getFullYear();
      const monthIndex = d.getMonth(); // 0-based
      const start = new Date(year, monthIndex, 1);
      const end = new Date(year, monthIndex + 1, 0); // last day of month
      const startStr = start.toISOString().slice(0, 10);
      const endStr = end.toISOString().slice(0, 10);
      const label = start.toLocaleString(undefined, { month: "long", year: "numeric" });
      // Capitalize month name in locales that use lowercase
      const capLabel = label.charAt(0).toUpperCase() + label.slice(1);
      const value = `${year}-${String(monthIndex + 1).padStart(2, "0")}`;
      opts.push({ value, label: capLabel, start: startStr, end: endStr });
    }
    return opts;
  }, []);

  // When quick month changes, set date range
  const onQuickMonthChange = (val: string) => {
    setQuickMonth(val);
    if (val === "custom") return;
    const found = monthOptions.find((m) => m.value === val);
    if (found) {
      setStartDate(found.start);
      setEndDate(found.end);
    }
  };

  // Data
  const { data: properties } = useQuery({
    queryKey: ["rpt-properties", role, user?.id, agencyId],
    enabled: !!agencyId && !!role,
    queryFn: () => fetchProperties({ role, userId: user?.id ?? null, agencyId }),
  });

  const { data: leases } = useQuery({
    queryKey: ["rpt-leases", role, user?.id, agencyId],
    enabled: !!agencyId && !!role,
    queryFn: () => fetchLeases({ role, userId: user?.id ?? null, agencyId }),
  });

  const { data: payments } = useQuery({
    queryKey: ["rpt-payments", role, user?.id, agencyId],
    enabled: !!agencyId && !!role,
    queryFn: () => fetchPayments({ role, userId: user?.id ?? null, agencyId }),
  });

  // ADD: derive average USD/DOP rate for the selected range (from payments; fallback to exchange_rates)
  const [avgRate, setAvgRate] = useState<number | null>(null);

  React.useEffect(() => {
    const loadRate = async () => {
      if (!startDate || !endDate) {
        setAvgRate(null);
        return;
      }
      const inRange = (payments ?? []).filter((p: any) => {
        const d = String(p.received_date ?? "").slice(0, 10);
        return d >= startDate && d <= endDate;
      });
      const paymentRates = inRange
        .map((p: any) => (typeof p.exchange_rate === "number" ? Number(p.exchange_rate) : null))
        .filter((n: any) => n != null && Number.isFinite(n) && n > 0) as number[];

      if (paymentRates.length > 0) {
        const avg = paymentRates.reduce((s, n) => s + n, 0) / paymentRates.length;
        setAvgRate(avg);
        return;
      }

      // Fallback to exchange_rates table
      const { data, error } = await supabase
        .from("exchange_rates")
        .select("rate")
        .gte("date", startDate)
        .lte("date", endDate)
        .eq("base_currency", "USD")
        .eq("target_currency", "DOP");
      if (error) {
        setAvgRate(null);
        return;
      }
      const rates = (data ?? []).map((r: any) => Number(r.rate)).filter((n) => Number.isFinite(n) && n > 0);
      if (rates.length === 0) {
        setAvgRate(null);
      } else {
        const avg = rates.reduce((s, n) => s + n, 0) / rates.length;
        setAvgRate(avg);
      }
    };
    loadRate();
  }, [payments, startDate, endDate]);

  // Owner share map (for owner role)
  const { data: myShares } = useQuery({
    queryKey: ["rpt-owner-shares", user?.id],
    enabled: role === "owner" && !!user?.id,
    queryFn: () => fetchMyOwnerships(user!.id),
  });

  const { data: invoices } = useQuery({
    queryKey: ["rpt-invoices", role, user?.id, agencyId],
    enabled: !!agencyId && !!role,
    queryFn: fetchInvoices,
  });

  const { data: tenants } = useQuery({
    queryKey: ["rpt-tenants", agencyId],
    enabled: !!agencyId && isAdmin,
    queryFn: () => fetchTenantProfilesInAgency(agencyId!),
  });

  const { data: owners } = useQuery({
    queryKey: ["rpt-owners", agencyId],
    enabled: !!agencyId && isAdmin,
    queryFn: () => fetchOwnerProfilesInAgency(agencyId!),
  });

  const { data: ownerships } = useQuery({
    queryKey: ["rpt-ownerships", agencyId],
    enabled: !!agencyId && isAdmin,
    queryFn: () => fetchAgencyOwnerships(agencyId!),
  });

  // Occupancy
  const occupancy = useMemo(() => {
    // Consistent with dashboard: occupied if any lease has a tenant and is not terminated
    const totalProps = properties?.length ?? 0;
    if (totalProps === 0) return { percent: 0, activeProps: 0, totalProps: 0 };
    const occupiedSet = new Set<string>();
    (leases ?? []).forEach((l: any) => {
      if (l?.tenant_id && String(l.status) !== "terminated") {
        occupiedSet.add(l.property_id);
      }
    });
    const activeProps = occupiedSet.size;
    const percent = Math.round((activeProps / totalProps) * 100);
    return { percent, activeProps, totalProps };
  }, [properties, leases]);

  // Revenue (by currency)
  const revenue = useMemo(() => {
    const inRange = (payments ?? []).filter((p: any) => p.received_date >= startDate && p.received_date <= endDate);
    const byTenant = tenantFilter === "all" ? inRange : inRange.filter((p: any) => p.tenant_id === tenantFilter);
    
    const ownerShareOf = (p: any) => {
      if (role !== "owner") return Number(p.amount || 0);
      const propId = p.lease?.property?.id ?? p.lease?.property_id ?? null;
      const percent = propId ? (myShares?.get(propId) ?? 100) : 100;
      const factor = Math.max(0, Math.min(100, Number(percent))) / 100;
      return Number(p.amount || 0) * factor;
    };

    const sum = (method: string, currency: "USD" | "DOP") =>
      byTenant
        .filter((p: any) => String(p.method) === method && p.currency === currency)
        .reduce((s: number, p: any) => s + ownerShareOf(p), 0);

    return {
      bankUsd: sum("bank_transfer", "USD"),
      bankDop: sum("bank_transfer", "DOP"),
      cashUsd: sum("cash", "USD"),
      cashDop: sum("cash", "DOP"),
      rows: byTenant,
    };
  }, [payments, startDate, endDate, tenantFilter, role, myShares]);

  // Invoice aging
  const aging = useMemo(() => {
    const todayStr = endDate; // consider endDate as "today" for report view
    const pendings = (invoices ?? []).filter((inv: any) => inv.status !== "paid" && inv.status !== "void");
    const inRange = pendings.filter((inv: any) => inv.due_date <= todayStr);
    const bucket = { current: 0, "1-30": 0, "31-60": 0, "61+": 0 };
    const totalsByBucket: Record<"current" | "1-30" | "31-60" | "61+", { USD: number; DOP: number }> = {
      current: { USD: 0, DOP: 0 },
      "1-30": { USD: 0, DOP: 0 },
      "31-60": { USD: 0, DOP: 0 },
      "61+": { USD: 0, DOP: 0 },
    };
    inRange.forEach((inv: any) => {
      const days = Math.max(0, Math.floor((Date.parse(todayStr) - Date.parse(inv.due_date)) / (24 * 3600 * 1000)));
      const key: "current" | "1-30" | "31-60" | "61+" =
        days === 0 ? "current" : days <= 30 ? "1-30" : days <= 60 ? "31-60" : "61+";
      bucket[key] += 1;
      const cur = inv.currency as "USD" | "DOP";
      totalsByBucket[key][cur] += Number(inv.total_amount || 0);
    });
    return { bucket, totalsByBucket };
  }, [invoices, endDate]);

  // Owner payouts (weighted by ownership)
  const ownerPayoutRows = useMemo(() => {
    if (!isAdmin) return [];
    const ow = ownerships ?? [];
    const inRange = (payments ?? []).filter((p: any) => p.received_date >= startDate && p.received_date <= endDate);
    const result = new Map<string, { name: string; usd: number; dop: number }>();
    inRange.forEach((p: any) => {
      const propId = p.lease?.property?.id || p.lease?.property_id || null;
      if (!propId) return;
      const ownersForProp = ow.filter((o) => o.property_id === propId);
      ownersForProp.forEach((o) => {
        const percent = o.ownership_percent == null ? 100 : Math.max(0, Math.min(100, Number(o.ownership_percent)));
        const share = (Number(p.amount || 0) * percent) / 100;
        const ownerName = [o.owner?.first_name ?? "", o.owner?.last_name ?? ""].filter(Boolean).join(" ") || "—";
        const key = o.owner_id;
        const row = result.get(key) ?? { name: ownerName, usd: 0, dop: 0 };
        if (p.currency === "USD") row.usd += share;
        else row.dop += share;
        result.set(key, row);
      });
    });
    return Array.from(result.entries()).map(([ownerId, val]) => ({ ownerId, ...val }));
  }, [ownerships, payments, startDate, endDate, isAdmin]);

  // Enrich owner payout rows with fee and payoutAfterFee using avgRate and 5%
  const ownerPayoutRowsWithFee = useMemo(() => {
    const rate = Number.isFinite(Number(avgRate)) && (avgRate ?? 0) > 0 ? (avgRate as number) : NaN;
    const feePct = 0.05; // 5%
    return ownerPayoutRows.map((r) => {
      const baseDop = (Number.isNaN(rate) ? 0 : r.usd * rate) + r.dop;
      const feeDop = baseDop * feePct;
      const feeDeducted = Math.min(feeDop, r.dop);
      const payoutAfterFee = Math.max(0, r.dop - feeDeducted);
      return { ...r, feeDop: feeDeducted, payoutAfterFee };
    });
  }, [ownerPayoutRows, avgRate]);

  // Tenant payment history table rows (filtered by tenant)
  const tenantHistoryRows = useMemo(() => {
    const rows = revenue.rows.map((p: any) => {
      const propName = p.lease?.property?.name ?? "—";
      const tenantName = [p.tenant?.first_name, p.tenant?.last_name].filter(Boolean).join(" ") || "—";
      const ownerShareAmount = (() => {
        if (role !== "owner") return Number(p.amount || 0);
        const propId = p.lease?.property?.id ?? p.lease?.property_id ?? null;
        const percent = propId ? (myShares?.get(propId) ?? 100) : 100;
        const factor = Math.max(0, Math.min(100, Number(percent))) / 100;
        return Number(p.amount || 0) * factor;
      })();
      return {
        date: p.received_date,
        property: propName,
        tenant: tenantName,
        method: String(p.method).replace("_", " "),
        amount: fmtMoney(ownerShareAmount, p.currency),
      };
    });
    return rows;
  }, [revenue.rows, role, myShares]);

  // Build CSV for a single owner (aggregated totals only for simplicity)
  const ownerCsvFor = (ownerId: string) => {
    const rows = ownerPayoutRows.filter((r) => r.ownerId === ownerId);
    const headers = ["Owner", "USD", "DOP", "Start", "End"];
    const csvRows = rows.map((r) => [r.name, r.usd.toFixed(2), r.dop.toFixed(2), startDate, endDate]);
    return [headers.join(","), ...csvRows.map((r) => r.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(","))].join("\n");
  };

  const handleSendEmail = async () => {
    if (ownerFilter === "all") {
      toast({ title: "Select an owner", description: "Please choose an owner to send the report.", variant: "default" });
      return;
    }
    const row = ownerPayoutRows.find((r) => r.ownerId === ownerFilter);
    if (!row) {
      toast({ title: "No data", description: "No payouts found for the selected owner.", variant: "default" });
      return;
    }
    const csv = ownerCsvFor(ownerFilter);
    try {
      await sendOwnerReport({
        ownerId: ownerFilter,
        ownerName: row.name,
        startDate,
        endDate,
        totals: { usd: row.usd, dop: row.dop },
        csv,
      });
      toast({ title: "Report sent", description: `Email sent to ${row.name}.` });
    } catch (e: any) {
      toast({ title: "Failed to send", description: e.message, variant: "destructive" });
    }
  };

  return (
    <AppShell>
      <div className="space-y-6">
        <div className="flex flex-wrap items-end gap-3">
          <div>
            <div className="text-sm text-muted-foreground">Quick month</div>
            <Select value={quickMonth} onValueChange={onQuickMonthChange}>
              <SelectTrigger className="w-[220px]">
                <SelectValue placeholder="Select month" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="custom">Custom range</SelectItem>
                {monthOptions.map((m) => (
                  <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <div className="text-sm text-muted-foreground">Start</div>
            <Input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} className="w-[180px]" />
          </div>
          <div>
            <div className="text-sm text-muted-foreground">End</div>
            <Input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} className="w-[180px]" />
          </div>
          {isAdmin && (
            <>
              <div>
                <div className="text-sm text-muted-foreground">Tenant</div>
                <Select value={tenantFilter} onValueChange={setTenantFilter}>
                  <SelectTrigger className="w-[220px]">
                    <SelectValue placeholder="All tenants" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All tenants</SelectItem>
                    {(tenants ?? []).map((t) => (
                      <SelectItem key={t.id} value={t.id}>
                        {[t.first_name, t.last_name].filter(Boolean).join(" ") || "—"}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <div className="text-sm text-muted-foreground">Owner (payout report)</div>
                <Select value={ownerFilter} onValueChange={setOwnerFilter}>
                  <SelectTrigger className="w-[220px]">
                    <SelectValue placeholder="All owners" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All owners</SelectItem>
                    {(owners ?? []).map((o) => (
                      <SelectItem key={o.id} value={o.id}>
                        {[o.first_name, o.last_name].filter(Boolean).join(" ") || "—"}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </>
          )}
        </div>

        <div className="grid gap-4 grid-cols-1 md:grid-cols-3">
          <Card>
            <CardHeader className="pb-2"><CardTitle className="text-sm text-muted-foreground">Occupancy</CardTitle></CardHeader>
            <CardContent className="text-2xl font-bold">{`${occupancy.percent}%`}</CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2"><CardTitle className="text-sm text-muted-foreground">Bank Transfer</CardTitle></CardHeader>
            <CardContent className="text-base font-normal">
              <div className="text-lg font-semibold">{fmtMoney(revenue.bankUsd, "USD")} USD</div>
              <div className="text-lg font-semibold">{fmtMoney(revenue.bankDop, "DOP")} DOP</div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2"><CardTitle className="text-sm text-muted-foreground">Cash</CardTitle></CardHeader>
            <CardContent className="text-base font-normal">
              <div className="text-lg font-semibold">{fmtMoney(revenue.cashUsd, "USD")} USD</div>
              <div className="text-lg font-semibold">{fmtMoney(revenue.cashDop, "DOP")} DOP</div>
            </CardContent>
          </Card>
        </div>

        <div className="grid gap-4 grid-cols-1 lg:grid-cols-2">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle>Invoice Aging</CardTitle>
              <Button
                variant="outline"
                size="sm"
                onClick={() => exportCSV("invoice_aging.csv", ["Bucket", "Count", "Total USD", "Total DOP"], [
                  ["Current", String(aging.bucket.current), (aging.totalsByBucket.current.USD ?? 0).toFixed(2), (aging.totalsByBucket.current.DOP ?? 0).toFixed(2)],
                  ["1-30", String(aging.bucket["1-30"]), (aging.totalsByBucket["1-30"].USD ?? 0).toFixed(2), (aging.totalsByBucket["1-30"].DOP ?? 0).toFixed(2)],
                  ["31-60", String(aging.bucket["31-60"]), (aging.totalsByBucket["31-60"].USD ?? 0).toFixed(2), (aging.totalsByBucket["31-60"].DOP ?? 0).toFixed(2)],
                  ["61+", String(aging.bucket["61+"]), (aging.totalsByBucket["61+"].USD ?? 0).toFixed(2), (aging.totalsByBucket["61+"].DOP ?? 0).toFixed(2)],
                ])}
              >
                Export CSV
              </Button>
            </CardHeader>
            <CardContent>
              {isMobile ? (
                <div>
                  <InvoiceAgingBucketMobile
                    title="Current"
                    count={aging.bucket.current}
                    totalUsd={aging.totalsByBucket.current.USD ?? 0}
                    totalDop={aging.totalsByBucket.current.DOP ?? 0}
                  />
                  <InvoiceAgingBucketMobile
                    title="1-30"
                    count={aging.bucket["1-30"]}
                    totalUsd={aging.totalsByBucket["1-30"].USD ?? 0}
                    totalDop={aging.totalsByBucket["1-30"].DOP ?? 0}
                  />
                  <InvoiceAgingBucketMobile
                    title="31-60"
                    count={aging.bucket["31-60"]}
                    totalUsd={aging.totalsByBucket["31-60"].USD ?? 0}
                    totalDop={aging.totalsByBucket["31-60"].DOP ?? 0}
                  />
                  <InvoiceAgingBucketMobile
                    title="61+"
                    count={aging.bucket["61+"]}
                    totalUsd={aging.totalsByBucket["61+"].USD ?? 0}
                    totalDop={aging.totalsByBucket["61+"].DOP ?? 0}
                  />
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Bucket</TableHead>
                      <TableHead>Count</TableHead>
                      <TableHead>Total USD</TableHead>
                      <TableHead>Total DOP</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    <TableRow>
                      <TableCell>Current</TableCell>
                      <TableCell>{aging.bucket.current}</TableCell>
                      <TableCell>{fmtMoney(aging.totalsByBucket.current.USD ?? 0, "USD")}</TableCell>
                      <TableCell>{fmtMoney(aging.totalsByBucket.current.DOP ?? 0, "DOP")}</TableCell>
                    </TableRow>
                    <TableRow>
                      <TableCell>1-30</TableCell>
                      <TableCell>{aging.bucket["1-30"]}</TableCell>
                      <TableCell>{fmtMoney(aging.totalsByBucket["1-30"].USD ?? 0, "USD")}</TableCell>
                      <TableCell>{fmtMoney(aging.totalsByBucket["1-30"].DOP ?? 0, "DOP")}</TableCell>
                    </TableRow>
                    <TableRow>
                      <TableCell>31-60</TableCell>
                      <TableCell>{aging.bucket["31-60"]}</TableCell>
                      <TableCell>{fmtMoney(aging.totalsByBucket["31-60"].USD ?? 0, "USD")}</TableCell>
                      <TableCell>{fmtMoney(aging.totalsByBucket["31-60"].DOP ?? 0, "DOP")}</TableCell>
                    </TableRow>
                    <TableRow>
                      <TableCell>61+</TableCell>
                      <TableCell>{aging.bucket["61+"]}</TableCell>
                      <TableCell>{fmtMoney(aging.totalsByBucket["61+"].USD ?? 0, "USD")}</TableCell>
                      <TableCell>{fmtMoney(aging.totalsByBucket["61+"].DOP ?? 0, "DOP")}</TableCell>
                    </TableRow>
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle>Tenant Payment History</CardTitle>
              <Button
                variant="outline"
                size="sm"
                onClick={() =>
                  exportCSV(
                    "tenant_payments.csv",
                    ["Date", "Property", "Tenant", "Method", "Amount"],
                    tenantHistoryRows.map(r => [r.date, r.property, r.tenant, r.method, r.amount])
                  )
                }
              >
                Export CSV
              </Button>
            </CardHeader>
            <CardContent>
              {tenantHistoryRows.length === 0 ? (
                <div className="text-muted-foreground text-sm">No payments in range.</div>
              ) : isMobile ? (
                <div>
                  {tenantHistoryRows.map((r, idx) => (
                    <TenantPaymentHistoryItemMobile key={idx} row={r} />
                  ))}
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Date</TableHead>
                      <TableHead>Property</TableHead>
                      <TableHead>Tenant</TableHead>
                      <TableHead>Method</TableHead>
                      <TableHead>Amount</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {tenantHistoryRows.map((r, idx) => (
                      <TableRow key={idx}>
                        <TableCell>{r.date}</TableCell>
                        <TableCell>{r.property}</TableCell>
                        <TableCell>{r.tenant}</TableCell>
                        <TableCell className="capitalize">{r.method}</TableCell>
                        <TableCell>{r.amount}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </div>

        {isAdmin && (
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle>Owner Payouts</CardTitle>
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() =>
                    exportCSV(
                      "owner_payouts.csv",
                      ["Owner", "USD", "DOP"],
                      ownerPayoutRowsWithFee
                        .filter((r) => (ownerFilter === "all" ? true : r.ownerId === ownerFilter))
                        .map((r) => [r.name, r.usd.toFixed(2), r.dop.toFixed(2)])
                    )
                  }
                >
                  Export CSV
                </Button>
                <Button variant="default" size="sm" onClick={handleSendEmail} disabled={ownerFilter === "all"}>
                  Send Email
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              {isMobile ? (
                <div>
                  {ownerPayoutRowsWithFee
                    .filter((r) => (ownerFilter === "all" ? true : r.ownerId === ownerFilter))
                    .map((r) => (
                      <OwnerPayoutItemMobile
                        key={r.ownerId}
                        name={r.name}
                        usd={r.usd}
                        dop={r.dop}
                        feeDop={r.feeDop}
                        payoutAfterFee={r.payoutAfterFee}
                      />
                    ))}
                  {ownerPayoutRowsWithFee.length === 0 && (
                    <div className="text-muted-foreground text-sm">No payouts in range.</div>
                  )}
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Owner</TableHead>
                      <TableHead>USD</TableHead>
                      <TableHead>DOP</TableHead>
                      <TableHead>Management fee (DOP)</TableHead>
                      <TableHead>Payout (DOP after fee)</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {ownerPayoutRowsWithFee
                      .filter((r) => (ownerFilter === "all" ? true : r.ownerId === ownerFilter))
                      .map((r) => (
                        <TableRow key={r.ownerId}>
                          <TableCell>{r.name}</TableCell>
                          <TableCell>{fmtMoney(r.usd, "USD")}</TableCell>
                          <TableCell>{fmtMoney(r.dop, "DOP")}</TableCell>
                          <TableCell>{fmtMoney(r.feeDop ?? 0, "DOP")}</TableCell>
                          <TableCell>{fmtMoney(r.payoutAfterFee ?? r.dop, "DOP")}</TableCell>
                        </TableRow>
                      ))}
                    {ownerPayoutRowsWithFee.length === 0 && (
                      <TableRow>
                        <TableCell colSpan={5} className="text-muted-foreground text-sm">No payouts in range.</TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        )}
      </div>
    </AppShell>
  );
};

export default Reports;