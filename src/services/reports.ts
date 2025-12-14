import { supabase } from "@/integrations/supabase/client";

const SEND_OWNER_REPORT_URL = "https://tsfswvmwkfairaoccfqa.supabase.co/functions/v1/send-owner-report";

export async function sendOwnerReport(input: {
  ownerId: string;
  ownerName?: string;
  startDate: string;
  endDate: string;
  totals: { usd: number; dop: number };
  csv?: string;
}) {
  const { data: sess } = await supabase.auth.getSession();
  const token = sess.session?.access_token;
  if (!token) throw new Error("Not authenticated");

  const res = await fetch(SEND_OWNER_REPORT_URL, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err?.error || `Send owner report failed (${res.status})`);
  }

  return (await res.json()) as { ok: true };
}