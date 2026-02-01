import React, { useMemo, useState, useEffect } from "react";
import AppShell from "@/components/layout/AppShell";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/contexts/AuthProvider";
import { useQuery } from "@tanstack/react-query";
import { fetchPayments } from "@/services/payments";
import { fetchAgencyOwnerships } from "@/services/property-owners";
import { fetchOwnerProfilesInAgency } from "@/services/users";
import { supabase } from "@/integrations/supabase/client";
import { listOwnerReports, createOwnerReport, deleteOwnerReport, type OwnerReportRow } from "@/services/owner-reports";
import EditOwnerReportDialog from "@/components/owner/EditOwnerReportDialog";
import OwnerReportInvoiceDialog from "@/components/owner/OwnerReportInvoiceDialog";
import { useIsMobile } from "@/hooks/use-mobile";
import OwnerPaymentItemMobile from "@/components/owner/OwnerPaymentItemMobile";
import SavedOwnerReportItemMobile from "@/components/owner/SavedOwnerReportItemMobile";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { useToast } from "@/components/ui/use-toast";
import { listManagerReports } from "@/services/manager-reports";
import { fetchMyOwnerships } from "@/services/property-owners";
import { fetchLeases, type LeaseWithMeta } from "@/services/leases";
import { fetchInvoices } from "@/services/invoices";

function fmt(amount: number, currency: "USD" | "DOP") {
  return new Intl.NumberFormat(undefined, { style: "currency", currency }).format(amount);
}

function monthList(limit = 12) {
  const pad2 = (n: number) => String(n).padStart(2, "0");
  const opts: Array<{ value: string; label: string; start: string; end: string }> = [];
  const now = new Date();
  for (let i = 0; i < limit; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const year = d.getFullYear();
    const monthIndex = d.getMonth();
    const lastDay = new Date(year, monthIndex + 1, 0).getDate();
    const startStr = `${year}-${pad2(monthIndex + 1)}-01`;
    const endStr = `${year}-${pad2(monthIndex + 1)}-${pad2(lastDay)}`;
    const label = d.toLocaleString(undefined, { month: "long", year: "numeric" });
    const capLabel = label.charAt(0).toUpperCase() + label.slice(1);
    const value = `${year}-${pad2(monthIndex + 1)}`;
    opts.push({ value, label: capLabel, start: startStr, end: endStr });
  }
  return opts;
}

async function fetchMonthlyAvgRate(startDate: string, endDate: string) {
  const { data, error } = await supabase
    .from("exchange_rates")
    .select("rate, base_currency, target_currency, date")
    .gte("date", startDate)
    .lte("date", endDate)
    .eq("base_currency", "USD")
    .eq("target_currency", "DOP");
  if (error) throw error;
  const rates = (data ?? []).map((r: any) => Number(r.rate)).filter((n) => !Number.isNaN(n));
  if (rates.length === 0) return null;
  const avg = rates.reduce((s, n) => s + n, 0) / rates.length;
  return avg;
}

