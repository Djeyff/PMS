import React from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useAuth } from "@/contexts/AuthProvider";
import { useQuery } from "@tanstack/react-query";
import { fetchProperties } from "@/services/properties";
import { fetchLeases, type LeaseWithMeta } from "@/services/leases";
import { fetchPayments } from "@/services/payments";
import { fetchMyOwnerships } from "@/services/property-owners";
import { fetchMaintenanceRequests } from "@/services/maintenance";
import { fetchInvoices } from "@/services/invoices";
import { listOwnerReports, type OwnerReportRow } from "@/services/owner-reports";
import OwnerReportInvoiceDialog from "@/components/owner/OwnerReportInvoiceDialog";
import { Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";

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

  const { data: myShares } = useQuery({
    queryKey: ["owner-shares", user?.id],
    queryFn: () => fetchMyOwnerships(user!.id),
    enabled: role === "owner" && !!user,
  });

  // Owner maintenance requests (open/in_progress) for the agency; RLS limits to owner's properties
  const { data: maintenance } = useQuery({
    queryKey: ["owner-maintenance", role, user?.id, profile?.agency_id],
    queryFn: () => fetchMaintenanceRequests({ agencyId: profile!.agency_id!, status: ["open", "in_progress"] }),
    enabled: role === "owner" && !!user && !!profile?.agency_id,
  });

  // Owner invoices (RLS restricts to owned properties)
  const { data: invoices } = useQuery({
    queryKey: ["owner-invoices", role, user?.id],
    queryFn: fetchInvoices,
    enabled: role === "owner" && !!user,
  });

  // Saved Owner Reports for this owner
  const { data: savedReports } = useQuery({
    queryKey: ["owner-saved-reports-dashboard", profile?.agency_id, user?.id],
    enabled: role === "owner" && !!user?.id && !!profile?.agency_id,
    queryFn: () => listOwnerReports(profile!.agency_id!, user!.id),
  });

  // Local state for viewing a saved owner report
  const [openReport, setOpenReport] = React.useState<OwnerReportRow | null>(null);

  // Helper to format month label
  const formatMonthLabel = (ym?: string) => {
    const parts = String(ym ?? "").split("-");
    if (parts.length !== 2) return ym ?? "";
    const y = Number(parts[0]);
    const m = Number(parts[1]) - 1;
    if (!Number.isFinite(y) || !Number.isFinite(m)) return ym ?? "";
    const d = new Date(y, m, 1);
    const label = d.toLocaleString(undefined, { month: "long", year: "numeric" });
    return label.charAt(0).toUpperCase() + label.slice(1);
  };

  const feePercentSaved = 5;

  const hasNoProps = (props?.length ?? 0) === 0;

  const occupancy = (() => {
    const totalProps = props?.length ?? 0;
    if (totalProps === 0) return "0%";
    const propIds = new Set<string>((props ?? []).map((p: any) => p.id));
    const occupied = new Set<string>();
    (leases ?? []).forEach((l: any) => {
      if (propIds.has(l.property_id) && l?.tenant_id && String(l.status) !== "terminated") {
        occupied.add(l.property_id);
      }
    });
    return `${Math.round((occupied.size / totalProps) * 100)}%`;
  })();

  const ym = new Date().toISOString().slice(0, 7);

  const normalizeMethod = (m: any) => String(m ?? "").trim().toLowerCase();

  // Define helpers and monthly slices
  const getPropId = (obj: any): string | null => {
    // Works for payments (obj.lease.property.id or lease.property_id) and invoices (obj.lease.property.id)
    return obj?.lease?.property?.id ?? obj?.lease?.property_id ?? obj?.property_id ?? null;
  };

  const shareFactorForProp = (propId: string | null | undefined): number => {
    if (!propId) return 0;
    const pct = myShares?.get(propId);
    if (pct == null) return 0;
    const clamped = Math.max(0, Math.min(100, Number(pct)));
    return clamped / 100;
  };

  const monthPayments = React.useMemo(
    () => (payments ?? []).filter((p: any) => String(p?.received_date ?? "").startsWith(ym)),
    [payments, ym]
  );

  const monthInvoices = React.useMemo(
    () => (invoices ?? []).filter((inv: any) => String(inv?.issue_date ?? "").startsWith(ym)),
    [invoices, ym]
  );

  const monthly = (() => {
    const classifyMethod = (m: any): "cash" | "bank_transfer" | "other" => {
      const s = String(m ?? "")
        .toLowerCase()
        .trim()
        .replace(/[-\s]+/g, "_");
      if (s.includes("cash")) return "cash";
      if (s.includes("transfer") || s.includes("bank_transfer") || s.includes("bank")) return "bank_transfer";
      return "other";
    };

    const totalBy = (cur: "USD" | "DOP") =>
      monthPayments
        .filter((p: any) => p.currency === cur)
        .reduce((sum: number, p: any) => {
          const propId = getPropId(p);
          return sum + Number(p.amount || 0) * shareFactorForProp(propId);
        }, 0);

    const sumBy = (methodKey: "cash" | "bank_transfer", cur: "USD" | "DOP") =>
      monthPayments
        .filter((p: any) => classifyMethod(p.method) === methodKey && p.currency === cur)
        .reduce((s: number, p: any) => {
          const propId = getPropId(p);
          return s + Number(p.amount || 0) * shareFactorForProp(propId);
        }, 0);

    return {
      usd: totalBy("USD"),
      dop: totalBy("DOP"),
      cashUsd: sumBy("cash", "USD"),
      cashDop: sumBy("cash", "DOP"),
      transferUsd: sumBy("bank_transfer", "USD"),
      transferDop: sumBy("bank_transfer", "DOP"),
    };
  })();

  // Average exchange rate from this month's payments; fallback to exchange_rates if needed
  const rateFromPayments = React.useMemo(() => {
    const rates = monthPayments
      .map((p: any) => Number(p.exchange_rate))
      .filter((r) => Number.isFinite(r) && r > 0);
    if (rates.length === 0) return 0;
    return rates.reduce((s: number, r: number) => s + r, 0) / rates.length;
  }, [monthPayments]);

  const [rateFromRates, setRateFromRates] = React.useState<number>(0);
  React.useEffect(() => {
    const run = async () => {
      // Only needed if we have USD to convert but no payment-derived rate
      if (rateFromPayments > 0) {
        setRateFromRates(0);
        return;
      }
      const hasUsd = monthPayments.some((p: any) => p.currency === "USD") || monthInvoices.some((inv: any) => inv.currency === "USD");
      if (!hasUsd) {
        setRateFromRates(0);
        return;
      }

      const y = Number(ym.slice(0, 4));
      const m = Number(ym.slice(5, 7));
      if (!y || !m) return;
      const startDate = `${ym}-01`;
      const endDate = new Date(y, m, 0).toISOString().slice(0, 10);

      const { data, error } = await supabase
        .from("exchange_rates")
        .select("rate")
        .gte("date", startDate)
        .lte("date", endDate)
        .eq("base_currency", "USD")
        .eq("target_currency", "DOP");
      if (error) {
        setRateFromRates(0);
        return;
      }
      const rates = (data ?? []).map((r: any) => Number(r.rate)).filter((n) => Number.isFinite(n) && n > 0);
      if (!rates.length) {
        setRateFromRates(0);
        return;
      }
      setRateFromRates(rates.reduce((s, n) => s + n, 0) / rates.length);
    };
    run();
  }, [rateFromPayments, monthPayments, monthInvoices, ym]);

  const avgRate = rateFromPayments > 0 ? rateFromPayments : rateFromRates;

  const leaseFeeBasisById = React.useMemo(() => {
    const map = new Map<string, "paid" | "issued">();
    (leases as LeaseWithMeta[] | undefined)?.forEach((l) => {
      map.set(l.id, l.management_fee_basis === "issued" ? "issued" : "paid");
    });
    return map;
  }, [leases]);

  // Management fee base: payments for leases set to 'paid' + invoices issued for leases set to 'issued'
  const feeBase = React.useMemo(() => {
    const paid = { usd: 0, dop: 0 };
    const issued = { usd: 0, dop: 0 };

    monthPayments.forEach((p: any) => {
      const leaseId = String(p.lease_id ?? "");
      const basis = leaseFeeBasisById.get(leaseId) ?? "paid";
      if (basis !== "paid") return;
      const propId = getPropId(p);
      const share = Number(p.amount || 0) * shareFactorForProp(propId);
      if (p.currency === "USD") paid.usd += share;
      else paid.dop += share;
    });

    monthInvoices.forEach((inv: any) => {
      const leaseId = String(inv.lease_id ?? "");
      const basis = leaseFeeBasisById.get(leaseId) ?? "paid";
      if (basis !== "issued") return;

      const propId = inv.lease?.property?.id ?? null;
      const share = Number(inv.total_amount || 0) * shareFactorForProp(propId);
      if (inv.currency === "USD") issued.usd += share;
      else issued.dop += share;
    });

    return { paid, issued };
  }, [monthPayments, monthInvoices, leaseFeeBasisById, myShares]);

  const feePercent = 5;
  const feeBaseDop = (feeBase.paid.dop + feeBase.issued.dop) + (feeBase.paid.usd + feeBase.issued.usd) * avgRate;
  const feeTotalDop = feeBaseDop * (feePercent / 100);
  const feeDeductedDop = Math.min(feeTotalDop, monthly.cashDop);
  const feeBalanceDueDop = Math.max(0, feeTotalDop - feeDeductedDop);
  const cashDopAfterFee = Math.max(0, monthly.cashDop - feeDeductedDop);

  const hasIssuedFeePart = (feeBase.issued.usd + feeBase.issued.dop) > 0;

  const partialInvoices = (invoices ?? []).filter((inv: any) => String(inv.status) === "partial");

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
      {hasNoProps ? (
        <Card>
          <CardHeader>
            <CardTitle>Access pending</CardTitle>
          </CardHeader>
          <CardContent className="text-sm">
            <div className="font-medium">No Properties Assigned to you yet.</div>
            <div className="mt-1">Your account is awaiting activation. An Agency Admin will assign your role shortly.</div>
            <div className="mt-1 text-muted-foreground">If you believe this is a mistake, please contact your agency administrator.</div>
          </CardContent>
        </Card>
      ) : null}
      <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3">
        <Stat title="My Occupancy" value={occupancy} />
        <Stat title="Cash (Owner share)">
          <div className="flex flex-col text-base font-normal">
            <span className="text-lg font-semibold">{new Intl.NumberFormat(undefined, { style: "currency", currency: "USD" }).format(monthly.cashUsd)} USD</span>
            <span className="text-muted-foreground text-sm">{new Intl.NumberFormat(undefined, { style: "currency", currency: "DOP" }).format(monthly.cashDop)} DOP</span>
          </div>
        </Stat>
        <Stat title="Incomes (Owner share)">
          <div className="flex flex-col text-base font-normal">
            <span className="text-lg font-semibold">{new Intl.NumberFormat(undefined, { style: "currency", currency: "USD" }).format(monthly.transferUsd)} USD</span>
            <span className="text-muted-foreground text-sm">{new Intl.NumberFormat(undefined, { style: "currency", currency: "DOP" }).format(monthly.transferDop)} DOP</span>
          </div>
        </Stat>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Cash after management fee</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-semibold">
            {new Intl.NumberFormat(undefined, { style: "currency", currency: "DOP" }).format(cashDopAfterFee)}
          </div>
          <div className="mt-2 grid grid-cols-2 gap-2 text-sm">
            <div className="text-muted-foreground">Fee total (owed)</div>
            <div className="text-right font-medium">{new Intl.NumberFormat(undefined, { style: "currency", currency: "DOP" }).format(feeTotalDop)}</div>
            <div className="text-muted-foreground">Balance due to agency</div>
            <div className={`text-right font-semibold ${feeBalanceDueDop > 0 ? "text-red-600" : ""}`}>{new Intl.NumberFormat(undefined, { style: "currency", currency: "DOP" }).format(feeBalanceDueDop)}</div>
          </div>
          {hasIssuedFeePart ? (
            <div className="mt-2 text-xs text-muted-foreground">
              Includes invoices issued for some leases: {new Intl.NumberFormat(undefined, { style: "currency", currency: "USD" }).format(feeBase.issued.usd)} USD and {new Intl.NumberFormat(undefined, { style: "currency", currency: "DOP" }).format(feeBase.issued.dop)} DOP.
            </div>
          ) : null}
          {feeBalanceDueDop > 0 ? (
            <div className="mt-2 text-xs text-muted-foreground">
              If there is not enough DOP cash this month, the remaining fee can be paid by transfer or will be deducted from the next cash payout.
            </div>
          ) : null}
        </CardContent>
      </Card>

      {/* Partial Invoices */}
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
                const partialDate = lastPaymentDate(inv);
                return (
                  <li key={inv.id} className="space-y-1">
                    <div className="font-medium">{propName} — {inv.number ?? inv.id.slice(0, 8)}</div>
                    <div className="text-sm text-muted-foreground">Issued: {inv.issue_date} • Due: {inv.due_date}</div>
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

      {/* Saved Owner Reports (read-only) */}
      <Card>
        <CardHeader>
          <CardTitle>Saved Owner Reports</CardTitle>
        </CardHeader>
        <CardContent>
          {!savedReports || savedReports.length === 0 ? (
            <div className="text-sm text-muted-foreground">No saved reports yet.</div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="py-2 pr-4">Month</TableHead>
                    <TableHead className="py-2 pr-4">USD (Your share)</TableHead>
                    <TableHead className="py-2 pr-4">DOP (Your share)</TableHead>
                    <TableHead className="py-2 pr-4">Avg rate</TableHead>
                    <TableHead className="py-2 pr-4">Cash after fee (DOP)</TableHead>
                    <TableHead className="py-2 pr-4">Action</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {(savedReports as OwnerReportRow[]).map((r) => {
                    const usdTotal = Number(r.usd_total || 0);
                    const dopCash = Number(r.dop_cash_total || 0);
                    const dopTransfer = Number(r.dop_transfer_total || 0);
                    const dopTotal = Number(r.dop_total || dopCash + dopTransfer);
                    const avgR = r.avg_rate != null ? Number(r.avg_rate) : 0;

                    const feeTotal = ((usdTotal * avgR) + dopTotal) * (feePercentSaved / 100);
                    const feeDeductedSaved = Math.min(feeTotal, dopCash);
                    const dopAfterFeeSaved = Math.max(0, dopCash - feeDeductedSaved);
                    return (
                      <TableRow key={r.id} className="border-t">
                        <TableCell className="py-2 pr-4">{formatMonthLabel(r.month)}</TableCell>
                        <TableCell className="py-2 pr-4">{new Intl.NumberFormat(undefined, { style: "currency", currency: "USD" }).format(usdTotal)}</TableCell>
                        <TableCell className="py-2 pr-4">{new Intl.NumberFormat(undefined, { style: "currency", currency: "DOP" }).format(dopTotal)}</TableCell>
                        <TableCell className="py-2 pr-4">{avgR ? avgR.toFixed(6) : "—"}</TableCell>
                        <TableCell className="py-2 pr-4">{new Intl.NumberFormat(undefined, { style: "currency", currency: "DOP" }).format(dopAfterFeeSaved)}</TableCell>
                        <TableCell className="py-2 pr-4">
                          <button className="underline" onClick={() => setOpenReport(r)}>View</button>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          )}
          <OwnerReportInvoiceDialog
            report={openReport as any}
            open={!!openReport}
            onOpenChange={(v) => !v && setOpenReport(null)}
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Recent Payments</CardTitle>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground">
          {(payments ?? []).slice(0, 5).length === 0
            ? "No payments yet."
            : (payments ?? []).slice(0, 5).map((p: any) => {
                const propId = p.lease?.property?.id ?? p.lease?.property_id ?? null;
                const percent = propId ? (myShares?.get(propId) ?? null) : null;
                const shareAmt = percent != null
                  ? Number(p.amount || 0) * Math.max(0, Math.min(100, percent)) / 100
                  : null;
                const amtText = new Intl.NumberFormat(undefined, { style: "currency", currency: p.currency }).format(p.amount);
                const shareText = shareAmt != null
                  ? new Intl.NumberFormat(undefined, { style: "currency", currency: p.currency }).format(shareAmt)
                  : "—";
                return (
                  <div key={p.id} className="space-y-1">
                    <div className="flex justify-between">
                      <span>{p.received_date}</span>
                      <span>{amtText}</span>
                    </div>
                    <div className="flex justify-between text-xs">
                      <span>Owner share{percent != null ? ` (${Math.round(percent)}%)` : ""}</span>
                      <span>{shareText}</span>
                    </div>
                  </div>
                );
              })}
        </CardContent>
      </Card>
    </div>
  );
};

export default OwnerDashboard;