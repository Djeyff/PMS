import React, { useMemo } from "react";
import AppShell from "@/components/layout/AppShell";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useAuth } from "@/contexts/AuthProvider";
import { useQuery } from "@tanstack/react-query";
import { fetchInvoices } from "@/services/invoices";
import InvoiceForm from "@/components/invoices/InvoiceForm";
import EditInvoiceDialog from "@/components/invoices/EditInvoiceDialog";
import DeleteInvoiceDialog from "@/components/invoices/DeleteInvoiceDialog";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import Money from "@/components/Money";
import { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem } from "@/components/ui/dropdown-menu";
import { generateInvoicePDF } from "@/services/invoices";
import { toast } from "sonner";
import { runAutoInvoice } from "@/services/auto-invoice";
import { useIsMobile } from "@/hooks/use-mobile";
import InvoiceListItemMobile from "@/components/invoices/InvoiceListItemMobile";

const data = [
  { number: "INV-1001", tenant: "Maria Gomez", due: "2024-08-05", total: 1200, currency: "USD" as const, status: "paid" as const },
  { number: "INV-1002", tenant: "John Smith", due: "2024-08-10", total: 950, currency: "USD" as const, status: "overdue" as const },
];

const Invoices = () => {
  const { role } = useAuth();
  const isAdmin = role === "agency_admin";

  const { data, isLoading, refetch } = useQuery({
    queryKey: ["invoices"],
    queryFn: fetchInvoices,
  });

  const rows = useMemo(() => {
    return (data ?? []).map((inv: any) => {
      const paidConverted = (inv.payments ?? []).reduce((sum: number, p: any) => {
        const amt = Number(p.amount || 0);
        if (p.currency === inv.currency) return sum + amt;
        const rate = typeof p.exchange_rate === "number" ? p.exchange_rate : null;
        if (!rate || rate <= 0) return sum;
        if (inv.currency === "USD" && p.currency === "DOP") return sum + amt / rate;
        if (inv.currency === "DOP" && p.currency === "USD") return sum + amt * rate;
        return sum;
      }, 0);
      const balance = paidConverted - Number(inv.total_amount);
      let displayStatus = inv.status;
      const today = new Date().toISOString().slice(0, 10);
      if (balance >= 0) displayStatus = "paid";
      else if (inv.due_date < today && inv.status !== "void") displayStatus = "overdue";
      else if (paidConverted > 0) displayStatus = "partial";
      return { ...inv, paid: paidConverted, balance, displayStatus };
    });
  }, [data]);

  const isMobile = useIsMobile();

  return (
    <AppShell>
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h1 className="text-xl font-semibold">Invoices</h1>
          {isAdmin ? (
            <div className="flex items-center gap-2">
              <InvoiceForm onCreated={() => refetch()} />
              <Button
                variant="outline"
                onClick={async () => {
                  try {
                    const res = await runAutoInvoice(true);
                    if (res.sent > 0) toast.success(`Auto-invoice ran: ${res.sent} invoice(s) created`);
                    else toast.info("Auto-invoice ran: no invoices matched the schedule");
                    if (res.errors?.length) toast.error(res.errors[0]);
                    refetch();
                  } catch (e: any) {
                    toast.error(e?.message ?? "Failed to run auto-invoice");
                  }
                }}
              >
                Run Auto-Invoice
              </Button>
            </div>
          ) : null}
        </div>
        <Card>
          <CardHeader>
            <CardTitle>All Invoices</CardTitle>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="text-sm text-muted-foreground">Loading...</div>
            ) : (rows?.length ?? 0) === 0 ? (
              <div className="text-sm text-muted-foreground">No invoices yet.</div>
            ) : isMobile ? (
              <div>
                {rows.map((inv: any) => (
                  <InvoiceListItemMobile key={inv.id} inv={inv} onRefetch={() => refetch()} />
                ))}
              </div>
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>No.</TableHead>
                      <TableHead>Property</TableHead>
                      <TableHead>Tenant</TableHead>
                      <TableHead>Issue</TableHead>
                      <TableHead>Due</TableHead>
                      <TableHead>Total</TableHead>
                      <TableHead>Paid</TableHead>
                      <TableHead>Balance</TableHead>
                      <TableHead>Status</TableHead>
                      {isAdmin && <TableHead>Actions</TableHead>}
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {rows.map((inv: any) => {
                      const propName = inv.lease?.property?.name ?? inv.lease_id?.slice(0, 8);
                      const tenantName = [inv.tenant?.first_name, inv.tenant?.last_name].filter(Boolean).join(" ") || inv.tenant_id?.slice(0, 6);
                      const fmt = (amt: number, cur: string) =>
                        new Intl.NumberFormat(undefined, { style: "currency", currency: cur }).format(amt);
                      return (
                        <TableRow key={inv.id}>
                          <TableCell className="font-mono text-xs">{inv.number ?? "—"}</TableCell>
                          <TableCell className="font-medium">{propName}</TableCell>
                          <TableCell>{tenantName}</TableCell>
                          <TableCell>{inv.issue_date}</TableCell>
                          <TableCell>{inv.due_date}</TableCell>
                          <TableCell>{fmt(Number(inv.total_amount), inv.currency)}</TableCell>
                          <TableCell>{fmt(inv.paid, inv.currency)}</TableCell>
                          <TableCell>{fmt(inv.balance, inv.currency)}</TableCell>
                          <TableCell className="capitalize">{String(inv.displayStatus).replace("_", " ")}</TableCell>
                          {isAdmin && (
                            <TableCell>
                              <div className="flex gap-2">
                                <Button asChild size="sm" variant="outline"><Link to={`/invoices/${inv.id}`}>View</Link></Button>
                                <DropdownMenu>
                                  <DropdownMenuTrigger asChild>
                                    <Button size="sm" variant="outline">Generate in</Button>
                                  </DropdownMenuTrigger>
                                  <DropdownMenuContent>
                                    <DropdownMenuItem
                                      onClick={async () => {
                                        try {
                                          await generateInvoicePDF(inv.id, "en", { sendEmail: false, sendWhatsApp: false });
                                          toast.success("Invoice PDF generated in English");
                                          refetch();
                                        } catch (e: any) {
                                          toast.error(e.message || "Failed to generate PDF");
                                        }
                                      }}
                                    >
                                      English
                                    </DropdownMenuItem>
                                    <DropdownMenuItem
                                      onClick={async () => {
                                        try {
                                          await generateInvoicePDF(inv.id, "es", { sendEmail: false, sendWhatsApp: false });
                                          toast.success("Factura generada en Español");
                                          refetch();
                                        } catch (e: any) {
                                          toast.error(e.message || "Failed to generate PDF");
                                        }
                                      }}
                                    >
                                      Spanish
                                    </DropdownMenuItem>
                                  </DropdownMenuContent>
                                </DropdownMenu>
                                <EditInvoiceDialog invoice={inv} onUpdated={() => refetch()} />
                                <DeleteInvoiceDialog id={inv.id} onDeleted={() => refetch()} />
                              </div>
                            </TableCell>
                          )}
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </AppShell>
  );
};

export default Invoices;