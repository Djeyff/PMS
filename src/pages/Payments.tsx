import React, { useMemo } from "react";
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

const Payments = () => {
  const { role, user, profile } = useAuth();

  const { data, isLoading, refetch } = useQuery({
    queryKey: ["payments", role, user?.id, profile?.agency_id],
    queryFn: () => fetchPayments({ role, userId: user?.id ?? null, agencyId: profile?.agency_id ?? null }),
  });

  const canCreate = role === "agency_admin";

  const totals = useMemo(() => {
    const usd = (data ?? []).filter(p => p.currency === "USD").reduce((s, p) => s + Number(p.amount || 0), 0);
    const dop = (data ?? []).filter(p => p.currency === "DOP").reduce((s, p) => s + Number(p.amount || 0), 0);
    return { usd, dop };
  }, [data]);

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
            ) : (data?.length ?? 0) === 0 ? (
              <div className="text-sm text-muted-foreground">No payments yet.</div>
            ) : (
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
                  {(data ?? []).map((p: any) => {
                    const propName = p.lease?.property?.name ?? "—";
                    const tenantName = [p.tenant?.first_name, p.tenant?.last_name].filter(Boolean).join(" ") || "—";
                    return (
                      <TableRow key={p.id}>
                        <TableCell className="font-medium">{propName}</TableCell>
                        <TableCell>{tenantName}</TableCell>
                        <TableCell>{p.received_date}</TableCell>
                        <TableCell>{methodLabel(p.method)}</TableCell>
                        <TableCell>{fmt(Number(p.amount), p.currency)}</TableCell>
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
                              </>
                            )}
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </div>
    </AppShell>
  );
};

export default Payments;