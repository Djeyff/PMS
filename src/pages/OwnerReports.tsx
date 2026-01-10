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

// Suggested monthly average USD/DOP rate from Supabase exchange_rates table
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
  const agencyId = profile?.agency_id ?? null;

  const months = useMemo(() => monthList(12), []);
  const [monthValue, setMonthValue] = useState<string>(months[0]?.value ?? "");
  const currentMonth = useMemo(() => months.find((m) => m.value === monthValue) ?? months[0], [months, monthValue]);
  const [startDate, setStartDate] = useState<string>(currentMonth.start);
  const [endDate, setEndDate] = useState<string>(currentMonth.end);

  const [ownerId, setOwnerId] = useState<string>("");

  const [avgRateInput, setAvgRateInput] = useState<string>("");
  const [suggestedRate, setSuggestedRate] = useState<number | null>(null);

  const { data: payments } = useQuery({
    queryKey: ["owner-payments", role, user?.id, agencyId],
    enabled: !!role && !!agencyId,
    queryFn: () => fetchPayments({ role, userId: user?.id ?? null, agencyId }),
  });

  const { data: ownerships } = useQuery({
    queryKey: ["owner-ownerships", agencyId],
    enabled: !!agencyId && isAdmin,
    queryFn: () => fetchAgencyOwnerships(agencyId!),
  });

  const { data: owners } = useQuery({
    queryKey: ["owner-owners", agencyId],
    enabled: !!agencyId && isAdmin,
    queryFn: () => fetchOwnerProfilesInAgency(agencyId!),
  });

  // Build a map of ownerId -> "First Last"
  const ownerNameMap = useMemo(() => {
    const map: Record<string, string> = {};
    (owners ?? []).forEach((o: any) => {
      const name = [o.first_name, o.last_name].filter(Boolean).join(" ");
      if (o.id) map[o.id] = name || o.id;
    });
    return map;
  }, [owners]);

  const { data: savedReports, refetch: refetchSaved } = useQuery({
    queryKey: ["owner-saved-reports", agencyId, ownerId],
    enabled: !!agencyId && isAdmin,
    queryFn: () => listOwnerReports(agencyId!, ownerId || undefined),
  });

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

  useEffect(() => {
    setStartDate(currentMonth.start);
    setEndDate(currentMonth.end);
  }, [currentMonth]);

  const filteredPayments = useMemo(() => {
    if (!startDate || !endDate) return payments ?? [];
    return (payments ?? []).filter((p: any) => {
      const d = String(p.received_date ?? "").slice(0, 10);
      return d >= startDate && d <= endDate;
    });
  }, [payments, startDate, endDate]);

  const ownerProps = useMemo(() => {
    if (!ownerId) return [];
    return (ownerships ?? []).filter((o) => o.owner_id === ownerId);
  }, [ownerships, ownerId]);

  const ownedPropIds = useMemo(() => new Set(ownerProps.map((o) => o.property_id)), [ownerProps]);

  const percentByProp = useMemo(() => new Map<string, number>(ownerProps.map((o) => [o.property_id, o.ownership_percent == null ? 100 : Number(o.ownership_percent)])), [ownerProps]);

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

  const applySuggestedRate = () => {
    if (suggestedRate == null) {
      toast({ title: "No suggested rate", description: "No exchange rates found for this month.", variant: "default" });
      return;
    }
    setAvgRateInput(String(Number(suggestedRate.toFixed(6))));
    toast({ title: "Applied", description: "Suggested average USD/DOP rate applied." });
  };

  const handleSaveReport = async () => {
    if (!agencyId || !ownerId || !currentMonth) {
      toast({ title: "Missing selection", description: "Choose an owner and a month.", variant: "destructive" });
      return;
    }
    const saved = await createOwnerReport({
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
          <div>
            <div className="text-sm text-muted-foreground">Owner</div>
            <Select value={ownerId} onValueChange={setOwnerId}>
              <SelectTrigger className="w-[260px]">
                <SelectValue placeholder="Select owner" />
              </SelectTrigger>
              <SelectContent>
                {(owners ?? []).map((o) => (
                  <SelectItem key={o.id} value={o.id}>
                    {[o.first_name, o.last_name].filter(Boolean).join(" ") || o.id}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <div className="text-sm text-muted-foreground">Avg USD/DOP rate</div>
            <div className="flex items-center gap-2">
              <Input
                type="number"
                inputMode="decimal"
                value={avgRateInput}
                onChange={(e) => setAvgRateInput(e.target.value)}
                placeholder={suggestedRate != null ? `Suggested: ${suggestedRate.toFixed(6)}` : "Enter rate"}
                className="w-[220px]"
              />
              <Button variant="outline" size="sm" onClick={applySuggestedRate}>Apply suggested</Button>
            </div>
          </div>
          <div className="ml-auto flex items-end gap-2">
            <Button size="sm" onClick={handleSaveReport} disabled={!ownerId}>Save report</Button>
          </div>
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
              {avgRateInput ? avgRateInput : suggestedRate != null ? suggestedRate.toFixed(6) : "—"}
            </CardContent>
          </Card>
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

        {/* Saved Reports list */}
        <Card>
          <CardHeader className="flex items-center justify-between">
            <CardTitle>Saved Owner Reports</CardTitle>
            <div className="text-sm text-muted-foreground">Edit the average rate or delete a saved statement; open invoice-style view.</div>
          </CardHeader>
          <CardContent>
            {!savedReports || savedReports.length === 0 ? (
              <div className="text-sm text-muted-foreground">No saved reports yet.</div>
            ) : isMobile ? (
              <div>
                {savedReports.map((r: any) => (
                  <SavedOwnerReportItemMobile
                    key={r.id}
                    report={r}
                    ownerName={ownerNameMap[r.owner_id] ?? r.owner_id}
                    onEdited={() => refetchSaved()}
                  />
                ))}
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
                      <TableHead className="print:hidden">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {savedReports.map((r: OwnerReportRow) => (
                      <SavedReportRow key={r.id} report={r} onEdited={() => refetchSaved()} ownerNameMap={ownerNameMap} />
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

// Helper row component inside this file for saved entries
function SavedReportRow({ report, onEdited, ownerNameMap }: { report: OwnerReportRow; onEdited: () => void; ownerNameMap: Record<string, string> }) {
  const [openEdit, setOpenEdit] = useState(false);
  const [openInvoice, setOpenInvoice] = useState(false);
  const [openDelete, setOpenDelete] = useState(false);
  const { toast } = useToast();

  // Display full owner name instead of UUID
  const displayOwner = ownerNameMap[report.owner_id] ?? report.owner_id;

  return (
    <TableRow>
      <TableCell>{report.month}</TableCell>
      <TableCell className="font-semibold">{displayOwner}</TableCell>
      <TableCell>{fmt(Number(report.usd_total || 0), "USD")}</TableCell>
      <TableCell>{fmt(Number(report.dop_total || 0), "DOP")}</TableCell>
      <TableCell>{report.avg_rate != null ? Number(report.avg_rate).toFixed(6) : "—"}</TableCell>
      <TableCell className="print:hidden">
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => setOpenEdit(true)}>Edit</Button>
          <Button size="sm" onClick={() => setOpenInvoice(true)}>Invoice-style</Button>
          <Button variant="destructive" size="sm" onClick={() => setOpenDelete(true)}>Delete</Button>
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