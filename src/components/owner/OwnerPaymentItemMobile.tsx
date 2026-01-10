"use client";

import React from "react";
import { Card, CardContent } from "@/components/ui/card";

type Row = {
  property: string;
  date: string;
  method: string;
  assigned: boolean;
  usd: number;
  dop: number;
  rate: number | null;
};

const fmt = (amount: number, currency: "USD" | "DOP") =>
  new Intl.NumberFormat(undefined, { style: "currency", currency }).format(amount);

const LabelRow = ({ label, value }: { label: string; value: React.ReactNode }) => (
  <div className="grid grid-cols-[120px,1fr] gap-3">
    <div className="text-xs text-muted-foreground">{label}</div>
    <div className="text-sm font-medium">{value}</div>
  </div>
);

const OwnerPaymentItemMobile: React.FC<{ row: Row }> = ({ row }) => {
  return (
    <Card className="mb-3">
      <CardContent className="p-3">
        <div className="font-semibold text-base">{row.property}</div>
        <div className="mt-2 space-y-2">
          <LabelRow label="Date" value={row.date} />
          <LabelRow label="Method" value={row.method} />
          <LabelRow label="USD" value={fmt(row.usd, "USD")} />
          <LabelRow label="DOP" value={fmt(row.dop, "DOP")} />
          <LabelRow label="Rate" value={row.rate ? String(row.rate) : "—"} />
          <LabelRow label="Owner assigned" value={<span className={row.assigned ? "text-green-600 dark:text-green-400" : "text-red-600 dark:text-red-400"}>{row.assigned ? "Assigned" : "Unassigned"}</span>} />
        </div>
      </CardContent>
    </Card>
  );
};

export default OwnerPaymentItemMobile;