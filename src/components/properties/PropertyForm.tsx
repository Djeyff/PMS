import React, { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { createProperty } from "@/services/properties";
import { toast } from "sonner";

type Props = {
  agencyId: string;
  onCreated?: () => void;
};

const PropertyForm = ({ agencyId, onCreated }: Props) => {
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);

  const [name, setName] = useState("");
  const [type, setType] = useState<"villa" | "apartment" | "house" | "studio" | "office" | "other">("apartment");
  const [city, setCity] = useState("");
  const [bedrooms, setBedrooms] = useState<number | "">("");

  const handleSave = async () => {
    if (!name) {
      toast.error("Please enter a property name");
      return;
    }
    setSaving(true);
    try {
      await createProperty({
        agency_id: agencyId,
        name,
        type,
        city: city || undefined,
        bedrooms: bedrooms === "" ? undefined : Number(bedrooms),
      });
      toast.success("Property created");
      setOpen(false);
      setName("");
      setType("apartment");
      setCity("");
      setBedrooms("");
      onCreated?.();
    } catch (e: any) {
      console.error("Create property failed:", e);
      toast.error(e?.message ?? "Failed to create property");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button>Add Property</Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>New Property</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-2">
            <Label>Name</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g., Ocean View Villa" />
          </div>
          <div className="space-y-2">
            <Label>Type</Label>
            <Select value={type} onValueChange={(v) => setType(v as any)}>
              <SelectTrigger>
                <SelectValue placeholder="Select type" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="villa">Villa</SelectItem>
                <SelectItem value="apartment">Apartment</SelectItem>
                <SelectItem value="house">House</SelectItem>
                <SelectItem value="studio">Studio</SelectItem>
                <SelectItem value="office">Office</SelectItem>
                <SelectItem value="other">Other</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>City</Label>
            <Input value={city} onChange={(e) => setCity(e.target.value)} placeholder="City" />
          </div>
          <div className="space-y-2">
            <Label>Bedrooms</Label>
            <Input
              type="number"
              min={0}
              value={bedrooms}
              onChange={(e) => setBedrooms(e.target.value === "" ? "" : Number(e.target.value))}
              placeholder="e.g., 3"
            />
          </div>
          <div className="pt-2">
            <Button onClick={handleSave} disabled={saving}>
              {saving ? "Saving..." : "Create Property"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default PropertyForm;