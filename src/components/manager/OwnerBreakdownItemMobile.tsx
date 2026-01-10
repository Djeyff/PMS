"use client";

import React from "react";
import { Card, CardContent } from "@/components/ui/card";

type Props = {
  row: {
    ownerId: string;
    name: string;
    cashUsd: number;
    cashDop: number;
    transferUsd: number;
    transferDop: number;
    cashDopAfterFee?: number;
  };
};

const fmt = (amount: number, currency: "USD" | "DOP") =>
  new Intl.NumberFormat(undefined, { style: "currency", currency }).format(amount);

const LabelRow = ({ label, value }: { label: string; value: React.ReactNode }) => (
  <div className="grid grid-cols-[150px,1fr] gap-3">
    <div className="text-xs text-muted-foreground">{label}</div>
    <div className="text-sm font-medium">{value}</div>
  </div>
);

const OwnerBreakdownItemMobile: React.FC<Props> = ({ row }) => {
  const feeShare = (row.cashDop ?? 0) - (row.cashDopAfterFee ?? row.cashDop ?? 0);

  return (
    <Card className="mb-3">
      <CardContent className="p-3">
        <div className="font-semibold text-base">{row.name}</div>
        <div className="mt-2 space-y-2">
          <LabelRow label="Cash USD" value={fmt(row.cashUsd, "USD")} />
          <LabelRow label="Cash DOP" value={fmt(row.cashDop, "DOP")} />
          <LabelRow label="Fee share (DOP)" value={fmt(feeShare, "DOP")} />
          <LabelRow label="Cash DOP (after fee)" value={fmt(row.cashDopAfterFee ?? row.cashDop, "DOP")} />
          <LabelRow label="Transfer USD" value={fmt(row.transferUsd, "USD")} />
          <LabelRow label="Transfer DOP" value={fmt(row.transferDop, "DOP")} />
        </div>
      </CardContent>
    </Card>
  );
};

export default OwnerBreakdownItemMobile;