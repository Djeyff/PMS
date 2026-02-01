"use client";

import React, { useMemo } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useAuth } from "@/contexts/AuthProvider";
import { useQuery } from "@tanstack/react-query";
import { fetchPayments } from "@/services/payments";
import { fetchAgencyOwnerships } from "@/services/property-owners";
import { fetchMyOwnerships } from "@/services/property-owners";
import type { OwnerReportRow } from "@/services/owner-reports";
import { fetchOwnerProfilesInAgency } from "@/services/users";
import { fetchAgencyById } from "@/services/agencies";
import { getLogoPublicUrl } from "@/services/branding";
import { listManagerReports } from "@/services/manager-reports";
import { useIsMobile } from "@/hooks/use-mobile";
import { fetchLeases, type LeaseWithMeta } from "@/services/leases";
import { fetchInvoices } from "@/services/invoices";
import { printElement } from "@/lib/print";

type Props = {
  report: OwnerReportRow | null;
  open: boolean;
  onOpenChange: (v: boolean) => void;
};

type PaymentRow = {
  date: string;
  property: string;
  method: string;
  usd: number;
  dop: number;
  rate: number | null;
};

function fmt(amount: number, currency: "USD" | "DOP") {
  return new Intl.NumberFormat(undefined, { style: "currency", currency }).format(amount);
}

