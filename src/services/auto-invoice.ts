import { supabase } from "@/integrations/supabase/client";

const AUTO_INVOICE_URL = "https://tsfswvmwkfairaoccfqa.supabase.co/functions/v1/auto-invoice";

export async function runAutoInvoice(force: boolean = true): Promise<{ ok: boolean; sent: number; errors: string[] }> {
  const { data: sess } = await supabase.auth.getSession();
  const token = sess.session?.access_token;
  if (!token) throw new Error("Not authenticated");

  const res = await fetch(`${AUTO_INVOICE_URL}`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ force }),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err?.error || `Auto-invoice failed (${res.status})`);
  }

  return (await res.json()) as { ok: boolean; sent: number; errors: string[] };
}

export async function runAutoInvoiceNoForce(): Promise<{ ok: boolean; sent: number; errors: string[] }> {
  return runAutoInvoice(false);
}