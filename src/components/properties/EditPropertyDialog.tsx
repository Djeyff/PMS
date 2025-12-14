import React, { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import type { Property } from "@/services/properties";
import { updateProperty } from "@/services/properties";
import { toast } from "sonner";

type Props = {
  property: Property;
  onUpdated?: () => void;
};

const EditPropertyDialog = ({ property, onUpdated }: Props) => {
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);

  const [name, setName] = useState(property.name);
  const [type, setType] = useState<Property["type"]>(property.type);
  const [status, setStatus] = useState<Property["status"]>(property.status);
  const [city, setCity] = useState(property.city ?? "");
  const [bedrooms, setBedrooms] = useState<number | "">(property.bedrooms ?? "");

  const reset = () => {
    setName(property.name);
    setType(property.type);
    setStatus(property.status);
    setCity(property.city ?? "");
    setBedrooms(property.bedrooms ?? "");
  };

  const onSave = async () => {
    if (!name) {
      toast.error("Please enter a property name");
      return;
    }
    setSaving(true);
    try {
      await updateProperty(property.id, {
        name,
        type,
        status,
        city: city || undefined,
        bedrooms: bedrooms === "" ? undefined : Number(bedrooms),
      });
      toast.success("Property updated");
      setOpen(false);
      onUpdated?.();
    } catch (e: any) {
      console.error("Update property failed:", e);
      toast.error(e?.message ?? "Failed to update property");
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
          <DialogTitle>Edit Property</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-2">
            <Label>Name</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Property name" />
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Type</Label>
              <Select value={type} onValueChange={(v) => setType(v as Property["type"])}>
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
              <Label>Status</Label>
              <Select value={status} onValueChange={(v) => setStatus(v as Property["status"])}>
                <SelectTrigger>
                  <SelectValue placeholder="Select status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="active">Active</SelectItem>
                  <SelectItem value="rented">Rented</SelectItem>
                  <SelectItem value="vacant">Vacant</SelectItem>
                  <SelectItem value="maintenance">Maintenance</SelectItem>
                  <SelectItem value="sold">Sold</SelectItem>
                </SelectContent>
              </Select>
            </div>
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

export default EditPropertyDialog;