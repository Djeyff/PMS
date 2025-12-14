import React from "react";
import AppShell from "@/components/layout/AppShell";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

const data = [
  { tenant: "Maria Gomez", property: "Ocean View Villa", start: "2024-07-01", end: "2025-06-30", status: "active" },
  { tenant: "John Smith", property: "Downtown Apartment 12B", start: "2024-01-01", end: "2024-12-31", status: "active" },
];

const Leases = () => {
  return (
    <AppShell>
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h1 className="text-xl font-semibold">Leases</h1>
          <Button>New Lease</Button>
        </div>
        <Card>
          <CardHeader>
            <CardTitle>All Leases</CardTitle>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Tenant</TableHead>
                  <TableHead>Property</TableHead>
                  <TableHead>Start</TableHead>
                  <TableHead>End</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.map((l) => (
                  <TableRow key={`${l.tenant}-${l.property}`}>
                    <TableCell className="font-medium">{l.tenant}</TableCell>
                    <TableCell>{l.property}</TableCell>
                    <TableCell>{l.start}</TableCell>
                    <TableCell>{l.end}</TableCell>
                    <TableCell className="capitalize">{l.status}</TableCell>
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

export default Leases;