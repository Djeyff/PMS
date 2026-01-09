"use client";

import React, { useMemo } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useAuth } from "@/contexts/AuthProvider";
import { useQuery } from "@tanstack/react-query";
import { fetchPayments } from "@/services/payments";
import { fetchAgencyOwnerships } from "@/services/property-owners";
import type { ManagerReportRow } from "@/services/manager-reports";
import { fetchAgencyById } from "@/services/agencies";
import { getLogoPublicUrl } from "@/services/branding";

type Props = {
  report: ManagerReportRow;
  open: boolean;
  onOpenChange: (v: boolean) => void;
};

type OwnerRow = {
  ownerId: string;
  name: string;
  cashUsd: number;
  cashDop: number;
  transferUsd: number;
  transferDop: number;
  cashDopAfterFee?: number;
};

function fmt(amount: number, currency: "USD" | "DOP") {
  return new Intl.NumberFormat(undefined, { style: "currency", currency }).format(amount);
}

const ManagerReportInvoiceDialog: React.FC<Props> = ({ report, open, onOpenChange }) => {
  const { role, user, profile } = useAuth();
  const agencyId = profile?.agency_id ?? null;
  const isAdmin = role === "agency_admin";

  const { data: agency } = useQuery({
    queryKey: ["mgr-invoice-agency", agencyId],
    enabled: open && !!agencyId,
    queryFn: () => fetchAgencyById(agencyId!),
  });

  const [logoUrl, setLogoUrl] = React.useState<string>("");
  React.useEffect(() => {
    if (!open) return;
    getLogoPublicUrl().then((url) => {
      setLogoUrl(url || "/assets/invoice-layout-reference.png");
    }).catch(() => setLogoUrl("/assets/invoice-layout-reference.png"));
  }, [open]);

  const { data: payments } = useQuery({
    queryKey: ["mgr-invoice-payments", role, user?.id, agencyId],
    enabled: open && !!role && !!agencyId,
    queryFn: () => fetchPayments({ role, userId: user?.id ?? null, agencyId }),
  });

  const { data: ownerships } = useQuery({
    queryKey: ["mgr-invoice-ownerships", agencyId],
    enabled: open && !!agencyId && isAdmin,
    queryFn: () => fetchAgencyOwnerships(agencyId!),
  });

  const filteredPayments = useMemo(() => {
    const rows = payments ?? [];
    const s = String(report.start_date).slice(0, 10);
    const e = String(report.end_date).slice(0, 10);
    return rows.filter((p: any) => {
      const d = String(p.received_date ?? "").slice(0, 10);
      return d >= s && d <= e;
    });
  }, [payments, report.start_date, report.end_date]);

  const ownerRows: OwnerRow[] = useMemo(() => {
    const map = new Map<string, OwnerRow>();
    (filteredPayments ?? []).forEach((p: any) => {
      const propId = p.lease?.property?.id || p.lease?.property_id || null;
      const ownersForProp = (ownerships ?? []).filter((o) => o.property_id === propId);
      if (!ownersForProp || ownersForProp.length === 0) {
        const row = map.get("__unassigned__") ?? { ownerId: "__unassigned__", name: "Unassigned", cashUsd: 0, cashDop: 0, transferUsd: 0, transferDop: 0 };
        const method = String(p.method || "").toLowerCase();
        const isCash = method !== "bank_transfer";
        const isTransfer = method === "bank_transfer";
        const amt = Number(p.amount || 0);
        if (isCash && p.currency === "USD") row.cashUsd += amt;
        if (isCash && p.currency === "DOP") row.cashDop += amt;
        if (isTransfer && p.currency === "USD") row.transferUsd += amt;
        if (isTransfer && p.currency === "DOP") row.transferDop += amt;
        map.set("__unassigned__", row);
      } else {
        ownersForProp.forEach((o) => {
          const percent = o.ownership_percent == null ? 100 : Math.max(0, Math.min(100, Number(o.ownership_percent)));
          const shareAmt = (Number(p.amount || 0) * percent) / 100;
          const ownerId = o.owner_id;
          const ownerName = [o.owner?.first_name ?? "", o.owner?.last_name ?? ""].filter(Boolean).join(" ") || "—";
          const row = map.get(ownerId) ?? { ownerId, name: ownerName, cashUsd: 0, cashDop: 0, transferUsd: 0, transferDop: 0 };
          const method = String(p.method || "").toLowerCase();
          const isCash = method !== "bank_transfer";
          const isTransfer = method === "bank_transfer";
          if (isCash && p.currency === "USD") row.cashUsd += shareAmt;
          if (isCash && p.currency === "DOP") row.cashDop += shareAmt;
          if (isTransfer && p.currency === "USD") row.transferUsd += shareAmt;
          if (isTransfer && p.currency === "DOP") row.transferDop += shareAmt;
          map.set(ownerId, row);
        });
      }
    });
    return Array.from(map.values());
  }, [filteredPayments, ownerships]);

  const totals = useMemo(() => {
    const usdCash = ownerRows.reduce((s, r) => s + r.cashUsd, 0);
    const dopCash = ownerRows.reduce((s, r) => s + r.cashDop, 0);
    const usdTransfer = ownerRows.reduce((s, r) => s + r.transferUsd, 0);
    const dopTransfer = ownerRows.reduce((s, r) => s + r.transferDop, 0);
    return { usdCash, dopCash, usdTransfer, dopTransfer };
  }, [ownerRows]);

  const rateNum = useMemo(() => {
    const n = Number(report.avg_rate ?? NaN);
    return Number.isFinite(n) && n > 0 ? n : NaN;
  }, [report.avg_rate]);

  const usdTotal = totals.usdCash + totals.usdTransfer;
  const dopTotal = totals.dopCash + totals.dopTransfer;
  const feeBaseDop = (Number.isNaN(rateNum) ? 0 : usdTotal * rateNum) + dopTotal;
  const feePct = Number(report.fee_percent ?? 5);
  const managerFeeDop = feeBaseDop * (feePct / 100);
  const actualFeeDeducted = Math.min(managerFeeDop, totals.dopCash);

  const ownerRowsWithFee = useMemo(() => {
    const totalDopCash = totals.dopCash;
    if (totalDopCash <= 0 || actualFeeDeducted <= 0) {
      return ownerRows.map((r) => ({ ...r, cashDopAfterFee: r.cashDop }));
    }
    return ownerRows.map((r) => {
      const share = r.cashDop / totalDopCash;
      const deducted = actualFeeDeducted * share;
      return { ...r, cashDopAfterFee: Math.max(0, r.cashDop - deducted) };
    });
  }, [ownerRows, totals.dopCash, actualFeeDeducted]);

  const dopCashAfterFeeTotal = useMemo(
    () => ownerRowsWithFee.reduce((s, r) => s + (r.cashDopAfterFee ?? r.cashDop), 0),
    [ownerRowsWithFee]
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl invoice-print bg-white text-black p-6 rounded-md overflow-hidden">
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
              <DialogTitle className="text-base font-semibold">Property Manager Report • {report.month}</DialogTitle>
              <div className="text-xs text-gray-600">{String(report.start_date).slice(0,10)} to {String(report.end_date).slice(0,10)}</div>
            </div>
          </div>
        </DialogHeader>

        <div className="border rounded-md divide-y mt-4 bg-white">
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
            <div className="text-xs font-medium mb-1">Manager fee</div>
            <div className="space-y-1 text-sm">
              <div>
                Base: {fmt(dopTotal, "DOP")} + {usdTotal.toFixed(2)} USD × {Number.isNaN(rateNum) ? "rate ?" : rateNum} = {fmt(feeBaseDop, "DOP")}
              </div>
              <div className="font-semibold">
                {fmt(managerFeeDop, "DOP")} ({feePct.toFixed(2)}%)
              </div>
            </div>
          </div>
        </div>

        <div className="border rounded-md mt-4 bg-white">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Owner</TableHead>
                <TableHead>Cash USD</TableHead>
                <TableHead>Cash DOP</TableHead>
                <TableHead>Fee share (DOP)</TableHead>
                <TableHead>Cash DOP after fee</TableHead>
                <TableHead>Transfer USD</TableHead>
                <TableHead>Transfer DOP</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {ownerRowsWithFee.map((r) => {
                const feeShare = (r.cashDop ?? 0) - (r.cashDopAfterFee ?? r.cashDop ?? 0);
                return (
                  <TableRow key={r.ownerId}>
                    <TableCell className="font-medium">{r.name}</TableCell>
                    <TableCell>{fmt(r.cashUsd, "USD")}</TableCell>
                    <TableCell>{fmt(r.cashDop, "DOP")}</TableCell>
                    <TableCell>{fmt(feeShare, "DOP")}</TableCell>
                    <TableCell>{fmt(r.cashDopAfterFee ?? r.cashDop, "DOP")}</TableCell>
                    <TableCell>{fmt(r.transferUsd, "USD")}</TableCell>
                    <TableCell>{fmt(r.transferDop, "DOP")}</TableCell>
                  </TableRow>
                );
              })}
              <TableRow>
                <TableCell className="font-semibold">Totals</TableCell>
                <TableCell className="font-semibold">{fmt(ownerRows.reduce((s, r) => s + r.cashUsd, 0), "USD")}</TableCell>
                <TableCell className="font-semibold">{fmt(ownerRows.reduce((s, r) => s + r.cashDop, 0), "DOP")}</TableCell>
                <TableCell className="font-semibold">{fmt(actualFeeDeducted, "DOP")}</TableCell>
                <TableCell className="font-semibold">{fmt(dopCashAfterFeeTotal, "DOP")}</TableCell>
                <TableCell className="font-semibold">{fmt(ownerRows.reduce((s, r) => s + r.transferUsd, 0), "USD")}</TableCell>
                <TableCell className="font-semibold">{fmt(ownerRows.reduce((s, r) => s + r.transferDop, 0), "DOP")}</TableCell>
              </TableRow>
            </TableBody>
          </Table>
        </div>

        <div className="mt-3 flex items-center justify-between">
          <div className="text-xs text-gray-600">
            Note: "Unassigned" shows payments from properties without owner assignments.
          </div>
          <div className="print:hidden">
            <Button variant="outline" onClick={() => window.print()}>Print</Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default ManagerReportInvoiceDialog;