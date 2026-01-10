"use client";

import React from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import EditPropertyDialog from "@/components/properties/EditPropertyDialog";
import DeletePropertyDialog from "@/components/properties/DeletePropertyDialog";
import PropertyOwnersDialog from "@/components/properties/PropertyOwnersDialog";
import AssignTenantDialog from "@/components/properties/AssignTenantDialog";
import type { Property } from "@/services/properties";

type Props = {
  property: Property;
  occupied: boolean;
  canCreate: boolean;
  onRefetch?: () => void;
};

const LabelRow = ({ label, value }: { label: string; value: React.ReactNode }) => (
  <div className="grid grid-cols-[110px,1fr] gap-3">
    <div className="text-xs text-muted-foreground">{label}</div>
    <div className="text-sm font-medium">{value}</div>
  </div>
);

const PropertyListItemMobile: React.FC<Props> = ({ property, occupied, canCreate, onRefetch }) => {
  const statusEl = occupied ? (
    <span className="text-green-600 font-medium">Occupied</span>
  ) : (
    <span className="text-red-600 font-medium">Vacant</span>
  );

  return (
    <Card className="mb-3">
      <CardContent className="p-3">
        <div className="flex items-start justify-between">
          <div className="font-semibold text-base">{property.name}</div>
          <div className="text-right">
            {statusEl}
          </div>
        </div>

        <div className="mt-3 space-y-2">
          <LabelRow label="Type" value={<span className="capitalize">{property.type}</span>} />
          <LabelRow label="Bedrooms" value={property.bedrooms ?? "-"} />
          <LabelRow label="City" value={property.city ?? "-"} />
          {property.location_group ? <LabelRow label="Folder" value={property.location_group} /> : null}
        </div>

        <div className="mt-3 flex flex-wrap gap-2">
          {canCreate ? (
            <>
              <EditPropertyDialog property={property} onUpdated={() => onRefetch?.()} />
              <PropertyOwnersDialog propertyId={property.id} />
              <AssignTenantDialog propertyId={property.id} onAssigned={() => onRefetch?.()} />
              <DeletePropertyDialog id={property.id} name={property.name} onDeleted={() => onRefetch?.()} />
            </>
          ) : (
            <Button size="sm" variant="secondary" disabled>
              View
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  );
};

export default PropertyListItemMobile;