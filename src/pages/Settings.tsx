import React from "react";
import AppShell from "@/components/layout/AppShell";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { useState } from "react";
import { createAgency } from "@/services/agencies";
import { useAuth } from "@/contexts/AuthProvider";
import { toast } from "sonner";
import { useQuery } from "@tanstack/react-query";
import { fetchAgencyById, updateAgencyTimezone } from "@/services/agencies";

const Settings = () => {
  const { profile, refreshProfile } = useAuth();
  const [agencyName, setAgencyName] = useState("");
  const [currency, setCurrency] = useState<"USD" | "DOP">("USD");
  const [saving, setSaving] = useState(false);

  const hasAgency = !!profile?.agency_id;

  const { data: agency } = useQuery({
    queryKey: ["agency", profile?.agency_id],
    enabled: hasAgency,
    queryFn: () => fetchAgencyById(profile!.agency_id!),
  });

  // Curated timezone list (values are IANA tz names)
  const TIMEZONES = [
    { value: "UTC", label: "UTC (GMT+0)" },
    { value: "America/Santo_Domingo", label: "GMT-4 — Dominican Republic" },
    { value: "America/New_York", label: "GMT-5/4 — New York" },
    { value: "Europe/London", label: "GMT+0/1 — London" },
    { value: "Europe/Madrid", label: "GMT+1/2 — Madrid" },
    { value: "America/Los_Angeles", label: "GMT-8/7 — Los Angeles" },
  ];
  const [timezone, setTimezone] = useState<string>(agency?.timezone ?? "UTC");

  // Keep timezone in sync when agency loads
  React.useEffect(() => {
    if (agency?.timezone != null) setTimezone(agency.timezone || "UTC");
  }, [agency?.timezone]);

  const onCreateAgency = async () => {
    if (!agencyName) {
      toast.error("Please enter an agency name");
      return;
    }
    setSaving(true);
    try {
      const { id } = await createAgency({ name: agencyName, default_currency: currency });
      await refreshProfile();
      toast.success("Agency created and assigned");
      setAgencyName("");
    } catch (e: any) {
      console.error("Create agency failed:", e);
      toast.error(e?.message ?? "Failed to create agency");
    } finally {
      setSaving(false);
    }
  };

  const onSaveTimezone = async () => {
    if (!hasAgency || !profile?.agency_id) return;
    setSaving(true);
    try {
      await updateAgencyTimezone(profile.agency_id, timezone);
      toast.success("Timezone updated");
    } catch (e: any) {
      toast.error(e?.message ?? "Failed to update timezone");
    } finally {
      setSaving(false);
    }
  };

  return (
    <AppShell>
      <div className="space-y-6 max-w-2xl">
        <h1 className="text-xl font-semibold">Settings</h1>
        <Card>
          <CardHeader>
            <CardTitle>Agency Setup</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {hasAgency ? (
              <>
                <div className="space-y-2 text-sm">
                  <div className="text-muted-foreground">Status</div>
                  <div className="rounded-md border p-3">
                    You are assigned to an agency. You can now manage users and properties.
                  </div>
                </div>
                <div className="space-y-2">
                  <Label>Timezone</Label>
                  <Select value={timezone} onValueChange={(v) => setTimezone(v)}>
                    <SelectTrigger className="w-[280px]">
                      <SelectValue placeholder="Select timezone" />
                    </SelectTrigger>
                    <SelectContent>
                      {TIMEZONES.map((tz) => (
                        <SelectItem key={tz.value} value={tz.value}>{tz.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <div className="pt-2">
                    <Button variant="outline" onClick={onSaveTimezone} disabled={saving}>
                      {saving ? "Saving..." : "Save Timezone"}
                    </Button>
                  </div>
                </div>
              </>
            ) : (
              <>
                <div className="space-y-2">
                  <Label>Agency Name</Label>
                  <Input value={agencyName} onChange={(e) => setAgencyName(e.target.value)} placeholder="Your Agency LLC" />
                </div>
                <div className="space-y-2">
                  <Label>Default Currency</Label>
                  <Select value={currency} onValueChange={(v) => setCurrency(v as "USD" | "DOP")}>
                    <SelectTrigger className="w-[160px]">
                      <SelectValue placeholder="Currency" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="USD">USD</SelectItem>
                      <SelectItem value="DOP">DOP</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <Button onClick={onCreateAgency} disabled={saving}>
                  {saving ? "Creating..." : "Create Agency"}
                </Button>
              </>
            )}
          </CardContent>
        </Card>
      </div>
    </AppShell>
  );
};

export default Settings;