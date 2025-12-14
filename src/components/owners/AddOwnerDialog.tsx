import React, { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { inviteOwner } from "@/services/owners";
import { toast } from "sonner";

const AddOwnerDialog = ({ onCreated, triggerLabel = "Add Owner" }: { onCreated?: (id: string) => void; triggerLabel?: string }) => {
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [email, setEmail] = useState("");
  const [first, setFirst] = useState("");
  const [last, setLast] = useState("");

  const onSave = async () => {
    if (!email && !first && !last) {
      toast.error("Please enter at least a name or an email");
      return;
    }
    setSaving(true);
    try {
      const { id } = await inviteOwner({ email: email || undefined, first_name: first || undefined, last_name: last || undefined });
      toast.success("Owner added");
      setOpen(false);
      setEmail(""); setFirst(""); setLast("");
      onCreated?.(id);
    } catch (e: any) {
      console.error("Add owner failed:", e);
      toast.error(e?.message ?? "Failed to add owner");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild><Button>{triggerLabel}</Button></DialogTrigger>
      <DialogContent>
        <DialogHeader><DialogTitle>Add Owner</DialogTitle></DialogHeader>
        <div className="space-y-4">
          <div className="space-y-2">
            <Label>Email (optional)</Label>
            <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="owner@example.com (optional)" />
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
            <Button onClick={onSave} disabled={saving}>{saving ? "Adding..." : "Add Owner"}</Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default AddOwnerDialog;