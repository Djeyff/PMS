"use client";

import React from "react";
import { Card, CardContent } from "@/components/ui/card";

type Props = {
  row: { date: string; property: string; tenant: string; method: string; amount: string };
};

const LabelRow = ({ label, value }: { label: string; value: React.ReactNode }) => (
  <div className="grid grid-cols-[120px,1fr] gap-3">
    <div className="text-xs text-muted-foreground">{label}</div>
    <div className="text-sm font-medium">{value}</div>
  </div>
);

const TenantPaymentHistoryItemMobile: React.FC<Props> = ({ row }) => {
  return (
    <Card className="mb-3">
      <CardContent className="p-3">
        <div className="font-semibold text-base">{row.property}</div>
        <div className="mt-2 space-y-2">
          <LabelRow label="Date" value={row.date} />
          <LabelRow label="Tenant" value={row.tenant} />
          <LabelRow label="Method" value={<span className="capitalize">{row.method}</span>} />
          <LabelRow label="Amount" value={row.amount} />
        </div>
      </CardContent>
    </Card>
  );
};

export default TenantPaymentHistoryItemMobile;