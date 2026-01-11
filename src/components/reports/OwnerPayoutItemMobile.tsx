"use client";

import React from "react";
import { Card, CardContent } from "@/components/ui/card";

type Props = {
  name: string;
  usd: number;
  dop: number;
  feeDop?: number;
  payoutAfterFee?: number;
};

const fmt = (amt: number, cur: "USD" | "DOP") =>
  new Intl.NumberFormat(undefined, { style: "currency", currency: cur }).format(amt);

const OwnerPayoutItemMobile: React.FC<Props> = ({ name, usd, dop, feeDop = 0, payoutAfterFee }) => {
  return (
    <Card className="mb-3">
      <CardContent className="p-3">
        <div className="font-semibold text-base">{name}</div>
        <div className="mt-2 text-sm space-y-1">
          <div>USD: <span className="font-medium">{fmt(usd, "USD")}</span></div>
          <div>DOP: <span className="font-medium">{fmt(dop, "DOP")}</span></div>
          <div>Mgmt fee (DOP): <span className="font-medium">{fmt(feeDop, "DOP")}</span></div>
          <div>Payout (DOP after fee): <span className="font-medium">{fmt(payoutAfterFee ?? Math.max(0, dop - feeDop), "DOP")}</span></div>
        </div>
      </CardContent>
    </Card>
  );
};

export default OwnerPayoutItemMobile;