import React, { useMemo, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import type { OwnerReportRow } from "@/services/owner-reports";
import { updateOwnerReport } from "@/services/owner-reports";
import { useToast } from "@/components/ui/use-toast";

type Props = {
  report: OwnerReportRow;
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onSaved?: (updated: OwnerReportRow) => void;
};

const EditOwnerReportDialog: React.FC<Props> = ({ report, open, onOpenChange, onSaved }) => {
  const { toast } = useToast();
  const [avgRate, setAvgRate] = useState<string>(report.avg_rate == null ? "" : String(report.avg_rate));

  const rateNum = useMemo(() => {
    const n = Number(avgRate);
    return Number.isFinite(n) && n > 0 ? n : NaN;
  }, [avgRate]);

  const handleSave = async () => {
    if (report.usd_total > 0 && Number.isNaN(rateNum)) {
      toast({ title: "Average rate required", description: "Enter a valid USD/DOP average rate.", variant: "destructive" });
      return;
    }

    const updated = await updateOwnerReport(report.id, {
      avg_rate: Number.isNaN(rateNum) ? null : rateNum,
      updated_at: new Date().toISOString(),
    });

    toast({ title: "Owner report updated", description: "Values saved." });
    onSaved?.(updated);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Edit Owner Report</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div>
              <Label>Month</Label>
              <div className="text-sm text-muted-foreground">{report.month} ({report.start_date} to {report.end_date})</div>
            </div>
            <div>
              <Label>Owner</Label>
              <div className="text-sm text-muted-foreground">{report.owner_id}</div>
            </div>
          </div>
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
          <div className="text-xs text-muted-foreground">
            This rate is used for reference in the view; saved totals remain in original currencies.
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

export default EditOwnerReportDialog;