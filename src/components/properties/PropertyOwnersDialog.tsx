import React, { useMemo, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { fetchOwnerProfilesInAgency } from "@/services/users";
import { addPropertyOwner, fetchPropertyOwners, updatePropertyOwner, deletePropertyOwner } from "@/services/property-owners";
import { useAuth } from "@/contexts/AuthProvider";
import { toast } from "sonner";

const PropertyOwnersDialog = ({ propertyId }: { propertyId: string }) => {
  const { profile } = useAuth();
  const agencyId = profile?.agency_id ?? null;
  const qc = useQueryClient();

  const { data: allOwners } = useQuery({
    queryKey: ["owners", agencyId],
    enabled: !!agencyId,
    queryFn: () => fetchOwnerProfilesInAgency(agencyId!),
  });

  const { data: propOwners, isLoading } = useQuery({
    queryKey: ["property-owners", propertyId],
    queryFn: () => fetchPropertyOwners(propertyId),
  });

  const [open, setOpen] = useState(false);
  const [addingOwnerId, setAddingOwnerId] = useState("");
  const [addingPercent, setAddingPercent] = useState<string>("");

  const availableOwners = useMemo(() => {
    const existing = new Set((propOwners ?? []).map(po => po.owner_id));
    return (allOwners ?? []).filter(o => !existing.has(o.id));
  }, [allOwners, propOwners]);

  const addMutation = useMutation({
    mutationFn: () => addPropertyOwner({
      property_id: propertyId,
      owner_id: addingOwnerId,
      ownership_percent: addingPercent === "" ? undefined : Number(addingPercent),
    }),
    onSuccess: () => {
      toast.success("Owner added to property");
      setAddingOwnerId("");
      setAddingPercent("");
      qc.invalidateQueries({ queryKey: ["property-owners", propertyId] });
    },
    onError: (e: any) => toast.error(e?.message ?? "Failed to add owner"),
  });

  const savePercent = (ownerId: string, percent: string) => {
    const val = percent === "" ? null : Number(percent);
    updatePropertyOwner({ property_id: propertyId, owner_id: ownerId, ownership_percent: val })
      .then(() => {
        toast.success("Share updated");
        qc.invalidateQueries({ queryKey: ["property-owners", propertyId] });
      })
      .catch((e) => toast.error(e?.message ?? "Failed to update share"));
  };

  const removeOwner = (ownerId: string) => {
    deletePropertyOwner({ property_id: propertyId, owner_id: ownerId })
      .then(() => {
        toast.success("Owner removed");
        qc.invalidateQueries({ queryKey: ["property-owners", propertyId] });
      })
      .catch((e) => toast.error(e?.message ?? "Failed to remove owner"));
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild><Button size="sm" variant="outline">Manage Owners</Button></DialogTrigger>
      <DialogContent className="max-w-xl">
        <DialogHeader><DialogTitle>Property Owners</DialogTitle></DialogHeader>
        <div className="space-y-4">
          <div className="space-y-2">
            <Label>Add owner</Label>
            <div className="flex items-center gap-2">
              <Select value={addingOwnerId} onValueChange={setAddingOwnerId}>
                <SelectTrigger className="min-w-[240px]">
                  <SelectValue placeholder="Select owner" />
                </SelectTrigger>
                <SelectContent>
                  {(availableOwners ?? []).map((o) => (
                    <SelectItem key={o.id} value={o.id}>
                      {[o.first_name, o.last_name].filter(Boolean).join(" ") || "—"}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Input
                type="number"
                min={0}
                max={100}
                step="0.01"
                className="w-28"
                placeholder="%"
                value={addingPercent}
                onChange={(e) => setAddingPercent(e.target.value)}
              />
              <Button
                size="sm"
                onClick={() => {
                  if (!addingOwnerId) {
                    toast.error("Choose an owner");
                    return;
                  }
                  addMutation.mutate();
                }}
                disabled={addMutation.isPending}
              >
                {addMutation.isPending ? "Adding..." : "Add"}
              </Button>
            </div>
            <div className="text-xs text-muted-foreground">Leave percent empty for unspecified share.</div>
          </div>

          <div className="space-y-2">
            <Label>Current owners</Label>
            {isLoading ? (
              <div className="text-sm text-muted-foreground">Loading...</div>
            ) : (propOwners ?? []).length === 0 ? (
              <div className="text-sm text-muted-foreground">No owners assigned.</div>
            ) : (
              <div className="space-y-2">
                {(propOwners ?? []).map((po) => {
                  const owner = (allOwners ?? []).find(o => o.id === po.owner_id);
                  const name = [owner?.first_name, owner?.last_name].filter(Boolean).join(" ") || "—";
                  const [localPercent, setLocalPercent] = useState<string>(po.ownership_percent == null ? "" : String(po.ownership_percent));
                  // Since we cannot use hooks inside loop in React, rewrite as subcomponent inline function:
                  return (
                    <OwnerRow
                      key={po.owner_id}
                      name={name}
                      percent={po.ownership_percent}
                      onUpdate={(newVal) => savePercent(po.owner_id, newVal)}
                      onRemove={() => removeOwner(po.owner_id)}
                    />
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};

const OwnerRow = ({ name, percent, onUpdate, onRemove }: { name: string; percent: number | null; onUpdate: (v: string) => void; onRemove: () => void; }) => {
  const [val, setVal] = React.useState<string>(percent == null ? "" : String(percent));
  return (
    <div className="flex items-center gap-2">
      <div className="flex-1">{name}</div>
      <Input
        type="number"
        min={0}
        max={100}
        step="0.01"
        className="w-28"
        placeholder="%"
        value={val}
        onChange={(e) => setVal(e.target.value)}
        onBlur={() => onUpdate(val)}
      />
      <Button size="sm" variant="destructive" onClick={onRemove}>Remove</Button>
    </div>
  );
};

export default PropertyOwnersDialog;