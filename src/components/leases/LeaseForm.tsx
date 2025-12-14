import React, { useMemo, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useQuery } from "@tanstack/react-query";
import { fetchProperties } from "@/services/properties";
import { fetchTenantProfilesInAgency } from "@/services/users";
import { useAuth } from "@/contexts/AuthProvider";
import { createLease } from "@/services/leases";
import { toast } from "sonner";

type Props = { onCreated?: () => void };

const LeaseForm = ({ onCreated }: Props) => {
  const { role, user, profile } = useAuth();
  const agencyId = profile?.agency_id ?? null;
  const canCreate = role === "agency_admin" && !!agencyId;

  const { data: propsList } = useQuery({
    queryKey: ["lease-props", agencyId],
    enabled: canCreate,
    queryFn: () => fetchProperties({ role: role, userId: user?.id ?? null, agencyId }),
  });

  const { data: tenants } = useQuery({
    queryKey: ["lease-tenants", agencyId],
    enabled: canCreate,
    queryFn: () => fetchTenantProfilesInAgency(agencyId!),
  });

  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [propertyId, setPropertyId] = useState<string>("");
  const [tenantId, setTenantId] = useState<string>("");
  const [startDate, setStartDate] = useState<string>("");
  const [endDate, setEndDate] = useState<string>("");
  const [rentAmount, setRentAmount] = useState<string>("");
  const [rentCurrency, setRentCurrency] = useState<"USD" | "DOP">("USD");
  const [depositAmount, setDepositAmount] = useState<string>("");

  const canSubmit = useMemo(() => {
    return (
      propertyId &&
      tenantId &&
      startDate &&
      endDate &&
      rentAmount !== "" &&
      Number(rentAmount) >= 0
    );
  }, [propertyId, tenantId, startDate, endDate, rentAmount]);

  const onSave = async () => {
    if (!canSubmit) {
      toast.error("Please fill all required fields");
      return;
    }
    setSaving(true);
    try {
      await createLease({
        property_id: propertyId,
        tenant_id: tenantId,
        start_date: startDate,
        end_date: endDate,
        rent_amount: Number(rentAmount),
        rent_currency: rentCurrency,
        deposit_amount: depositAmount === "" ? undefined : Number(depositAmount),
      });
      toast.success("Lease created");
      setOpen(false);
      setPropertyId("");
      setTenantId("");
      setStartDate("");
      setEndDate("");
      setRentAmount("");
      setRentCurrency("USD");
      setDepositAmount("");
      onCreated?.();
    } catch (e: any) {
      toast.error(e?.message ?? "Failed to create lease");
    } finally {
      setSaving(false);
    }
  };

  if (!canCreate) return null;

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button>New Lease</Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Create Lease</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-2">
            <Label>Property</Label>
            <Select value={propertyId} onValueChange={setPropertyId}>
              <SelectTrigger>
                <SelectValue placeholder="Select property" />
              </SelectTrigger>
              <SelectContent>
                {(propsList ?? []).map((p) => (
                  <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>Tenant</Label>
            <Select value={tenantId} onValueChange={setTenantId}>
              <SelectTrigger>
                <SelectValue placeholder="Select tenant" />
              </SelectTrigger>
              <SelectContent>
                {(tenants ?? []).map((t) => (
                  <SelectItem key={t.id} value={t.id}>
                    {[t.first_name, t.last_name].filter(Boolean).join(" ") || t.id.slice(0, 6)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
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
              <Input type="number" min={0} value={rentAmount} onChange={(e) => setRentAmount(e.target.value)} placeholder="e.g., 1200" />
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
            <Input type="number" min={0} value={depositAmount} onChange={(e) => setDepositAmount(e.target.value)} placeholder="e.g., 1200" />
          </div>
          <div className="pt-2">
            <Button onClick={onSave} disabled={saving || !canSubmit}>
              {saving ? "Saving..." : "Create Lease"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default LeaseForm;