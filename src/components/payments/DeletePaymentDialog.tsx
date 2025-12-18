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
import { deletePayment } from "@/services/payments";
import { toast } from "sonner";

type Props = {
  id: string;
  summary?: string;
  onDeleted?: () => void;
};

const DeletePaymentDialog = ({ id, summary, onDeleted }: Props) => {
  const [open, setOpen] = useState(false);
  const [confirmStep, setConfirmStep] = useState<1 | 2>(1);
  const [loading, setLoading] = useState(false);

  const reset = () => {
    setConfirmStep(1);
    setOpen(false);
  };

  const handlePrimary = async () => {
    if (confirmStep === 1) {
      setConfirmStep(2);
      return;
    }
    setLoading(true);
    try {
      await deletePayment(id);
      toast.success("Payment deleted");
      reset();
      onDeleted?.();
    } catch (e: any) {
      toast.error(e?.message ?? "Failed to delete payment");
    } finally {
      setLoading(false);
    }
  };

  return (
    <AlertDialog open={open} onOpenChange={(v) => { if (!v) reset(); else setOpen(v); }}>
      <Button variant="destructive" size="sm" onClick={() => setOpen(true)}>
        <Trash2 className="h-4 w-4 mr-1" />
        Delete
      </Button>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>
            {confirmStep === 1 ? "Delete this payment?" : "Are you absolutely sure?"}
          </AlertDialogTitle>
          <AlertDialogDescription>
            {confirmStep === 1
              ? "This action cannot be undone. You will be asked to confirm once more."
              : "This will permanently remove the payment record. This action cannot be undone."}
            {summary ? (
              <div className="mt-2 text-sm text-foreground/80">
                {summary}
              </div>
            ) : null}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={loading}>Cancel</AlertDialogCancel>
          <AlertDialogAction onClick={handlePrimary} disabled={loading}>
            {loading ? "Deleting..." : confirmStep === 1 ? "Continue" : "Delete"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
};

export default DeletePaymentDialog;