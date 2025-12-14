import React from "react";
import AppShell from "@/components/layout/AppShell";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import Money from "@/components/Money";

const data = [
  { date: "2024-08-03", property: "Ocean View Villa", category: "repair", vendor: "CoolAir", amount: 350, currency: "USD" as const },
  { date: "2024-08-10", property: "Ocean View Villa", category: "cleaning", vendor: "Shiny Co", amount: 120, currency: "USD" as const },
];

const Expenses = () => {
  return (
    <AppShell>
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h1 className="text-xl font-semibold">Expenses</h1>
          <Button>Add Expense</Button>
        </div>
        <Card>
          <CardHeader>
            <CardTitle>All Expenses</CardTitle>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date</TableHead>
                  <TableHead>Property</TableHead>
                  <TableHead>Category</TableHead>
                  <TableHead>Vendor</TableHead>
                  <TableHead>Amount</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.map((e) => (
                  <TableRow key={`${e.date}-${e.vendor}-${e.amount}`}>
                    <TableCell>{e.date}</TableCell>
                    <TableCell>{e.property}</TableCell>
                    <TableCell className="capitalize">{e.category}</TableCell>
                    <TableCell>{e.vendor}</TableCell>
                    <TableCell><Money amount={e.amount} currency={e.currency} showConverted /></TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>
    </AppShell>
  );
};

export default Expenses;