import React, { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { updateTenantProfile } from "@/services/tenants";
import { toast } from "sonner";

type Props = {
  tenant: { id: string; first_name: string | null; last_name: string | null; phone?: string | null; email?: string | null };
  onUpdated?: () => void;
};

const EditTenantDialog = ({ tenant, onUpdated }: Props) => {
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);

  const [first, setFirst] = useState(tenant.first_name ?? "");
  const [last, setLast] = useState(tenant.last_name ?? "");
  const [phone, setPhone] = useState(tenant.phone ?? "");
  const [email, setEmail] = useState(tenant.email ?? "");

  const reset = () => {
    setFirst(tenant.first_name ?? "");
    setLast(tenant.last_name ?? "");
    setPhone(tenant.phone ?? "");
    setEmail(tenant.email ?? "");
  };

  const onSave = async () => {
    setSaving(true);
    try {
      await updateTenantProfile(tenant.id, {
        first_name: first || null,
        last_name: last || null,
        phone: phone || null,
        email: email || null,
      });
      toast.success("Tenant updated");
      setOpen(false);
      onUpdated?.();
    } catch (e: any) {
      console.error("Update tenant failed:", e);
      toast.error(e?.message ?? "Failed to update tenant");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { setOpen(v); if (!v) reset(); }}>
      <DialogTrigger asChild>
        <Button size="sm" variant="secondary">Edit</Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Edit Tenant</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-2">
            <Label>Email (optional)</Label>
            <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="tenant@example.com" />
          </div>
          <div className="space-y-2">
            <Label>First name</Label>
            <Input value={first} onChange={(e) => setFirst(e.target.value)} placeholder="First name" />
          </div>
          <div className="space-y-2">
            <Label>Last name</Label>
            <Input value={last} onChange={(e) => setLast(e.target.value)} placeholder="Last name" />
          </div>
          <div className="space-y-2">
            <Label>Phone</Label>
            <Input type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="+1 555 123 4567" />
          </div>
          <div className="pt-2">
            <Button onClick={onSave} disabled={saving}>{saving ? "Saving..." : "Save changes"}</Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default EditTenantDialog;