const OwnerReportInvoiceDialog: React.FC<Props> = ({ report, open, onOpenChange }) => {
  // IMPORTANT: keep hooks unconditional (no early return) to avoid blank screens.
  const { role, user, profile } = useAuth();
  const agencyId = profile?.agency_id ?? null;
  const isAdmin = role === "agency_admin";
  const isMobile = useIsMobile();
  const printAreaRef = React.useRef<HTMLDivElement | null>(null);

  const { data: agency } = useQuery({
    queryKey: ["owner-invoice-agency", agencyId],
    enabled: open && !!agencyId,
    queryFn: () => fetchAgencyById(agencyId!),
  });

  // Load manager reports for fee info
  const { data: mgrReports } = useQuery({
    queryKey: ["owner-invoice-mgr", agencyId],
    enabled: open && !!agencyId,
    queryFn: () => listManagerReports(agencyId!),
  });

  const [logoUrl, setLogoUrl] = React.useState<string>("");
  React.useEffect(() => {
    if (!open) return;
    getLogoPublicUrl()
      .then((url) => setLogoUrl(url || "/assets/invoice-layout-reference.png"))
      .catch(() => setLogoUrl("/assets/invoice-layout-reference.png"));
  }, [open]);

  const { data: payments } = useQuery({
    queryKey: ["owner-invoice-payments", role, user?.id, agencyId],
    enabled: open && !!role && !!agencyId,
    queryFn: () => fetchPayments({ role, userId: user?.id ?? null, agencyId }),
  });

  const { data: leases } = useQuery({
    queryKey: ["owner-invoice-leases", role, user?.id, agencyId],
    enabled: open && !!role && !!agencyId,
    queryFn: () => fetchLeases({ role, userId: user?.id ?? null, agencyId }),
  });

  const { data: invoices } = useQuery({
    queryKey: ["owner-invoice-invoices", role, user?.id, agencyId],
    enabled: open && !!role && !!agencyId,
    queryFn: fetchInvoices,
  });

  const { data: ownerships } = useQuery({
    queryKey: ["owner-invoice-ownerships", agencyId],
    enabled: open && !!agencyId && isAdmin,
    queryFn: () => fetchAgencyOwnerships(agencyId!),
  });

  // Owner-only: owner's own ownerships
  const { data: myOwnerships } = useQuery({
    queryKey: ["owner-invoice-my-ownerships", user?.id],
    enabled: open && !isAdmin && !!user?.id,
    queryFn: () => fetchMyOwnerships(user!.id),
  });

  const { data: owners } = useQuery({
    queryKey: ["owner-invoice-owners", agencyId],
    enabled: open && !!agencyId && isAdmin,
    queryFn: () => fetchOwnerProfilesInAgency(agencyId!),
  });

  const ownerName = useMemo(() => {
    if (!report) return "";

    // Owner backend: show the owner's real name (no "(You)"); fallback to email, then "Owner"
    if (!isAdmin) {
      const name = [profile?.first_name ?? "", profile?.last_name ?? ""].filter(Boolean).join(" ");
      if (name) return name;
      const email = user?.email ?? "";
      return email || "Owner";
    }

    // Admin backend: look up owner in agency owner list
    const o = (owners ?? []).find((x) => x.id === report.owner_id);
    const name = [o?.first_name ?? "", o?.last_name ?? ""].filter(Boolean).join(" ");
    return name || report.owner_id;
  }, [isAdmin, owners, report, profile?.first_name, profile?.last_name, user?.email]);

  const filteredPayments = useMemo(() => {
    if (!report) return [];
    const s = String(report.start_date).slice(0, 10);
    const e = String(report.end_date).slice(0, 10);
    return (payments ?? []).filter((p: any) => {
      const d = String(p.received_date ?? "").slice(0, 10);
      return d >= s && d <= e;
    });
  }, [payments, report]);

  const filteredInvoices = useMemo(() => {
    if (!report) return [];
    const s = String(report.start_date).slice(0, 10);
    const e = String(report.end_date).slice(0, 10);
    return (invoices ?? []).filter((inv: any) => {
      if (String(inv.status) === "void") return false;
      const d = String(inv.issue_date ?? "").slice(0, 10);
      return d >= s && d <= e;
    });
  }, [invoices, report]);

  const ownershipCtx = useMemo(() => {
    if (!report) {
      return {
        ownedPropIds: new Set<string>(),
        percentByProp: new Map<string, number>(),
      };
    }

    if (isAdmin) {
      const ownerProps = (ownerships ?? []).filter((o) => o.owner_id === report.owner_id);
      const ownedPropIds = new Set(ownerProps.map((o) => o.property_id));
      const percentByProp = new Map(ownerProps.map((o) => [o.property_id, o.ownership_percent == null ? 100 : Number(o.ownership_percent)]));
      return { ownedPropIds, percentByProp };
    }

    const entries = Array.from((myOwnerships ?? new Map<string, number>()).entries());
    const ownedPropIds = new Set(entries.map(([pid]) => pid));
    const percentByProp = new Map(entries.map(([pid, percent]) => [pid, percent == null ? 100 : Number(percent)]));
    return { ownedPropIds, percentByProp };
  }, [isAdmin, ownerships, myOwnerships, report]);

  const ownerRows: PaymentRow[] = useMemo(() => {
    if (!report) return [];

    const map = new Map<string, PaymentRow>();

    (filteredPayments ?? []).forEach((p: any) => {
      const propId = p.lease?.property?.id || p.lease?.property_id || null;
      const propName = p.lease?.property?.name ?? "—";
      const percent = propId ? (ownershipCtx.percentByProp.get(propId) ?? 0) : 0;
      const assigned = propId ? ownershipCtx.ownedPropIds.has(propId) : false;
      const shareAmt = assigned ? (Number(p.amount || 0) * percent) / 100 : 0;

      const key = `${p.id}`;
      const method = String(p.method || "").toLowerCase() === "bank_transfer" ? "Transfer" : "Cash";
      const usd = p.currency === "USD" ? shareAmt : 0;
      const dop = p.currency === "DOP" ? shareAmt : 0;
      const rate = typeof p.exchange_rate === "number" ? p.exchange_rate : p.exchange_rate == null ? null : Number(p.exchange_rate);

      if (!assigned) return; // Only include assigned payments in owner statement
      map.set(key, {
        date: p.received_date,
        property: propName,
        method,
        usd,
        dop,
        rate,
      });
    });

    return Array.from(map.values());
  }, [filteredPayments, ownershipCtx, report]);

  const totals = useMemo(() => {
    const usdCash = ownerRows.filter((r) => r.method === "Cash").reduce((s, r) => s + r.usd, 0);
    const dopCash = ownerRows.filter((r) => r.method === "Cash").reduce((s, r) => s + r.dop, 0);
    const usdTransfer = ownerRows.filter((r) => r.method === "Transfer").reduce((s, r) => s + r.usd, 0);
    const dopTransfer = ownerRows.filter((r) => r.method === "Transfer").reduce((s, r) => s + r.dop, 0);
    return { usdCash, dopCash, usdTransfer, dopTransfer };
  }, [ownerRows]);

  // Find matching manager report for the same period
  const managerForPeriod = useMemo(() => {
    if (!report || !mgrReports || (mgrReports as any[]).length === 0) return null;
    const m = (mgrReports as any[]).find(
      (mr) =>
        String(mr.month) === String(report.month) &&
        String(mr.start_date).slice(0, 10) === String(report.start_date).slice(0, 10) &&
        String(mr.end_date).slice(0, 10) === String(report.end_date).slice(0, 10)
    );
    return m ?? null;
  }, [mgrReports, report]);

  const feePercent = managerForPeriod ? Number(managerForPeriod.fee_percent || 5) : 5;
  const avgRate = managerForPeriod && managerForPeriod.avg_rate != null ? Number(managerForPeriod.avg_rate) : (report?.avg_rate != null ? Number(report.avg_rate) : NaN);

  const leaseFeeBasisById = useMemo(() => {
    const map = new Map<string, "paid" | "issued">();
    (leases as LeaseWithMeta[] | undefined)?.forEach((l) => {
      map.set(l.id, l.management_fee_basis === "issued" ? "issued" : "paid");
    });
    return map;
  }, [leases]);

  // Fee base: payments for leases set to 'paid' + invoices issued for leases set to 'issued'
  const feeBase = useMemo(() => {
    const paid = { usd: 0, dop: 0 };
    const issued = { usd: 0, dop: 0 };

    (filteredPayments ?? []).forEach((p: any) => {
      const propId = p.lease?.property?.id || p.lease?.property_id || null;
      const assigned = propId ? ownershipCtx.ownedPropIds.has(propId) : false;
      if (!assigned) return;

      const percent = propId ? (ownershipCtx.percentByProp.get(propId) ?? 0) : 0;
      const shareAmt = (Number(p.amount || 0) * percent) / 100;

      const basis = leaseFeeBasisById.get(String(p.lease_id ?? "")) ?? "paid";
      if (basis !== "paid") return;

      if (p.currency === "USD") paid.usd += shareAmt;
      else paid.dop += shareAmt;
    });

    (filteredInvoices ?? []).forEach((inv: any) => {
      const propId = inv.lease?.property?.id ?? null;
      const assigned = propId ? ownershipCtx.ownedPropIds.has(propId) : false;
      if (!assigned) return;

      const percent = propId ? (ownershipCtx.percentByProp.get(propId) ?? 0) : 0;
      const shareAmt = (Number(inv.total_amount || 0) * percent) / 100;

      const basis = leaseFeeBasisById.get(String(inv.lease_id ?? "")) ?? "paid";
      if (basis !== "issued") return;

      if (inv.currency === "USD") issued.usd += shareAmt;
      else issued.dop += shareAmt;
    });

    return { paid, issued };
  }, [filteredPayments, filteredInvoices, leaseFeeBasisById, ownershipCtx]);

  const feeTotalOwedDop = useMemo(() => {
    const usd = feeBase.paid.usd + feeBase.issued.usd;
    const dop = feeBase.paid.dop + feeBase.issued.dop;
    const rate = Number.isFinite(avgRate) && avgRate > 0 ? avgRate : 0;
    return ((usd * rate) + dop) * (feePercent / 100);
  }, [feeBase, avgRate, feePercent]);

  // Deduct only from DOP CASH (actual cash payments)
  const ownerFeeDeductedDop = Math.min(feeTotalOwedDop, totals.dopCash);
  const ownerFeeBalanceDueDop = Math.max(0, feeTotalOwedDop - ownerFeeDeductedDop);
  const ownerDopAfterFee = Math.max(0, totals.dopCash - ownerFeeDeductedDop);

  const hasIssuedComponent = (feeBase.issued.usd + feeBase.issued.dop) > 0;

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

  const periodLabel = React.useMemo(() => {
    if (!report) return "";
    const sStr = String(report.start_date ?? "").slice(0, 10);
    const eStr = String(report.end_date ?? "").slice(0, 10);
    const s = parseYmd(sStr);
    const e = parseYmd(eStr);
    if (!s || !e) return formatMonthLabel(report.month);

    const isFirstDay = s.d === 1;
    const isSameMonth = s.y === e.y && s.m === e.m;
    const isLastDay = e.d === daysInMonth(s.y, s.m);

    const isFullMonth = isFirstDay && isSameMonth && isLastDay;
    return isFullMonth ? formatMonthLabel(report.month) : `${sStr} to ${eStr}`;
  }, [report]);

  const handlePrint = () => {
    const el = printAreaRef.current;
    if (!el) return;
    printElement(el);
  };

  const paymentsTable = (
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
          </TableRow>
        </TableHeader>
        <TableBody>
          {ownerRows.map((r, idx) => (
            <TableRow key={idx}>
              <TableCell className="font-medium">{r.property}</TableCell>
              <TableCell>{r.date}</TableCell>
              <TableCell>{r.method}</TableCell>
              <TableCell>{fmt(r.usd, "USD")}</TableCell>
              <TableCell>{fmt(r.dop, "DOP")}</TableCell>
              <TableCell>{r.rate ? String(r.rate) : "—"}</TableCell>
            </TableRow>
          ))}
          <TableRow>
            <TableCell className="font-semibold">Totals</TableCell>
            <TableCell />
            <TableCell />
            <TableCell className="font-semibold">{fmt(totals.usdCash + totals.usdTransfer, "USD")}</TableCell>
            <TableCell className="font-semibold">{fmt(totals.dopCash + totals.dopTransfer, "DOP")}</TableCell>
            <TableCell />
          </TableRow>
        </TableBody>
      </Table>
    </div>
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-[95vw] sm:max-w-3xl max-h-[85vh] overflow-y-auto invoice-print bg-white text-black p-3 sm:p-6 rounded-md">
        <div ref={printAreaRef} className="report-print-area">
          {!report ? (
            <div className="text-sm text-muted-foreground">Loading report…</div>
          ) : (
            <>
              <DialogHeader>
                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                  <div className="flex items-start gap-3">
                    {logoUrl ? <img src={logoUrl} alt="Agency logo" className="h-10 w-auto rounded" /> : null}
                    <div>
                      <div className="font-semibold">{agency?.name ?? "Las Terrenas Properties"}</div>
                      <div className="text-xs text-gray-600">{agency?.address ?? "278 calle Duarte, LTI building, Las Terrenas"}</div>
                    </div>
                  </div>
                  <div className="sm:text-right">
                    <DialogTitle className="text-base font-semibold">Owner Statement • {periodLabel}</DialogTitle>
                    <div className="text-xs text-gray-600">
                      {String(report.start_date).slice(0, 10)} to {String(report.end_date).slice(0, 10)}
                    </div>
                    <div className="mt-1 font-semibold text-base">{ownerName}</div>
                  </div>
                </div>
              </DialogHeader>

              {/* Totals */}
              <div className="border rounded-md divide-y mt-4">
                <div className="p-3">
                  <div className="text-xs font-medium mb-1">Cash totals</div>
                  <div className="space-y-1 text-sm">
                    <div>{fmt(totals.usdCash, "USD")} USD</div>
                    <div>{fmt(totals.dopCash, "DOP")} DOP</div>
                  </div>
                </div>
                <div className="p-3">
                  <div className="text-xs font-medium mb-1">Transfer totals</div>
                  <div className="space-y-1 text-sm">
                    <div>{fmt(totals.usdTransfer, "USD")} USD</div>
                    <div>{fmt(totals.dopTransfer, "DOP")} DOP</div>
                  </div>
                </div>
                <div className="p-3">
                  <div className="text-xs font-medium mb-1">Average USD/DOP rate</div>
                  <div className="space-y-1 text-sm">
                    <div>{avgRate && Number.isFinite(avgRate) ? avgRate.toFixed(6) : "—"}</div>
                  </div>
                </div>
                <div className="p-3">
                  <div className="text-xs font-medium mb-1">Management fee</div>
                  <div className="space-y-2 text-sm">
                    <div className="font-semibold">Fee total (owed): {fmt(feeTotalOwedDop, "DOP")} ({feePercent.toFixed(2)}%)</div>
                    <div className="text-xs text-muted-foreground">
                      Deductions are applied only against DOP cash. If there is no DOP cash, the remaining fee is still owed.
                    </div>
                    {hasIssuedComponent ? (
                      <div className="text-xs text-muted-foreground">
                        Includes invoices issued (fee owed even if unpaid): {fmt(feeBase.issued.usd, "USD")} USD and {fmt(feeBase.issued.dop, "DOP")} DOP.
                      </div>
                    ) : null}
                    <div className="grid grid-cols-2 gap-2 text-sm">
                      <div className="text-muted-foreground">Deducted from DOP cash</div>
                      <div className="text-right font-medium">{fmt(ownerFeeDeductedDop, "DOP")}</div>
                      <div className="text-muted-foreground">Balance due to agency</div>
                      <div className={`text-right font-semibold ${ownerFeeBalanceDueDop > 0 ? "text-red-600" : ""}`}>{fmt(ownerFeeBalanceDueDop, "DOP")}</div>
                    </div>
                    {ownerFeeBalanceDueDop > 0 ? (
                      <div className="text-xs text-muted-foreground">
                        This balance can be paid by transfer or will be deducted from the next available DOP cash payout.
                      </div>
                    ) : null}
                  </div>
                </div>
              </div>

              {/* Per-payment rows */}
              <div className="border rounded-md mt-4">
                {isMobile ? (
                  <>
                    <div className="space-y-2 p-3 print:hidden">
                      {ownerRows.map((r, idx) => (
                        <div key={idx} className="rounded-md border p-3">
                          <div className="flex items-start justify-between gap-3">
                            <div className="font-semibold">{r.property}</div>
                            <div className="text-right text-xs text-muted-foreground">{r.date}</div>
                          </div>
                          <div className="mt-1 text-xs text-muted-foreground">{r.method}</div>
                          <div className="mt-2 grid grid-cols-2 gap-2 text-sm">
                            <div className="text-muted-foreground">USD</div>
                            <div className="text-right">{fmt(r.usd, "USD")}</div>
                            <div className="text-muted-foreground">DOP</div>
                            <div className="text-right">{fmt(r.dop, "DOP")}</div>
                            <div className="text-muted-foreground">Rate</div>
                            <div className="text-right">{r.rate ? String(r.rate) : "—"}</div>
                          </div>
                        </div>
                      ))}
                      <div className="rounded-md border p-3">
                        <div className="font-semibold">Totals</div>
                        <div className="mt-2 grid grid-cols-2 gap-2 text-sm">
                          <div className="text-muted-foreground">Total USD</div>
                          <div className="text-right">{fmt(totals.usdCash + totals.usdTransfer, "USD")}</div>
                          <div className="text-muted-foreground">Total DOP</div>
                          <div className="text-right">{fmt(totals.dopCash + totals.dopTransfer, "DOP")}</div>
                        </div>
                      </div>
                    </div>

                    <div className="hidden print:block">{paymentsTable}</div>
                  </>
                ) : (
                  paymentsTable
                )}
              </div>

              {/* Summary */}
              <div className="border rounded-md mt-4">
                {isMobile ? (
                  <div className="p-3 print:hidden">
                    <div className="grid grid-cols-2 gap-2 text-sm">
                      <div className="text-muted-foreground">Cash DOP (after fee)</div>
                      <div className="text-right font-semibold">{fmt(ownerDopAfterFee, "DOP")}</div>
                      <div className="text-muted-foreground">Fee balance due</div>
                      <div className={`text-right font-semibold ${ownerFeeBalanceDueDop > 0 ? "text-red-600" : ""}`}>{fmt(ownerFeeBalanceDueDop, "DOP")}</div>
                      <div className="text-muted-foreground">Cash USD</div>
                      <div className="text-right font-semibold">{fmt(totals.usdCash, "USD")}</div>
                      <div className="text-muted-foreground">Transfer DOP</div>
                      <div className="text-right font-semibold">{fmt(totals.dopTransfer, "DOP")}</div>
                      <div className="text-muted-foreground">Transfer USD</div>
                      <div className="text-right font-semibold">{fmt(totals.usdTransfer, "USD")}</div>
                    </div>
                  </div>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Cash DOP (after manager fee)</TableHead>
                        <TableHead>Fee balance due (DOP)</TableHead>
                        <TableHead>Cash USD</TableHead>
                        <TableHead>Transfer DOP</TableHead>
                        <TableHead>Transfer USD</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      <TableRow>
                        <TableCell className="font-semibold">{fmt(ownerDopAfterFee, "DOP")}</TableCell>
                        <TableCell className={`font-semibold ${ownerFeeBalanceDueDop > 0 ? "text-red-600" : ""}`}>{fmt(ownerFeeBalanceDueDop, "DOP")}</TableCell>
                        <TableCell className="font-semibold">{fmt(totals.usdCash, "USD")}</TableCell>
                        <TableCell className="font-semibold">{fmt(totals.dopTransfer, "DOP")}</TableCell>
                        <TableCell className="font-semibold">{fmt(totals.usdTransfer, "USD")}</TableCell>
                      </TableRow>
                    </TableBody>
                  </Table>
                )}
              </div>
            </>
          )}
        </div>

        <div className="mt-3 flex items-center justify-end print:hidden">
          <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row sm:items-center">
            <Button
              variant="default"
              className="w-full bg-neutral-800 text-white hover:bg-neutral-900 sm:w-auto"
              onClick={handlePrint}
            >
              Download PDF
            </Button>
            <Button
              variant="outline"
              className="w-full bg-white text-black border-gray-300 hover:bg-gray-100 sm:w-auto"
              onClick={handlePrint}
            >
              Print
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default OwnerReportInvoiceDialog;