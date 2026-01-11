"use client";

export function buildWhatsAppUrl(phone: string | null | undefined, text: string) {
  const sanitized = String(phone ?? "")
    .replace(/[^\d+]/g, "") // keep digits and plus
    .replace(/^\+/, "");    // wa.me expects no leading plus
  const base = sanitized ? `https://wa.me/${sanitized}` : "https://wa.me/";
  return `${base}?text=${encodeURIComponent(text)}`;
}

export function openWhatsAppShare(phone: string | null | undefined, text: string) {
  const url = buildWhatsAppUrl(phone, text);
  window.open(url, "_blank");
}