const OwnerReports = () => {
  const { role, user, profile } = useAuth();
  const { toast } = useToast();
  const isAdmin = role === "agency_admin";
  const isOwner = role === "owner";
  const agencyId = profile?.agency_id ?? null;

  const months = useMemo(() => monthList(12), []);
  const [monthValue, setMonthValue] = useState<string>(months[0]?.value ?? "");
  const currentMonth = useMemo(() => months.find((m) => m.value === monthValue), [months, monthValue]);
  const [startDate, setStartDate] = useState<string>(months[0]?.start ?? "");
  const [endDate, setEndDate] = useState<string>(months[0]?.end ?? "");

  const [ownerId, setOwnerId] = useState<string>(isAdmin ? "" : (user?.id ?? ""));

  const [avgRateInput, setAvgRateInput] = useState<string>("");
  const [suggestedRate, setSuggestedRate] = useState<number | null>(null);

  const { data: payments } = useQuery({
    queryKey: ["owner-payments", role, user?.id, agencyId],
    enabled: !!role && !!agencyId,
    queryFn: () => fetchPayments({ role, userId: user?.id ?? null, agencyId }),
  });

  const { data: leases } = useQuery({
    queryKey: ["owner-report-leases", role, user?.id, agencyId],
    enabled: !!role && !!agencyId,
    queryFn: () => fetchLeases({ role, userId: user?.id ?? null, agencyId }),
  });

  const { data: invoices } = useQuery({
    queryKey: ["owner-report-invoices", role, user?.id, agencyId],
    enabled: !!role && !!agencyId,
    queryFn: fetchInvoices,
  });

  const { data: ownerships } = useQuery({
    queryKey: ["owner-ownerships", agencyId],
    enabled: !!agencyId && isAdmin,
    queryFn: () => fetchAgencyOwnerships(agencyId!),
  });

  const { data: myOwnerships } = useQuery({
    queryKey: ["owner-my-ownerships", user?.id],
    enabled: isOwner && !!user?.id,
    queryFn: () => fetchMyOwnerships(user!.id),
  });

  const { data: owners } = useQuery({
    queryKey: ["owner-owners", agencyId],
    enabled: !!agencyId && isAdmin,
    queryFn: () => fetchOwnerProfilesInAgency(agencyId!),
  });

  const { data: mgrReports } = useQuery({
    queryKey: ["owner-mgr-reports", agencyId],
    enabled: !!agencyId && isAdmin,
    queryFn: () => listManagerReports(agencyId!),
  });

  const ownerNameMap = useMemo(() => {
    const map: Record<string, string> = {};
    (owners ?? []).forEach((o: any) => {
      const name = [o.first_name, o.last_name].filter(Boolean).join(" ");
      if (o.id) map[o.id] = name || o.id;
    });
    if (!isAdmin && user?.id) {
      const selfName = [profile?.first_name, profile?.last_name].filter(Boolean).join(" ");
      map[user.id] = selfName || "You";
    }
    return map;
  }, [owners, isAdmin, user?.id, profile?.first_name, profile?.last_name]);

  const { data: savedReports, refetch: refetchSaved } = useQuery({
    queryKey: ["owner-saved-reports", agencyId, isOwner ? user?.id : ownerId],
    enabled: !!agencyId,
    queryFn: () => listOwnerReports(agencyId!, isOwner ? user!.id : ownerId || undefined),
  });

  useEffect(() => {
    const m = months.find((mm) => mm.value === monthValue);
    if (m) {
      setStartDate(m.start);
      setEndDate(m.end);
    }
  }, [monthValue, months]);

  // Identify saved owner report matching the selected period (used to gate the fee card)
  const currentOwnerSaved = useMemo(() => {
    if (!savedReports || !currentMonth) return null;
    const sStr = String(startDate).slice(0, 10);
    const eStr = String(endDate).slice(0, 10);
    const match = (savedReports as OwnerReportRow[]).find((r) =>
      String(r.month) === String(currentMonth.value) &&
      String(r.start_date).slice(0, 10) === sStr &&
      String(r.end_date).slice(0, 10) === eStr
    );
    return match ?? null;
  }, [savedReports, currentMonth, startDate, endDate]);

  useEffect(() => {
    const loadRate = async () => {
      if (!startDate || !endDate) return;
      try {
        const avg = await fetchMonthlyAvgRate(startDate, endDate);
        setSuggestedRate(avg);
      } catch {
        setSuggestedRate(null);
      }
    };
    loadRate();
  }, [startDate, endDate]);

  const filteredPayments = useMemo(() => {
    if (!startDate || !endDate) return payments ?? [];
    return (payments ?? []).filter((p: any) => {
      const d = String(p.received_date ?? "").slice(0, 10);
      return d >= startDate && d <= endDate;
    });
  }, [payments, startDate, endDate]);

  // NEW: average exchange rate derived from this period's payments (e.g., (50 + 52) / 2 = 51)
  const rateFromPayments = useMemo(() => {
    const rs = (filteredPayments ?? [])
      .map((p: any) => Number(p.exchange_rate))
      .filter((n) => Number.isFinite(n) && n > 0);
    if (rs.length === 0) return 0;
    return rs.reduce((s, n) => s + n, 0) / rs.length;
  }, [filteredPayments]);

  const filteredInvoices = useMemo(() => {
    if (!startDate || !endDate) return (invoices ?? []).filter((inv: any) => String(inv.status) !== "void");
    return (invoices ?? []).filter((inv: any) => {
      if (String(inv.status) === "void") return false;
      const d = String(inv.issue_date ?? "").slice(0, 10);
      return d >= startDate && d <= endDate;
    });
  }, [invoices, startDate, endDate]);

  const ownerProps = useMemo(() => {
    if (isAdmin) {
      if (!ownerId) return [];
      return (ownerships ?? []).filter((o) => o.owner_id === ownerId);
    }
    return (myOwnerships ?? []);
  }, [ownerships, ownerId, myOwnerships, isAdmin]);

  const ownerPropItems = useMemo(() => {
    if (Array.isArray(ownerProps)) {
      return ownerProps.map((o: any) => ({
        property_id: o.property_id,
        ownership_percent: o.ownership_percent,
      }));
    }
    if (ownerProps instanceof Map) {
      return Array.from(ownerProps.entries()).map(([property_id, percent]) => ({
        property_id,
        ownership_percent: percent as number | null,
      }));
    }
    return [];
  }, [ownerProps]);

  const ownedPropIds = useMemo(() => new Set(ownerPropItems.map((o) => o.property_id)), [ownerPropItems]);

  const percentByProp = useMemo(
    () => new Map<string, number>(ownerPropItems.map((o) => [o.property_id, o.ownership_percent == null ? 100 : Number(o.ownership_percent)])),
    [ownerPropItems]
  );

  const leaseFeeBasisById = useMemo(() => {
    const map = new Map<string, "paid" | "issued">();
    (leases as LeaseWithMeta[] | undefined)?.forEach((l) => {
      map.set(l.id, l.management_fee_basis === "issued" ? "issued" : "paid");
    });
    return map;
  }, [leases]);

  const rows = useMemo(() => {
    const list: Array<{ property: string; date: string; method: string; assigned: boolean; usd: number; dop: number; rate: number | null }> = [];
    (filteredPayments ?? []).forEach((p: any) => {
      const propId = p.lease?.property?.id || p.lease?.property_id || null;
      const propName = p.lease?.property?.name ?? "—";
      const assigned = ownerId ? (propId ? ownedPropIds.has(propId) : false) : false;
      const percent = assigned ? (percentByProp.get(propId!) ?? 0) : 0;
      const shareAmt = assigned ? (Number(p.amount || 0) * percent) / 100 : 0;
      const method = String(p.method || "").toLowerCase() === "bank_transfer" ? "Transfer" : "Cash";
      const usd = p.currency === "USD" ? shareAmt : 0;
      const dop = p.currency === "DOP" ? shareAmt : 0;
      const rate = typeof p.exchange_rate === "number" ? p.exchange_rate : p.exchange_rate == null ? null : Number(p.exchange_rate);
      if (!ownerId || assigned) {
        list.push({ property: propName, date: p.received_date, method, assigned, usd, dop, rate });
      }
    });
    return list;
  }, [filteredPayments, ownerId, ownedPropIds, percentByProp]);

  const totals = useMemo(() => {
    const usdCash = rows.filter((r) => r.method === "Cash").reduce((s, r) => s + r.usd, 0);
    const dopCash = rows.filter((r) => r.method === "Cash").reduce((s, r) => s + r.dop, 0);
    const usdTransfer = rows.filter((r) => r.method === "Transfer").reduce((s, r) => s + r.usd, 0);
    const dopTransfer = rows.filter((r) => r.method === "Transfer").reduce((s, r) => s + r.dop, 0);
    return { usdCash, dopCash, usdTransfer, dopTransfer };
  }, [rows]);

  const effectiveRate = useMemo(() => {
    // Prefer real payment-derived average to match Manager's flow; fall back to suggested monthly rate
    if (rateFromPayments > 0) return rateFromPayments;
    const fromInput = avgRateInput && Number(avgRateInput) > 0 ? Number(avgRateInput) : null;
    return fromInput ?? (suggestedRate != null ? Number(suggestedRate) : 0);
  }, [rateFromPayments, avgRateInput, suggestedRate]);

  const feePercent = useMemo(() => {
    if (isAdmin && mgrReports && mgrReports.length > 0) {
      const m = (mgrReports as any[])[0];
      return Number(m?.fee_percent ?? 5);
    }
    return 5;
  }, [isAdmin, mgrReports]);

  const feeBase = useMemo(() => {
    const paid = { usd: 0, dop: 0 };
    const issued = { usd: 0, dop: 0 };

    (filteredPayments ?? []).forEach((p: any) => {
      const propId = p.lease?.property?.id || p.lease?.property_id || null;
      const assigned = ownerId ? (propId ? ownedPropIds.has(propId) : false) : false;
      if (ownerId && !assigned) return;

      const percent = propId ? (percentByProp.get(propId) ?? 0) : 0;
      const shareAmt = Number(p.amount || 0) * (percent / 100);

      const basis = leaseFeeBasisById.get(String(p.lease_id ?? "")) ?? "paid";
      if (basis !== "paid") return;

      if (p.currency === "USD") paid.usd += shareAmt;
      else paid.dop += shareAmt;
    });

    (filteredInvoices ?? []).forEach((inv: any) => {
      const propId = inv.lease?.property?.id ?? null;
      const assigned = ownerId ? (propId ? ownedPropIds.has(propId) : false) : false;
      if (ownerId && !assigned) return;

      const percent = propId ? (percentByProp.get(propId) ?? 0) : 0;
      const shareAmt = Number(inv.total_amount || 0) * (percent / 100);

      const basis = leaseFeeBasisById.get(String(inv.lease_id ?? "")) ?? "paid";
      if (basis !== "issued") return;

      if (inv.currency === "USD") issued.usd += shareAmt;
      else issued.dop += shareAmt;
    });

    return { paid, issued };
  }, [filteredPayments, filteredInvoices, leaseFeeBasisById, percentByProp, ownedPropIds, ownerId]);

  const feeTotalOwedDop = useMemo(() => {
    const usd = feeBase.paid.usd + feeBase.issued.usd;
    const dop = feeBase.paid.dop + feeBase.issued.dop;
    return ((usd * effectiveRate) + dop) * (feePercent / 100);
  }, [feeBase, effectiveRate, feePercent]);

  const ownerFeeDeducted = useMemo(() => Math.min(feeTotalOwedDop, totals.dopCash), [feeTotalOwedDop, totals.dopCash]);
  const ownerFeeBalanceDue = useMemo(() => Math.max(0, feeTotalOwedDop - ownerFeeDeducted), [feeTotalOwedDop, ownerFeeDeducted]);
  const ownerDopAfterFee = useMemo(() => Math.max(0, totals.dopCash - ownerFeeDeducted), [totals.dopCash, ownerFeeDeducted]);

  const handleSaveReport = async () => {
    if (!agencyId || !ownerId || !currentMonth) {
      toast({ title: "Missing selection", description: "Choose an owner and a month.", variant: "destructive" });
      return;
    }
    await createOwnerReport({
      agency_id: agencyId!,
      owner_id: ownerId!,
      month: currentMonth.value,
      start_date: startDate,
      end_date: endDate,
      avg_rate: avgRateInput && Number(avgRateInput) > 0 ? Number(avgRateInput) : null,
      usd_cash_total: totals.usdCash,
      dop_cash_total: totals.dopCash,
      usd_transfer_total: totals.usdTransfer,
      dop_transfer_total: totals.dopTransfer,
      usd_total: totals.usdCash + totals.usdTransfer,
      dop_total: totals.dopCash + totals.dopTransfer,
    });
    toast({ title: "Report saved", description: `Saved ${currentMonth.label} for owner.` });
    refetchSaved();
  };

  const isMobile = useIsMobile();

  const hasIssuedComponent = (feeBase.issued.usd + feeBase.issued.dop) > 0;

  return (
    <AppShell>
      <div className="space-y-6">
        <div className="flex flex-wrap items-end gap-3">
          <div>
            <div className="text-sm text-muted-foreground">Quick month</div>
            <Select value={monthValue} onValueChange={setMonthValue}>
              <SelectTrigger className="w-[220px]">
                <SelectValue placeholder="Select month" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="custom">Custom range</SelectItem>
                {months.map((m) => (
                  <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <div className="mt-2 grid grid-cols-2 gap-2">
              <div>
                <div className="text-xs text-muted-foreground">Start</div>
                <Input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} className="w-[180px]" />
              </div>
              <div>
                <div className="text-xs text-muted-foreground">End</div>
                <Input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} className="w-[180px]" />
              </div>
            </div>
          </div>
          {isAdmin ? (
            <div>
              <div className="text-sm text-muted-foreground">Owner</div>
              <Select value={ownerId} onValueChange={(v) => setOwnerId(v === "__all__" ? "" : v)}>
                <SelectTrigger className="w-[260px]">
                  <SelectValue placeholder="Select owner" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__all__">All owners</SelectItem>
                  {(owners ?? []).map((o) => (
                    <SelectItem key={o.id} value={o.id}>
                      {[o.first_name, o.last_name].filter(Boolean).join(" ") || o.id}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          ) : (
            <div className="text-sm text-muted-foreground">Owner: You</div>
          )}
        </div>

        <div className="grid gap-4 grid-cols-1 md:grid-cols-3">
          <Card>
            <CardHeader className="pb-2"><CardTitle className="text-sm text-muted-foreground">Cash totals</CardTitle></CardHeader>
            <CardContent>
              <div className="text-base font-medium flex flex-col">
                <span>{fmt(totals.usdCash, "USD")} USD</span>
                <span>{fmt(totals.dopCash, "DOP")} DOP</span>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2"><CardTitle className="text-sm text-muted-foreground">Transfer totals</CardTitle></CardHeader>
            <CardContent>
              <div className="text-base font-medium flex flex-col">
                <span>{fmt(totals.usdTransfer, "USD")} USD</span>
                <span>{fmt(totals.dopTransfer, "DOP")} DOP</span>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2"><CardTitle className="text-sm text-muted-foreground">Average USD/DOP rate</CardTitle></CardHeader>
            <CardContent className="text-2xl font-bold">
              {rateFromPayments > 0
                ? rateFromPayments.toFixed(6)
                : (avgRateInput ? avgRateInput : suggestedRate != null ? suggestedRate.toFixed(6) : "—")}
            </CardContent>
          </Card>

          {isOwner && (
            <Card>
              <CardHeader className="pb-2"><CardTitle className="text-sm text-muted-foreground">Your Management Fee</CardTitle></CardHeader>
              <CardContent>
                {!currentOwnerSaved ? (
                  <div className="text-sm text-muted-foreground">
                    Waiting for report to be generated to have exchange rate value.
                  </div>
                ) : (
                  (() => {
                    const feePercent = 5;
                    const usdTotal = Number(currentOwnerSaved.usd_total || 0);
                    const dopCash = Number(currentOwnerSaved.dop_cash_total || 0);
                    const dopTransfer = Number(currentOwnerSaved.dop_transfer_total || 0);
                    const dopTotal = dopCash + dopTransfer;
                    const avgRate = currentOwnerSaved.avg_rate != null ? Number(currentOwnerSaved.avg_rate) : NaN;

                    const feeOwedDop = ((Number.isNaN(avgRate) ? 0 : usdTotal * avgRate) + dopTotal) * (feePercent / 100);
                    const feeDeducted = Math.min(feeOwedDop, dopCash);
                    const feeBalanceDue = Math.max(0, feeOwedDop - feeDeducted);
                    const dopAfterFee = Math.max(0, dopCash - feeDeducted);

                    return (
                      <div className="space-y-2 text-sm">
                        <div>Fee percent: <span className="font-medium">{feePercent}%</span></div>
                        <div className="grid grid-cols-2 gap-2">
                          <div className="text-muted-foreground">Fee total (owed)</div>
                          <div className="text-right font-medium">{fmt(feeOwedDop, "DOP")}</div>
                          <div className="text-muted-foreground">Deducted from DOP cash</div>
                          <div className="text-right font-medium">{fmt(feeDeducted, "DOP")}</div>
                          <div className="text-muted-foreground">Balance due to agency</div>
                          <div className={`text-right font-semibold ${feeBalanceDue > 0 ? "text-red-600" : ""}`}>{fmt(feeBalanceDue, "DOP")}</div>
                          <div className="text-muted-foreground">Cash after fee (DOP)</div>
                          <div className="text-right font-semibold">{fmt(dopAfterFee, "DOP")}</div>
                        </div>
                      </div>
                    );
                  })()
                )}
              </CardContent>
            </Card>
          )}
        </div>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle>Owner Payments (Assigned)</CardTitle>
          </CardHeader>
          <CardContent>
            {rows.length === 0 ? (
              <div className="text-sm text-muted-foreground">No payments for selection.</div>
            ) : isMobile ? (
              <div>
                {rows.map((r, idx) => (
                  <OwnerPaymentItemMobile key={idx} row={r} />
                ))}
                <div className="mt-3 text-sm">
                  <div className="font-semibold">Totals</div>
                  <div>USD: {fmt(totals.usdCash + totals.usdTransfer, "USD")}</div>
                  <div>DOP: {fmt(totals.dopCash + totals.dopTransfer, "DOP")}</div>
                </div>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Property</TableHead>
                      <TableHead>Date</TableHead>
                      <TableHead>Method</TableHead>
                      <TableHead>USD</TableHead>
                      <TableHead>DOP</TableHead>
                      <TableHead>Rate</TableHead>
                      <TableHead>Owner assigned</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {rows.map((r, idx) => (
                      <TableRow key={idx}>
                        <TableCell className="font-medium">{r.property}</TableCell>
                        <TableCell>{r.date}</TableCell>
                        <TableCell>{r.method}</TableCell>
                        <TableCell>{fmt(r.usd, "USD")}</TableCell>
                        <TableCell>{fmt(r.dop, "DOP")}</TableCell>
                        <TableCell>{r.rate ? String(r.rate) : "—"}</TableCell>
                        <TableCell className={r.assigned ? "text-green-600 dark:text-green-400" : "text-red-600 dark:text-red-400"}>
                          {r.assigned ? "Assigned" : "Unassigned"}
                        </TableCell>
                      </TableRow>
                    ))}
                    {rows.length > 0 && (
                      <TableRow>
                        <TableCell className="font-semibold">Totals</TableCell>
                        <TableCell />
                        <TableCell />
                        <TableCell className="font-semibold">{fmt(totals.usdCash + totals.usdTransfer, "USD")}</TableCell>
                        <TableCell className="font-semibold">{fmt(totals.dopCash + totals.dopTransfer, "DOP")}</TableCell>
                        <TableCell />
                        <TableCell />
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex items-center justify-between">
            <CardTitle>Saved Owner Reports</CardTitle>
            <div className="text-sm text-muted-foreground">
              {isAdmin ? "Edit, delete or view saved statements." : "View your saved statements."}
            </div>
          </CardHeader>
          <CardContent>
            {!savedReports || savedReports.length === 0 ? (
              <div className="text-sm text-muted-foreground">No saved reports yet.</div>
            ) : isMobile ? (
              <div>
                {savedReports.map((r: any) => {
                  const selfName = [profile?.first_name, profile?.last_name].filter(Boolean).join(" ");
                  const label =
                    r.owner_id === user?.id
                      ? (selfName ? `${selfName} (You)` : "You")
                      : (ownerNameMap[r.owner_id] ?? r.owner_id);
                  return (
                    <SavedOwnerReportItemMobile
                      key={r.id}
                      report={r}
                      ownerName={label}
                      onEdited={() => refetchSaved()}
                    />
                  );
                })}
              </div>
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Month</TableHead>
                      <TableHead>Owner</TableHead>
                      <TableHead>USD total</TableHead>
                      <TableHead>DOP total</TableHead>
                      <TableHead>Avg rate</TableHead>
                      <TableHead>Management fee share</TableHead>
                      <TableHead>DOP after fee</TableHead>
                      <TableHead className="print:hidden">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {savedReports.map((r: OwnerReportRow) => (
                      <SavedReportRow
                        key={r.id}
                        report={r}
                        onEdited={() => refetchSaved()}
                        ownerNameMap={ownerNameMap}
                        mgrReports={mgrReports ?? []}
                        isAdmin={isAdmin}
                      />
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </AppShell>
  );
};

function SavedReportRow({
  report,
  onEdited,
  ownerNameMap,
  mgrReports,
  isAdmin,
}: {
  report: OwnerReportRow;
  onEdited: () => void;
  ownerNameMap: Record<string, string>;
  mgrReports: any[];
  isAdmin: boolean;
}) {
  const [openEdit, setOpenEdit] = useState(false);
  const [openInvoice, setOpenInvoice] = useState(false);
  const [openDelete, setOpenDelete] = useState(false);
  const { toast } = useToast();
  const { user, profile } = useAuth();

  const selfName = [profile?.first_name, profile?.last_name].filter(Boolean).join(" ");
  const displayOwner =
    report.owner_id === user?.id
      ? (selfName ? `${selfName} (You)` : "You")
      : (ownerNameMap[report.owner_id] ?? report.owner_id);

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

  const parseYmd = (s: string) => {
    const [y, m, d] = String(s).slice(0, 10).split("-").map(Number);
    if (!y || !m || !d) return null;
    return { y, m, d };
  };

  const daysInMonth = (y: number, m: number) => new Date(y, m, 0).getUTCDate();

  const monthOrRangeLabel = React.useMemo(() => {
    const sStr = String(report.start_date ?? "").slice(0, 10);
    const eStr = String(report.end_date ?? "").slice(0, 10);
    const s = parseYmd(sStr);
    const e = parseYmd(eStr);
    if (!s || !e) return formatMonthLabel(report.month);

    const isFirstDay = s.d === 1;
    const isSameMonth = s.y === e.y && s.m === e.m;
    const isLastDay = e.d === daysInMonth(s.y, s.m);

    return (isFirstDay && isSameMonth && isLastDay) ? formatMonthLabel(report.month) : `${sStr} to ${eStr}`;
  }, [report.month, report.start_date, report.end_date]);

  const managerForPeriod = useMemo(() => {
    if (!mgrReports || mgrReports.length === 0) return null;
    const m = (mgrReports as any[]).find((mr) =>
      String(mr.month) === String(report.month) &&
      String(mr.start_date).slice(0, 10) === String(report.start_date).slice(0, 10) &&
      String(mr.end_date).slice(0, 10) === String(report.end_date).slice(0, 10)
    );
    return m ?? null;
  }, [mgrReports, report.month, report.start_date, report.end_date]);

  const feePercent = managerForPeriod ? Number(managerForPeriod.fee_percent || 5) : 5;
  const avgRate = managerForPeriod && managerForPeriod.avg_rate != null ? Number(managerForPeriod.avg_rate) : (report.avg_rate != null ? Number(report.avg_rate) : NaN);

  const ownerUsdTotal = Number(report.usd_total || 0);
  const ownerDopCash = Number(report.dop_cash_total || 0);
  const ownerDopTransfer = Number(report.dop_transfer_total || 0);
  const ownerDopTotal = ownerDopCash + ownerDopTransfer;

  const ownerFeeShareDop = ((Number.isNaN(avgRate) ? 0 : ownerUsdTotal * avgRate) + ownerDopTotal) * (feePercent / 100);
  const ownerFeeDeducted = Math.min(ownerFeeShareDop, ownerDopCash);
  const ownerDopAfterFee = Math.max(0, ownerDopCash - ownerFeeDeducted);

  return (
    <TableRow>
      <TableCell>{monthOrRangeLabel}</TableCell>
      <TableCell className="font-semibold">{displayOwner}</TableCell>
      <TableCell>{fmt(Number(report.usd_total || 0), "USD")}</TableCell>
      <TableCell>{fmt(Number(report.dop_total || 0), "DOP")}</TableCell>
      <TableCell>{avgRate && Number.isFinite(avgRate) ? avgRate.toFixed(6) : "—"}</TableCell>
      <TableCell>{fmt(ownerFeeShareDop, "DOP")}</TableCell>
      <TableCell>{fmt(ownerDopAfterFee, "DOP")}</TableCell>
      <TableCell className="print:hidden">
        <div className="flex gap-2">
          {isAdmin ? (
            <>
              <Button variant="outline" size="sm" onClick={() => setOpenEdit(true)}>Edit</Button>
              <Button size="sm" onClick={() => setOpenInvoice(true)}>View</Button>
              <Button variant="destructive" size="sm" onClick={() => setOpenDelete(true)}>Delete</Button>
            </>
          ) : (
            <Button size="sm" onClick={() => setOpenInvoice(true)}>View</Button>
          )}
        </div>
        <EditOwnerReportDialog
          report={report}
          open={openEdit}
          onOpenChange={(v) => {
            setOpenEdit(v);
            if (!v) onEdited();
          }}
          onSaved={() => onEdited()}
        />
        <OwnerReportInvoiceDialog
          report={report}
          open={openInvoice}
          onOpenChange={(v) => {
            setOpenInvoice(v);
            if (!v) onEdited();
          }}
        />
        <AlertDialog open={openDelete} onOpenChange={setOpenDelete}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Delete owner report?</AlertDialogTitle>
            </AlertDialogHeader>
            <div className="text-sm text-muted-foreground">
              This removes the saved report for {report.month}. You can recreate it later by generating and saving again.
            </div>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction
                onClick={async () => {
                  try {
                    await deleteOwnerReport(report.id);
                    toast({ title: "Report deleted", description: `Deleted ${report.month}.` });
                    setOpenDelete(false);
                    onEdited();
                  } catch (e: any) {
                    toast({ title: "Delete failed", description: e.message, variant: "destructive" });
                  }
                }}
              >
                Delete
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </TableCell>
    </TableRow>
  );
}

export default OwnerReports;