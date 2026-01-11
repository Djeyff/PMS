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
import { fetchAgencyById, updateAgencyTimezone, updateAgencyProfile } from "@/services/agencies";
import { useTheme } from "@/contexts/ThemeProvider";
import { uploadLogo, getLogoPublicUrl, uploadFavicon, getFaviconPublicUrl, applyFavicon } from "@/services/branding";

const Settings = () => {
  const { profile, refreshProfile } = useAuth();
  const { theme, setTheme } = useTheme();
  const [pendingTheme, setPendingTheme] = useState<"light" | "dark">(theme);
  const [savingTheme, setSavingTheme] = useState(false);
  const [agencyName, setAgencyName] = useState("");
  const [currency, setCurrency] = useState<"USD" | "DOP">("USD");
  const [saving, setSaving] = useState(false);

  const hasAgency = !!profile?.agency_id;

  const { data: agency, refetch: refetchAgency } = useQuery({
    queryKey: ["agency", profile?.agency_id],
    enabled: hasAgency,
    queryFn: () => fetchAgencyById(profile!.agency_id!),
  });

  // Branding states
  const [agencyDisplayName, setAgencyDisplayName] = useState<string>(agency?.name ?? "");
  const [address, setAddress] = useState<string>(agency?.address ?? "");

  React.useEffect(() => {
    if (agency?.name != null) setAgencyDisplayName(agency.name || "");
    if (agency?.address != null) setAddress(agency.address || "");
  }, [agency?.name, agency?.address]);

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

  const [logoUrl, setLogoUrl] = useState<string>("");
  const [faviconUrl, setFaviconUrl] = useState<string>("");

  React.useEffect(() => {
    if (agency?.timezone != null) setTimezone(agency.timezone || "UTC");
    if (agency?.address != null) setAddress(agency.address || "");
  }, [agency?.timezone, agency?.address]);

  React.useEffect(() => {
    // Try to load logo preview
    getLogoPublicUrl().then((url) => setLogoUrl(url)).catch(() => setLogoUrl(""));
    // Try to load favicon preview
    getFaviconPublicUrl().then((url) => setFaviconUrl(url)).catch(() => setFaviconUrl(""));
  }, []);

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
      await refetchAgency();
    } catch (e: any) {
      toast.error(e?.message ?? "Failed to update timezone");
    } finally {
      setSaving(false);
    }
  };

  const onSaveAgencyInfo = async () => {
    if (!hasAgency || !profile?.agency_id) return;
    setSaving(true);
    try {
      await updateAgencyProfile(profile.agency_id, {
        name: agencyDisplayName,
        address: address,
      });
      toast.success("Agency info updated");
      await refetchAgency();
    } catch (e: any) {
      toast.error(e?.message ?? "Failed to update agency info");
    } finally {
      setSaving(false);
    }
  };

  const onUploadLogo = async (file?: File) => {
    if (!file) {
      toast.error("Please select a PNG file");
      return;
    }
    setSaving(true);
    try {
      await uploadLogo(file);
      const url = await getLogoPublicUrl();
      setLogoUrl(url);
      toast.success("Logo uploaded");
    } catch (e: any) {
      toast.error(e?.message ?? "Failed to upload logo");
    } finally {
      setSaving(false);
    }
  };

  const onUploadFavicon = async (file?: File) => {
    if (!file) {
      toast.error("Please select a PNG or ICO file");
      return;
    }
    setSaving(true);
    try {
      await uploadFavicon(file);
      const url = await getFaviconPublicUrl();
      setFaviconUrl(url);
      applyFavicon(url);
      toast.success("Favicon uploaded");
    } catch (e: any) {
      toast.error(e?.message ?? "Failed to upload favicon");
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
                  <Label>Theme</Label>
                  <div className="flex items-center gap-2">
                    <Select value={pendingTheme} onValueChange={(v) => setPendingTheme(v as "light" | "dark")}>
                      <SelectTrigger className="w-[200px]">
                        <SelectValue placeholder="Select theme" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="light">Light</SelectItem>
                        <SelectItem value="dark">Dark</SelectItem>
                      </SelectContent>
                    </Select>
                    <Button
                      variant="outline"
                      onClick={async () => {
                        setSavingTheme(true);
                        setTheme(pendingTheme);
                        toast.success("Theme saved");
                        setSavingTheme(false);
                      }}
                      disabled={savingTheme}
                    >
                      {savingTheme ? "Saving..." : "Save Theme"}
                    </Button>
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

                <div className="space-y-2">
                  <Label>Agency Name</Label>
                  <Input
                    value={agencyDisplayName}
                    onChange={(e) => setAgencyDisplayName(e.target.value)}
                    placeholder="Las Terrenas Properties"
                  />
                </div>

                <div className="space-y-2">
                  <Label>Invoice Address (shown on PDF)</Label>
                  <Input
                    value={address}
                    onChange={(e) => setAddress(e.target.value)}
                    placeholder="278 calle Duarte, LTI building, Las Terrenas"
                  />
                </div>

                <div className="pt-2">
                  <Button onClick={onSaveAgencyInfo} disabled={saving}>
                    {saving ? "Saving..." : "Save Agency Info"}
                  </Button>
                </div>

                <div className="space-y-2">
                  <Label>Brand Logo (PNG)</Label>
                  <div className="flex items-center gap-3">
                    <input
                      type="file"
                      accept="image/png"
                      onChange={(e) => onUploadLogo(e.target.files?.[0])}
                    />
                    {logoUrl ? (
                      <img src={logoUrl} alt="Logo" className="h-10 w-auto rounded border" />
                    ) : (
                      <div className="text-xs text-muted-foreground">No logo uploaded</div>
                    )}
                  </div>
                  <div className="text-xs text-muted-foreground">
                    The logo is stored as branding/logo.png and printed on invoice PDFs.
                  </div>
                </div>

                <div className="space-y-2">
                  <Label>Favicon (PNG or ICO)</Label>
                  <div className="flex items-center gap-3">
                    <input
                      type="file"
                      accept="image/png,image/x-icon"
                      onChange={(e) => onUploadFavicon(e.target.files?.[0])}
                    />
                    {faviconUrl ? (
                      <img src={faviconUrl} alt="Favicon" className="h-8 w-8 rounded border" />
                    ) : (
                      <div className="text-xs text-muted-foreground">Using default favicon</div>
                    )}
                  </div>
                  <div className="text-xs text-muted-foreground">
                    This replaces the browser tab icon. If not set, the default /favicon.ico is used.
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