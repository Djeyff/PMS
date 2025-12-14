import React from "react";
import AppShell from "@/components/layout/AppShell";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

const data = [
  { title: "AC not cooling", property: "Downtown Apartment 12B", priority: "high", status: "in_progress" },
  { title: "Leaky faucet", property: "Ocean View Villa", priority: "low", status: "open" },
];

const Maintenance = () => {
  return (
    <AppShell>
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h1 className="text-xl font-semibold">Maintenance</h1>
          <Button>New Request</Button>
        </div>
        <Card>
          <CardHeader>
            <CardTitle>Requests</CardTitle>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Title</TableHead>
                  <TableHead>Property</TableHead>
                  <TableHead>Priority</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.map((m) => (
                  <TableRow key={`${m.title}-${m.property}`}>
                    <TableCell className="font-medium">{m.title}</TableCell>
                    <TableCell>{m.property}</TableCell>
                    <TableCell className="capitalize">{m.priority}</TableCell>
                    <TableCell className="capitalize">{m.status.replace("_", " ")}</TableCell>
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

export default Maintenance;