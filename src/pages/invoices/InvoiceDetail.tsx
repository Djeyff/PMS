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
  const fmt = (amt: number, cur: string) => new Intl.NumberFormat(undefined, { style: "currency", currency: cur }).format(amt);

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
          <h1 className="text-2xl font-bold">Invoice</h1>
          <div className="text-sm text-gray-600">#{inv.number ?? inv.id.slice(0, 8)}</div>
        </div>
        <div className="space-x-2 print:hidden">
          <Button variant="secondary" asChild><Link to="/invoices">Back</Link></Button>
          <Button onClick={() => window.print()}>Print</Button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
        <div>
          <div className="font-medium">Billed To</div>
          <div>{tenantName}</div>
        </div>
        <div>
          <div className="font-medium">Property</div>
          <div>{propName}</div>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4 text-sm mb-6">
        <div>Issue Date: {inv.issue_date}</div>
        <div>Due Date: {inv.due_date}</div>
        <div>Currency: {inv.currency}</div>
        <div>Status: {String(displayStatus).toUpperCase()}</div>
      </div>

      <div className="border rounded">
        <div className="flex justify-between p-3 border-b">
          <div>Description</div>
          <div>Amount</div>
        </div>
        <div className="flex justify-between p-3">
          <div>Lease invoice</div>
          <div>{fmt(Number(inv.total_amount), inv.currency)}</div>
        </div>
      </div>

      <div className="flex justify-end mt-4">
        <div className="w-64 space-y-1">
          <div className="flex justify-between">
            <div>Total</div>
            <div className="font-medium">{fmt(Number(inv.total_amount), inv.currency)}</div>
          </div>
          <div className="flex justify-between text-gray-600">
            <div>Paid</div>
            <div>{fmt(paid, inv.currency)}</div>
          </div>
          <div className="flex justify-between">
            <div>Balance</div>
            <div className="font-medium">{fmt(balance, inv.currency)}</div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default InvoiceDetail;