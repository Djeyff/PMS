import React from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import Money from "@/components/Money";

const TenantDashboard = () => {
  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>My Lease</CardTitle>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground">
          Lease active until 2026-06-30. Rent: <Money amount={1200} currency="USD" showConverted /> monthly.
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>Invoices</CardTitle>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground">No invoices due.</CardContent>
      </Card>
    </div>
  );
};

export default TenantDashboard;