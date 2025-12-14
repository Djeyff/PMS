import React from "react";
import AppShell from "@/components/layout/AppShell";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import Money from "@/components/Money";

const Reports = () => {
  return (
    <AppShell>
      <div className="space-y-6">
        <h1 className="text-xl font-semibold">Reports</h1>
        <div className="grid gap-4 grid-cols-1 md:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle>Occupancy</CardTitle>
            </CardHeader>
            <CardContent className="text-sm text-muted-foreground">Portfolio occupancy is 92%.</CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>Revenue vs Expenses</CardTitle>
            </CardHeader>
            <CardContent className="text-sm">
              <div className="space-y-2">
                <div>Revenue: <Money amount={42000} currency="USD" showConverted /></div>
                <div>Expenses: <Money amount={8600} currency="USD" showConverted /></div>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </AppShell>
  );
};

export default Reports;