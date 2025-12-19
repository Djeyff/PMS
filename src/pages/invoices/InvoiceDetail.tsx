import React from "react";
import { useParams, Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { fetchInvoiceById, fetchInvoicesByTenant } from "@/services/invoices";
import { Button } from "@/components/ui/button";
import { fetchAgencyById } from "@/services/agencies";
import { getLogoPublicUrl } from "@/services/branding";
import { fetchPaymentsByTenant } from "@/services/payments";
import { getInvoiceSignedUrlByInvoiceId, generateInvoicePDF } from "@/services/invoices";
import { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem } from "@/components/ui/dropdown-menu";
import { toast } from "sonner";

const InvoiceDetail = () => {
  const { id } = useParams<{ id: string }>();

  const { data: inv, isLoading, isError, refetch } = useQuery({
    queryKey: ["invoice-detail", id],
    queryFn: () => fetchInvoiceById(id!),
    enabled: !!id,
  });

  const agencyId = inv?.lease?.property?.agency_id ?? null;

  const { data: tenantInvoices } = useQuery({
    queryKey: ["tenant-invoices", inv?.tenant_id],
    enabled: !!inv?.tenant_id,
    queryFn: () => fetchInvoicesByTenant(inv!.tenant_id),
  });

  const { data: tenantPayments } = useQuery({
    queryKey: ["tenant-payments", inv?.tenant_id],
    enabled: !!inv?.tenant_id,
    queryFn: () => fetchPaymentsByTenant(inv!.tenant_id),
  });

  const { data: agency } = useQuery({
    queryKey: ["invoice-agency", agencyId],
    enabled: !!agencyId,
    queryFn: () => fetchAgencyById(agencyId!),
  });

  const [logoUrl, setLogoUrl] = React.useState<string>("");
  React.useEffect(() => {
    getLogoPublicUrl().then((url) => setLogoUrl(url)).catch(() => setLogoUrl(""));
  }, []);

  const [signedUrl, setSignedUrl] = React.useState<string | null>(null);
  React.useEffect(() => {
    if (inv?.id && inv?.pdf_url) {
      getInvoiceSignedUrlByInvoiceId(inv.id)
        .then((url) => setSignedUrl(url))
        .catch(() => setSignedUrl(null));
    } else {
      setSignedUrl(null);
    }
  }, [inv?.id, inv?.pdf_url]);

  // Safe month text computation - moved above early returns to keep hook order consistent
  const monthText = React.useMemo(() => {
    const iso = inv?.issue_date;
    const localeLang = inv?.pdf_lang === "es" ? "es" : "en";
    if (!iso) return "—";
    const d = new Date(iso);
    const m = d.toLocaleString(localeLang === "es" ? "es-ES" : "en-US", { month: "long" });
    const y = String(d.getFullYear());
    return localeLang === "es" ? `${m} ${y.slice(-2)}` : `${m} ${y}`;
  }, [inv?.issue_date, inv?.pdf_lang]);

  if (isLoading) return <div className="p-6 text-sm text-muted-foreground">Loading...</div>;
  if (isError) return <div className="p-6">Failed to load invoice. <Link to="/invoices" className="underline text-blue-600">Back</Link></div>;
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
        contractExpiry: "Vencimiento del contrato",
        prevBalance: "Saldo previo (mismo inquilino)",
        overallBalance: "Saldo total (incluye esta factura)",
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
        contractExpiry: "Contract Expiry",
        prevBalance: "Previous balance (same tenant)",
        overallBalance: "Overall balance (includes this invoice)",
      };

  const fmtLocale = lang === "es" ? "es-ES" : "en-US";
  const fmt = (amt: number, cur: string) => new Intl.NumberFormat(fmtLocale, { style: "currency", currency: cur }).format(amt);

  // Compute paid using currency conversion (exchange_rate), then balance
  const paidConverted = (inv.payments ?? []).reduce((sum: number, p: any) => {
    const amt = Number(p.amount || 0);
    if (p.currency === inv.currency) return sum + amt;
    // Convert using exchange_rate when available
    const rate = typeof p.exchange_rate === "number" ? p.exchange_rate : null;
    if (!rate || rate <= 0) return sum;
    if (inv.currency === "USD" && p.currency === "DOP") return sum + amt / rate; // DOP → USD
    if (inv.currency === "DOP" && p.currency === "USD") return sum + amt * rate; // USD → DOP
    return sum;
  }, 0);

  const balance = Number(inv.total_amount) - paidConverted;
  const today = new Date().toISOString().slice(0, 10);
  let displayStatus: string = inv.status;
  if (balance <= 0) displayStatus = "paid";
  else if (inv.due_date < today && inv.status !== "void") displayStatus = "overdue";
  else if (paidConverted > 0) displayStatus = "partial";

  // Compute previous and overall tenant balances in the invoice currency
  const invCurrency = inv.currency;
  const invIssue = inv.issue_date;
  const prevInvoices = (tenantInvoices ?? []).filter((i: any) => i.currency === invCurrency && i.issue_date < invIssue && i.id !== inv.id);
  const prevTotals = prevInvoices.reduce((s: number, i: any) => s + Number(i.total_amount || 0), 0);
  const prevPayments = (tenantPayments ?? []).filter((p: any) => p.currency === invCurrency && p.received_date < invIssue).reduce((s: number, p: any) => s + Number(p.amount || 0), 0);
  const previousBalance = prevPayments - prevTotals;

  const allTotalsToDate = (tenantInvoices ?? []).filter((i: any) => i.currency === invCurrency && i.issue_date <= invIssue).reduce((s: number, i: any) => s + Number(i.total_amount || 0), 0);
  const allPaymentsToDate = (tenantPayments ?? []).filter((p: any) => p.currency === invCurrency && p.received_date <= invIssue).reduce((s: number, p: any) => s + Number(p.amount || 0), 0);
  const overallBalance = allPaymentsToDate - allTotalsToDate;

  // Branding
  const agencyName = agency?.name ?? "Las Terrenas Properties";
  const agencyAddress = agency?.address ?? "278 calle Duarte, LTI building, Las Terrenas";

  // Friendly payment method label (localized)
  const methodLabel = (m: string | null | undefined) => {
    const key = String(m ?? "").toLowerCase();
    const mapEn: Record<string, string> = {
      bank_transfer: "Bank Transfer",
      cash: "Cash",
      card: "Card",
      check: "Check",
    };
    const mapEs: Record<string, string> = {
      bank_transfer: "Transferencia bancaria",
      cash: "Efectivo",
      card: "Tarjeta",
      check: "Cheque",
    };
    const map = lang === "es" ? mapEs : mapEn;
    if (map[key]) return map[key];
    const cleaned = key.replace(/_/g, " ").trim();
    return cleaned
      .split(" ")
      .map((w) => (w ? w[0].toUpperCase() + w.slice(1) : w))
      .join(" ") || "—";
  };

  const methodsDisplay = (() => {
    const list = (inv.payments ?? []).map((p: any) => methodLabel(p.method)).filter(Boolean);
    if (list.length === 0) return "—";
    const uniq = Array.from(new Set(list));
    return uniq.join(", ");
  })();

  const exchangeRateDisplay = (() => {
    const diffPay = (inv.payments ?? []).find((p: any) => p.exchange_rate && p.currency !== inv.currency);
    if (!diffPay?.exchange_rate) return "—";
    return String(diffPay.exchange_rate);
  })();

  return (
    <div className="invoice-print p-6 max-w-3xl mx-auto bg-white text-black">
      {/* Header with bilingual title (aligned right) */}
      <div className="flex items-start justify-between mb-6">
        <div className="flex items-start gap-3">
          {logoUrl ? <img src={logoUrl} alt="Logo" className="h-12 w-auto rounded" /> : null}
          <div>
            <div className="font-semibold">{agencyName}</div>
            <div className="text-xs text-gray-600 whitespace-pre-line">{agencyAddress}</div>
          </div>
        </div>
        <div className="text-right">
          <div className="text-xl font-semibold leading-tight">{lang === "es" ? "Recibo" : "Receipt"}</div>
          <div className="text-sm text-gray-600">{lang === "es" ? "Factura" : "Invoice"}</div>
          <div className="mt-2 space-x-2 print:hidden flex items-center gap-2">
            <Button variant="secondary" asChild><Link to="/invoices">{t.back}</Link></Button>
            {signedUrl ? (
              <Button asChild><a href={signedUrl} target="_blank" rel="noreferrer">{t.openPdf}</a></Button>
            ) : null}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline">{lang === "es" ? "Generar PDF" : "Generate PDF"}</Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent>
                <DropdownMenuItem
                  onClick={async () => {
                    if (!inv?.id) return;
                    try {
                      const out = await generateInvoicePDF(inv.id, "en", { sendEmail: false, sendWhatsApp: false });
                      toast.success("Invoice PDF generated in English");
                      await refetch();
                      const url = await getInvoiceSignedUrlByInvoiceId(inv.id);
                      if (url) window.open(url, "_blank");
                    } catch (e: any) {
                      toast.error(e?.message ?? "Failed to generate PDF");
                    }
                  }}
                >
                  English
                </DropdownMenuItem>
                <DropdownMenuItem
                  onClick={async () => {
                    if (!inv?.id) return;
                    try {
                      const out = await generateInvoicePDF(inv.id, "es", { sendEmail: false, sendWhatsApp: false });
                      toast.success("Factura generada en Español");
                      await refetch();
                      const url = await getInvoiceSignedUrlByInvoiceId(inv.id);
                      if (url) window.open(url, "_blank");
                    } catch (e: any) {
                      toast.error(e?.message ?? "No se pudo generar el PDF");
                    }
                  }}
                >
                  Español
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
            <Button onClick={() => window.print()}>{t.print}</Button>
          </div>
        </div>
      </div>

      {/* Info grid: agency block left, billed-to and meta right */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
        <div className="space-y-1">
          <div className="font-semibold">{agencyName}</div>
          <div className="text-sm text-gray-600 whitespace-pre-line">{agencyAddress}</div>
        </div>
        <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-sm">
          <div className="text-gray-600">{lang === "es" ? "Facturado a" : "Billed to"}</div>
          <div className="font-medium">{tenantName}</div>

          <div className="text-gray-600">{lang === "es" ? "Para" : "For"}</div>
          <div className="font-medium">{propName}</div>

          <div className="text-gray-600">{lang === "es" ? "Fecha" : "Date"}</div>
          <div className="font-medium">{inv.issue_date}</div>

          <div className="text-gray-600">{lang === "es" ? "Para el mes de" : "For month of"}</div>
          <div className="font-medium">{monthText}</div>
        </div>
      </div>

      {/* Summary header row (compact table-style) */}
      <div className="rounded border bg-gray-50">
        <div className="grid grid-cols-5 gap-2 p-2 text-xs font-medium text-gray-700">
          <div className="truncate">{lang === "es" ? "Alquiler DOP" : "Rent DOP"}</div>
          <div className="truncate">{lang === "es" ? "Alquiler USD" : "Rent USD"}</div>
          <div className="truncate">{lang === "es" ? "Importe Anterior USD" : "Overdue USD"}</div>
          <div className="truncate">{lang === "es" ? "Importe Anterior DOP" : "Overdue DOP"}</div>
          <div className="truncate">{lang === "es" ? "Fin del contrato" : "Lease End Date"}</div>
        </div>
        <div className="grid grid-cols-5 gap-2 p-2 text-sm">
          <div className="truncate">
            {inv.currency === "DOP" ? fmt(Number(inv.total_amount), "DOP") : "—"}
          </div>
          <div className="truncate">
            {inv.currency === "USD" ? fmt(Number(inv.total_amount), "USD") : "—"}
          </div>
          <div className="truncate">
            {inv.currency === "USD" ? fmt(Math.max(0, previousBalance), "USD") : "—"}
          </div>
          <div className="truncate">
            {inv.currency === "DOP" ? fmt(Math.max(0, previousBalance), "DOP") : "—"}
          </div>
          <div className="truncate">{inv.lease?.end_date ?? "—"}</div>
        </div>
      </div>

      {/* Line item block */}
      <div className="border rounded mt-6">
        <div className="flex justify-between p-3 border-b">
          <div className="font-medium">{t.description}</div>
          <div className="font-medium">{t.amount}</div>
        </div>
        <div className="flex justify-between p-3">
          <div>{t.leaseInvoice}</div>
          <div>{fmt(Number(inv.total_amount), inv.currency)}</div>
        </div>
      </div>

      {/* Payment summary + Balance block */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mt-6">
        <div className="space-y-2 bg-gray-50 rounded p-3">
          <div className="font-medium">{lang === "es" ? "Total a pagar" : "Amount to be Paid"} :</div>
          <div className="text-lg font-semibold">{fmt(Number(inv.total_amount), inv.currency)}</div>

          <div className="font-medium mt-2">{lang === "es" ? "Pagado" : "Paid"} :</div>
          <div>{fmt(paidConverted, inv.currency)}</div>

          <div className="font-medium mt-2">{lang === "es" ? "Tasa de Cambio" : "Exchange Rate"} :</div>
          <div className="text-sm">{exchangeRateDisplay}</div>

          <div className="font-medium mt-2">{lang === "es" ? "Método de pago" : "Payment Method"} :</div>
          <div className="text-sm">{methodsDisplay}</div>
        </div>

        <div className="space-y-2 bg-gray-50 rounded p-3">
          <div className="font-medium">{lang === "es" ? "Saldo" : "Balance"} :</div>
          <div className="text-lg font-semibold">{fmt(balance, inv.currency)}</div>

          <div className="mt-4 pt-3 border-t space-y-2">
            <div className="flex justify-between text-gray-600">
              <div>{t.prevBalance}</div>
              <div>{fmt(previousBalance, inv.currency)}</div>
            </div>
            <div className="grid grid-cols-[1fr,auto] items-start gap-4">
              <div className="leading-snug">{t.overallBalance}</div>
              <div className="font-semibold text-right min-w-[110px]">{fmt(overallBalance, inv.currency)}</div>
            </div>
          </div>
        </div>
      </div>

      {/* Reminder */}
      <div className="mt-6 text-sm">
        <div className="font-medium">{lang === "es" ? "Recordatorio" : "Reminder"} :</div>
        <div className="text-gray-700">
          {lang === "es"
            ? "Por favor, pague antes del día 5 de cada mes."
            : "Please pay before the 5th of each month."}
        </div>
      </div>
    </div>
  );
};

export default InvoiceDetail;