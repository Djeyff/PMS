import React from "react";
import { useParams, Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { fetchInvoices } from "@/services/invoices";
import { Button } from "@/components/ui/button";

const InvoiceDetail = () => {
  const { id } = useParams<{ id: string }>();
  const { data, isLoading } = useQuery({
    queryKey: ["invoice-detail"],
    queryFn: fetchInvoices,
  });

  const inv = (data ?? []).find((i: any) => i.id === id);

  if (isLoading) return <div className="p-6 text-sm text-muted-foreground">Loading...</div>;
  if (!inv) return <div className="p-6">Invoice not found. <Link to="/invoices" className="underline text-blue-600">Back</Link></div>;

  const propName = inv.lease?.property?.name ?? inv.lease_id?.slice(0, 8);
  const tenantName = [inv.tenant?.first_name, inv.tenant?.last_name].filter(Boolean).join(" ") || inv.tenant_id?.slice(0, 6);
  const lang = inv?.pdf_lang === "es" ? "es" : "en";
  const t = lang === "es"
    ? {
        title: "Factura",
        billedTo: "Facturado a",
        property: "Propiedad",
        issue: "Fecha de emisión",
        due: "Fecha de vencimiento",
        currency: "Moneda",
        status: "Estado",
        description: "Descripción",
        leaseInvoice: "Factura de contrato",
        total: "Total",
        paid: "Pagado",
        balance: "Saldo",
        back: "Volver",
        print: "Imprimir",
        openPdf: "Abrir PDF",
        amount: "Importe",
      }
    : {
        title: "Invoice",
        billedTo: "Billed To",
        property: "Property",
        issue: "Issue Date",
        due: "Due Date",
        currency: "Currency",
        status: "Status",
        description: "Description",
        leaseInvoice: "Lease invoice",
        total: "Total",
        paid: "Paid",
        balance: "Balance",
        back: "Back",
        print: "Print",
        openPdf: "Open PDF",
        amount: "Amount",
      };

  const fmtLocale = lang === "es" ? "es-ES" : "en-US";
  const fmt = (amt: number, cur: string) => new Intl.NumberFormat(fmtLocale, { style: "currency", currency: cur }).format(amt);

  // Compute paid/balance and derived display status (same as list page)
  const paid = (inv.payments ?? []).filter((p: any) => p.currency === inv.currency).reduce((s: number, p: any) => s + Number(p.amount || 0), 0);
  const balance = Math.max(0, Number(inv.total_amount) - paid);
  const today = new Date().toISOString().slice(0, 10);
  let displayStatus: string = inv.status;
  if (balance <= 0) displayStatus = "paid";
  else if (inv.due_date < today && inv.status !== "void") displayStatus = "overdue";
  else if (paid > 0) displayStatus = "partial";

  return (
    <div className="p-6 max-w-3xl mx-auto bg-white text-black">
      <div className="flex justify-between items-start mb-6">
        <div>
          <h1 className="text-2xl font-bold">{t.title}</h1>
          <div className="text-sm text-gray-600">#{inv.number ?? inv.id.slice(0, 8)}</div>
        </div>
        <div className="space-x-2 print:hidden">
          <Button variant="secondary" asChild><Link to="/invoices">{t.back}</Link></Button>
          {inv.pdf_url ? (
            <Button asChild><a href={inv.pdf_url} target="_blank" rel="noreferrer">{t.openPdf}</a></Button>
          ) : null}
          <Button onClick={() => window.print()}>{t.print}</Button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
        <div>
          <div className="font-medium">{t.billedTo}</div>
          <div>{tenantName}</div>
        </div>
        <div>
          <div className="font-medium">{t.property}</div>
          <div>{propName}</div>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4 text-sm mb-6">
        <div>{t.issue}: {inv.issue_date}</div>
        <div>{t.due}: {inv.due_date}</div>
        <div>{t.currency}: {inv.currency}</div>
        <div>{t.status}: {String(displayStatus).toUpperCase()}</div>
      </div>

      <div className="border rounded">
        <div className="flex justify-between p-3 border-b">
          <div>{t.description}</div>
          <div>{t.amount}</div>
        </div>
        <div className="flex justify-between p-3">
          <div>{t.leaseInvoice}</div>
          <div>{fmt(Number(inv.total_amount), inv.currency)}</div>
        </div>
      </div>

      <div className="flex justify-end mt-4">
        <div className="w-64 space-y-1">
          <div className="flex justify-between">
            <div>{t.total}</div>
            <div className="font-medium">{fmt(Number(inv.total_amount), inv.currency)}</div>
          </div>
          <div className="flex justify-between text-gray-600">
            <div>{t.paid}</div>
            <div>{fmt(paid, inv.currency)}</div>
          </div>
          <div className="flex justify-between">
            <div>{t.balance}</div>
            <div className="font-medium">{fmt(balance, inv.currency)}</div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default InvoiceDetail;