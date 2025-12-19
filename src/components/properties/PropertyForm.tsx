import React, { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { createProperty } from "@/services/properties";
import { toast } from "sonner";
import GroupPicker from "@/components/properties/GroupPicker";

type Props = {
  agencyId: string;
  onCreated?: () => void;
};

const PropertyForm = ({ agencyId, onCreated }: Props) => {
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);

  const [name, setName] = useState("");
  const [type, setType] = useState<"villa" | "apartment" | "house" | "studio" | "office" | "other" | "restaurant" | "banca" | "business" | "land" | "colmado" | "rentacar">("apartment");
  const [city, setCity] = useState("");
  const [bedrooms, setBedrooms] = useState<number | "">("");
  const [locationGroup, setLocationGroup] = useState<string>("");
  
  // Set default city when dialog opens (avoid side-effects in JSX)
  useEffect(() => {
    if (open && city === "") {
      setCity("Las Terrenas");
    }
  }, [open, city]);

  const handleSave = async () => {
    if (!name) {
      toast.error("Please enter a property name");
      return;
    }
    setSaving(true);
    try {
      // Normalize type to match DB constraint expected values
      const normalizedType =
        type === "colmado" ? ("Colmado" as any) :
        type === "banca" ? ("Banca" as any) :
        (type as any);

      await createProperty({
        agency_id: agencyId,
        name,
        type: normalizedType,
        city: city || undefined,
        bedrooms: bedrooms === "" ? undefined : Number(bedrooms),
        location_group: locationGroup || undefined,
      });
      toast.success("Property created");
      setOpen(false);
      setName("");
      setType("apartment");
      setCity("Las Terrenas");
      setBedrooms("");
      setLocationGroup("");
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
                <SelectItem value="restaurant">Restaurant</SelectItem>
                <SelectItem value="banca">Banca</SelectItem>
                <SelectItem value="business">Business</SelectItem>
                <SelectItem value="land">Land</SelectItem>
                <SelectItem value="colmado">Colmado</SelectItem>
                <SelectItem value="rentacar">Rent a car</SelectItem>
                <SelectItem value="other">Other</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
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
          </div>
          <GroupPicker agencyId={agencyId} value={locationGroup} onChange={setLocationGroup} />
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