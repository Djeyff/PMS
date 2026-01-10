"use client";

import React from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Link } from "react-router-dom";

type Props = {
  tenantId: string;
  name: string;
  usd: number;
  dop: number;
};

const fmt = (amt: number, cur: "USD" | "DOP") =>
  new Intl.NumberFormat(undefined, { style: "currency", currency: cur }).format(amt);

const OutstandingTenantItemMobile: React.FC<Props> = ({ tenantId, name, usd, dop }) => {
  const usdClass = usd < 0 ? "text-red-600" : usd > 0 ? "text-green-600" : "";
  const dopClass = dop < 0 ? "text-red-600" : dop > 0 ? "text-green-600" : "";

  return (
    <Card className="mb-3">
      <CardContent className="p-3">
        <div className="font-semibold text-base">{name}</div>
        <div className="mt-2 space-y-2">
          <div className="grid grid-cols-[120px,1fr] gap-3">
            <div className="text-xs text-muted-foreground">USD Balance</div>
            <div className={`text-sm font-medium ${usdClass}`}>{fmt(usd, "USD")}</div>
          </div>
          <div className="grid grid-cols-[120px,1fr] gap-3">
            <div className="text-xs text-muted-foreground">DOP Balance</div>
            <div className={`text-sm font-medium ${dopClass}`}>{fmt(dop, "DOP")}</div>
          </div>
        </div>
        <div className="mt-3">
          <Button asChild size="sm" variant="outline">
            <Link to={`/tenants/${tenantId}/overdue`}>View details</Link>
          </Button>
        </div>
      </CardContent>
    </Card>
  );
};

export default OutstandingTenantItemMobile;