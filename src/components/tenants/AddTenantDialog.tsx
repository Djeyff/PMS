import React, { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { inviteTenant } from "@/services/tenants";
import { toast } from "sonner";

type Props = {
  onCreated?: (id: string) => void;
  triggerLabel?: string;
};

const AddTenantDialog = ({ onCreated, triggerLabel = "Add Tenant" }: Props) => {
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);

  const [email, setEmail] = useState("");
  const [first, setFirst] = useState("");
  const [last, setLast] = useState("");

  const onSave = async () => {
    if (!email) {
      toast.error("Please enter the tenant's email");
      return;
    }
    setSaving(true);
    try {
      const { id } = await inviteTenant({ email, first_name: first || undefined, last_name: last || undefined });
      toast.success("Tenant invited");
      setOpen(false);
      setEmail("");
      setFirst("");
      setLast("");
      onCreated?.(id);
    } catch (e: any) {
      console.error("Invite tenant failed:", e);
      toast.error(e?.message ?? "Failed to invite tenant");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button>{triggerLabel}</Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Add Tenant</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-2">
            <Label>Email</Label>
            <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="tenant@example.com" />
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>First name (optional)</Label>
              <Input value={first} onChange={(e) => setFirst(e.target.value)} placeholder="First name" />
            </div>
            <div className="space-y-2">
              <Label>Last name (optional)</Label>
              <Input value={last} onChange={(e) => setLast(e.target.value)} placeholder="Last name" />
            </div>
          </div>
          <div className="pt-2">
            <Button onClick={onSave} disabled={saving}>
              {saving ? "Inviting..." : "Invite Tenant"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default AddTenantDialog;