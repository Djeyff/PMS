import React, { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import type { PaymentWithMeta } from "@/services/payments";
import { updatePayment } from "@/services/payments";
import { toast } from "sonner";

type Props = {
  payment: PaymentWithMeta;
  onUpdated?: () => void;
};

const EditPaymentDialog = ({ payment, onUpdated }: Props) => {
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);

  const [amount, setAmount] = useState<string>(String(payment.amount));
  const [currency, setCurrency] = useState<"USD" | "DOP">(payment.currency);
  const [method, setMethod] = useState<string>(payment.method || "bank_transfer");
  const [receivedDate, setReceivedDate] = useState<string>(payment.received_date);
  const [reference, setReference] = useState<string>(payment.reference ?? "");
  const [exchangeRate, setExchangeRate] = useState<string>(
    typeof payment.exchange_rate === "number" ? String(payment.exchange_rate) : ""
  );

  const reset = () => {
    setAmount(String(payment.amount));
    setCurrency(payment.currency);
    setMethod(payment.method || "bank_transfer");
    setReceivedDate(payment.received_date);
    setReference(payment.reference ?? "");
  };

  const onSave = async () => {
    if (amount.trim() === "" || Number.isNaN(Number(amount))) {
      toast.error("Enter a valid amount");
      return;
    }
    if (!receivedDate) {
      toast.error("Select a date");
      return;
    }
    setSaving(true);
    try {
      await updatePayment(payment.id, {
        amount: Number(amount),
        currency,
        method,
        received_date: receivedDate,
        reference: reference.trim() !== "" ? reference.trim() : null,
        exchange_rate: exchangeRate && !Number.isNaN(Number(exchangeRate)) ? Number(exchangeRate) : null,
      });
      toast.success("Payment updated");
      setOpen(false);
      onUpdated?.();
    } catch (e: any) {
      toast.error(e?.message ?? "Failed to update payment");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { setOpen(v); if (!v) reset(); }}>
      <DialogTrigger asChild>
        <Button variant="secondary" size="sm">Edit</Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Edit Payment</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Amount</Label>
              <Input type="number" min={0} value={amount} onChange={(e) => setAmount(e.target.value)} />
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
                  <SelectItem value="other">Other</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Date</Label>
              <Input type="date" value={receivedDate} onChange={(e) => setReceivedDate(e.target.value)} />
            </div>
          </div>
          <div className="space-y-2">
            <Label>Reference (optional)</Label>
            <Input value={reference} onChange={(e) => setReference(e.target.value)} placeholder="e.g., TXN-12345" />
          </div>
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
            <div className="text-xs text-muted-foreground">Use when payment currency differs from invoice currency.</div>
          </div>
          <div className="pt-2">
            <Button onClick={onSave} disabled={saving}>
              {saving ? "Saving..." : "Save changes"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default EditPaymentDialog;