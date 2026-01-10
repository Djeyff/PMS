"use client";

import React from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import EditTenantDialog from "@/components/tenants/EditTenantDialog";
import DeleteTenantDialog from "@/components/tenants/DeleteTenantDialog";
import { Link } from "react-router-dom";

type Props = {
  tenant: { id: string; first_name: string | null; last_name: string | null; agency_id?: string | null };
  isAdmin: boolean;
  onRefetch?: () => void;
};

const LabelRow = ({ label, value }: { label: string; value: React.ReactNode }) => (
  <div className="grid grid-cols-[110px,1fr] gap-3">
    <div className="text-xs text-muted-foreground">{label}</div>
    <div className="text-sm font-medium">{value}</div>
  </div>
);

const TenantListItemMobile: React.FC<Props> = ({ tenant, isAdmin, onRefetch }) => {
  const name = [tenant.first_name ?? "", tenant.last_name ?? ""].filter(Boolean).join(" ") || "—";
  const agencyStatus = tenant.agency_id ? "Assigned" : "Unassigned";

  return (
    <Card className="mb-3">
      <CardContent className="p-3">
        <div className="font-semibold text-base">{name}</div>
        <div className="mt-2 space-y-2">
          <LabelRow label="Agency" value={agencyStatus} />
        </div>
        <div className="mt-3 flex flex-wrap gap-2">
          {isAdmin ? (
            <>
              <Button asChild size="sm" variant="outline">
                <Link to={`/tenants/${tenant.id}/overdue`}>Overdue</Link>
              </Button>
              <EditTenantDialog tenant={{ id: tenant.id, first_name: tenant.first_name, last_name: tenant.last_name }} onUpdated={() => onRefetch?.()} />
              <DeleteTenantDialog id={tenant.id} displayName={name} onDeleted={() => onRefetch?.()} />
            </>
          ) : (
            <Button size="sm" variant="secondary" disabled>View</Button>
          )}
        </div>
      </CardContent>
    </Card>
  );
};

export default TenantListItemMobile;