"use client";

import React from "react";
import { Card, CardContent } from "@/components/ui/card";
import EditOwnerDialog from "@/components/owners/EditOwnerDialog";
import DeleteOwnerDialog from "@/components/owners/DeleteOwnerDialog";

type Props = {
  owner: { id: string; first_name: string | null; last_name: string | null; agency_id?: string | null };
  onRefetch?: () => void;
};

const LabelRow = ({ label, value }: { label: string; value: React.ReactNode }) => (
  <div className="grid grid-cols-[110px,1fr] gap-3">
    <div className="text-xs text-muted-foreground">{label}</div>
    <div className="text-sm font-medium">{value}</div>
  </div>
);

const OwnerListItemMobile: React.FC<Props> = ({ owner, onRefetch }) => {
  const name = [owner.first_name ?? "", owner.last_name ?? ""].filter(Boolean).join(" ") || "—";
  const agencyStatus = owner.agency_id ? "Assigned" : "Unassigned";

  return (
    <Card className="mb-3">
      <CardContent className="p-3">
        <div className="font-semibold text-base">{name}</div>
        <div className="mt-2 space-y-2">
          <LabelRow label="Agency" value={agencyStatus} />
        </div>
        <div className="mt-3 flex flex-wrap gap-2">
          <EditOwnerDialog owner={{ id: owner.id, first_name: owner.first_name, last_name: owner.last_name }} onUpdated={() => onRefetch?.()} />
          <DeleteOwnerDialog id={owner.id} displayName={name} onDeleted={() => onRefetch?.()} />
        </div>
      </CardContent>
    </Card>
  );
};

export default OwnerListItemMobile;