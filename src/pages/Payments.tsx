import React, { useMemo } from "react";
import AppShell from "@/components/layout/AppShell";
import { useAuth } from "@/contexts/AuthProvider";
import { useQuery } from "@tanstack/react-query";
import { fetchPayments, type PaymentWithMeta } from "@/services/payments";
import PaymentForm from "@/components/payments/PaymentForm";
import DeletePaymentDialog from "@/components/payments/DeletePaymentDialog";
import EditPaymentDialog from "@/components/payments/EditPaymentDialog";
import { useIsMobile } from "@/hooks/use-mobile";
import PaymentListItemMobile from "@/components/payments/PaymentListItemMobile";
import { fetchMyOwnerships } from "@/services/property-owners";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { generatePaymentReceiptPDF } from "@/services/payment-pdf";
import { toast } from "sonner";
import { sharePdfToWhatsApp } from "@/utils/whatsapp";
import { buildPdfFileName, downloadFileFromUrl } from "@/utils/download";

const currencyOrder = ["USD", "DOP"] as const;

type Currency = PaymentWithMeta["currency"];

const formatCurrency = (amount: number, currency: Currency) => {
  const value = Number(amount || 0).toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  return currency === "DOP" ? `RD$${value}` : `$${value}`;
};

const formatDate = (value: string | null | undefined) => {
  if (!value) return "—";
  const [year, month, day] = value.split("-").map(Number);
  if (!year || !month || !day) return value;
  return new Date(year, month - 1, day).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
};

const monthKey = (value: string | null | undefined) => (value ? value.slice(0, 7) : "Unknown");

const tenantNameOf = (payment: PaymentWithMeta) =>
  [payment.tenant?.first_name, payment.tenant?.last_name].filter(Boolean).join(" ") || "—";

const propertyNameOf = (payment: PaymentWithMeta) => payment.lease?.property?.name ?? "—";

