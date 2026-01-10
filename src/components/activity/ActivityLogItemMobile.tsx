"use client";

import React from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import MaintenanceHistoryInline from "@/components/activity/MaintenanceHistoryInline";

type Props = {
  item: any;
  userName: string;
  safeMeta: any;
  showHistory: boolean;
  onToggleHistory: () => void;
  onReinstatePayment?: () => void;
  onReinstateMaintenance?: () => void;
  onReinstateProperty?: () => void;
  onReinstateLease?: () => void;
  onReinstateTenant?: () => void;
};

const ActivityLogItemMobile: React.FC<Props> = ({
  item,
  userName,
  safeMeta,
  showHistory,
  onToggleHistory,
  onReinstatePayment,
  onReinstateMaintenance,
  onReinstateProperty,
  onReinstateLease,
  onReinstateTenant,
}) => {
  const when = new Date(item.created_at).toISOString().slice(0, 19).replace("T", " ");
  const actionLabel = String(item.action || "").replace(/_/g, " ");
  const entityLabel = String(item.entity_type || "").replace(/_/g, " ");
  const reqId = item.entity_id as string | undefined;

  return (
    <Card className="mb-3">
      <CardContent className="p-3 space-y-2">
        <div className="font-semibold text-base">{actionLabel}</div>
        <div className="grid grid-cols-[120px,1fr] gap-3 text-sm">
          <div className="text-xs text-muted-foreground">When</div>
          <div className="font-medium">{when}</div>
          <div className="text-xs text-muted-foreground">User</div>
          <div className="font-medium">{userName}</div>
          <div className="text-xs text-muted-foreground">Entity</div>
          <div className="font-medium">{entityLabel} {item.entity_id ? `(${String(item.entity_id).slice(0,8)})` : ""}</div>
        </div>
        <div className="text-xs whitespace-pre-wrap bg-muted/40 rounded p-2">{JSON.stringify(safeMeta, null, 2)}</div>

        {item.entity_type === "maintenance_request" && reqId ? (
          <div className="space-y-2">
            <Button
              size="sm"
              variant="outline"
              onClick={onToggleHistory}
            >
              {showHistory ? "Hide maintenance history" : "Show maintenance history"}
            </Button>
            {showHistory ? <MaintenanceHistoryInline requestId={reqId} /> : null}
          </div>
        ) : null}

        <div className="flex flex-wrap gap-2">
          {onReinstatePayment ? <Button size="sm" onClick={onReinstatePayment}>Reinstate Payment</Button> : null}
          {onReinstateMaintenance ? <Button size="sm" onClick={onReinstateMaintenance}>Reinstate Request</Button> : null}
          {onReinstateProperty ? <Button size="sm" onClick={onReinstateProperty}>Reinstate Property</Button> : null}
          {onReinstateLease ? <Button size="sm" onClick={onReinstateLease}>Reinstate Lease</Button> : null}
          {onReinstateTenant ? <Button size="sm" onClick={onReinstateTenant}>Reinstate Tenant</Button> : null}
        </div>
      </CardContent>
    </Card>
  );
};

export default ActivityLogItemMobile;