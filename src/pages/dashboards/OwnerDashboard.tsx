import React from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import Money from "@/components/Money";

const Stat = ({ title, value, children }: { title: string; value?: string; children?: React.ReactNode }) => (
  <Card>
    <CardHeader className="pb-2">
      <CardTitle className="text-sm text-muted-foreground">{title}</CardTitle>
    </CardHeader>
    <CardContent className="text-2xl font-bold">{value ?? children}</CardContent>
  </Card>
);

const OwnerDashboard = () => {
  return (
    <div className="space-y-6">
      <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3">
        <Stat title="My Occupancy">{`95%`}</Stat>
        <Stat title="My Revenue">
          <Money amount={12800} currency="USD" showConverted />
        </Stat>
        <Stat title="Open Maintenance" value="1" />
      </div>
      <Card>
        <CardHeader>
          <CardTitle>My Invoices</CardTitle>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground">No invoices to show.</CardContent>
      </Card>
    </div>
  );
};

export default OwnerDashboard;