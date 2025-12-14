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

const AgencyDashboard = () => {
  return (
    <div className="space-y-6">
      <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-4">
        <Stat title="Occupancy">{`92%`}</Stat>
        <Stat title="Monthly Revenue">
          <Money amount={42500} currency="USD" showConverted />
        </Stat>
        <Stat title="Overdue Invoices" value="7" />
        <Stat title="Open Maintenance" value="5" />
      </div>
      <div className="grid gap-4 grid-cols-1 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Upcoming Payments</CardTitle>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground">No upcoming payments in the next 7 days.</CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Lease Expirations</CardTitle>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground">No leases expiring this month.</CardContent>
        </Card>
      </div>
    </div>
  );
};

export default AgencyDashboard;