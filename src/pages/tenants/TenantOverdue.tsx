import React, { useMemo } from "react";
import AppShell from "@/components/layout/AppShell";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useParams, Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { fetchInvoicesByTenantWithRelations } from "@/services/invoices";
import { fetchPaymentsByTenantWithRelations } from "@/services/payments";
import { Button } from "@/components/ui/button";

type LedgerEntry = {
  date: string;
  type: "invoice" | "payment";
  description: string;
  amount: number; // positive = payment, negative = invoice
  currency: "USD" | "DOP";
  property?: string | null;
  tenant?: string | null;
};

const fmt = (amt: number, cur: string) =>
  new Intl.NumberFormat(undefined, { style: "currency", currency: cur }).format(amt);

const TenantOverdue = () => {
  const { id } = useParams<{ id: string }>();
  const tenantId = id!;

  const { data: invoices, isLoading: invLoading } = useQuery({
    queryKey: ["tenant-invoices-rel", tenantId],
    queryFn: () => fetchInvoicesByTenantWithRelations(tenantId),
  });

  const { data: payments, isLoading: payLoading } = useQuery({
    queryKey: ["tenant-payments-rel", tenantId],
    queryFn: () => fetchPaymentsByTenantWithRelations(tenantId),
  });

  const currencies: Array<"USD" | "DOP"> = ["USD", "DOP"];
  const today = new Date().toISOString().slice(0, 10);

  const contentByCurrency = useMemo(() => {
    const out: Record<"USD" | "DOP", {
      overdue: Array<{ id: string; number: string | null; issue_date: string; due_date: string; total: number; paid: number; outstanding: number; property_name: string; tenant_name: string }>;
      ledger: Array<LedgerEntry & { balance: number }>;
      totals: { totalInvoices: number; totalPayments: number; balance: number };
    }> = { USD: { overdue: [], ledger: [], totals: { totalInvoices: 0, totalPayments: 0, balance: 0 } }, DOP: { overdue: [], ledger: [], totals: { totalInvoices: 0, totalPayments: 0, balance: 0 } } };

    // Quick lookup for invoice currency by id
    const invoiceById = new Map<string, { currency: "USD" | "DOP"; total_amount: number; issue_date: string; due_date: string }>();
    (invoices ?? []).forEach((i: any) => {
      invoiceById.set(i.id, { currency: i.currency, total_amount: Number(i.total_amount || 0), issue_date: i.issue_date, due_date: i.due_date });
    });

    // Helper: convert a payment amount to a target currency via per-payment exchange_rate
    const convertToCurrency = (amt: number, from: "USD" | "DOP", to: "USD" | "DOP", rate: number | null) => {
      if (from === to) return amt;
      if (!rate || !isFinite(rate) || rate <= 0) return 0;
      if (from === "DOP" && to === "USD") return amt / rate;
      if (from === "USD" && to === "DOP") return amt * rate;
      return 0;
    };

    currencies.forEach((cur) => {
      const invs = (invoices ?? []).filter((i: any) => i.currency === cur);

      // Payments relevant to this currency:
      // - Unlinked payments: show in their native currency tab
      // - Linked payments: show only in the tab of the invoice's currency
      const paysRelevant = (payments ?? []).filter((p: any) => {
        if (p.invoice_id) {
          const ref = invoiceById.get(p.invoice_id);
          return ref ? ref.currency === cur : false;
        }
        return p.currency === cur;
      });

      // Build ledger entries (amounts always in current tab currency)
      const entries: LedgerEntry[] = [
        ...invs.map((i: any) => ({
          date: i.issue_date,
          type: "invoice" as const,
          description: i.number ?? i.id.slice(0, 8),
          amount: -Number(i.total_amount || 0),
          currency: cur,
          property: i.lease?.property?.name ?? null,
          tenant: [i.tenant?.first_name ?? "", i.tenant?.last_name ?? ""].filter(Boolean).join(" ") || null,
        })),
        ...paysRelevant.map((p: any) => {
          const rate = typeof p.exchange_rate === "number" ? p.exchange_rate : null;
          const amtInCur = p.currency === cur
            ? Number(p.amount || 0)
            : convertToCurrency(Number(p.amount || 0), p.currency, cur, rate);
          return {
            date: p.received_date,
            type: "payment" as const,
            description: p.reference ?? p.method,
            amount: amtInCur,
            currency: cur,
            property: p.lease?.property?.name ?? null,
            tenant: [p.tenant?.first_name ?? "", p.tenant?.last_name ?? ""].filter(Boolean).join(" ") || null,
          };
        }),
      ].sort((a, b) => a.date.localeCompare(b.date) || (a.type === "invoice" ? -1 : 1));

      let running = 0;
      const ledgerWithBalance = entries.map((e) => {
        running += e.amount;
        return { ...e, balance: running };
      });

      const totalInvoices = invs.reduce((s: number, i: any) => s + Number(i.total_amount || 0), 0);
      const totalPayments = paysRelevant.reduce((s: number, p: any) => {
        const rate = typeof p.exchange_rate === "number" ? p.exchange_rate : null;
        if (p.currency === cur) return s + Number(p.amount || 0);
        return s + convertToCurrency(Number(p.amount || 0), p.currency, cur, rate);
      }, 0);
      const balance = totalPayments - totalInvoices;

      // Overdue invoices with paid and outstanding in current currency (include converted cross-currency payments)
      const paidByInvoice = new Map<string, number>();
      paysRelevant.forEach((p: any) => {
        if (!p.invoice_id) return;
        const rate = typeof p.exchange_rate === "number" ? p.exchange_rate : null;
        const addAmt = p.currency === cur
          ? Number(p.amount || 0)
          : convertToCurrency(Number(p.amount || 0), p.currency, cur, rate);
        paidByInvoice.set(p.invoice_id, (paidByInvoice.get(p.invoice_id) ?? 0) + addAmt);
      });

      const overdue = invs
        .filter((i: any) => i.due_date < today)
        .map((i: any) => {
          const paid = paidByInvoice.get(i.id) ?? 0;
          const outstanding = paid - Number(i.total_amount || 0);
          const tenantName = [i.tenant?.first_name ?? "", i.tenant?.last_name ?? ""].filter(Boolean).join(" ");
          return {
            id: i.id,
            number: i.number ?? null,
            issue_date: i.issue_date,
            due_date: i.due_date,
            total: Number(i.total_amount || 0),
            paid,
            outstanding,
            property_name: i.lease?.property?.name ?? "—",
            tenant_name: tenantName || "—",
          };
        })
        .filter((row: any) => row.outstanding < 0);

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
                                <TableHead>Property</TableHead>
                                <TableHead>Tenant</TableHead>
                                <TableHead>Issue</TableHead>
                                <TableHead>Due</TableHead>
                                <TableHead className="text-right">Total</TableHead>
                                <TableHead className="text-right">Paid</TableHead>
                                <TableHead className="text-right">Outstanding</TableHead>
                              </TableRow>
                            </TableHeader>
                            <TableBody>
                              {section.overdue.map((row: any) => (
                                <TableRow key={row.id}>
                                  <TableCell className="font-mono text-xs">{row.number ?? row.id.slice(0, 8)}</TableCell>
                                  <TableCell>{row.property_name}</TableCell>
                                  <TableCell>{row.tenant_name}</TableCell>
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
                                <TableHead>Property</TableHead>
                                <TableHead>Tenant</TableHead>
                                <TableHead>Description</TableHead>
                                <TableHead className="text-right">Amount</TableHead>
                                <TableHead className="text-right">Outstanding</TableHead>
                              </TableRow>
                            </TableHeader>
                            <TableBody>
                              {section.ledger.map((e: any, idx: number) => (
                                <TableRow key={idx}>
                                  <TableCell>{e.date}</TableCell>
                                  <TableCell className="capitalize">{e.type}</TableCell>
                                  <TableCell>{e.property ?? "—"}</TableCell>
                                  <TableCell>{e.tenant ?? "—"}</TableCell>
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