import React, { useMemo, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useAuth } from "@/contexts/AuthProvider";
import { useQuery } from "@tanstack/react-query";
import { fetchLeases, updateLease } from "@/services/leases";
import { fetchTenantProfilesInAgency } from "@/services/users";
import { toast } from "sonner";

type Props = {
  propertyId: string;
  triggerLabel?: string;
  onAssigned?: () => void;
};

const AssignTenantDialog = ({ propertyId, triggerLabel = "Assign Tenant", onAssigned }: Props) => {
  const { role, user, profile } = useAuth();
  const agencyId = profile?.agency_id ?? null;
  const canAssign = role === "agency_admin" && !!agencyId;

  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);

  const { data: leases } = useQuery({
    queryKey: ["assign-leases", role, user?.id, agencyId],
    enabled: canAssign,
    queryFn: () => fetchLeases({ role, userId: user?.id ?? null, agencyId }),
  });

  const { data: tenants, refetch: refetchTenants } = useQuery({
    queryKey: ["assign-tenants", agencyId],
    enabled: canAssign,
    queryFn: () => fetchTenantProfilesInAgency(agencyId!),
  });

  const propertyLeases = useMemo(() => {
    const list = (leases ?? []).filter((l: any) => l.property_id === propertyId);
    // Show newest first for convenience
    return list.sort((a: any, b: any) => (a.created_at < b.created_at ? 1 : -1));
  }, [leases, propertyId]);

  const [leaseId, setLeaseId] = useState<string>("");
  const [tenantId, setTenantId] = useState<string>("");

  const canSubmit = canAssign && leaseId && tenantId;

  const onSave = async () => {
    if (!canSubmit) {
      toast.error("Select a lease and a tenant");
      return;
    }
    setSaving(true);
    try {
      await updateLease(leaseId, { tenant_id: tenantId });
      toast.success("Tenant assigned to lease");
      setOpen(false);
      setLeaseId("");
      setTenantId("");
      onAssigned?.();
    } catch (e: any) {
      console.error("Assign tenant failed:", e);
      toast.error(e?.message ?? "Failed to assign tenant");
    } finally {
      setSaving(false);
    }
  };

  if (!canAssign) return null;

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="secondary">{triggerLabel}</Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Assign Tenant to Lease</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          {propertyLeases.length === 0 ? (
            <div className="text-sm text-muted-foreground">
              No leases found for this property. Create the lease first, then assign a tenant here.
            </div>
          ) : (
            <>
              <div className="space-y-2">
                <Label>Select Lease</Label>
                <Select value={leaseId} onValueChange={setLeaseId}>
                  <SelectTrigger className="min-w-[280px]">
                    <SelectValue placeholder="Choose a lease" />
                  </SelectTrigger>
                  <SelectContent>
                    {propertyLeases.map((l: any) => {
                      const label = `${l.start_date} → ${l.end_date} • ${new Intl.NumberFormat(undefined, { style: "currency", currency: l.rent_currency }).format(l.rent_amount)}`;
                      return (
                        <SelectItem key={l.id} value={l.id}>
                          {label}
                        </SelectItem>
                      );
                    })}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label>Tenant</Label>
                <Select value={tenantId} onValueChange={setTenantId}>
                  <SelectTrigger className="min-w-[280px]">
                    <SelectValue placeholder="Choose a tenant" />
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

              <div className="pt-2">
                <Button onClick={onSave} disabled={saving || !canSubmit}>
                  {saving ? "Assigning..." : "Assign Tenant"}
                </Button>
              </div>
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default AssignTenantDialog;