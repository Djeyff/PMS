"use client";

import React, { useMemo } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useAuth } from "@/contexts/AuthProvider";
import { useQuery } from "@tanstack/react-query";
import { fetchPayments } from "@/services/payments";
import { fetchAgencyOwnerships } from "@/services/property-owners";
import type { OwnerReportRow } from "@/services/owner-reports";
import { fetchOwnerProfilesInAgency } from "@/services/users";
import { fetchAgencyById } from "@/services/agencies";
import { getLogoPublicUrl } from "@/services/branding";

type Props = {
  report: OwnerReportRow;
  open: boolean;
  onOpenChange: (v: boolean) => void;
};

function fmt(amount: number, currency: "USD" | "DOP") {
  return new Intl.NumberFormat(undefined, { style: "currency", currency }).format(amount);
}

const OwnerReportInvoiceDialog: React.FC<Props> = ({ report, open, onOpenChange }) => {
  const { role, user, profile } = useAuth();
  const agencyId = profile?.agency_id ?? null;
  const isAdmin = role === "agency_admin";

  const { data: agency } = useQuery({
    queryKey: ["owner-invoice-agency", agencyId],
    enabled: open && !!agencyId,
    queryFn: () => fetchAgencyById(agencyId!),
  });

  const [logoUrl, setLogoUrl] = React.useState<string>("");
  React.useEffect(() => {
    if (!open) return;
    getLogoPublicUrl().then((url) => setLogoUrl(url || "/assets/invoice-layout-reference.png")).catch(() => setLogoUrl("/assets/invoice-layout-reference.png"));
  }, [open]);

  const { data: payments } = useQuery({
    queryKey: ["owner-invoice-payments", role, user?.id, agencyId],
    enabled: open && !!role && !!agencyId,
    queryFn: () => fetchPayments({ role, userId: user?.id ?? null, agencyId }),
  });

  const { data: ownerships } = useQuery({
    queryKey: ["owner-invoice-ownerships", agencyId],
    enabled: open && !!agencyId && isAdmin,
    queryFn: () => fetchAgencyOwnerships(agencyId!),
  });

  const { data: owners } = useQuery({
    queryKey: ["owner-invoice-owners", agencyId],
    enabled: open && !!agencyId && isAdmin,
    queryFn: () => fetchOwnerProfilesInAgency(agencyId!),
  });

  const ownerName = useMemo(() => {
    const o = (owners ?? []).find((x) => x.id === report.owner_id);
    return [o?.first_name ?? "", o?.last_name ?? ""].filter(Boolean).join(" ") || report.owner_id;
  }, [owners, report.owner_id]);

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
    const ownerProps = (ownerships ?? []).filter((o) => o.owner_id === report.owner_id);
    const ownedPropIds = new Set(ownerProps.map((o) => o.property_id));
    const percentByProp = new Map<string, number>(ownerProps.map((o) => [o.property_id, o.ownership_percent == null ? 100 : Number(o.ownership_percent)]));

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
  }, [filteredPayments, ownerships, report.owner_id]);

  const totals = useMemo(() => {
    const usdCash = ownerRows.filter((r) => r.method === "Cash").reduce((s, r) => s + r.usd, 0);
    const dopCash = ownerRows.filter((r) => r.method === "Cash").reduce((s, r) => s + r.dop, 0);
    const usdTransfer = ownerRows.filter((r) => r.method === "Transfer").reduce((s, r) => s + r.usd, 0);
    const dopTransfer = ownerRows.filter((r) => r.method === "Transfer").reduce((s, r) => s + r.dop, 0);
    return { usdCash, dopCash, usdTransfer, dopTransfer };
  }, [ownerRows]);

  // Format "YYYY-MM" into "Month YYYY" label
  const prettyMonth = useMemo(() => {
    const parts = String(report.month ?? "").split("-");
    if (parts.length !== 2) return report.month;
    const y = Number(parts[0]);
    const m = Number(parts[1]) - 1;
    if (!Number.isFinite(y) || !Number.isFinite(m)) return report.month;
    const d = new Date(y, m, 1);
    const label = d.toLocaleString(undefined, { month: "long", year: "numeric" });
    return label.charAt(0).toUpperCase() + label.slice(1);
  }, [report.month]);

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
              <DialogTitle className="text-base font-semibold">Owner Statement • {prettyMonth}</DialogTitle>
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
              <div>{report.avg_rate != null ? Number(report.avg_rate).toFixed(6) : "—"}</div>
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