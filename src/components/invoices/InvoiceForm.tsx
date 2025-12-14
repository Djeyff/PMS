import React, { useMemo, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useAuth } from "@/contexts/AuthProvider";
import { useQuery } from "@tanstack/react-query";
import { fetchLeases } from "@/services/leases";
import { createInvoice } from "@/services/invoices";
import { toast } from "sonner";

const InvoiceForm = ({ onCreated }: { onCreated?: () => void }) => {
  const { role, user, profile } = useAuth();
  const agencyId = profile?.agency_id ?? null;
  const canCreate = role === "agency_admin" && !!agencyId;

  const { data: leases } = useQuery({
    queryKey: ["invoice-leases", role, user?.id, agencyId],
    enabled: canCreate,
    queryFn: () => fetchLeases({ role, userId: user?.id ?? null, agencyId }),
  });

  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [leaseId, setLeaseId] = useState("");
  const [tenantId, setTenantId] = useState("");
  const [number, setNumber] = useState<string>("");
  const [issueDate, setIssueDate] = useState<string>(new Date().toISOString().slice(0, 10));
  const [dueDate, setDueDate] = useState<string>(new Date(Date.now() + 7*24*3600*1000).toISOString().slice(0, 10));
  const [currency, setCurrency] = useState<"USD" | "DOP">("USD");
  const [total, setTotal] = useState<string>("");

  const canSubmit = useMemo(() => {
    return leaseId && tenantId && total !== "" && Number(total) >= 0 && dueDate && issueDate;
  }, [leaseId, tenantId, total, dueDate, issueDate]);

  const onSave = async () => {
    if (!canSubmit) {
      toast.error("Please fill all required fields");
      return;
    }
    setSaving(true);
    try {
      await createInvoice({
        lease_id: leaseId,
        tenant_id: tenantId,
        number: number || null,
        issue_date: issueDate,
        due_date: dueDate,
        currency,
        total_amount: Number(total),
      });
      toast.success("Invoice created");
      setOpen(false);
      setLeaseId("");
      setTenantId("");
      setNumber("");
      setIssueDate(new Date().toISOString().slice(0, 10));
      setDueDate(new Date(Date.now() + 7*24*3600*1000).toISOString().slice(0, 10));
      setCurrency("USD");
      setTotal("");
      onCreated?.();
    } catch (e: any) {
      console.error("Create invoice failed:", e);
      toast.error(e?.message ?? "Failed to create invoice");
    } finally {
      setSaving(false);
    }
  };

  if (!canCreate) return null;

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button>Create Invoice</Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Create Invoice</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-2">
            <Label>Lease</Label>
            <Select
              value={leaseId}
              onValueChange={(v) => {
                setLeaseId(v);
                const found = (leases ?? []).find((l: any) => l.id === v);
                if (found) {
                  setTenantId(found.tenant?.id || found.tenant_id);
                  setCurrency(found.rent_currency); // default to lease currency
                }
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
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Invoice Number (optional)</Label>
              <Input value={number} onChange={(e) => setNumber(e.target.value)} placeholder="e.g., INV-2025-0001" />
            </div>
            <div className="space-y-2">
              <Label>Issue Date</Label>
              <Input type="date" value={issueDate} onChange={(e) => setIssueDate(e.target.value)} />
            </div>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Due Date</Label>
              <Input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
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
          <div className="space-y-2">
            <Label>Total Amount</Label>
            <Input type="number" min={0} value={total} onChange={(e) => setTotal(e.target.value)} placeholder="0.00" />
          </div>
          <div className="pt-2">
            <Button onClick={onSave} disabled={saving || !canSubmit}>
              {saving ? "Saving..." : "Create Invoice"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default InvoiceForm;