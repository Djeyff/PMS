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

  const { data: pendingInvoices } = useQuery({
    queryKey: ["payment-pending-invoices", leaseId],
    enabled: !!leaseId && canCreate,
    queryFn: () => fetchPendingInvoicesByLease(leaseId),
  });

  const canSubmit = useMemo(() => {
    const baseOk = leaseId && tenantId && date;
    if (selectedInvoiceIds.length > 0) return baseOk;
    return baseOk && amount !== "" && Number(amount) >= 0;
  }, [leaseId, tenantId, amount, date, selectedInvoiceIds.length]);

  const onSave = async () => {
    if (!canSubmit) {
      toast.error("Please fill all required fields");
      return;
    }
    setSaving(true);
    try {
      if (selectedInvoiceIds.length > 0) {
        const invs = (pendingInvoices ?? []).filter((i: any) => selectedInvoiceIds.includes(i.id));
        for (const inv of invs) {
          await createPayment({
            lease_id: leaseId,
            tenant_id: tenantId,
            amount: Number(inv.total_amount),
            currency: inv.currency,
            method,
            received_date: date,
            reference: reference || undefined,
            invoice_id: inv.id,
            exchange_rate: exchangeRate && !Number.isNaN(Number(exchangeRate)) ? Number(exchangeRate) : undefined,
          });
          await recomputeInvoiceStatus(inv.id);
        }
      } else {
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
                <div className="text-xs text-muted-foreground">
                  We'll record one payment per selected invoice using the invoice's full amount. Method, date, reference and exchange rate will apply to each.
                </div>
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