const Payments = () => {
  const { role, user, profile } = useAuth();
  const isMobile = useIsMobile();

  const { data, isLoading, refetch } = useQuery<PaymentWithMeta[]>({
    queryKey: ["payments", role, user?.id, profile?.agency_id],
    queryFn: () => fetchPayments({ role, userId: user?.id ?? null, agencyId: profile?.agency_id ?? null }),
  });

  const { data: myShares } = useQuery({
    queryKey: ["payments-owner-shares", user?.id],
    enabled: role === "owner" && !!user?.id,
    queryFn: () => fetchMyOwnerships(user!.id),
  });

  const canCreate = role === "agency_admin";

  const ownerShareOf = React.useCallback((payment: PaymentWithMeta) => {
    if (role !== "owner") return Number(payment.amount || 0);
    const propertyId = payment.lease?.property?.id ?? null;
    const percent = propertyId ? (myShares?.get(propertyId) ?? 100) : 100;
    const factor = Math.max(0, Math.min(100, Number(percent))) / 100;
    return Number(payment.amount || 0) * factor;
  }, [role, myShares]);

  const sortedPayments = useMemo(() => {
    return [...(data ?? [])].sort((a, b) => {
      const byDate = String(b.received_date ?? "").localeCompare(String(a.received_date ?? ""));
      if (byDate !== 0) return byDate;
      return String(b.created_at ?? "").localeCompare(String(a.created_at ?? ""));
    });
  }, [data]);

  const groups = useMemo(() => {
    const grouped = new Map<string, PaymentWithMeta[]>();
    sortedPayments.forEach((payment) => {
      const key = monthKey(payment.received_date);
      grouped.set(key, [...(grouped.get(key) ?? []), payment]);
    });
    return Array.from(grouped.entries()).map(([key, payments]) => ({ key, payments }));
  }, [sortedPayments]);

  const totals = useMemo(() => {
    const all: Record<Currency, number> = { USD: 0, DOP: 0 };
    const month: Record<Currency, number> = { USD: 0, DOP: 0 };
    const currentMonth = new Date().toISOString().slice(0, 7);

    sortedPayments.forEach((payment) => {
      const currency = payment.currency;
      const amount = ownerShareOf(payment);
      all[currency] = (all[currency] ?? 0) + amount;
      if (monthKey(payment.received_date) === currentMonth) {
        month[currency] = (month[currency] ?? 0) + amount;
      }
    });

    return { all, month };
  }, [sortedPayments, ownerShareOf]);

  const groupTotals = (payments: PaymentWithMeta[]) => {
    const totals: Record<Currency, number> = { USD: 0, DOP: 0 };
    payments.forEach((payment) => {
      const currency = payment.currency;
      totals[currency] = (totals[currency] ?? 0) + ownerShareOf(payment);
    });
    return totals;
  };

  const openReceipt = async (payment: PaymentWithMeta, language: "en" | "es") => {
    try {
      const out = await generatePaymentReceiptPDF(payment.id, language);
      if (out.url) {
        window.open(out.url, "_blank");
        toast.success(language === "en" ? "Payment receipt generated in English" : "Recibo generado en Español");
      } else {
        toast.info(language === "en" ? "Receipt generated but no URL returned" : "Recibo generado pero sin URL");
      }
    } catch (error: unknown) {
      toast.error(error instanceof Error ? error.message : "Failed to open receipt");
    }
  };

  const downloadReceipt = async (payment: PaymentWithMeta, tenantName: string, propertyName: string) => {
    try {
      const out = await generatePaymentReceiptPDF(payment.id, "es");
      if (!out.url) {
        toast.info("Recibo generado pero sin URL");
        return;
      }
      await downloadFileFromUrl(out.url, buildPdfFileName(tenantName, propertyName, payment.received_date));
    } catch (error: unknown) {
      toast.error(error instanceof Error ? error.message : "No se pudo descargar el PDF");
    }
  };

  const shareReceipt = async (payment: PaymentWithMeta, tenantName: string, propertyName: string) => {
    try {
      const out = await generatePaymentReceiptPDF(payment.id, "es");
      if (!out.url) {
        toast.info("Recibo generado pero sin URL");
        return;
      }
      const text = `Hola ${tenantName}, aquí está su recibo de pago por ${formatCurrency(
        Number(payment.amount),
        payment.currency
      )} del ${payment.received_date}.`;
      await sharePdfToWhatsApp(out.url, buildPdfFileName(tenantName, propertyName, payment.received_date), text);
    } catch (error: unknown) {
      toast.error(error instanceof Error ? error.message : "Error al compartir por WhatsApp");
    }
  };

  const renderTotals = (values: Record<Currency, number>) => (
    <div className="flex flex-wrap justify-end gap-2 font-mono text-sm">
      {currencyOrder.map((currency) =>
        values[currency] > 0 ? (
          <span key={currency} className={currency === "USD" ? "text-emerald-300" : "text-blue-300"}>
            {formatCurrency(values[currency], currency)}
          </span>
        ) : null
      )}
    </div>
  );

  return (
    <AppShell>
      <div className="space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h1 className="text-xl font-bold text-white">💰 Payments ({sortedPayments.length})</h1>
          <div className="flex flex-wrap items-center gap-2">
            <div className="rounded-lg bg-white/5 px-3 py-2 text-xs text-white/55">
              This month:{" "}
              <span className="font-mono text-blue-300">
                {formatCurrency(totals.month.DOP || totals.month.USD || 0, totals.month.DOP ? "DOP" : "USD")}
              </span>
            </div>
            <div className="rounded-lg bg-white/5 px-3 py-2 text-xs text-white/55">
              Total:{" "}
              <span className="font-mono text-emerald-300">{formatCurrency(totals.all.USD, "USD")}</span>
              <span className="text-white/35"> + </span>
              <span className="font-mono text-blue-300">{formatCurrency(totals.all.DOP, "DOP")}</span>
            </div>
            {canCreate ? <PaymentForm onCreated={() => refetch()} /> : null}
          </div>
        </div>

        {isLoading ? (
          <div className="text-sm text-white/50">Loading...</div>
        ) : sortedPayments.length === 0 ? (
          <div className="rounded-lg border border-white/10 bg-white/[0.03] p-4 text-sm text-white/50">
            No payments yet.
          </div>
        ) : (
          groups.map((group) => {
            const totals = groupTotals(group.payments);

            return (
              <section key={group.key} className="space-y-2">
                <div className="flex items-center justify-between gap-3">
                  <h2 className="text-base font-bold text-white/70">
                    {group.key} ({group.payments.length})
                  </h2>
                  {renderTotals(totals)}
                </div>

                {isMobile ? (
                  <div className="overflow-hidden rounded-lg border border-white/10 bg-white/[0.03]">
                    {group.payments.map((payment) => (
                      <PaymentListItemMobile
                        key={payment.id}
                        payment={{ ...payment, ownerShareAmount: ownerShareOf(payment) }}
                        onRefetch={() => refetch()}
                      />
                    ))}
                  </div>
                ) : (
                  <div className="overflow-x-auto rounded-lg border border-white/10 bg-white/[0.03]">
                    <table className="w-full min-w-[980px] border-collapse text-left text-sm">
                      <thead>
                        <tr className="border-b border-white/10 bg-white/[0.02] text-xs text-white/55">
                          <th className="px-4 py-3 font-semibold">Date</th>
                          <th className="px-4 py-3 font-semibold">Tenant</th>
                          <th className="px-4 py-3 font-semibold">Property</th>
                          <th className="px-4 py-3 font-semibold">Method</th>
                          <th className="px-4 py-3 text-right font-semibold">Amount</th>
                          <th className="px-4 py-3 font-semibold">Reference</th>
                          <th className="px-4 py-3 text-right font-semibold">Actions</th>
                        </tr>
                      </thead>
                      <tbody>
                        {group.payments.map((payment) => {
                          const tenantName = tenantNameOf(payment);
                          const propertyName = propertyNameOf(payment);
                          const displayAmount = ownerShareOf(payment);

                          return (
                            <tr key={payment.id} className="border-b border-white/[0.06] text-white/65 last:border-0">
                              <td className="px-4 py-3 whitespace-nowrap text-xs font-medium text-white/70">
                                {formatDate(payment.received_date)}
                              </td>
                              <td className="px-4 py-3 font-bold text-white">{tenantName}</td>
                              <td className="px-4 py-3 font-medium">{propertyName}</td>
                              <td className="px-4 py-3 text-xs">{payment.method ?? "—"}</td>
                              <td
                                className={`px-4 py-3 text-right font-mono font-bold ${
                                  payment.currency === "USD" ? "text-emerald-300" : "text-blue-300"
                                }`}
                              >
                                {formatCurrency(displayAmount, payment.currency)}
                              </td>
                              <td className="max-w-[320px] px-4 py-3 text-xs text-white/45">
                                <span className="line-clamp-2">{payment.reference || "—"}</span>
                              </td>
                              <td className="px-4 py-3">
                                <div className="flex justify-end gap-2">
                                  <DropdownMenu>
                                    <DropdownMenuTrigger asChild>
                                      <Button size="sm" variant="outline" className="border-white/10 bg-white/5 text-white hover:bg-white/10">
                                        View
                                      </Button>
                                    </DropdownMenuTrigger>
                                    <DropdownMenuContent align="end">
                                      <DropdownMenuItem onClick={() => openReceipt(payment, "en")}>English receipt</DropdownMenuItem>
                                      <DropdownMenuItem onClick={() => openReceipt(payment, "es")}>Spanish receipt</DropdownMenuItem>
                                      <DropdownMenuItem onClick={() => shareReceipt(payment, tenantName, propertyName)}>
                                        QuickShare
                                      </DropdownMenuItem>
                                      <DropdownMenuItem onClick={() => downloadReceipt(payment, tenantName, propertyName)}>
                                        Download PDF
                                      </DropdownMenuItem>
                                    </DropdownMenuContent>
                                  </DropdownMenu>
                                  {canCreate ? (
                                    <>
                                    <EditPaymentDialog payment={payment} onUpdated={() => refetch()} />
                                    <DeletePaymentDialog
                                      id={payment.id}
                                      summary={`${tenantName} • ${propertyName} • ${payment.received_date} • ${formatCurrency(
                                        Number(payment.amount),
                                        payment.currency
                                      )}`}
                                      metadata={{
                                        amount: payment.amount,
                                        currency: payment.currency,
                                        method: payment.method,
                                        received_date: payment.received_date,
                                        reference: payment.reference ?? null,
                                        tenant_id: payment.tenant_id,
                                        tenant_name: tenantName,
                                        property_id: payment.lease?.property?.id ?? null,
                                        property_name: propertyName,
                                        lease_id: payment.lease_id,
                                        invoice_id: payment.invoice_id ?? null,
                                      }}
                                      onDeleted={() => refetch()}
                                    />
                                    </>
                                  ) : null}
                                </div>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </section>
            );
          })
        )}
      </div>
    </AppShell>
  );
};

export default Payments;
