import React from "react";
import AppShell from "@/components/layout/AppShell";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import Money from "@/components/Money";

const data = [
  { invoice: "INV-1001", date: "2024-08-01", method: "bank_transfer", amount: 1200, currency: "USD" as const },
  { invoice: "INV-1002", date: "2024-08-12", method: "cash", amount: 500, currency: "USD" as const },
];

const Payments = () => {
  return (
    <AppShell>
      <div className="space-y-4">
        <h1 className="text-xl font-semibold">Payments</h1>
        <Card>
          <CardHeader>
            <CardTitle>All Payments</CardTitle>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Invoice</TableHead>
                  <TableHead>Date</TableHead>
                  <TableHead>Method</TableHead>
                  <TableHead>Amount</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.map((p) => (
                  <TableRow key={`${p.invoice}-${p.date}`}>
                    <TableCell className="font-medium">{p.invoice}</TableCell>
                    <TableCell>{p.date}</TableCell>
                    <TableCell className="capitalize">{p.method.replace("_", " ")}</TableCell>
                    <TableCell><Money amount={p.amount} currency={p.currency} showConverted /></TableCell>
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

export default Payments;