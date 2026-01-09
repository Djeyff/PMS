import React, { useMemo, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import type { ManagerReportRow } from "@/services/manager-reports";
import { updateManagerReport } from "@/services/manager-reports";
import { useToast } from "@/components/ui/use-toast";

type Props = {
  report: ManagerReportRow;
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onSaved?: (updated: ManagerReportRow) => void;
};

const EditManagerReportDialog: React.FC<Props> = ({ report, open, onOpenChange, onSaved }) => {
  const { toast } = useToast();
  const [avgRate, setAvgRate] = useState<string>(report.avg_rate == null ? "" : String(report.avg_rate));
  const [feePercent, setFeePercent] = useState<string>(String(report.fee_percent ?? 5));

  const rateNum = useMemo(() => {
    const n = Number(avgRate);
    return Number.isFinite(n) && n > 0 ? n : NaN;
  }, [avgRate]);

  const feePctNum = useMemo(() => {
    const n = Number(feePercent);
    return Number.isFinite(n) && n >= 0 ? n : NaN;
  }, [feePercent]);

  const handleSave = async () => {
    if (report.usd_total > 0 && Number.isNaN(rateNum)) {
      toast({ title: "Average rate required", description: "Enter a valid USD/DOP average rate.", variant: "destructive" });
      return;
    }
    if (Number.isNaN(feePctNum)) {
      toast({ title: "Fee percent invalid", description: "Enter a valid fee percent.", variant: "destructive" });
      return;
    }
    const fee_base_dop = (Number.isNaN(rateNum) ? 0 : report.usd_total * rateNum) + report.dop_total;
    const fee_dop = fee_base_dop * (feePctNum / 100);
    const fee_deducted_dop = Math.min(fee_dop, report.dop_cash_total);

    const updated = await updateManagerReport(report.id, {
      avg_rate: Number.isNaN(rateNum) ? null : rateNum,
      fee_percent: feePctNum,
      fee_base_dop,
      fee_dop,
      fee_deducted_dop,
      updated_at: new Date().toISOString(),
    });

    toast({ title: "Report updated", description: "Values recalculated and saved." });
    onSaved?.(updated);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Edit Manager Report</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div>
              <Label>Month</Label>
              <div className="text-sm text-muted-foreground">{report.month} ({report.start_date} to {report.end_date})</div>
            </div>
            <div>
              <Label>Agency</Label>
              <div className="text-sm text-muted-foreground">{report.agency_id}</div>
            </div>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div>
              <Label>Average USD/DOP rate</Label>
              <Input
                type="number"
                inputMode="decimal"
                value={avgRate}
                onChange={(e) => setAvgRate(e.target.value)}
                placeholder="e.g. 57.25"
              />
            </div>
            <div>
              <Label>Fee percent</Label>
              <Input
                type="number"
                inputMode="decimal"
                value={feePercent}
                onChange={(e) => setFeePercent(e.target.value)}
                placeholder="5"
              />
            </div>
          </div>
          <div className="text-xs text-muted-foreground">
            Fee is recalculated as (USD total × avg rate + DOP total) × (fee% / 100). Deduction is capped by DOP cash total.
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={handleSave}>Save</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default EditManagerReportDialog;