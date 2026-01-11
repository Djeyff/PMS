"use client";

export function sanitizeName(input: string) {
  return String(input || "")
    .trim()
    .replace(/\s+/g, "-")
    .replace(/[^\p{L}\p{N}\-_.]/gu, "");
}

export function monthYearFromDate(dateStr: string) {
  const s = String(dateStr || "").slice(0, 10); // YYYY-MM-DD
  const d = new Date(s);
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const yyyy = String(d.getFullYear());
  return `${mm}-${yyyy}`;
}

export function buildPdfFileName(tenantName: string, propertyName: string, dateStr: string) {
  const t = sanitizeName(tenantName || "Tenant");
  const p = sanitizeName(propertyName || "Property");
  const my = monthYearFromDate(dateStr);
  return `${t}-${p}-${my}.pdf`;
}

export function buildInvoicePdfFileName(invoiceNumber: string, tenantName: string, dateStr: string) {
  const n = sanitizeName(invoiceNumber || "Factura");
  const t = sanitizeName(tenantName || "Cliente");
  const my = monthYearFromDate(dateStr);
  return `${n}-${t}-${my}.pdf`;
}

export async function downloadFileFromUrl(url: string, filename: string) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Failed to download file (${res.status})`);
  const blob = await res.blob();
  const objectUrl = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = objectUrl;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(objectUrl);
}