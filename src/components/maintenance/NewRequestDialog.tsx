import React, { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useAuth } from "@/contexts/AuthProvider";
import { useQuery } from "@tanstack/react-query";
import { fetchProperties } from "@/services/properties";
import { createMaintenanceRequest } from "@/services/maintenance";
import { toast } from "sonner";

const NewRequestDialog = ({ onCreated }: { onCreated?: () => void }) => {
  const { role, user, profile } = useAuth();
  const agencyId = profile?.agency_id ?? null;
  const canCreate = role === "agency_admin" && !!agencyId;

  const { data: properties } = useQuery({
    queryKey: ["maint-props", agencyId],
    enabled: canCreate,
    queryFn: () => fetchProperties({ role, userId: user?.id ?? null, agencyId }),
  });

  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);

  const [propertyId, setPropertyId] = useState<string>("");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [priority, setPriority] = useState<"low" | "medium" | "high">("medium");
  const [dueDate, setDueDate] = useState<string>("");

  const onSave = async () => {
    if (!propertyId || !title || !priority) {
      toast.error("Please fill property, title and priority");
      return;
    }
    setSaving(true);
    try {
      await createMaintenanceRequest({
        property_id: propertyId,
        title,
        description: description || undefined,
        priority,
        due_date: dueDate || undefined,
      });
      toast.success("Maintenance request created");
      setOpen(false);
      setPropertyId("");
      setTitle("");
      setDescription("");
      setPriority("medium");
      setDueDate("");
      onCreated?.();
    } catch (e: any) {
      toast.error(e?.message ?? "Failed to create request");
    } finally {
      setSaving(false);
    }
  };

  if (!canCreate) return null;

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button>New Request</Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Create Maintenance Request</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-2">
            <Label>Property</Label>
            <Select value={propertyId} onValueChange={setPropertyId}>
              <SelectTrigger className="min-w-[260px]">
                <SelectValue placeholder="Select property" />
              </SelectTrigger>
              <SelectContent>
                {(properties ?? []).map((p) => (
                  <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>Title</Label>
            <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g., AC not cooling" />
          </div>
          <div className="space-y-2">
            <Label>Description</Label>
            <Textarea value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Details (optional)" />
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Priority</Label>
              <Select value={priority} onValueChange={(v) => setPriority(v as "low" | "medium" | "high")}>
                <SelectTrigger>
                  <SelectValue placeholder="Priority" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="low">Low</SelectItem>
                  <SelectItem value="medium">Medium</SelectItem>
                  <SelectItem value="high">High</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Due Date</Label>
              <Input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
            </div>
          </div>
          <div className="pt-2">
            <Button onClick={onSave} disabled={saving}>
              {saving ? "Saving..." : "Create Request"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default NewRequestDialog;