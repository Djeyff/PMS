import React, { useMemo, useState } from "react";
import AppShell from "@/components/layout/AppShell";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useAuth } from "@/contexts/AuthProvider";
import { useQuery } from "@tanstack/react-query";
import { fetchPayments } from "@/services/payments";
import PaymentForm from "@/components/payments/PaymentForm";
import DeletePaymentDialog from "@/components/payments/DeletePaymentDialog";
import EditPaymentDialog from "@/components/payments/EditPaymentDialog";
import { generatePaymentReceiptPDF } from "@/services/payment-pdf";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem } from "@/components/ui/dropdown-menu";
import { useIsMobile } from "@/hooks/use-mobile";
import PaymentListItemMobile from "@/components/payments/PaymentListItemMobile";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { sharePdfToWhatsApp } from "@/utils/whatsapp";
import { downloadFileFromUrl, buildPdfFileName } from "@/utils/download";
import { fetchMyOwnerships } from "@/services/property-owners";

const Payments = () => {
  const { role, user, profile } = useAuth();
  const isMobile = useIsMobile();

  const { data, isLoading, refetch } = useQuery({
    queryKey: ["payments", role, user?.id, profile?.agency_id],
    queryFn: () => fetchPayments({ role, userId: user?.id ?? null, agencyId: profile?.agency_id ?? null }),
  });

  // NEW: owner's share map
  const { data: myShares } = useQuery({
    queryKey: ["payments-owner-shares", user?.id],
    enabled: role === "owner" && !!user?.id,
    queryFn: () => fetchMyOwnerships(user!.id),
  });

  // NEW: Month selector state and options
  const [monthValue, setMonthValue] = useState<string>("all");

  const monthOptions = useMemo(() => {
    const opts: Array<{ value: string; label: string; start: string; end: string }> = [];
    const now = new Date();
    for (let i = 0; i < 12; i++) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const year = d.getFullYear();
      const monthIndex = d.getMonth();
      const start = new Date(year, monthIndex, 1);
      const end = new Date(year, monthIndex + 1, 0);
      const startStr = start.toISOString().slice(0, 10);
      const endStr = end.toISOString().slice(0, 10);
      const label = start.toLocaleString(undefined, { month: "long", year: "numeric" });
      const capLabel = label.charAt(0).toUpperCase() + label.slice(1);
      const value = `${year}-${String(monthIndex + 1).padStart(2, "0")}`;
      opts.push({ value, label: capLabel, start: startStr, end: endStr });
    }
    return opts;
  }, []);

  const filteredPayments = useMemo(() => {
    const rows = data ?? [];
    if (monthValue === "all") return rows;
    const found = monthOptions.find((m) => m.value === monthValue);
    if (!found) return rows;
    return rows.filter((p: any) => p.received_date >= found.start && p.received_date <= found.end);
  }, [data, monthValue, monthOptions]);

  // NEW: helper to compute owner share for a payment
  const ownerShareOf = (p: any) => {
    if (role !== "owner") return Number(p.amount || 0);
    const propId = p.lease?.property?.id ?? p.lease?.property_id ?? null;
    const percent = propId ? (myShares?.get(propId) ?? 100) : 100;
    const factor = Math.max(0, Math.min(100, Number(percent))) / 100;
    return Number(p.amount || 0) * factor;
  };

  const canCreate = role === "agency_admin";

  const totals = useMemo(() => {
    const usd = (filteredPayments ?? []).filter((p: any) => p.currency === "USD").reduce((s: number, p: any) => s + ownerShareOf(p), 0);
    const dop = (filteredPayments ?? []).filter((p: any) => p.currency === "DOP").reduce((s: number, p: any) => s + ownerShareOf(p), 0);
    return { usd, dop };
  }, [filteredPayments, role, myShares]);

  const fmt = (amt: number, cur: string) => new Intl.NumberFormat(undefined, { style: "currency", currency: cur }).format(amt);

  const methodLabel = (m: string | null | undefined) => {
    const key = String(m ?? "").toLowerCase();
    const map: Record<string, string> = {
      bank_transfer: "Bank Transfer",
      cash: "Cash",
      card: "Card",
      check: "Check",
    };
    if (map[key]) return map[key];
    const cleaned = key.replace(/_/g, " ").trim();
    return cleaned
      .split(" ")
      .map((w) => (w ? w[0].toUpperCase() + w.slice(1) : w))
      .join(" ") || "—";
  };

  return (
    <AppShell>
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h1 className="text-xl font-semibold">Payments</h1>
          {canCreate ? <PaymentForm onCreated={() => refetch()} /> : null}
        </div>

        {/* NEW: Month selector */}
        <div className="flex flex-wrap items-end gap-3">
          <div>
            <div className="text-sm text-muted-foreground">Month</div>
            <Select value={monthValue} onValueChange={setMonthValue}>
              <SelectTrigger className="w-[220px]">
                <SelectValue placeholder="Select month" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All</SelectItem>
                {monthOptions.map((m) => (
                  <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        <div className="grid gap-4 grid-cols-1 sm:grid-cols-2">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm text-muted-foreground">Total USD</CardTitle>
            </CardHeader>
            <CardContent className="text-2xl font-bold">
              {fmt(totals.usd, "USD")}
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm text-muted-foreground">Total DOP</CardTitle>
            </CardHeader>
            <CardContent className="text-2xl font-bold">
              {fmt(totals.dop, "DOP")}
            </CardContent>
          </Card>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>All Payments</CardTitle>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="text-sm text-muted-foreground">Loading...</div>
            ) : (filteredPayments.length ?? 0) === 0 ? (
              <div className="text-sm text-muted-foreground">No payments yet.</div>
            ) : isMobile ? (
              <div>
                {filteredPayments.map((p: any) => (
                  <PaymentListItemMobile
                    key={p.id}
                    payment={{ ...p, ownerShareAmount: ownerShareOf(p) }} // owner view shows share
                    onRefetch={() => refetch()}
                  />
                ))}
              </div>
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Property</TableHead>
                      <TableHead>Tenant</TableHead>
                      <TableHead>Date</TableHead>
                      <TableHead>Method</TableHead>
                      <TableHead>Amount</TableHead>
                      {canCreate && <TableHead>Actions</TableHead>}
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredPayments.map((p: any) => {
                      const propName = p.lease?.property?.name ?? "—";
                      const tenantName = [p.tenant?.first_name, p.tenant?.last_name].filter(Boolean).join(" ") || "—";
                      const displayAmount = ownerShareOf(p);
                      return (
                        <TableRow key={p.id}>
                          <TableCell className="font-medium">{propName}</TableCell>
                          <TableCell>{tenantName}</TableCell>
                          <TableCell>{p.received_date}</TableCell>
                          <TableCell>{methodLabel(p.method)}</TableCell>
                          <TableCell>{fmt(displayAmount, p.currency)}</TableCell>
                          {/* Always allow viewing a receipt */}
                          <TableCell>
                            <div className="flex gap-2">
                              <DropdownMenu>
                                <DropdownMenuTrigger asChild>
                                  <Button size="sm" variant="outline">
                                    View
                                  </Button>
                                </DropdownMenuTrigger>
                                <DropdownMenuContent>
                                  <DropdownMenuItem
                                    onClick={async () => {
                                      try {
                                        const out = await generatePaymentReceiptPDF(p.id, "en");
                                        if (out.url) {
                                          window.open(out.url, "_blank");
                                          toast.success("Payment receipt generated in English");
                                        } else {
                                          toast.info("Receipt generated but no URL returned");
                                        }
                                      } catch (e: any) {
                                        toast.error(e?.message ?? "Failed to open receipt");
                                      }
                                    }}
                                  >
                                    English
                                  </DropdownMenuItem>
                                  <DropdownMenuItem
                                    onClick={async () => {
                                      try {
                                        const out = await generatePaymentReceiptPDF(p.id, "es");
                                        if (out.url) {
                                          window.open(out.url, "_blank");
                                          toast.success("Recibo generado en Español");
                                        } else {
                                          toast.info("Recibo generado pero sin URL");
                                        }
                                      } catch (e: any) {
                                        toast.error(e?.message ?? "Error al abrir el recibo");
                                      }
                                    }}
                                  >
                                    Spanish
                                  </DropdownMenuItem>
                                </DropdownMenuContent>
                              </DropdownMenu>
                              {canCreate && (
                                <>
                                  <EditPaymentDialog payment={p} onUpdated={() => refetch()} />
                                  <DeletePaymentDialog
                                    id={p.id}
                                    summary={`${tenantName} • ${propName} • ${p.received_date} • ${fmt(Number(p.amount), p.currency)}`}
                                    metadata={{
                                      amount: p.amount,
                                      currency: p.currency,
                                      method: p.method,
                                      received_date: p.received_date,
                                      reference: p.reference ?? null,
                                      tenant_id: p.tenant_id,
                                      tenant_name: tenantName,
                                      property_id: p.lease?.property?.id ?? null,
                                      property_name: propName,
                                      lease_id: p.lease_id,
                                      invoice_id: p.invoice_id ?? null,
                                    }}
                                    onDeleted={() => refetch()}
                                  />
                                  <Button
                                    size="sm"
                                    variant="secondary"
                                    onClick={async () => {
                                      try {
                                        // Default to Spanish for WhatsApp
                                        const out = await generatePaymentReceiptPDF(p.id, "es");
                                        const url = out.url;
                                        if (!url) {
                                          toast.info("Recibo generado pero sin URL");
                                          return;
                                        }
                                        const fmtAmt = new Intl.NumberFormat(undefined, { style: "currency", currency: p.currency }).format(Number(p.amount));
                                        const text = `Hola ${tenantName}, aquí está su recibo de pago por ${fmtAmt} del ${p.received_date}.`;
                                        const filename = buildPdfFileName(tenantName || "Cliente", propName || "Propiedad", p.received_date);
                                        await sharePdfToWhatsApp(url, filename, text);
                                      } catch (e: any) {
                                        toast.error(e?.message ?? "Error al compartir por WhatsApp");
                                      }
                                    }}
                                  >
                                    QuickShare
                                  </Button>
                                  {/* NEW: Download receipt PDF */}
                                  <Button
                                    size="sm"
                                    variant="outline"
                                    onClick={async () => {
                                      try {
                                        const out = await generatePaymentReceiptPDF(p.id, "es");
                                        const url = out.url;
                                        if (!url) {
                                          toast.info("Recibo generado pero sin URL");
                                          return;
                                        }
                                        const filename = buildPdfFileName(
                                          tenantName || "Cliente",
                                          propName || "Propiedad",
                                          p.received_date
                                        );
                                        await downloadFileFromUrl(url, filename);
                                      } catch (e: any) {
                                        toast.error(e?.message ?? "No se pudo descargar el PDF");
                                      }
                                    }}
                                  >
                                    Download PDF
                                  </Button>
                                </>
                              )}
                            </div>
                          </TableCell>
                        </TableRow>
                      );
                    })}
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

export default Payments;