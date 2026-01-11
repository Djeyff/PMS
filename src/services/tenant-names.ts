import { supabase } from "@/integrations/supabase/client";

export async function getTenantNamesForInvoices(invoiceIds: string[]) {
  if (!Array.isArray(invoiceIds) || invoiceIds.length === 0) return {};
  const { data: sess } = await supabase.auth.getSession();
  const token = sess.session?.access_token;
  if (!token) return {};

  const url = "https://tsfswvmwkfairaoccfqa.supabase.co/functions/v1/owner-tenant-names";
  const res = await fetch(url, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ invoiceIds }),
  });

  if (!res.ok) {
    // Silently return empty mapping on failure to avoid breaking UI
    return {};
  }

  const json = await res.json().catch(() => ({}));
  return (json?.names ?? {}) as Record<string, string>;
}