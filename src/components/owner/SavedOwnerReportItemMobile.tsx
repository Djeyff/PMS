"use client";

import React, { useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import EditOwnerReportDialog from "@/components/owner/EditOwnerReportDialog";
import OwnerReportInvoiceDialog from "@/components/owner/OwnerReportInvoiceDialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { useToast } from "@/components/ui/use-toast";
import { deleteOwnerReport } from "@/services/owner-reports";

type Props = {
  report: any;
  ownerName: string;
  onEdited: () => void;
};

const fmt = (amount: number, currency: "USD" | "DOP") =>
  new Intl.NumberFormat(undefined, { style: "currency", currency }).format(amount);

const SavedOwnerReportItemMobile: React.FC<Props> = ({ report, ownerName, onEdited }) => {
  const [openEdit, setOpenEdit] = useState(false);
  const [openInvoice, setOpenInvoice] = useState(false);
  const [openDelete, setOpenDelete] = useState(false);
  const { toast } = useToast();

  const confirmDelete = async () => {
    try {
      await deleteOwnerReport(report.id);
      toast({ title: "Report deleted", description: `Deleted ${report.month}.` });
      setOpenDelete(false);
      onEdited();
    } catch (e: any) {
      toast({ title: "Delete failed", description: e.message, variant: "destructive" });
    }
  };

  return (
    <Card className="mb-3">
      <CardContent className="p-3">
        <div className="font-semibold text-base">{report.month}</div>
        <div className="mt-2 text-sm space-y-1">
          <div>Owner: <span className="font-medium">{ownerName}</span></div>
          <div>USD total: {fmt(Number(report.usd_total || 0), "USD")}</div>
          <div>DOP total: {fmt(Number(report.dop_total || 0), "DOP")}</div>
          <div>Avg rate: {report.avg_rate != null ? Number(report.avg_rate).toFixed(6) : "—"}</div>
        </div>
        <div className="mt-3 flex flex-wrap gap-2">
          <Button variant="outline" size="sm" onClick={() => setOpenEdit(true)}>Edit</Button>
          <Button size="sm" onClick={() => setOpenInvoice(true)}>View</Button>
          <Button variant="destructive" size="sm" onClick={() => setOpenDelete(true)}>Delete</Button>
        </div>
        <EditOwnerReportDialog
          report={report}
          open={openEdit}
          onOpenChange={(v) => {
            setOpenEdit(v);
            if (!v) onEdited();
          }}
          onSaved={() => onEdited()}
        />
        <OwnerReportInvoiceDialog
          report={report}
          open={openInvoice}
          onOpenChange={(v) => {
            setOpenInvoice(v);
            if (!v) onEdited();
          }}
        />
        <AlertDialog open={openDelete} onOpenChange={setOpenDelete}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Delete owner report?</AlertDialogTitle>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction onClick={confirmDelete}>Delete</AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </CardContent>
    </Card>
  );
};

export default SavedOwnerReportItemMobile;