"use client";

import React from "react";
import { Link } from "react-router-dom";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import Money from "@/components/Money";
import { useAuth } from "@/contexts/AuthProvider";
import { generateInvoicePDF } from "@/services/invoices";
import { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem } from "@/components/ui/dropdown-menu";
import { toast } from "sonner";
import { sharePdfToWhatsApp } from "@/utils/whatsapp";
import { downloadFileFromUrl, buildInvoicePdfFileName } from "@/utils/download";

type Props = {
  inv: any;
  onRefetch?: () => void;
};

const statusPill = (status: string) => {
  const s = String(status ?? "").toLowerCase();
  if (s === "overdue") return { cls: "bg-red-100 text-red-700", label: "Overdue" };
  if (s === "partial") return { cls: "bg-amber-100 text-amber-800", label: "Partial" };
  if (s === "paid") return { cls: "bg-green-100 text-green-700", label: "Paid" };
  if (s === "void") return { cls: "bg-gray-200 text-gray-700", label: "Void" };
  if (s === "sent") return { cls: "bg-blue-100 text-blue-700", label: "Sent" };
  return { cls: "bg-gray-200 text-gray-700", label: s ? s[0].toUpperCase() + s.slice(1).replace(/_/g, " ") : "—" };
};

const InvoiceListItemMobile: React.FC<Props> = ({ inv, onRefetch }) => {
  const { role } = useAuth();
  const isAdmin = role === "agency_admin";
  const propName = inv.lease?.property?.name ?? inv.lease_id?.slice(0, 8);
  const tenantName = [inv.tenant?.first_name, inv.tenant?.last_name].filter(Boolean).join(" ") || inv.tenant_id?.slice(0, 6);
  const st = statusPill(inv.displayStatus ?? inv.status);

  return (
    <Card className="mb-3">
      <CardContent className="p-3">
        <div className="flex items-start justify-between gap-3">
          <div className="space-y-1">
            <div className="text-sm text-muted-foreground">{inv.number ?? "—"}</div>
            <div className="font-semibold">{propName}</div>
            <div className="text-sm">{tenantName}</div>
          </div>
          <div className="text-right">
            <div className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${st.cls}`}>{st.label}</div>
            <div className="mt-2 text-xs text-muted-foreground">Issue: {inv.issue_date}</div>
            <div className="text-xs text-muted-foreground">Due: {inv.due_date}</div>
          </div>
        </div>

        <div className="mt-3 grid grid-cols-2 gap-3 text-sm">
          <div>
            <div className="text-muted-foreground">Total</div>
            <div className="font-medium"><Money amount={Number(inv.total_amount)} currency={inv.currency} /></div>
          </div>
          <div>
            <div className="text-muted-foreground">Paid</div>
            <div className="font-medium"><Money amount={Number(inv.paid ?? 0)} currency={inv.currency} /></div>
          </div>
          <div>
            <div className="text-muted-foreground">Balance</div>
            <div className="font-medium"><Money amount={Number(inv.balance ?? 0)} currency={inv.currency} /></div>
          </div>
          <div>
            <div className="text-muted-foreground">Currency</div>
            <div className="font-medium">{inv.currency}</div>
          </div>
        </div>

        <div className="mt-3 flex flex-wrap gap-2">
          <Button asChild size="sm" variant="outline"><Link to={`/invoices/${inv.id}`}>View</Link></Button>

          {isAdmin ? (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button size="sm" variant="secondary">Actions</Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent>
                <DropdownMenuItem
                  onClick={async () => {
                    try {
                      await generateInvoicePDF(inv.id, "en", { sendEmail: false, sendWhatsApp: false });
                      toast.success("Invoice PDF generated in English");
                      onRefetch && onRefetch();
                    } catch (e: any) {
                      toast.error(e.message || "Failed to generate PDF");
                    }
                  }}
                >
                  Generate PDF (English)
                </DropdownMenuItem>
                <DropdownMenuItem
                  onClick={async () => {
                    try {
                      await generateInvoicePDF(inv.id, "es", { sendEmail: false, sendWhatsApp: false });
                      toast.success("Factura generada en Español");
                      onRefetch && onRefetch();
                    } catch (e: any) {
                      toast.error(e.message || "Failed to generate PDF");
                    }
                  }}
                >
                  Generate PDF (Español)
                </DropdownMenuItem>
                <DropdownMenuItem
                  onClick={async () => {
                    try {
                      // Default to Spanish
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
                  QuickShare (WhatsApp)
                </DropdownMenuItem>
                <DropdownMenuItem
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
                      onRefetch && onRefetch();
                    } catch (e: any) {
                      toast.error(e?.message ?? "No se pudo descargar el PDF");
                    }
                  }}
                >
                  Download PDF
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          ) : null}
        </div>
      </CardContent>
    </Card>
  );
};

export default InvoiceListItemMobile;