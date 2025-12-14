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

  const canSubmit = useMemo(() => {
    return leaseId && tenantId && amount !== "" && Number(amount) >= 0 && date;
  }, [leaseId, tenantId, amount, date]);

  const onSave = async () => {
    if (!canSubmit) {
      toast.error("Please fill all required fields");
      return;
    }
    setSaving(true);
    try {
      await createPayment({
        lease_id: leaseId,
        tenant_id: tenantId,
        amount: Number(amount),
        currency,
        method,
        received_date: date,
        reference: reference || undefined,
      });
      toast.success("Payment recorded");
      setOpen(false);
      setLeaseId("");
      setTenantId("");
      setAmount("");
      setCurrency("USD");
      setMethod("bank_transfer");
      setDate(new Date().toISOString().slice(0, 10));
      setReference("");
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
                if (found) setTenantId(found.tenant_id);
              }}
            >
              <SelectTrigger>
                <SelectValue placeholder="Select lease" />
              </SelectTrigger>
              <SelectContent>
                {(leases ?? []).map((l: any) => (
                  <SelectItem key={l.id} value={l.id}>
                    {`${l.id.slice(0, 6)} • tenant ${l.tenant_id.slice(0, 6)}`}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
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