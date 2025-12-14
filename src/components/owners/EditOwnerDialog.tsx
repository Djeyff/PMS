import React, { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { updateOwnerProfile } from "@/services/owners";
import { toast } from "sonner";

const EditOwnerDialog = ({ owner, onUpdated }: { owner: { id: string; first_name: string | null; last_name: string | null }; onUpdated?: () => void }) => {
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [first, setFirst] = useState(owner.first_name ?? "");
  const [last, setLast] = useState(owner.last_name ?? "");

  const reset = () => {
    setFirst(owner.first_name ?? "");
    setLast(owner.last_name ?? "");
  };

  const onSave = async () => {
    setSaving(true);
    try {
      await updateOwnerProfile(owner.id, { first_name: first || null, last_name: last || null });
      toast.success("Owner updated");
      setOpen(false);
      onUpdated?.();
    } catch (e: any) {
      console.error("Update owner failed:", e);
      toast.error(e?.message ?? "Failed to update owner");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { setOpen(v); if (!v) reset(); }}>
      <DialogTrigger asChild><Button size="sm" variant="secondary">Edit</Button></DialogTrigger>
      <DialogContent>
        <DialogHeader><DialogTitle>Edit Owner</DialogTitle></DialogHeader>
        <div className="space-y-4">
          <div className="space-y-2"><Label>First name</Label><Input value={first} onChange={(e) => setFirst(e.target.value)} /></div>
          <div className="space-y-2"><Label>Last name</Label><Input value={last} onChange={(e) => setLast(e.target.value)} /></div>
          <div className="pt-2"><Button onClick={onSave} disabled={saving}>{saving ? "Saving..." : "Save changes"}</Button></div>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default EditOwnerDialog;