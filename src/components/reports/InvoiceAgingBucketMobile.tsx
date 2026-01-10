"use client";

import React from "react";
import { Card, CardContent } from "@/components/ui/card";

type Props = {
  title: string;
  count: number;
  totalUsd: number;
  totalDop: number;
};

const fmt = (amt: number, cur: "USD" | "DOP") =>
  new Intl.NumberFormat(undefined, { style: "currency", currency: cur }).format(amt);

const InvoiceAgingBucketMobile: React.FC<Props> = ({ title, count, totalUsd, totalDop }) => {
  return (
    <Card className="mb-3">
      <CardContent className="p-3">
        <div className="font-semibold text-base">{title}</div>
        <div className="mt-2 text-sm space-y-1">
          <div>Count: <span className="font-medium">{count}</span></div>
          <div>Total USD: <span className="font-medium">{fmt(totalUsd, "USD")}</span></div>
          <div>Total DOP: <span className="font-medium">{fmt(totalDop, "DOP")}</span></div>
        </div>
      </CardContent>
    </Card>
  );
};

export default InvoiceAgingBucketMobile;