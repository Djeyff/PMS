import React, { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { MaintenanceRow, updateMaintenanceRequest } from "@/services/maintenance";

type Props = {
  request: MaintenanceRow;
  onUpdated?: () => void;
  size?: React.ComponentProps<typeof Button>["size"];
};

const EditMaintenanceDialog = ({ request, onUpdated, size = "default" }: Props) => {
  const [open, setOpen] = useState(false);
  const [dueDate, setDueDate] = useState<string>(request.due_date ?? "");
  const [description, setDescription] = useState<string>(request.description ?? "");
  const [saving, setSaving] = useState(false);

  const onSave = async () => {
    setSaving(true);
    try {
      const payload = {
        due_date: dueDate.trim() ? dueDate.trim() : null,
        description: description.trim() ? description.trim() : null,
      };
      await updateMaintenanceRequest(request.id, payload);
      toast.success("Maintenance updated");
      setOpen(false);
      onUpdated?.();
    } catch (e: any) {
      toast.error(e?.message ?? "Failed to update maintenance");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        setOpen(v);
        if (v) {
          setDueDate(request.due_date ?? "");
          setDescription(request.description ?? "");
        }
      }}
    >
      <DialogTrigger asChild>
        <Button size={size} variant="outline">Edit</Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Edit maintenance</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div>
            <Label className="block mb-1">Due date</Label>
            <Input
              type="date"
              value={dueDate}
              onChange={(e) => setDueDate(e.target.value)}
            />
          </div>
          <div>
            <Label className="block mb-1">Description</Label>
            <Textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Update the maintenance description..."
              className="min-h-[100px]"
            />
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
            <Button onClick={onSave} disabled={saving}>
              {saving ? "Saving..." : "Save changes"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default EditMaintenanceDialog;