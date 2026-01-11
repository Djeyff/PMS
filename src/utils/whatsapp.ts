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

export async function sharePdfToWhatsApp(url: string, filename: string, message?: string) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Failed to fetch PDF (${res.status})`);
  const blob = await res.blob();

  // Create a File for Web Share API
  const file = new File([blob], filename, { type: "application/pdf" });

  const nav: any = navigator as any;
  const canShareFiles = !!nav?.canShare && nav.canShare({ files: [file] });
  if (canShareFiles && !!nav?.share) {
    // Share with file attachment (mobile browsers that support files)
    await nav.share({
      files: [file],
      text: message ?? "",
    });
    return;
  }

  // Fallback: open WhatsApp with prefilled text containing the URL (user picks the recipient)
  const composed = message ? `${message}\n${url}` : url;
  const waUrl = `https://wa.me/?text=${encodeURIComponent(composed)}`;
  window.open(waUrl, "_blank");
}