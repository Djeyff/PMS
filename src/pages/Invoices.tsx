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
import { Select, SelectTrigger, SelectContent, SelectItem, SelectValue } from "@/components/ui/select";
import { generateInvoicePDF } from "@/services/invoices";
import { toast } from "sonner";
import { runAutoInvoice } from "@/services/auto-invoice";
import { useIsMobile } from "@/hooks/use-mobile";
import InvoiceListItemMobile from "@/components/invoices/InvoiceListItemMobile";
import { sharePdfToWhatsApp } from "@/utils/whatsapp";
import { downloadFileFromUrl, buildInvoicePdfFileName } from "@/utils/download";
import { getTenantNamesForInvoices } from "@/services/tenant-names";

const Invoices = () => {
  const { role } = useAuth();
  const isAdmin = role === "agency_admin";

  const { data, isLoading, refetch } = useQuery({
    queryKey: ["invoices"],
    queryFn: fetchInvoices,
  });

  // Owner-only: fetch tenant names mapping for displayed invoices
  const ownerTenantNamesQuery = useQuery({
    queryKey: ["owner-tenant-names", (data ?? []).map((d: any) => d.id)],
    enabled: role === "owner" && !!data && (data as any[]).length > 0,
    queryFn: () => getTenantNamesForInvoices((data as any[]).map((d: any) => d.id)),
  });
  const ownerTenantNames = (ownerTenantNamesQuery.data ?? {}) as Record<string, string>;

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
      const paymentDatesText = (() => {
        const raw = (inv.payments ?? [])
          .map((p: any) => p.received_date)
          .filter((d: any) => typeof d === "string");
        const uniqSorted = Array.from(new Set(raw)).sort();
        return uniqSorted.length ? uniqSorted.join(", ") : "—";
      })();
      return { ...inv, paid: paidConverted, balance, displayStatus, paymentDatesText };
    });
  }, [data]);

  const [sortOrder, setSortOrder] = React.useState<"desc" | "asc">("desc");
  const sortedRows = useMemo(() => {
    const copy = [...rows];
    copy.sort((a: any, b: any) => {
      const aIssue = String(a.issue_date ?? "");
      const bIssue = String(b.issue_date ?? "");
      return sortOrder === "desc" ? bIssue.localeCompare(aIssue) : aIssue.localeCompare(bIssue);
    });
    return copy;
  }, [rows, sortOrder]);

  const isMobile = useIsMobile();

  const getStatusStyle = (status: string) => {
    const s = String(status).toLowerCase();
    if (s === "overdue") return { cls: "text-red-600", label: "Overdue" };
    if (s === "partial") return { cls: "text-orange-600", label: "Partial" };
    if (s === "paid") return { cls: "text-green-600", label: "Paid" };
    // Ensure visibility in dark theme: white text, black in light theme
    if (s === "sent" || s === "void") return { cls: "text-black dark:text-white", label: s[0].toUpperCase() + s.slice(1) };
    return { cls: "text-black dark:text-white", label: s.replace("_", " ") };
  };

  return (
    <AppShell>
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h1 className="text-xl font-semibold">Invoices</h1>
          <div className="flex items-center gap-2">
            <div className="w-[180px]">
              <Select value={sortOrder} onValueChange={(v) => setSortOrder(v as "desc" | "asc")}>
                <SelectTrigger aria-label="Sort by issue date"><SelectValue placeholder="Sort by issue date" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="desc">Newest first</SelectItem>
                  <SelectItem value="asc">Oldest first</SelectItem>
                </SelectContent>
              </Select>
            </div>
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
                {sortedRows.map((inv: any) => (
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
                      <TableHead>Payment date</TableHead>
                      <TableHead>Balance</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {sortedRows.map((inv: any) => {
                      const propName = inv.lease?.property?.name ?? inv.lease_id?.slice(0, 8);
                      const tenantName = role === "owner"
                        ? (ownerTenantNames[inv.id] ?? ([inv.tenant?.first_name, inv.tenant?.last_name].filter(Boolean).join(" ") || "—"))
                        : ([inv.tenant?.first_name, inv.tenant?.last_name].filter(Boolean).join(" ") || inv.tenant_id?.slice(0, 6));
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
                          <TableCell className="whitespace-nowrap">{inv.paymentDatesText ?? "—"}</TableCell>
                          <TableCell>{fmt(inv.balance, inv.currency)}</TableCell>
                          <TableCell>
                            {(() => {
                              const s = getStatusStyle(inv.displayStatus);
                              return <span className={`${s.cls} font-medium`}>{s.label}</span>;
                            })()}
                          </TableCell>
                          <TableCell>
                            <div className="flex gap-2">
                              <Button asChild size="sm" variant="outline"><Link to={`/invoices/${inv.id}`}>View</Link></Button>

                              {isAdmin ? (
                                <>
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
                                  <Button
                                    size="sm"
                                    variant="secondary"
                                    onClick={async () => {
                                      try {
                                        // Default to Spanish for WhatsApp
                                        const out = await generateInvoicePDF(inv.id, "es", { sendEmail: false, sendWhatsApp: false });
                                        const url = out.url;
                                        if (!url) {
                                          toast.info("Factura generada pero sin URL");
                                          return;
                                        }
                                        const tenantLabel = [inv.tenant?.first_name, inv.tenant?.last_name].filter(Boolean).join(" ") || "Cliente";
                                        const fmtAmt = new Intl.NumberFormat(undefined, { style: "currency", currency: inv.currency }).format(Number(inv.total_amount));
                                        const text = `Hola ${tenantLabel}, aquí está su factura ${inv.number ?? inv.id} por ${fmtAmt}, con vencimiento el ${inv.due_date}.`;
                                        const filename = buildInvoicePdfFileName(inv.number ?? inv.id, tenantLabel, inv.issue_date);
                                        await sharePdfToWhatsApp(url, filename, text);
                                      } catch (e: any) {
                                        toast.error(e?.message ?? "Error al compartir por WhatsApp");
                                      }
                                    }}
                                  >
                                    QuickShare
                                  </Button>
                                  <Button
                                    size="sm"
                                    variant="outline"
                                    onClick={async () => {
                                      try {
                                        const out = await generateInvoicePDF(inv.id, "es", { sendEmail: false, sendWhatsApp: false });
                                        const url = out.url;
                                        if (!url) {
                                          toast.info("Factura generada pero sin URL");
                                          return;
                                        }
                                        const invoiceNumber = inv.number ?? inv.id;
                                        const tenantLabel = [inv.tenant?.first_name, inv.tenant?.last_name].filter(Boolean).join(" ") || "Cliente";
                                        const filename = buildInvoicePdfFileName(invoiceNumber, tenantLabel, inv.issue_date);
                                        await downloadFileFromUrl(url, filename);
                                        toast.success("PDF downloaded");
                                      } catch (e: any) {
                                        toast.error(e?.message ?? "Failed to download PDF");
                                      }
                                    }}
                                  >
                                    Download PDF
                                  </Button>
                                  <EditInvoiceDialog invoice={inv} onUpdated={() => refetch()} />
                                  <DeleteInvoiceDialog id={inv.id} onDeleted={() => refetch()} />
                                </>
                              ) : null}
                            </div>
                          </TableCell>
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