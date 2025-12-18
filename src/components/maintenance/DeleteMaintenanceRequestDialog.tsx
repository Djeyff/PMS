import React, { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle
} from "@/components/ui/alert-dialog";
import { Trash2 } from "lucide-react";
import { deleteMaintenanceRequest } from "@/services/maintenance";
import { logAction } from "@/services/activity-logs";
import { toast } from "sonner";

type Props = {
  id: string;
  metadata?: any;
  onDeleted?: () => void;
  size?: "icon" | "sm" | "default";
};

const DeleteMaintenanceRequestDialog = ({ id, metadata, onDeleted, size = "sm" }: Props) => {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);

  const handleDelete = async () => {
    setLoading(true);
    try {
      await deleteMaintenanceRequest(id);
      await logAction({
        action: "delete_maintenance_request",
        entity_type: "maintenance_request",
        entity_id: id,
        metadata: metadata ?? {},
      });
      toast.success("Maintenance request deleted");
      setOpen(false);
      onDeleted?.();
    } catch (e: any) {
      toast.error(e?.message ?? "Failed to delete");
    } finally {
      setLoading(false);
    }
  };

  return (
    <AlertDialog open={open} onOpenChange={setOpen}>
      <Button variant="destructive" size={size} onClick={() => setOpen(true)} title="Delete request">
        <Trash2 className="h-4 w-4 mr-1" />
        {size !== "icon" ? "Delete" : null}
      </Button>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Delete this maintenance request?</AlertDialogTitle>
          <AlertDialogDescription>This action cannot be undone.</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={loading}>Cancel</AlertDialogCancel>
          <AlertDialogAction onClick={handleDelete} disabled={loading}>
            {loading ? "Deleting..." : "Delete"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
};

export default DeleteMaintenanceRequestDialog;