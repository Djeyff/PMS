import React from "react";
import AppShell from "@/components/layout/AppShell";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import Money from "@/components/Money";

const data = [
  { number: "INV-1001", tenant: "Maria Gomez", due: "2024-08-05", total: 1200, currency: "USD", status: "paid" as const },
  { number: "INV-1002", tenant: "John Smith", due: "2024-08-10", total: 950, currency: "USD", status: "overdue" as const },
];

const Invoices = () => {
  return (
    <AppShell>
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h1 className="text-xl font-semibold">Invoices</h1>
          <Button>Create Invoice</Button>
        </div>
        <Card>
          <CardHeader>
            <CardTitle>All Invoices</CardTitle>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>No.</TableHead>
                  <TableHead>Tenant</TableHead>
                  <TableHead>Due</TableHead>
                  <TableHead>Total</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.map((inv) => (
                  <TableRow key={inv.number}>
                    <TableCell className="font-medium">{inv.number}</TableCell>
                    <TableCell>{inv.tenant}</TableCell>
                    <TableCell>{inv.due}</TableCell>
                    <TableCell><Money amount={inv.total} currency={inv.currency} showConverted /></TableCell>
                    <TableCell className="capitalize">{inv.status}</TableCell>
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

export default Invoices;