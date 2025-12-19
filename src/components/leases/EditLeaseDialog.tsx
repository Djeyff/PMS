import React, { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import type { LeaseWithMeta } from "@/services/leases";
import { updateLease } from "@/services/leases";
import { toast } from "sonner";

type Props = {
  lease: LeaseWithMeta;
  onUpdated?: () => void;
};

const EditLeaseDialog = ({ lease, onUpdated }: Props) => {
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);

  const [startDate, setStartDate] = useState(lease.start_date);
  const [endDate, setEndDate] = useState(lease.end_date);
  const [rentAmount, setRentAmount] = useState(String(lease.rent_amount));
  const [rentCurrency, setRentCurrency] = useState<"USD" | "DOP">(lease.rent_currency);
  const [depositAmount, setDepositAmount] = useState<string>(lease.deposit_amount == null ? "" : String(lease.deposit_amount));
  const [status, setStatus] = useState<"draft" | "active" | "pending_renewal" | "expired" | "terminated">(lease.status);
  const [autoInvoiceEnabled, setAutoInvoiceEnabled] = useState<boolean>(!!lease.auto_invoice_enabled);
  const [autoDay, setAutoDay] = useState<number>(lease.auto_invoice_day ?? 5);
  const [autoIntervalMonths, setAutoIntervalMonths] = useState<number>(lease.auto_invoice_interval_months ?? 1);
  const [autoHour, setAutoHour] = useState<number>(typeof lease.auto_invoice_hour === "number" ? lease.auto_invoice_hour : 9);
  const [autoMinute, setAutoMinute] = useState<number>(typeof lease.auto_invoice_minute === "number" ? lease.auto_invoice_minute : 0);

  const reset = () => {
    setStartDate(lease.start_date);
    setEndDate(lease.end_date);
    setRentAmount(String(lease.rent_amount));
    setRentCurrency(lease.rent_currency);
    setDepositAmount(lease.deposit_amount == null ? "" : String(lease.deposit_amount));
    setStatus(lease.status);
    setAutoInvoiceEnabled(!!lease.auto_invoice_enabled);
    setAutoDay(lease.auto_invoice_day ?? 5);
    setAutoIntervalMonths(lease.auto_invoice_interval_months ?? 1);
    setAutoHour(typeof lease.auto_invoice_hour === "number" ? lease.auto_invoice_hour : 9);
    setAutoMinute(typeof lease.auto_invoice_minute === "number" ? lease.auto_invoice_minute : 0);
  };

  const onSave = async () => {
    setSaving(true);
    try {
      await updateLease(lease.id, {
        start_date: startDate,
        end_date: endDate,
        rent_amount: Number(rentAmount),
        rent_currency: rentCurrency,
        deposit_amount: depositAmount === "" ? null : Number(depositAmount),
        status,
        auto_invoice_enabled: autoInvoiceEnabled,
        auto_invoice_day: autoDay,
        auto_invoice_interval_months: autoIntervalMonths,
        auto_invoice_hour: autoHour,
        auto_invoice_minute: autoMinute,
      });
      toast.success("Lease updated");
      setOpen(false);
      onUpdated?.();
    } catch (e: any) {
      console.error("Update lease failed:", e);
      toast.error(e?.message ?? "Failed to update lease");
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
          <DialogTitle>Edit Lease</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Start Date</Label>
              <Input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>End Date</Label>
              <Input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} />
            </div>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Rent Amount</Label>
              <Input type="number" min={0} value={rentAmount} onChange={(e) => setRentAmount(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>Rent Currency</Label>
              <Select value={rentCurrency} onValueChange={(v) => setRentCurrency(v as "USD" | "DOP")}>
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
            <Label>Deposit Amount (optional)</Label>
            <Input type="number" min={0} value={depositAmount} onChange={(e) => setDepositAmount(e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label>Status</Label>
            <Select value={status} onValueChange={(v) => setStatus(v as any)}>
              <SelectTrigger>
                <SelectValue placeholder="Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="draft">Draft</SelectItem>
                <SelectItem value="active">Active</SelectItem>
                <SelectItem value="pending_renewal">Pending renewal</SelectItem>
                <SelectItem value="expired">Expired</SelectItem>
                <SelectItem value="terminated">Terminated</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="flex items-center justify-between">
            <Label className="flex-1">Auto-invoice</Label>
            <Switch checked={autoInvoiceEnabled} onCheckedChange={setAutoInvoiceEnabled} />
          </div>
          {autoInvoiceEnabled && (
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              <div className="space-y-2">
                <Label>Day of month</Label>
                <Input
                  type="number"
                  min={1}
                  max={28}
                  value={autoDay}
                  onChange={(e) => setAutoDay(Math.max(1, Math.min(28, Number(e.target.value || 1))))}
                />
              </div>
              <div className="space-y-2">
                <Label>Every N months</Label>
                <Input
                  type="number"
                  min={1}
                  max={12}
                  value={autoIntervalMonths}
                  onChange={(e) => setAutoIntervalMonths(Math.max(1, Math.min(12, Number(e.target.value || 1))))}
                />
              </div>
              <div className="space-y-2">
                <Label>Hour of day (0–23)</Label>
                <Input
                  type="number"
                  min={0}
                  max={23}
                  value={autoHour}
                  onChange={(e) => {
                    const v = Number(e.target.value ?? 0);
                    setAutoHour(Math.max(0, Math.min(23, isNaN(v) ? 0 : v)));
                  }}
                />
              </div>
              <div className="space-y-2">
                <Label>Minute (0–59)</Label>
                <Input
                  type="number"
                  min={0}
                  max={59}
                  value={autoMinute}
                  onChange={(e) => {
                    const v = Number(e.target.value ?? 0);
                    setAutoMinute(Math.max(0, Math.min(59, isNaN(v) ? 0 : v)));
                  }}
                />
              </div>
            </div>
          )}
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

export default EditLeaseDialog;