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
import { deleteTenant } from "@/services/tenants";
import { toast } from "sonner";

type Props = {
  id: string;
  displayName: string;
  onDeleted?: () => void;
};

const DeleteTenantDialog = ({ id, displayName, onDeleted }: Props) => {
  const [open, setOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const onConfirm = async () => {
    setDeleting(true);
    try {
      await deleteTenant(id);
      toast.success("Tenant deleted");
      setOpen(false);
      onDeleted?.();
    } catch (e: any) {
      console.error("Delete tenant failed:", e);
      toast.error(e?.message ?? "Failed to delete tenant");
    } finally {
      setDeleting(false);
    }
  };

  return (
    <AlertDialog open={open} onOpenChange={setOpen}>
      <AlertDialogTrigger asChild>
        <Button size="sm" variant="destructive">Delete</Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Delete tenant</AlertDialogTitle>
          <AlertDialogDescription>
            This will permanently remove {displayName}. This action cannot be undone.
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

export default DeleteTenantDialog;