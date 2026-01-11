"use client";

import React from "react";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import Money from "@/components/Money";
import { useAuth } from "@/contexts/AuthProvider";
import { generateInvoicePDF } from "@/services/invoices";
import { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem } from "@/components/ui/dropdown-menu";
import { toast } from "sonner";
import { sharePdfToWhatsApp } from "@/utils/whatsapp";
import { downloadFileFromUrl, buildPdfFileName, buildInvoicePdfFileName } from "@/utils/download";

type Props = {
  inv: any;
  onRefetch?: () => void;
};

const InvoiceListItemMobile: React.FC<Props> = ({ inv, onRefetch }) => {
  const { role } = useAuth();
  const isAdmin = role === "agency_admin";
  const propName = inv.lease?.property?.name ?? inv.lease_id?.slice(0, 8);
  const tenantName = [inv.tenant?.first_name, inv.tenant?.last_name].filter(Boolean).join(" ") || inv.tenant_id?.slice(0, 6);

  return (
    <div className="rounded-lg border p-3 bg-card mb-3">
      <div className="flex items-start justify-between gap-3">
        <div className="space-y-1">
          <div className="text-sm text-muted-foreground">{inv.number ?? "—"}</div>
          <div className="font-medium">{propName}</div>
          <div className="text-sm">{tenantName}</div>
        </div>
        <div className="text-right">
          <div className="text-sm">{inv.issue_date}</div>
          <div className="text-xs text-muted-foreground">{inv.due_date}</div>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 mt-3 text-sm">
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
          <div className="text-muted-foreground">Status</div>
          <div className="font-medium capitalize">{String(inv.displayStatus).replace("_", " ")}</div>
        </div>
      </div>

      <div className="mt-3 flex items-center gap-2">
        <Button asChild size="sm" variant="outline"><Link to={`/invoices/${inv.id}`}>View</Link></Button>
        {isAdmin && (
          <>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button size="sm" variant="secondary">Generate</Button>
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
                  English
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
                  Spanish
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
            <Button
              size="sm"
              variant="secondary"
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
                  const tenantName = [inv.tenant?.first_name, inv.tenant?.last_name].filter(Boolean).join(" ") || "Cliente";
                  const filename = buildInvoicePdfFileName(invoiceNumber, tenantName, inv.issue_date);
                  await downloadFileFromUrl(url, filename);
                  onRefetch && onRefetch();
                } catch (e: any) {
                  toast.error(e?.message ?? "No se pudo descargar el PDF");
                }
              }}
            >
              Download PDF
            </Button>
          </>
        )}
      </div>
    </div>
  );
};

export default InvoiceListItemMobile;