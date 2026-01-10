"use client";

import React, { useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import EditManagerReportDialog from "@/components/manager/EditManagerReportDialog";
import ManagerReportInvoiceDialog from "@/components/manager/ManagerReportInvoiceDialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { useToast } from "@/components/ui/use-toast";
import { deleteManagerReport } from "@/services/manager-reports";

type Props = {
  report: any;
  onEdited: () => void;
};

const fmt = (amount: number, currency: "USD" | "DOP") =>
  new Intl.NumberFormat(undefined, { style: "currency", currency }).format(amount);

const SavedManagerReportItemMobile: React.FC<Props> = ({ report, onEdited }) => {
  const [openEdit, setOpenEdit] = useState(false);
  const [openInvoice, setOpenInvoice] = useState(false);
  const [openDelete, setOpenDelete] = useState(false);
  const { toast } = useToast();

  const ownersLeftoverDop = Math.max(0, Number(report.dop_cash_total || 0) - Number(report.fee_deducted_dop || 0));

  const monthLabel = (() => {
    const parts = String(report.month ?? "").split("-");
    if (parts.length !== 2) return report.month;
    const y = Number(parts[0]);
    const m = Number(parts[1]) - 1;
    if (!Number.isFinite(y) || !Number.isFinite(m)) return report.month;
    const d = new Date(y, m, 1);
    const lbl = d.toLocaleString(undefined, { month: "long", year: "numeric" });
    return lbl.charAt(0).toUpperCase() + lbl.slice(1);
  })();

  const confirmDelete = async () => {
    try {
      await deleteManagerReport(report.id);
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
        <div className="font-semibold text-base">{monthLabel}</div>
        <div className="mt-2 text-sm space-y-1">
          <div>USD total: {fmt(Number(report.usd_total || 0), "USD")}</div>
          <div>DOP total: {fmt(Number(report.dop_total || 0), "DOP")}</div>
          <div>Avg rate: {report.avg_rate != null ? Number(report.avg_rate).toFixed(6) : "—"}</div>
          <div>Fee %: {Number(report.fee_percent || 0).toFixed(2)}%</div>
          <div>Fee base: {fmt(Number(report.fee_base_dop || 0), "DOP")}</div>
          <div>Fee: {fmt(Number(report.fee_dop || 0), "DOP")}</div>
          <div>Deducted: {fmt(Number(report.fee_deducted_dop || 0), "DOP")}</div>
          <div>Owners leftover: {fmt(ownersLeftoverDop, "DOP")}</div>
        </div>
        <div className="mt-3 flex flex-wrap gap-2">
          <Button variant="outline" size="sm" onClick={() => setOpenEdit(true)}>Edit</Button>
          <Button size="sm" onClick={() => setOpenInvoice(true)}>Invoice-style</Button>
          <Button variant="destructive" size="sm" onClick={() => setOpenDelete(true)}>Delete</Button>
        </div>
        <EditManagerReportDialog
          report={report}
          open={openEdit}
          onOpenChange={(v) => {
            setOpenEdit(v);
            if (!v) onEdited();
          }}
          onSaved={() => onEdited()}
        />
        <ManagerReportInvoiceDialog
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
              <AlertDialogTitle>Delete manager report?</AlertDialogTitle>
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

export default SavedManagerReportItemMobile;