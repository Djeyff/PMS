"use client";

import React from "react";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem } from "@/components/ui/dropdown-menu";
import { toast } from "sonner";
import { generatePaymentReceiptPDF } from "@/services/payment-pdf";
import EditPaymentDialog from "@/components/payments/EditPaymentDialog";
import DeletePaymentDialog from "@/components/payments/DeletePaymentDialog";
import Money from "@/components/Money";
import { useAuth } from "@/contexts/AuthProvider";
import { openWhatsAppShare } from "@/utils/whatsapp";
import { downloadFileFromUrl, buildPdfFileName } from "@/utils/download";

type Props = {
  payment: any;
  onRefetch?: () => void;
};

const methodLabel = (m: string | null | undefined) => {
  const key = String(m ?? "").toLowerCase();
  const map: Record<string, string> = {
    bank_transfer: "Bank Transfer",
    cash: "Cash",
    card: "Card",
    check: "Check",
  };
  if (map[key]) return map[key];
  const cleaned = key.replace(/_/g, " ").trim();
  return cleaned
    .split(" ")
    .map((w) => (w ? w[0].toUpperCase() + w.slice(1) : w))
    .join(" ") || "—";
};

const PaymentListItemMobile: React.FC<Props> = ({ payment, onRefetch }) => {
  const { role } = useAuth();
  const canCreate = role === "agency_admin";
  const propName = payment.lease?.property?.name ?? "—";
  const tenantName = [payment.tenant?.first_name, payment.tenant?.last_name].filter(Boolean).join(" ") || "—";

  return (
    <div className="rounded-lg border p-3 bg-card mb-3">
      <div className="flex items-start justify-between gap-3">
        <div className="space-y-1">
          <div className="font-medium">{propName}</div>
          <div className="text-sm">{tenantName}</div>
        </div>
        <div className="text-right">
          <div className="text-sm">{payment.received_date}</div>
          <div className="text-xs text-muted-foreground">{methodLabel(payment.method)}</div>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 mt-3 text-sm">
        <div>
          <div className="text-muted-foreground">Amount</div>
          <div className="font-medium"><Money amount={Number(payment.amount)} currency={payment.currency} /></div>
        </div>
        <div>
          <div className="text-muted-foreground">Reference</div>
          <div className="font-medium">{payment.reference ?? "—"}</div>
        </div>
      </div>

      <div className="mt-3 flex items-center gap-2">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button size="sm" variant="secondary">View</Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent>
            <DropdownMenuItem
              onClick={async () => {
                try {
                  const out = await generatePaymentReceiptPDF(payment.id, "en");
                  if (out.url) {
                    window.open(out.url, "_blank");
                    toast.success("Payment receipt generated in English");
                  } else {
                    toast.info("Receipt generated but no URL returned");
                  }
                } catch (e: any) {
                  toast.error(e?.message ?? "Failed to open receipt");
                }
              }}
            >
              English
            </DropdownMenuItem>
            <DropdownMenuItem
              onClick={async () => {
                try {
                  const out = await generatePaymentReceiptPDF(payment.id, "es");
                  if (out.url) {
                    window.open(out.url, "_blank");
                    toast.success("Recibo generado en Español");
                  } else {
                    toast.info("Recibo generado pero sin URL");
                  }
                } catch (e: any) {
                  toast.error(e?.message ?? "Error al abrir el recibo");
                }
              }}
            >
              Spanish
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
        {canCreate && (
          <>
            <EditPaymentDialog payment={payment} onUpdated={() => onRefetch && onRefetch()} />
            <DeletePaymentDialog
              id={payment.id}
              summary={`${tenantName} • ${propName} • ${payment.received_date}`}
              metadata={{
                amount: payment.amount,
                currency: payment.currency,
                method: payment.method,
                received_date: payment.received_date,
                reference: payment.reference ?? null,
                tenant_id: payment.tenant_id,
                tenant_name: tenantName,
                property_id: payment.lease?.property?.id ?? null,
                property_name: propName,
                lease_id: payment.lease_id,
                invoice_id: payment.invoice_id ?? null,
              }}
              onDeleted={() => onRefetch && onRefetch()}
            />
            <Button
              size="sm"
              variant="secondary"
              onClick={async () => {
                try {
                  // Default to Spanish
                  const out = await generatePaymentReceiptPDF(payment.id, "es");
                  const url = out.url;
                  if (!url) {
                    toast.info("Recibo generado pero sin URL");
                    return;
                  }
                  const fmtAmt = new Intl.NumberFormat(undefined, { style: "currency", currency: payment.currency }).format(Number(payment.amount));
                  const text = `Hola ${tenantName}, aquí está su recibo de pago por ${fmtAmt} del ${payment.received_date}.\n${url}`;
                  openWhatsAppShare(payment.tenant?.phone ?? null, text);
                } catch (e: any) {
                  toast.error(e?.message ?? "Error al compartir por WhatsApp");
                }
              }}
            >
              WhatsApp
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={async () => {
                try {
                  const out = await generatePaymentReceiptPDF(payment.id, "es");
                  const url = out.url;
                  if (!url) {
                    toast.info("Recibo generado pero sin URL");
                    return;
                  }
                  const filename = buildPdfFileName(
                    tenantName || "Cliente",
                    propName || "Propiedad",
                    payment.received_date
                  );
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

export default PaymentListItemMobile;