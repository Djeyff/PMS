import React, { useMemo, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useAuth } from "@/contexts/AuthProvider";
import { useQuery } from "@tanstack/react-query";
import { fetchLeases } from "@/services/leases";
import { createPayment } from "@/services/payments";
import { toast } from "sonner";
import { fetchPendingInvoicesByLease } from "@/services/invoices";
import { recomputeInvoiceStatus } from "@/services/invoices";

const PaymentForm = ({ onCreated }: { onCreated?: () => void }) => {
  const { role, user, profile } = useAuth();
  const agencyId = profile?.agency_id ?? null;
  const canCreate = role === "agency_admin" && !!agencyId;

  const { data: leases } = useQuery({
    queryKey: ["payment-leases", role, user?.id, agencyId],
    enabled: canCreate,
    queryFn: () => fetchLeases({ role, userId: user?.id ?? null, agencyId }),
  });

  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [leaseId, setLeaseId] = useState("");
  const [tenantId, setTenantId] = useState("");
  const [amount, setAmount] = useState("");
  const [currency, setCurrency] = useState<"USD" | "DOP">("USD");
  const [method, setMethod] = useState("bank_transfer");
  const [date, setDate] = useState<string>(new Date().toISOString().slice(0, 10));
  const [reference, setReference] = useState("");
  const [invoiceId, setInvoiceId] = useState("");
  const [selectedInvoiceIds, setSelectedInvoiceIds] = useState<string[]>([]);
  const [exchangeRate, setExchangeRate] = useState<string>("");
  // NEW: optional second currency payment
  const [secondEnabled, setSecondEnabled] = useState(false);
  const [secondAmount, setSecondAmount] = useState<string>("");
  const [secondCurrency, setSecondCurrency] = useState<"USD" | "DOP">("DOP");
  const [secondExchangeRate, setSecondExchangeRate] = useState<string>("");

  const { data: pendingInvoices } = useQuery({
    queryKey: ["payment-pending-invoices", leaseId],
    enabled: !!leaseId && canCreate,
    queryFn: () => fetchPendingInvoicesByLease(leaseId),
  });

  const canSubmit = useMemo(() => {
    const baseOk = leaseId && tenantId && date;
    if (selectedInvoiceIds.length > 1) return baseOk; // multi-invoice flow uses full amounts per invoice
    if (selectedInvoiceIds.length === 1) {
      if (secondEnabled) {
        const a1 = Number(amount || 0);
        const a2 = Number(secondAmount || 0);
        return baseOk && ((a1 > 0) || (a2 > 0));
      }
      // single selected invoice (no split) requires an amount
      const a1 = Number(amount || 0);
      return baseOk && a1 > 0;
    }
    // no invoices selected
    return baseOk && amount !== "" && Number(amount) >= 0;
  }, [leaseId, tenantId, amount, date, selectedInvoiceIds.length, secondEnabled, secondAmount]);

  const onSave = async () => {
    if (!canSubmit) {
      toast.error("Please fill all required fields");
      return;
    }
    setSaving(true);
    try {
      if (selectedInvoiceIds.length > 1) {
        // unchanged: full payment per selected invoice in selected currency
        const invs = (pendingInvoices ?? []).filter((i: any) => selectedInvoiceIds.includes(i.id));
        const rateNum = exchangeRate && !Number.isNaN(Number(exchangeRate)) ? Number(exchangeRate) : null;

        for (const inv of invs) {
          const invTotal = Number(inv.total_amount);
          const invCur = inv.currency as "USD" | "DOP";
          const payCur = currency;

          let payAmt = invTotal;
          if (payCur !== invCur) {
            if (!rateNum || rateNum <= 0) {
              toast.error("Please enter a valid exchange rate for cross-currency payments.");
              setSaving(false);
              return;
            }
            if (invCur === "USD" && payCur === "DOP") {
              payAmt = Math.round(invTotal * rateNum * 100) / 100; // USD → DOP
            } else if (invCur === "DOP" && payCur === "USD") {
              payAmt = Math.round((invTotal / rateNum) * 100) / 100; // DOP → USD
            }
          }

          await createPayment({
            lease_id: leaseId,
            tenant_id: tenantId,
            amount: payAmt,
            currency: payCur,
            method,
            received_date: date,
            reference: reference || undefined,
            invoice_id: inv.id,
            exchange_rate: rateNum ?? undefined,
          });
          await recomputeInvoiceStatus(inv.id);
        }
      } else if (selectedInvoiceIds.length === 1 && secondEnabled) {
        // NEW: split payment across two currencies for a single invoice (amounts entered manually)
        const inv = (pendingInvoices ?? []).find((i: any) => selectedInvoiceIds[0] === i.id);
        if (!inv) throw new Error("Invoice not found");
        const invCur = inv.currency as "USD" | "DOP";

        const a1 = Number(amount || 0);
        const a2 = Number(secondAmount || 0);
        const rate1 = exchangeRate && !Number.isNaN(Number(exchangeRate)) ? Number(exchangeRate) : null;
        const rate2 = secondExchangeRate && !Number.isNaN(Number(secondExchangeRate)) ? Number(secondExchangeRate) : null;

        // Validate exchange rates for cross-currency legs
        if (a1 > 0 && currency !== invCur && (!rate1 || rate1 <= 0)) {
          toast.error("Please enter a valid exchange rate for the first payment.");
          setSaving(false);
          return;
        }
        if (a2 > 0 && secondCurrency !== invCur && (!rate2 || rate2 <= 0)) {
          toast.error("Please enter a valid exchange rate for the second payment.");
          setSaving(false);
          return;
        }

        // First leg
        if (a1 > 0) {
          await createPayment({
            lease_id: leaseId,
            tenant_id: tenantId,
            amount: a1,
            currency,
            method,
            received_date: date,
            reference: reference || undefined,
            invoice_id: inv.id,
            exchange_rate: currency !== invCur ? (rate1 ?? undefined) : undefined,
          });
        }
        // Second leg
        if (a2 > 0) {
          await createPayment({
            lease_id: leaseId,
            tenant_id: tenantId,
            amount: a2,
            currency: secondCurrency,
            method,
            received_date: date,
            reference: reference || undefined,
            invoice_id: inv.id,
            exchange_rate: secondCurrency !== invCur ? (rate2 ?? undefined) : undefined,
          });
        }

        await recomputeInvoiceStatus(inv.id);
      } else if (selectedInvoiceIds.length === 1 && !secondEnabled) {
        // NEW: single selected invoice (no split) — link payment to that invoice using entered amount
        const inv = (pendingInvoices ?? []).find((i: any) => selectedInvoiceIds[0] === i.id);
        if (!inv) throw new Error("Invoice not found");
        const invCur = inv.currency as "USD" | "DOP";
        const a1 = Number(amount || 0);
        const rateNum = exchangeRate && !Number.isNaN(Number(exchangeRate)) ? Number(exchangeRate) : null;

        if (a1 <= 0) {
          toast.error("Enter a valid amount for the selected invoice.");
          setSaving(false);
          return;
        }
        // Validate exchange rate when paying in a different currency than the invoice
        if (currency !== invCur && (!rateNum || rateNum <= 0)) {
          toast.error("Please enter a valid exchange rate when paying in a different currency than the invoice.");
          setSaving(false);
          return;
        }

        await createPayment({
          lease_id: leaseId,
          tenant_id: tenantId,
          amount: a1,
          currency,
          method,
          received_date: date,
          reference: reference || undefined,
          invoice_id: inv.id,
          exchange_rate: currency !== invCur ? (rateNum ?? undefined) : undefined,
        });

        await recomputeInvoiceStatus(inv.id);
      } else {
        // Original single/unlinked payment flow (with optional second currency when no invoice selected)
        if (secondEnabled && !invoiceId) {
          // NEW: two unlinked payments in one submission
          const a1 = Number(amount || 0);
          const a2 = Number(secondAmount || 0);
          const rate1 = exchangeRate && !Number.isNaN(Number(exchangeRate)) ? Number(exchangeRate) : undefined;
          const rate2 = secondExchangeRate && !Number.isNaN(Number(secondExchangeRate)) ? Number(secondExchangeRate) : undefined;

          if (a1 > 0) {
            await createPayment({
              lease_id: leaseId,
              tenant_id: tenantId,
              amount: a1,
              currency,
              method,
              received_date: date,
              reference: reference || undefined,
              exchange_rate: rate1,
            });
          }
          if (a2 > 0) {
            await createPayment({
              lease_id: leaseId,
              tenant_id: tenantId,
              amount: a2,
              currency: secondCurrency,
              method,
              received_date: date,
              reference: reference || undefined,
              exchange_rate: rate2,
            });
          }
        } else {
          // Original single row create (linked or unlinked via manual invoiceId)
          await createPayment({
            lease_id: leaseId,
            tenant_id: tenantId,
            amount: Number(amount),
            currency,
            method,
            received_date: date,
            reference: reference || undefined,
            invoice_id: invoiceId || undefined,
            exchange_rate: exchangeRate && !Number.isNaN(Number(exchangeRate)) ? Number(exchangeRate) : undefined,
          });
          if (invoiceId) {
            await recomputeInvoiceStatus(invoiceId);
          }
        }
      }
      toast.success("Payment recorded");
      setOpen(false);
      setLeaseId("");
      setTenantId("");
      setAmount("");
      setCurrency("USD");
      setMethod("bank_transfer");
      setDate(new Date().toISOString().slice(0, 10));
      setReference("");
      setInvoiceId("");
      setSelectedInvoiceIds([]);
      setExchangeRate("");
      // reset second leg
      setSecondEnabled(false);
      setSecondAmount("");
      setSecondCurrency("DOP");
      setSecondExchangeRate("");
      onCreated?.();
    } catch (e: any) {
      console.error("Create payment failed:", e);
      toast.error(e?.message ?? "Failed to record payment");
    } finally {
      setSaving(false);
    }
  };

  if (!canCreate) return null;

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button>New Payment</Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Create Payment</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-2">
            <Label>Lease</Label>
            <Select
              value={leaseId}
              onValueChange={(v) => {
                setLeaseId(v);
                const found = (leases ?? []).find((l: any) => l.id === v);
                if (found) setTenantId(found.tenant?.id || found.tenant_id);
              }}
            >
              <SelectTrigger className="min-w-[260px]">
                <SelectValue placeholder="Select lease" />
              </SelectTrigger>
              <SelectContent>
                {(leases ?? []).map((l: any) => {
                  const propName = l.property?.name ?? (l.property_id ? l.property_id.slice(0, 8) : "Property");
                  const tenantName = [l.tenant?.first_name, l.tenant?.last_name].filter(Boolean).join(" ") || (l.tenant_id ? l.tenant_id.slice(0, 6) : "Tenant");
                  return (
                    <SelectItem key={l.id} value={l.id}>
                      {propName} — {tenantName}
                    </SelectItem>
                  );
                })}
              </SelectContent>
            </Select>
          </div>
          {/* Rent reminder for the selected lease */}
          {leaseId && (() => {
            const sel = (leases ?? []).find((l: any) => l.id === leaseId);
            if (!sel) return null;
            const rentText = new Intl.NumberFormat(undefined, { style: "currency", currency: sel.rent_currency }).format(sel.rent_amount);
            return (
              <div className="text-xs text-muted-foreground">
                Rent for this lease: {rentText} per period
              </div>
            );
          })()}
          {leaseId && (
            <div className="space-y-3">
              <Label>Pending invoices (select one or multiple)</Label>
              <div className="space-y-2">
                {(pendingInvoices ?? []).map((inv: any) => {
                  const tenantName = [inv.tenant?.first_name, inv.tenant?.last_name].filter(Boolean).join(" ") || "Tenant";
                  const label = `${inv.number ?? inv.id.slice(0,8)} — ${tenantName} — due ${inv.due_date} — ${new Intl.NumberFormat(undefined, { style: "currency", currency: inv.currency }).format(inv.total_amount)}`;
                  const checked = selectedInvoiceIds.includes(inv.id);
                  return (
                    <label key={inv.id} className="flex items-center gap-2">
                      <input
                        type="checkbox"
                        className="h-4 w-4"
                        checked={checked}
                        onChange={(e) => {
                          setSelectedInvoiceIds((prev) => {
                            const next = new Set(prev);
                            if (e.target.checked) next.add(inv.id);
                            else next.delete(inv.id);
                            return Array.from(next);
                          });
                          setInvoiceId(""); // clear single-select when using multi-select
                        }}
                      />
                      <span className="text-sm">{label}</span>
                    </label>
                  );
                })}
                {(pendingInvoices ?? []).length === 0 ? (
                  <div className="text-xs text-muted-foreground">No pending invoices for this lease.</div>
                ) : null}
              </div>
              {selectedInvoiceIds.length > 0 ? (
                selectedInvoiceIds.length > 1 ? (
                  <div className="text-xs text-muted-foreground">
                    We'll record one payment per selected invoice using the invoice's full amount. Method, date, reference and exchange rate will apply to each.
                  </div>
                ) : secondEnabled ? (
                  <div className="text-xs text-muted-foreground">
                    We'll split this payment across two currencies and link both parts to the selected invoice.
                  </div>
                ) : (
                  <div className="text-xs text-muted-foreground">
                    We'll link this payment to the selected invoice using the Amount and Currency fields below.
                  </div>
                )
              ) : (
                <div className="text-xs text-muted-foreground">
                  Or leave invoices unchecked to record an unlinked payment (uses the Amount field).
                </div>
              )}
            </div>
          )}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Amount</Label>
              <Input type="number" min={0} value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="0.00" />
            </div>
            <div className="space-y-2">
              <Label>Currency</Label>
              <Select value={currency} onValueChange={(v) => setCurrency(v as "USD" | "DOP")}>
                <SelectTrigger>
                  <SelectValue placeholder="Currency" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="USD">USD</SelectItem>
                  <SelectItem value="DOP">DOP</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          {/* Manual exchange rate (optional) */}
          <div className="space-y-2">
            <Label>Exchange rate (optional)</Label>
            <Input
              type="number"
              min={0}
              step="0.0001"
              value={exchangeRate}
              onChange={(e) => setExchangeRate(e.target.value)}
              placeholder="e.g., 58.50"
            />
            <div className="text-xs text-muted-foreground">
              Use when paying in a different currency than the invoice (e.g., DOP per USD).
            </div>
          </div>
          {/* NEW: Second currency payment */}
          <div className="space-y-2 pt-2">
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                className="h-4 w-4"
                checked={secondEnabled}
                onChange={(e) => setSecondEnabled(e.target.checked)}
                disabled={selectedInvoiceIds.length > 1}
              />
              <span className="text-sm">Add second currency payment</span>
            </label>
            {secondEnabled ? (
              <div className="space-y-3">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Second Amount</Label>
                    <Input type="number" min={0} value={secondAmount} onChange={(e) => setSecondAmount(e.target.value)} placeholder="0.00" />
                  </div>
                  <div className="space-y-2">
                    <Label>Second Currency</Label>
                    <Select value={secondCurrency} onValueChange={(v) => setSecondCurrency(v as "USD" | "DOP")}>
                      <SelectTrigger>
                        <SelectValue placeholder="Currency" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="USD">USD</SelectItem>
                        <SelectItem value="DOP">DOP</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <div className="space-y-2">
                  <Label>Second exchange rate (optional)</Label>
                  <Input
                    type="number"
                    min={0}
                    step="0.0001"
                    value={secondExchangeRate}
                    onChange={(e) => setSecondExchangeRate(e.target.value)}
                    placeholder="e.g., 64.00"
                  />
                  <div className="text-xs text-muted-foreground">
                    Required if the second payment currency differs from the invoice currency (e.g., DOP per USD).
                  </div>
                </div>
                <div className="text-xs text-muted-foreground">
                  Both payments will use the same method, date and reference.
                </div>
              </div>
            ) : null}
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Method</Label>
              <Select value={method} onValueChange={setMethod}>
                <SelectTrigger>
                  <SelectValue placeholder="Method" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="bank_transfer">Bank transfer</SelectItem>
                  <SelectItem value="cash">Cash</SelectItem>
                  <SelectItem value="card">Card</SelectItem>
                  <SelectItem value="check">Check</SelectItem>
                  <SelectItem value="other">Other</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Date</Label>
              <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
            </div>
          </div>
          <div className="space-y-2">
            <Label>Reference (optional)</Label>
            <Input value={reference} onChange={(e) => setReference(e.target.value)} placeholder="Transaction reference" />
          </div>
          <div className="pt-2">
            <Button onClick={onSave} disabled={saving || !canSubmit}>
              {saving ? "Saving..." : "Record Payment"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default PaymentForm;