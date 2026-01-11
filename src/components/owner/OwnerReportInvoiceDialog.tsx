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

type Props = {
  report: OwnerReportRow | null;
  open: boolean;
  onOpenChange: (v: boolean) => void;
};

function fmt(amount: number, currency: "USD" | "DOP") {
  return new Intl.NumberFormat(undefined, { style: "currency", currency }).format(amount);
}

const OwnerReportInvoiceDialog: React.FC<Props> = ({ report, open, onOpenChange }) => {
  // Early exit: do not render or run logic if dialog isn't open or report is missing
  if (!open || !report) return null;

  const { role, user, profile } = useAuth();
  const agencyId = profile?.agency_id ?? null;
  const isAdmin = role === "agency_admin";

  const { data: agency } = useQuery({
    queryKey: ["owner-invoice-agency", agencyId],
    enabled: open && !!agencyId && !!report,
    queryFn: () => fetchAgencyById(agencyId!),
  });

  // Load manager reports for fee info
  const { data: mgrReports } = useQuery({
    queryKey: ["owner-invoice-mgr", agencyId],
    enabled: open && !!agencyId && !!report,
    queryFn: () => listManagerReports(agencyId!),
  });

  const [logoUrl, setLogoUrl] = React.useState<string>("");
  React.useEffect(() => {
    if (!open) return;
    getLogoPublicUrl().then((url) => setLogoUrl(url || "/assets/invoice-layout-reference.png")).catch(() => setLogoUrl("/assets/invoice-layout-reference.png"));
  }, [open]);

  const { data: payments } = useQuery({
    queryKey: ["owner-invoice-payments", role, user?.id, agencyId],
    enabled: open && !!role && !!agencyId && !!report,
    queryFn: () => fetchPayments({ role, userId: user?.id ?? null, agencyId }),
  });

  const { data: ownerships } = useQuery({
    queryKey: ["owner-invoice-ownerships", agencyId],
    enabled: open && !!agencyId && isAdmin && !!report,
    queryFn: () => fetchAgencyOwnerships(agencyId!),
  });

  // NEW: owner's own ownerships when viewing as owner
  const { data: myOwnerships } = useQuery({
    queryKey: ["owner-invoice-my-ownerships", user?.id],
    enabled: open && !!report && !isAdmin && !!user?.id,
    queryFn: () => fetchMyOwnerships(user!.id),
  });

  const { data: owners } = useQuery({
    queryKey: ["owner-invoice-owners", agencyId],
    enabled: open && !!agencyId && isAdmin && !!report,
    queryFn: () => fetchOwnerProfilesInAgency(agencyId!),
  });

  const ownerName = useMemo(() => {
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
  }, [isAdmin, owners, report.owner_id, profile?.first_name, profile?.last_name, user?.email]);

  const filteredPayments = useMemo(() => {
    const s = String(report.start_date).slice(0, 10);
    const e = String(report.end_date).slice(0, 10);
    return (payments ?? []).filter((p: any) => {
      const d = String(p.received_date ?? "").slice(0, 10);
      return d >= s && d <= e;
    });
  }, [payments, report.start_date, report.end_date]);

  const ownerRows = useMemo(() => {
    const map = new Map<string, { date: string; property: string; method: string; usd: number; dop: number; rate: number | null; assigned: boolean }>();

    // Build owned set and percents depending on role
    let ownedPropIds = new Set<string>();
    let percentByProp = new Map<string, number>();

    if (isAdmin) {
      const ownerProps = (ownerships ?? []).filter((o) => o.owner_id === report.owner_id);
      ownedPropIds = new Set(ownerProps.map((o) => o.property_id));
      percentByProp = new Map(ownerProps.map((o) => [o.property_id, o.ownership_percent == null ? 100 : Number(o.ownership_percent)]));
    } else {
      const entries = Array.from((myOwnerships ?? new Map<string, number>()).entries());
      ownedPropIds = new Set(entries.map(([pid]) => pid));
      percentByProp = new Map(entries.map(([pid, percent]) => [pid, percent == null ? 100 : Number(percent)]));
    }

    (filteredPayments ?? []).forEach((p: any) => {
      const propId = p.lease?.property?.id || p.lease?.property_id || null;
      const propName = p.lease?.property?.name ?? "—";
      const percent = propId ? (percentByProp.get(propId) ?? 0) : 0;
      const assigned = propId ? ownedPropIds.has(propId) : false;
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
        assigned,
      });
    });

    return Array.from(map.values());
  }, [filteredPayments, ownerships, myOwnerships, report.owner_id, isAdmin]);

  const totals = useMemo(() => {
    const usdCash = ownerRows.filter((r) => r.method === "Cash").reduce((s, r) => s + r.usd, 0);
    const dopCash = ownerRows.filter((r) => r.method === "Cash").reduce((s, r) => s + r.dop, 0);
    const usdTransfer = ownerRows.filter((r) => r.method === "Transfer").reduce((s, r) => s + r.usd, 0);
    const dopTransfer = ownerRows.filter((r) => r.method === "Transfer").reduce((s, r) => s + r.dop, 0);
    return { usdCash, dopCash, usdTransfer, dopTransfer };
  }, [ownerRows]);

  // Find matching manager report for the same period
  const managerForPeriod = useMemo(() => {
    if (!mgrReports || mgrReports.length === 0) return null;
    const m = (mgrReports as any[]).find((mr) =>
      String(mr.month) === String(report.month) &&
      String(mr.start_date).slice(0, 10) === String(report.start_date).slice(0, 10) &&
      String(mr.end_date).slice(0, 10) === String(report.end_date).slice(0, 10)
    );
    return m ?? null;
  }, [mgrReports, report.month, report.start_date, report.end_date]);

  // Agency-level totals and fee percent (used for fee% and optional avg rate only)
  const feePercent = managerForPeriod ? Number(managerForPeriod.fee_percent || 5) : 5;
  const usdAgencyTotal = managerForPeriod ? Number(managerForPeriod.usd_total || 0) : (totals.usdCash + totals.usdTransfer);
  const dopAgencyTotal = managerForPeriod ? Number(managerForPeriod.dop_total || 0) : (totals.dopCash + totals.dopTransfer);
  const avgRate = managerForPeriod && managerForPeriod.avg_rate != null ? Number(managerForPeriod.avg_rate) : (report.avg_rate != null ? Number(report.avg_rate) : NaN);

  // Owner-specific fee components
  const ownerUsdTotal = totals.usdCash + totals.usdTransfer;
  const ownerDopTotal = totals.dopCash + totals.dopTransfer;
  const ownerDopCash = totals.dopCash;
  const ownerFeeShareDop = ((Number.isNaN(avgRate) ? 0 : ownerUsdTotal * avgRate) + ownerDopTotal) * (feePercent / 100);
  const ownerFeeDeducted = Math.min(ownerFeeShareDop, ownerDopCash);
  const ownerDopAfterFee = Math.max(0, ownerDopCash - ownerFeeDeducted);

  // Format "YYYY-MM" into "Month YYYY" label
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
  }, [report.month, report.start_date, report.end_date]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[85vh] overflow-y-auto invoice-print bg-white text-black p-6 rounded-md">
        <DialogHeader>
          <div className="flex items-start justify-between">
            <div className="flex items-start gap-3">
              {logoUrl ? <img src={logoUrl} alt="Agency logo" className="h-12 w-auto rounded" /> : null}
              <div>
                <div className="font-semibold">{agency?.name ?? "Las Terrenas Properties"}</div>
                <div className="text-xs text-gray-600">
                  {agency?.address ?? "278 calle Duarte, LTI building, Las Terrenas"}
                </div>
              </div>
            </div>
            <div className="text-right">
              <DialogTitle className="text-base font-semibold">Owner Statement • {periodLabel}</DialogTitle>
              <div className="text-xs text-gray-600">{String(report.start_date).slice(0,10)} to {String(report.end_date).slice(0,10)}</div>
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
          {/* Owner-only manager fee line */}
          <div className="p-3">
            <div className="text-xs font-medium mb-1">Manager fee</div>
            <div className="space-y-1 text-sm">
              <div className="font-semibold">
                {ownerUsdTotal > 0 ? (
                  <>
                    ({fmt(ownerDopTotal, "DOP")} + {ownerUsdTotal.toFixed(2)} USD × {Number.isFinite(avgRate) ? avgRate.toFixed(6) : "rate ?"}) × {feePercent.toFixed(2)}% = {fmt(ownerFeeShareDop, "DOP")}
                  </>
                ) : (
                  <>
                    {fmt(ownerDopTotal, "DOP")} × {feePercent.toFixed(2)}% = {fmt(ownerFeeShareDop, "DOP")}
                  </>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Per-payment rows */}
        <div className="border rounded-md mt-4">
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

        <div className="border rounded-md mt-4">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Cash DOP (after manager fee)</TableHead>
                <TableHead>Cash USD</TableHead>
                <TableHead>Transfer DOP</TableHead>
                <TableHead>Transfer USD</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              <TableRow>
                <TableCell className="font-semibold">{fmt(ownerDopAfterFee, "DOP")}</TableCell>
                <TableCell className="font-semibold">{fmt(totals.usdCash, "USD")}</TableCell>
                <TableCell className="font-semibold">{fmt(totals.dopTransfer, "DOP")}</TableCell>
                <TableCell className="font-semibold">{fmt(totals.usdTransfer, "USD")}</TableCell>
              </TableRow>
            </TableBody>
          </Table>
        </div>

        <div className="mt-3 flex items-center justify-end print:hidden">
          <Button
            variant="default"
            className="bg-neutral-800 text-white hover:bg-neutral-900"
            onClick={() => window.print()}
          >
            Print
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default OwnerReportInvoiceDialog;