import React, { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogTrigger,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogCancel,
  AlertDialogAction,
} from "@/components/ui/alert-dialog";
import { deleteLease } from "@/services/leases";
import { toast } from "sonner";

const DeleteLeaseDialog = ({ id, label, onDeleted }: { id: string; label?: string; onDeleted?: () => void }) => {
  const [open, setOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const onConfirm = async () => {
    setDeleting(true);
    try {
      await deleteLease(id);
      toast.success("Lease deleted");
      setOpen(false);
      onDeleted?.();
    } catch (e: any) {
      console.error("Delete lease failed:", e);
      toast.error(e?.message ?? "Failed to delete lease");
    } finally {
      setDeleting(false);
    }
  };

  return (
    <AlertDialog open={open} onOpenChange={setOpen}>
      <AlertDialogTrigger asChild>
        <Button variant="destructive" size="sm">{label ?? "Delete"}</Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Delete lease</AlertDialogTitle>
          <AlertDialogDescription>
            This action cannot be undone. This will permanently remove the selected lease.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={deleting}>Cancel</AlertDialogCancel>
          <AlertDialogAction onClick={onConfirm} disabled={deleting}>
            {deleting ? "Deleting..." : "Confirm"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
};

export default DeleteLeaseDialog;