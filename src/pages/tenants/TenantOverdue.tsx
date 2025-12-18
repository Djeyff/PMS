import React, { useMemo } from "react";
import AppShell from "@/components/layout/AppShell";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useParams, Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { fetchInvoicesByTenant } from "@/services/invoices";
import { fetchPaymentsByTenant } from "@/services/payments";
import { Button } from "@/components/ui/button";

type LedgerEntry = {
  date: string;
  type: "invoice" | "payment";
  description: string;
  amount: number; // positive = payment, negative = invoice
  currency: "USD" | "DOP";
};

const fmt = (amt: number, cur: string) =>
  new Intl.NumberFormat(undefined, { style: "currency", currency: cur }).format(amt);

const TenantOverdue = () => {
  const { id } = useParams<{ id: string }>();
  const tenantId = id!;

  const { data: invoices, isLoading: invLoading } = useQuery({
    queryKey: ["tenant-invoices", tenantId],
    queryFn: () => fetchInvoicesByTenant(tenantId),
  });

  const { data: payments, isLoading: payLoading } = useQuery({
    queryKey: ["tenant-payments", tenantId],
    queryFn: () => fetchPaymentsByTenant(tenantId),
  });

  const currencies: Array<"USD" | "DOP"> = ["USD", "DOP"];
  const today = new Date().toISOString().slice(0, 10);

  const contentByCurrency = useMemo(() => {
    const out: Record<"USD" | "DOP", {
      overdue: Array<{ id: string; number: string | null; issue_date: string; due_date: string; total: number; paid: number; outstanding: number }>;
      ledger: Array<LedgerEntry & { balance: number }>;
      totals: { totalInvoices: number; totalPayments: number; balance: number };
    }> = { USD: { overdue: [], ledger: [], totals: { totalInvoices: 0, totalPayments: 0, balance: 0 } }, DOP: { overdue: [], ledger: [], totals: { totalInvoices: 0, totalPayments: 0, balance: 0 } } };

    currencies.forEach((cur) => {
      const invs = (invoices ?? []).filter((i) => i.currency === cur);
      const pays = (payments ?? []).filter((p) => p.currency === cur);

      // Build ledger entries
      const entries: LedgerEntry[] = [
        ...invs.map((i) => ({ date: i.issue_date, type: "invoice" as const, description: i.number ?? i.id.slice(0, 8), amount: -Number(i.total_amount || 0), currency: cur })),
        ...pays.map((p) => ({ date: p.received_date, type: "payment" as const, description: p.reference ?? p.method, amount: Number(p.amount || 0), currency: cur })),
      ].sort((a, b) => a.date.localeCompare(b.date) || (a.type === "invoice" ? -1 : 1)); // invoices before payments on same day

      let running = 0;
      const ledgerWithBalance = entries.map((e) => {
        running += e.amount;
        return { ...e, balance: running };
      });

      const totalInvoices = invs.reduce((s, i) => s + Number(i.total_amount || 0), 0);
      const totalPayments = pays.reduce((s, p) => s + Number(p.amount || 0), 0);
      const balance = totalPayments - totalInvoices;

      // Overdue invoices: due_date < today and outstanding < 0
      const paidByInvoice = new Map<string, number>();
      pays.forEach((p) => {
        if (p.invoice_id) {
          paidByInvoice.set(p.invoice_id, (paidByInvoice.get(p.invoice_id) ?? 0) + Number(p.amount || 0));
        }
      });
      const overdue = invs
        .filter((i) => i.due_date < today)
        .map((i) => {
          const paid = paidByInvoice.get(i.id) ?? 0;
          const outstanding = paid - Number(i.total_amount || 0);
          return { id: i.id, number: i.number ?? null, issue_date: i.issue_date, due_date: i.due_date, total: Number(i.total_amount || 0), paid, outstanding };
        })
        .filter((row) => row.outstanding < 0);

      out[cur] = { overdue, ledger: ledgerWithBalance, totals: { totalInvoices, totalPayments, balance } };
    });

    return out;
  }, [invoices, payments]);

  const isLoading = invLoading || payLoading;

  const [activeCur, setActiveCur] = React.useState<"USD" | "DOP">("USD");

  function toCsv(fields: string[], rows: Array<Record<string, any>>) {
    const escape = (v: any) => {
      const s = v === null || v === undefined ? "" : String(v);
      if (s.includes('"') || s.includes(",") || s.includes("\n")) {
        return `"${s.replace(/"/g, '""')}"`;
      }
      return s;
    };
    const header = fields.map(escape).join(",");
    const body = rows.map((r) => fields.map((f) => escape(r[f])).join(",")).join("\n");
    return header + "\n" + body;
  }

  function downloadCsv(filename: string, csv: string) {
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  }

  const exportLedgerCsv = () => {
    const section = contentByCurrency[activeCur];
    const fields = ["date", "type", "description", "amount", "running_balance", "currency"];
    const rows = section.ledger.map((e) => ({
      date: e.date,
      type: e.type,
      description: e.description,
      amount: e.amount,
      running_balance: e.balance,
      currency: activeCur,
    }));
    const csv = toCsv(fields, rows);
    downloadCsv(`tenant_ledger_${activeCur}.csv`, csv);
  };

  const exportOverdueCsv = () => {
    const section = contentByCurrency[activeCur];
    const fields = ["invoice_number", "issue_date", "due_date", "total", "paid", "outstanding", "currency"];
    const rows = section.overdue.map((r) => ({
      invoice_number: r.number ?? "",
      issue_date: r.issue_date,
      due_date: r.due_date,
      total: r.total,
      paid: r.paid,
      outstanding: r.outstanding,
      currency: activeCur,
    }));
    const csv = toCsv(fields, rows);
    downloadCsv(`tenant_overdue_${activeCur}.csv`, csv);
  };

  return (
    <AppShell>
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h1 className="text-xl font-semibold">Tenant Overdue & Ledger</h1>
          <div className="flex gap-2">
            <Button variant="outline" onClick={exportOverdueCsv}>Export Overdue CSV</Button>
            <Button onClick={exportLedgerCsv}>Export Ledger CSV</Button>
            <Button variant="outline" asChild><Link to="/tenants">Back to Tenants</Link></Button>
          </div>
        </div>

        {isLoading ? (
          <div className="text-sm text-muted-foreground">Loading...</div>
        ) : (
          <Tabs value={activeCur} onValueChange={(v) => setActiveCur(v as "USD" | "DOP")} className="w-full">
            <TabsList>
              <TabsTrigger value="USD">USD</TabsTrigger>
              <TabsTrigger value="DOP">DOP</TabsTrigger>
            </TabsList>

            {currencies.map((cur) => {
              const section = contentByCurrency[cur];
              return (
                <TabsContent key={cur} value={cur}>
                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                    <Card>
                      <CardHeader>
                        <CardTitle>Overdue Invoices ({cur})</CardTitle>
                      </CardHeader>
                      <CardContent>
                        {section.overdue.length === 0 ? (
                          <div className="text-sm text-muted-foreground">No overdue invoices.</div>
                        ) : (
                          <Table>
                            <TableHeader>
                              <TableRow>
                                <TableHead>No.</TableHead>
                                <TableHead>Issue</TableHead>
                                <TableHead>Due</TableHead>
                                <TableHead className="text-right">Total</TableHead>
                                <TableHead className="text-right">Paid</TableHead>
                                <TableHead className="text-right">Outstanding</TableHead>
                              </TableRow>
                            </TableHeader>
                            <TableBody>
                              {section.overdue.map((row) => (
                                <TableRow key={row.id}>
                                  <TableCell className="font-mono text-xs">{row.number ?? row.id.slice(0, 8)}</TableCell>
                                  <TableCell>{row.issue_date}</TableCell>
                                  <TableCell>{row.due_date}</TableCell>
                                  <TableCell className="text-right">{fmt(row.total, cur)}</TableCell>
                                  <TableCell className="text-right">{fmt(row.paid, cur)}</TableCell>
                                  <TableCell className="text-right font-medium">{fmt(row.outstanding, cur)}</TableCell>
                                </TableRow>
                              ))}
                            </TableBody>
                          </Table>
                        )}
                      </CardContent>
                    </Card>

                    <Card>
                      <CardHeader>
                        <CardTitle>Ledger ({cur}) — Balance: {fmt(section.totals.balance, cur)}</CardTitle>
                      </CardHeader>
                      <CardContent>
                        {section.ledger.length === 0 ? (
                          <div className="text-sm text-muted-foreground">No activity yet.</div>
                        ) : (
                          <Table>
                            <TableHeader>
                              <TableRow>
                                <TableHead>Date</TableHead>
                                <TableHead>Type</TableHead>
                                <TableHead>Description</TableHead>
                                <TableHead className="text-right">Amount</TableHead>
                                <TableHead className="text-right">Outstanding</TableHead>
                              </TableRow>
                            </TableHeader>
                            <TableBody>
                              {section.ledger.map((e, idx) => (
                                <TableRow key={idx}>
                                  <TableCell>{e.date}</TableCell>
                                  <TableCell className="capitalize">{e.type}</TableCell>
                                  <TableCell>{e.description}</TableCell>
                                  <TableCell className="text-right">{fmt(e.amount, cur)}</TableCell>
                                  <TableCell className="text-right font-medium">{fmt(e.balance, cur)}</TableCell>
                                </TableRow>
                              ))}
                            </TableBody>
                          </Table>
                        )}
                      </CardContent>
                    </Card>
                  </div>
                </TabsContent>
              );
            })}
          </Tabs>
        )}
      </div>
    </AppShell>
  );
};

export default TenantOverdue;