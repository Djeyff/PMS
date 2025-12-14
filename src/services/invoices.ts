import { supabase } from "@/integrations/supabase/client";

export type InvoiceRow = {
  id: string;
  lease_id: string;
  tenant_id: string;
  number: string | null;
  issue_date: string;
  due_date: string;
  currency: "USD" | "DOP";
  total_amount: number;
  status: "draft" | "sent" | "partial" | "paid" | "overdue" | "void";
  created_at: string;
};

export type InvoiceWithMeta = InvoiceRow & {
  lease?: { id: string; property?: { id: string; name: string } | null } | null;
  tenant?: { id: string; first_name: string | null; last_name: string | null } | null;
  payments?: { amount: number; currency: "USD" | "DOP" }[] | null;
};

export async function fetchInvoices() {
  const { data, error } = await supabase
    .from("invoices")
    .select(`
      id, lease_id, tenant_id, number, issue_date, due_date, currency, total_amount, status, created_at,
      lease:leases (
        id,
        property:properties ( id, name )
      ),
      tenant:profiles ( id, first_name, last_name ),
      payments:payments ( amount, currency )
    `)
    .order("due_date", { ascending: true });

  if (error) throw error;
  return (data ?? []) as InvoiceWithMeta[];
}

export async function createInvoice(input: {
  lease_id: string;
  tenant_id: string;
  number?: string | null;
  issue_date: string;
  due_date: string;
  currency: "USD" | "DOP";
  total_amount: number;
  status?: InvoiceRow["status"];
}) {
  const payload = {
    lease_id: input.lease_id,
    tenant_id: input.tenant_id,
    number: input.number ?? null,
    issue_date: input.issue_date,
    due_date: input.due_date,
    currency: input.currency,
    total_amount: input.total_amount,
    status: input.status ?? "sent",
  };

  const { data, error } = await supabase
    .from("invoices")
    .insert(payload)
    .select(`
      id, lease_id, tenant_id, number, issue_date, due_date, currency, total_amount, status, created_at,
      lease:leases (
        id,
        property:properties ( id, name )
      ),
      tenant:profiles ( id, first_name, last_name ),
      payments:payments ( amount, currency )
    `)
    .single();

  if (error) throw error;
  return data as InvoiceWithMeta;
}