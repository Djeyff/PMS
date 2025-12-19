"use client";

import { supabase } from "@/integrations/supabase/client";

export async function generatePaymentReceiptPDF(paymentId: string, lang: "en" | "es" = "en") {
  const { data: sess } = await supabase.auth.getSession();
  const token = sess.session?.access_token;
  if (!token) throw new Error("Not authenticated");

  const url = "https://tsfswvmwkfairaoccfqa.supabase.co/functions/v1/payment-receipt";
  const res = await fetch(url, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ paymentId, lang }),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err?.error || `Generate payment receipt failed (${res.status})`);
  }

  return (await res.json()) as { ok: true; url: string | null; path: string };
}