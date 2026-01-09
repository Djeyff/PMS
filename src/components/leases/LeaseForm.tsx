import React, { useMemo, useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { useQuery } from "@tanstack/react-query";
import { fetchProperties } from "@/services/properties";
import { fetchTenantProfilesInAgency } from "@/services/users";
import { useAuth } from "@/contexts/AuthProvider";
import { createLease } from "@/services/leases";
import { toast } from "sonner";
import AddTenantDialog from "@/components/tenants/AddTenantDialog";

type Props = { onCreated?: () => void; propertyId?: string; triggerLabel?: string };

const LeaseForm = ({ onCreated, propertyId: propPropertyId, triggerLabel }: Props) => {
  const { role, user, profile } = useAuth();
  const agencyId = profile?.agency_id ?? null;
  const canCreate = role === "agency_admin" && !!agencyId;

  const { data: propsList } = useQuery({
    queryKey: ["lease-props", agencyId],
    enabled: canCreate,
    queryFn: () => fetchProperties({ role: role, userId: user?.id ?? null, agencyId }),
  });

  const { data: tenants, refetch: refetchTenants } = useQuery({
    queryKey: ["lease-tenants", agencyId],
    enabled: canCreate,
    queryFn: () => fetchTenantProfilesInAgency(agencyId!),
  });

  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [propertyId, setPropertyId] = useState<string>(propPropertyId ?? "");
  const [tenantId, setTenantId] = useState<string>("");
  const [startDate, setStartDate] = useState<string>("");
  const [endDate, setEndDate] = useState<string>("");
  const [rentAmount, setRentAmount] = useState<string>("");
  const [rentCurrency, setRentCurrency] = useState<"USD" | "DOP">("USD");
  const [depositAmount, setDepositAmount] = useState<string>("");
  const [autoInvoice, setAutoInvoice] = useState<boolean>(false);
  const [autoDay, setAutoDay] = useState<number>(5);
  const [autoIntervalMonths, setAutoIntervalMonths] = useState<number>(1);
  const [autoHour, setAutoHour] = useState<number>(new Date().getHours());
  const [autoMinute, setAutoMinute] = useState<number>(new Date().getMinutes());
  const [kdriveFolderUrl, setKdriveFolderUrl] = useState<string>("");
  const [kdriveFileUrl, setKdriveFileUrl] = useState<string>("");

  // ADDED: annual increase option
  const [annualIncreaseEnabled, setAnnualIncreaseEnabled] = useState<boolean>(false);
  const [annualIncreasePercent, setAnnualIncreasePercent] = useState<string>("");

  useEffect(() => {
    if (open && propPropertyId) {
      setPropertyId(propPropertyId);
    }
  }, [open, propPropertyId]);

  const canSubmit = useMemo(() => {
    return (
      propertyId &&
      tenantId &&
      startDate &&
      endDate &&
      rentAmount !== "" &&
      Number(rentAmount) >= 0 &&
      (!annualIncreaseEnabled || (annualIncreasePercent !== "" && Number(annualIncreasePercent) >= 0))
    );
  }, [propertyId, tenantId, startDate, endDate, rentAmount, annualIncreaseEnabled, annualIncreasePercent]);

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
        auto_invoice_enabled: autoInvoice,
        auto_invoice_day: autoDay,
        auto_invoice_interval_months: autoIntervalMonths,
        auto_invoice_hour: autoHour,
        auto_invoice_minute: autoMinute,
        contract_kdrive_folder_url: kdriveFolderUrl.trim() !== "" ? kdriveFolderUrl.trim() : null,
        contract_kdrive_file_url: kdriveFileUrl.trim() !== "" ? kdriveFileUrl.trim() : null,
        // ADDED: annual increase
        annual_increase_enabled: annualIncreaseEnabled,
        annual_increase_percent: annualIncreaseEnabled ? Number(annualIncreasePercent) : undefined,
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
      setAutoInvoice(false);
      setAutoDay(5);
      setAutoIntervalMonths(1);
      setAutoHour(new Date().getHours());
      setAutoMinute(new Date().getMinutes());
      setKdriveFolderUrl("");
      setKdriveFileUrl("");
      // RESET: annual increase
      setAnnualIncreaseEnabled(false);
      setAnnualIncreasePercent("");
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
        <Button>{triggerLabel || "New Lease"}</Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-[720px] max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Create Lease</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          {!propPropertyId ? (
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
          ) : null}
          <div className="space-y-2">
            <Label>Tenant</Label>
            <div className="flex items-center gap-2">
              <Select value={tenantId} onValueChange={setTenantId}>
                <SelectTrigger className="min-w-[220px]">
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
              <AddTenantDialog
                triggerLabel="Add"
                onCreated={async (id) => {
                  await refetchTenants();
                  setTenantId(id);
                }}
              />
            </div>
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

          {/* ADDED: Annual increase controls */}
          <div className="space-y-3 border rounded-md p-3">
            <div className="flex items-center justify-between py-1">
              <Label className="flex-1">Annual increase on contract anniversary</Label>
              <Switch checked={annualIncreaseEnabled} onCheckedChange={setAnnualIncreaseEnabled} />
            </div>
            {annualIncreaseEnabled && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Increase percent (%)</Label>
                  <Input
                    type="number"
                    min={0}
                    max={100}
                    value={annualIncreasePercent}
                    onChange={(e) => setAnnualIncreasePercent(e.target.value)}
                    placeholder="e.g., 5"
                  />
                </div>
                <div className="text-sm text-muted-foreground self-end">
                  Applied each year on the lease start date anniversary.
                </div>
              </div>
            )}
          </div>

          <div className="space-y-3">
            <div className="flex items-center justify-between py-2">
              <Label className="flex-1">Auto-invoice</Label>
              <Switch checked={autoInvoice} onCheckedChange={setAutoInvoice} />
            </div>
            {autoInvoice && (
              <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                <div className="space-y-2">
                  <Label>Day of month</Label>
                  <Input
                    type="number"
                    min={1}
                    max={28}
                    value={autoDay}
                    onChange={(e) => setAutoDay(Math.max(1, Math.min(28, Number(e.target.value || 1))))}
                    placeholder="e.g., 5"
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
                    placeholder="e.g., 1 for monthly, 3 for quarterly"
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
                    placeholder="e.g., 9"
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
                    placeholder="e.g., 30"
                  />
                </div>
              </div>
            )}
          </div>
          <div className="space-y-2">
            <Label>kDrive Folder URL (optional)</Label>
            <Input
              type="url"
              placeholder="https://kdrive.infomaniak.com/your/folder"
              value={kdriveFolderUrl}
              onChange={(e) => setKdriveFolderUrl(e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label>kDrive File URL (optional)</Label>
            <Input
              type="url"
              placeholder="https://kdrive.infomaniak.com/your/file.pdf"
              value={kdriveFileUrl}
              onChange={(e) => setKdriveFileUrl(e.target.value)}
            />
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