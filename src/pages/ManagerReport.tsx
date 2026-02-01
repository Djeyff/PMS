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
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/components/ui/use-toast";
import { listManagerReports, createManagerReport, deleteManagerReport } from "@/services/manager-reports";
import { logManagerReport } from "@/services/activity-logs";
import EditManagerReportDialog from "@/components/manager/EditManagerReportDialog";
import ManagerReportInvoiceDialog from "@/components/manager/ManagerReportInvoiceDialog";
import { createOwnerReport, deleteOwnerReportsForPeriod } from "@/services/owner-reports";
import { useIsMobile } from "@/hooks/use-mobile";
import OwnerBreakdownItemMobile from "@/components/manager/OwnerBreakdownItemMobile";
import SavedManagerReportItemMobile from "@/components/manager/SavedManagerReportItemMobile";
import ManagerReportFilters from "@/components/manager/ManagerReportFilters";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { printElement } from "@/utils/print";

type OwnerRow = {
  ownerId: string;
  name: string;
  cashUsd: number;
  cashDop: number;
  transferUsd: number;
  transferDop: number;
  cashDopAfterFee?: number;
};

// Utility to export CSV
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

const ManagerReport = () => {
  const { role, user, profile } = useAuth();
  const { toast } = useToast();
  const isAdmin = role === "agency_admin";
  const agencyId = profile?.agency_id ?? null;
  const reportPrintRef = React.useRef<HTMLDivElement | null>(null);

  const months = useMemo(() => monthList(12), []);
  const [monthValue, setMonthValue] = useState<string>(months[0]?.value ?? "");
  const currentMonth = useMemo(() => months.find((m) => m.value === monthValue), [months, monthValue]);
  const [startDate, setStartDate] = useState<string>(months[0]?.start ?? "");
  const [endDate, setEndDate] = useState<string>(months[0]?.end ?? "");

  // NEW: manual generate state
  const [generated, setGenerated] = useState<boolean>(false);
  useEffect(() => {
    // Reset generated state on month change; only sync dates when a real month is selected
    setGenerated(false);
    // Clear avg rate so a new month's suggestion can auto-fill
    setAvgRateInput("");
    const m = months.find((mm) => mm.value === monthValue);
    if (m) {
      setStartDate(m.start);
      setEndDate(m.end);
    }
  }, [monthValue, months]);

  const [avgRateInput, setAvgRateInput] = useState<string>(""); // user-editable average USD/DOP for the month
  const [suggestedRate, setSuggestedRate] = useState<number | null>(null);

  const { data: payments, isLoading: loadingPayments, refetch } = useQuery({
    queryKey: ["mgr-payments", role, user?.id, agencyId],
    enabled: !!role && !!agencyId,
    queryFn: () => fetchPayments({ role, userId: user?.id ?? null, agencyId }),
  });

  // NEW: Saved reports list
  const { data: savedReports, refetch: refetchSaved } = useQuery({
    queryKey: ["mgr-saved-reports", agencyId],
    enabled: !!agencyId && isAdmin,
    queryFn: () => listManagerReports(agencyId!),
  });

  const { data: ownerships } = useQuery({
    queryKey: ["mgr-ownerships", agencyId],
    enabled: !!agencyId && isAdmin,
    queryFn: () => fetchAgencyOwnerships(agencyId!),
  });

  // Declare filteredPayments BEFORE useEffect(loadRate) to avoid TS2448
  const filteredPayments = useMemo(() => {
    const rows = payments ?? [];
    if (!startDate || !endDate) return rows;
    return rows.filter((p: any) => {
      const d = String(p.received_date ?? "").slice(0, 10);
      return d >= startDate && d <= endDate;
    });
  }, [payments, startDate, endDate]);

  useEffect(() => {
    const loadRate = async () => {
      if (!startDate || !endDate) return;

      // First, try to derive the average from payments in the selected period
      const paymentRates = (filteredPayments ?? [])
        .map((p: any) => (typeof p.exchange_rate === "number" ? Number(p.exchange_rate) : null))
        .filter((n) => n != null && Number.isFinite(n) && n > 0) as number[];

      if (paymentRates.length > 0) {
        const avgFromPayments = paymentRates.reduce((s, n) => s + n, 0) / paymentRates.length;
        setSuggestedRate(avgFromPayments);
        return;
      }

      // Fallback: query monthly average from exchange_rates table
      try {
        const avg = await fetchMonthlyAvgRate(startDate, endDate);
        setSuggestedRate(avg);
      } catch {
        setSuggestedRate(null);
      }
    };
    loadRate();
  }, [startDate, endDate, filteredPayments]);

  // NEW: Auto-fill the input when a suggested rate is available (users can still edit/clear it)
  useEffect(() => {
    if (suggestedRate != null && (avgRateInput.trim() === "")) {
      setAvgRateInput(suggestedRate.toFixed(6));
    }
  }, [suggestedRate, avgRateInput]);

  // Build owner breakdown (pro-rata by ownership percent for each property)
  const ownerRows: OwnerRow[] = useMemo(() => {
    if (!ownerships) return [];
    const map = new Map<string, OwnerRow>();

    filteredPayments.forEach((p: any) => {
      const propId = p.lease?.property?.id || p.lease?.property_id || null;
      const ownersForProp = ownerships.filter((o) => o.property_id === propId);

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
  }, [ownerships, filteredPayments]);

  // Totals summary computed directly from payments (independent of ownership)
  const totals = useMemo(() => {
    const usdCash = filteredPayments
      .filter((p: any) => String(p.method).toLowerCase() !== "bank_transfer" && p.currency === "USD")
      .reduce((s: number, p: any) => s + Number(p.amount || 0), 0);
    const dopCash = filteredPayments
      .filter((p: any) => String(p.method).toLowerCase() !== "bank_transfer" && p.currency === "DOP")
      .reduce((s: number, p: any) => s + Number(p.amount || 0), 0);
    const usdTransfer = filteredPayments
      .filter((p: any) => String(p.method).toLowerCase() === "bank_transfer" && p.currency === "USD")
      .reduce((s: number, p: any) => s + Number(p.amount || 0), 0);
    const dopTransfer = filteredPayments
      .filter((p: any) => String(p.method).toLowerCase() === "bank_transfer" && p.currency === "DOP")
      .reduce((s: number, p: any) => s + Number(p.amount || 0), 0);
    return { usdCash, dopCash, usdTransfer, dopTransfer };
  }, [filteredPayments]);

  // Compute manager fee (5% of ALL transactions, USD converted to DOP with avg rate)
  const rateNum = useMemo(() => {
    const n = Number(avgRateInput);
    return Number.isFinite(n) && n > 0 ? n : NaN;
  }, [avgRateInput]);

  const usdTotal = totals.usdCash + totals.usdTransfer;
  const dopTotal = totals.dopCash + totals.dopTransfer;
  const feeBaseDop = (Number.isNaN(rateNum) ? 0 : usdTotal * rateNum) + dopTotal;
  const managerFeeDop = feeBaseDop * 0.05;

  // Per-owner fee computed on owner base = (owner USD × rate) + owner DOP; deduct from DOP cash, capped
  const ownerRowsWithFee = useMemo(() => {
    return ownerRows.map((r) => {
      const ownerUsdTotal = r.cashUsd + r.transferUsd;
      const ownerDopTotal = r.cashDop + r.transferDop;
      const ownerBaseDop = (Number.isNaN(rateNum) ? 0 : ownerUsdTotal * rateNum) + ownerDopTotal;
      const ownerFee = ownerBaseDop * 0.05;
      const ownerFeeDeducted = Math.min(ownerFee, r.cashDop);
      return { ...r, cashDopAfterFee: Math.max(0, r.cashDop - ownerFeeDeducted), feeShareDop: ownerFeeDeducted };
    });
  }, [ownerRows, rateNum]);

  const dopCashAfterFeeTotal = useMemo(
    () => ownerRowsWithFee.reduce((s, r) => s + (r.cashDopAfterFee ?? r.cashDop), 0),
    [ownerRowsWithFee]
  );

  // FIX: aggregate total fee deducted across owners for messaging/totals
  const actualFeeDeducted = useMemo(
    () => ownerRowsWithFee.reduce((s, r) => s + (r.feeShareDop ?? 0), 0),
    [ownerRowsWithFee]
  );

  const applySuggestedRate = () => {
    if (suggestedRate == null) {
      toast({ title: "No suggested rate", description: "No exchange rates found for this month.", variant: "default" });
      return;
    }
    setAvgRateInput(String(Number(suggestedRate.toFixed(6))));
    toast({ title: "Applied", description: "Suggested average USD/DOP rate applied." });
  };

  // NEW: handler to generate report manually
  const handleGenerate = () => {
    const label = currentMonth?.label ?? "Custom range";
    setGenerated(true);
    toast({ title: "Report generated", description: `Generated for ${label} (${startDate} to ${endDate}).` });
  };

  // NEW: Save current generated report
  const handleSaveReport = async () => {
    if (!generated || !currentMonth || !agencyId) return;
    if (usdTotal > 0 && Number.isNaN(rateNum)) {
      toast({ title: "Average rate required", description: "Enter a valid USD/DOP average rate to save.", variant: "destructive" });
      return;
    }

    // NEW: Clear any existing owner reports for this agency and period before regenerating
    await deleteOwnerReportsForPeriod(agencyId!, currentMonth.value, startDate, endDate);

    const fee_base_dop = (Number.isNaN(rateNum) ? 0 : usdTotal * rateNum) + dopTotal;
    const fee_dop = fee_base_dop * 0.05;
    const fee_deducted_dop = Math.min(fee_dop, totals.dopCash);

    const saved = await createManagerReport({
      agency_id: agencyId!,
      month: currentMonth.value,
      start_date: startDate,
      end_date: endDate,
      avg_rate: Number.isNaN(rateNum) ? null : rateNum,
      fee_percent: 5,
      usd_cash_total: totals.usdCash,
      dop_cash_total: totals.dopCash,
      usd_transfer_total: totals.usdTransfer,
      dop_transfer_total: totals.dopTransfer,
      usd_total: usdTotal,
      dop_total: dopTotal,
      fee_base_dop,
      fee_dop,
      fee_deducted_dop,
    });

    if (user?.id) {
      await logManagerReport("created", user.id, {
        id: saved.id,
        month: saved.month,
        start_date: saved.start_date,
        end_date: saved.end_date,
        avg_rate: saved.avg_rate,
        fee_percent: saved.fee_percent,
      });
    }

    // NEW: Auto-generate Owner Reports for each owner found in the breakdown
    const createdCount = await (async () => {
      let count = 0;
      for (const r of ownerRows) {
        if (!r.ownerId || r.ownerId === "__unassigned__") continue;
        await createOwnerReport({
          agency_id: agencyId!,
          owner_id: r.ownerId,
          month: currentMonth.value,
          start_date: startDate,
          end_date: endDate,
          avg_rate: Number.isNaN(rateNum) ? null : rateNum,
          usd_cash_total: r.cashUsd,
          dop_cash_total: r.cashDop,
          usd_transfer_total: r.transferUsd,
          dop_transfer_total: r.transferDop,
          usd_total: r.cashUsd + r.transferUsd,
          dop_total: r.cashDop + r.transferDop,
        });
        count++;
      }
      return count;
    })();

    toast({ title: "Report saved", description: `Saved ${currentMonth.label}. Generated ${createdCount} owner reports.` });
    refetchSaved();
  };

  const isMobile = useIsMobile();

  return (
    <AppShell>
      <div className="space-y-6">
        <div ref={reportPrintRef}>
          <ManagerReportFilters
            months={months}
            monthValue={monthValue}
            onMonthChange={setMonthValue}
            startDate={startDate}
            endDate={endDate}
            onStartDateChange={setStartDate}
            onEndDateChange={setEndDate}
            avgRateInput={avgRateInput}
            onAvgRateChange={setAvgRateInput}
            suggestedRate={suggestedRate}
            onApplySuggested={applySuggestedRate}
            generated={generated}
            onGenerate={handleGenerate}
            onReset={() => setGenerated(false)}
            onSave={handleSaveReport}
          />

          {/* Warning if rate missing but USD exists */}
          {/* Show warnings only once generated */}
          {generated && (usdTotal > 0 && Number.isNaN(rateNum)) && (
            <div className="text-sm text-destructive">
              Enter the average USD/DOP rate to include USD transactions in the 5% fee calculation.
            </div>
          )}
          {generated && (managerFeeDop > totals.dopCash && managerFeeDop > 0) && (
            <div className="text-sm text-muted-foreground">
              Fee exceeds available DOP cash; only {fmt(actualFeeDeducted, "DOP")} will be deducted this month.
            </div>
          )}

          {/* NEW: Gate report output behind 'generated' */}
          {!generated ? (
            <Card>
              <CardHeader>
                <CardTitle>Report not generated</CardTitle>
              </CardHeader>
              <CardContent className="text-sm text-muted-foreground">
                Select a month and click "Generate report" to compute totals and owner breakdown.
              </CardContent>
            </Card>
          ) : (
            <>
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
                  <CardHeader className="pb-2"><CardTitle className="text-sm text-muted-foreground">Manager fee (5% of all transactions)</CardTitle></CardHeader>
                  <CardContent>
                    <div className="text-xs text-muted-foreground mb-1">
                      Fee base: {fmt(dopTotal, "DOP")} DOP + {usdTotal.toFixed(2)} USD × {Number.isNaN(rateNum) ? "rate ?" : rateNum} = {fmt(feeBaseDop, "DOP")}
                    </div>
                    <div className="text-2xl font-bold">{fmt(managerFeeDop, "DOP")}</div>
                  </CardContent>
                </Card>
              </div>

              <Card>
                <CardHeader className="flex flex-row items-center justify-between">
                  <CardTitle>Owner Breakdown</CardTitle>
                  <div className="flex items-center gap-2 print:hidden">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        const rows = ownerRowsWithFee.map((r) => {
                          const feeShare = (r.cashDop ?? 0) - (r.cashDopAfterFee ?? r.cashDop ?? 0);
                          return [
                            r.name,
                            r.cashUsd.toFixed(2),
                            r.cashDop.toFixed(2),
                            feeShare.toFixed(2),
                            (r.cashDopAfterFee ?? r.cashDop).toFixed(2),
                            r.transferUsd.toFixed(2),
                            r.transferDop.toFixed(2),
                          ];
                        });
                        exportCSV("manager_owner_breakdown.csv",
                          ["Owner", "Cash USD", "Cash DOP", "Fee share (DOP)", "Cash DOP after fee", "Transfer USD", "Transfer DOP"],
                          rows
                        );
                      }}
                    >
                      Export CSV
                    </Button>
                    <Button
                      size="sm"
                      onClick={() => {
                        if (!reportPrintRef.current) return;
                        printElement(reportPrintRef.current, { title: "Manager Report" });
                      }}
                    >
                      Download PDF
                    </Button>
                  </div>
                </CardHeader>
                <CardContent>
                  {loadingPayments ? (
                    <div className="text-sm text-muted-foreground">Loading...</div>
                  ) : ownerRowsWithFee.length === 0 ? (
                    <div className="text-sm text-muted-foreground">No payments found for this month.</div>
                  ) : isMobile ? (
                    <div>
                      {ownerRowsWithFee.map((r) => (
                        <OwnerBreakdownItemMobile key={r.ownerId} row={r} />
                      ))}
                      <div className="mt-3 text-sm">
                        <div className="font-semibold">Totals</div>
                        <div>Cash USD: {fmt(totals.usdCash, "USD")}</div>
                        <div>Cash DOP: {fmt(totals.dopCash, "DOP")}</div>
                        <div>Fee share (DOP): {fmt(actualFeeDeducted, "DOP")}</div>
                        <div>Cash DOP after fee: {fmt(dopCashAfterFeeTotal, "DOP")}</div>
                        <div>Transfer USD: {fmt(totals.usdTransfer, "USD")}</div>
                        <div>Transfer DOP: {fmt(totals.dopTransfer, "DOP")}</div>
                      </div>
                    </div>
                  ) : (
                    <div className="overflow-x-auto">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>Owner</TableHead>
                            <TableHead>Cash USD</TableHead>
                            <TableHead>Cash DOP</TableHead>
                            <TableHead>Fee share (DOP)</TableHead>
                            <TableHead>Cash DOP (after fee)</TableHead>
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
                                <TableCell>{fmt(r.feeShareDop ?? 0, "DOP")}</TableCell>
                                <TableCell>{fmt(r.cashDopAfterFee ?? r.cashDop, "DOP")}</TableCell>
                                <TableCell>{fmt(r.transferUsd, "USD")}</TableCell>
                                <TableCell>{fmt(r.transferDop, "DOP")}</TableCell>
                              </TableRow>
                            );
                          })}
                          <TableRow>
                            <TableCell className="font-semibold">Totals</TableCell>
                            <TableCell className="font-semibold">{fmt(totals.usdCash, "USD")}</TableCell>
                            <TableCell className="font-semibold">{fmt(totals.dopCash, "DOP")}</TableCell>
                            <TableCell className="font-semibold">
                              {fmt(ownerRowsWithFee.reduce((s, r) => s + (r.feeShareDop ?? 0), 0), "DOP")}
                            </TableCell>
                            <TableCell className="font-semibold">{fmt(dopCashAfterFeeTotal, "DOP")}</TableCell>
                            <TableCell className="font-semibold">{fmt(totals.usdTransfer, "USD")}</TableCell>
                            <TableCell className="font-semibold">{fmt(totals.dopTransfer, "DOP")}</TableCell>
                          </TableRow>
                        </TableBody>
                      </Table>
                    </div>
                  )}
                </CardContent>
              </Card>
            </>
          )}

          {/* Saved Reports list */}
          <Card>
            <CardHeader className="flex items-center justify-between">
              <CardTitle>Saved Reports</CardTitle>
              <div className="text-sm text-muted-foreground">Edit average rate or fee percent later and recalculate.</div>
            </CardHeader>
            <CardContent>
              {!savedReports || savedReports.length === 0 ? (
                <div className="text-sm text-muted-foreground">No saved reports yet.</div>
              ) : isMobile ? (
                <div>
                  {savedReports.map((r) => (
                    <SavedManagerReportItemMobile key={r.id} report={r} onEdited={() => refetchSaved()} />
                  ))}
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Month</TableHead>
                        <TableHead>USD total</TableHead>
                        <TableHead>DOP total</TableHead>
                        <TableHead>Avg rate</TableHead>
                        <TableHead>Fee %</TableHead>
                        <TableHead>Fee base (DOP)</TableHead>
                        <TableHead>Fee (DOP)</TableHead>
                        <TableHead>Deducted (DOP)</TableHead>
                        <TableHead>Owners leftover (DOP)</TableHead>
                        <TableHead className="print:hidden">Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {savedReports.map((r) => (
                        <SavedReportRow key={r.id} report={r} onEdited={() => refetchSaved()} />
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </AppShell>
  );
};

// Helper row component inside this file
function SavedReportRow({ report, onEdited }: { report: any; onEdited: () => void }) {
  const [open, setOpen] = useState(false);
  const [openInvoice, setOpenInvoice] = useState(false);
  const [openDelete, setOpenDelete] = useState(false);
  const ownersLeftoverDop = Math.max(0, Number(report.dop_cash_total || 0) - Number(report.fee_deducted_dop || 0));
  const { toast } = useToast();
  const { user } = useAuth();

  // Helper to format "YYYY-MM" → "Month YYYY"
  const formatMonthLabel = (ym: string) => {
    const parts = String(ym ?? "").split("-");
    if (parts.length !== 2) return ym;
    const y = Number(parts[0]);
    const m = Number(parts[1]) - 1;
    if (!Number.isFinite(y) || !Number.isFinite(m)) return ym;
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

  const confirmDelete = async () => {
    try {
      await deleteManagerReport(report.id);
      if (user?.id) {
        await logManagerReport("deleted", user.id, {
          id: report.id,
          month: report.month,
          start_date: report.start_date,
          end_date: report.end_date,
          avg_rate: report.avg_rate,
          fee_percent: report.fee_percent,
        });
      }

      // NEW: Also delete owner reports for the same period so only new ones remain after regeneration
      await deleteOwnerReportsForPeriod(report.agency_id, report.month, report.start_date, report.end_date);

      toast({ title: "Report deleted", description: `Deleted ${report.month} and cleared owner reports for the same period.` });
      setOpenDelete(false);
      onEdited();
    } catch (e: any) {
      toast({ title: "Delete failed", description: e.message, variant: "destructive" });
    }
  };

  return (
    <TableRow>
      <TableCell>{monthOrRangeLabel}</TableCell>
      <TableCell>{fmt(Number(report.usd_total || 0), "USD")}</TableCell>
      <TableCell>{fmt(Number(report.dop_total || 0), "DOP")}</TableCell>
      <TableCell>{report.avg_rate != null ? Number(report.avg_rate).toFixed(6) : "—"}</TableCell>
      <TableCell>{Number(report.fee_percent || 0).toFixed(2)}%</TableCell>
      <TableCell>{fmt(Number(report.fee_base_dop || 0), "DOP")}</TableCell>
      <TableCell>{fmt(Number(report.fee_dop || 0), "DOP")}</TableCell>
      <TableCell>{fmt(Number(report.fee_deducted_dop || 0), "DOP")}</TableCell>
      <TableCell>{fmt(ownersLeftoverDop, "DOP")}</TableCell>
      <TableCell className="print:hidden">
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => setOpen(true)}>Edit</Button>
          <Button size="sm" onClick={() => setOpenInvoice(true)}>Invoice-style</Button>
          <Button variant="destructive" size="sm" onClick={() => setOpenDelete(true)}>Delete</Button>
        </div>
        <EditManagerReportDialog
          report={report}
          open={open}
          onOpenChange={(v) => {
            setOpen(v);
            if (!v) onEdited();
          }}
          onSaved={() => onEdited()}
        />
        <ManagerReportInvoiceDialog
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
              <AlertDialogTitle>Delete manager report?</AlertDialogTitle>
            </AlertDialogHeader>
            <div className="text-sm text-muted-foreground">
              This removes the saved report for {report.month}. The action is logged in Activity Log. You can recreate it later by generating and saving again.
            </div>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction onClick={confirmDelete}>Delete</AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </TableCell>
    </TableRow>
  );
}

export default ManagerReport;