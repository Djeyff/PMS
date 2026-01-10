"use client";

import React from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import LogsDialog from "@/components/maintenance/LogsDialog";
import DeleteMaintenanceRequestDialog from "@/components/maintenance/DeleteMaintenanceRequestDialog";

type Props = {
  request: any;
  tz: string;
  isAdmin: boolean;
  onUpdateStatus: (id: string, status: "open" | "in_progress" | "closed") => void;
  onUpdated?: () => void;
};

const MaintenanceRequestItemMobile: React.FC<Props> = ({ request, tz, isAdmin, onUpdateStatus, onUpdated }) => {
  const propName = request.property?.name ?? (request.property_id ? String(request.property_id).slice(0, 8) : "Property");

  return (
    <Card className="mb-3">
      <CardContent className="p-3 space-y-2">
        <div className="flex items-start justify-between">
          <div className="font-semibold text-base truncate">{request.title}</div>
          <div className="text-xs capitalize text-muted-foreground ml-3">{String(request.status).replace("_", " ")}</div>
        </div>
        <div className="grid grid-cols-[120px,1fr] gap-3 text-sm">
          <div className="text-xs text-muted-foreground">Property</div>
          <div className="font-medium">{propName}</div>
          <div className="text-xs text-muted-foreground">Priority</div>
          <div className="font-medium capitalize">{request.priority}</div>
          <div className="text-xs text-muted-foreground">Due</div>
          <div className="font-medium">{request.due_date ?? "—"}</div>
        </div>

        <div className="flex flex-wrap gap-2 pt-1">
          {isAdmin ? (
            <>
              {request.status !== "in_progress" && (
                <Button size="sm" variant="outline" onClick={() => onUpdateStatus(request.id, "in_progress")}>Start</Button>
              )}
              {request.status !== "closed" && (
                <Button size="sm" variant="outline" onClick={() => onUpdateStatus(request.id, "closed")}>Close</Button>
              )}
              <DeleteMaintenanceRequestDialog
                id={request.id}
                metadata={{ title: request.title, property_id: request.property?.id ?? request.property_id, status: request.status, due_date: request.due_date }}
                onDeleted={() => onUpdated && onUpdated()}
                size="sm"
              />
            </>
          ) : null}
          <LogsDialog request={request} tz={tz} onUpdated={() => onUpdated && onUpdated()} />
        </div>
      </CardContent>
    </Card>
  );
};

export default MaintenanceRequestItemMobile;