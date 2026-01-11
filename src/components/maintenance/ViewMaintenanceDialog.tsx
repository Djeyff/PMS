import React, { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { MaintenanceRow } from "@/services/maintenance";
import { formatDateTimeInTZ } from "@/utils/datetime";

type Props = {
  request: MaintenanceRow;
  tz?: string;
  size?: React.ComponentProps<typeof Button>["size"];
};

const ViewMaintenanceDialog = ({ request, tz, size = "default" }: Props) => {
  const [open, setOpen] = useState(false);

  const propName = request.property?.name ?? request.property_id.slice(0, 8);
  const statusLabel = request.status.replace("_", " ");
  const createdLabel = tz ? formatDateTimeInTZ(request.created_at, tz) : new Date(request.created_at).toLocaleString();

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size={size} variant="outline">View</Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="text-base sm:text-lg">{request.title}</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-1">
              <div className="text-xs text-muted-foreground">Property</div>
              <div className="text-sm">{propName}</div>
            </div>
            <div className="space-y-1">
              <div className="text-xs text-muted-foreground">Priority</div>
              <Badge variant="secondary" className="capitalize w-fit">{request.priority}</Badge>
            </div>
            <div className="space-y-1">
              <div className="text-xs text-muted-foreground">Status</div>
              <Badge className="capitalize w-fit">{statusLabel}</Badge>
            </div>
            <div className="space-y-1">
              <div className="text-xs text-muted-foreground">Due date</div>
              <div className="text-sm">{request.due_date ?? "—"}</div>
            </div>
            <div className="space-y-1 sm:col-span-2">
              <div className="text-xs text-muted-foreground">Created</div>
              <div className="text-sm">{createdLabel}</div>
            </div>
          </div>

          <div className="space-y-1">
            <div className="text-xs text-muted-foreground">Description</div>
            <div className="rounded-md border bg-card p-3 text-sm whitespace-pre-line">
              {request.description?.trim()
                ? request.description
                : "No description provided."}
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default ViewMaintenanceDialog;