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

function autoNumber(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  const rand = Math.random().toString(36).slice(2, 6).toUpperCase();
  return `INV-${y}${m}${day}-${rand}`;
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
    number: input.number && input.number.trim() !== "" ? input.number : autoNumber(),
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

export async function updateInvoice(
  id: string,
  input: Partial<{
    number: string | null;
    issue_date: string;
    due_date: string;
    currency: "USD" | "DOP";
    total_amount: number;
    status: InvoiceRow["status"];
  }>
) {
  const payload: any = {};
  if (typeof input.number !== "undefined") payload.number = input.number;
  if (typeof input.issue_date !== "undefined") payload.issue_date = input.issue_date;
  if (typeof input.due_date !== "undefined") payload.due_date = input.due_date;
  if (typeof input.currency !== "undefined") payload.currency = input.currency;
  if (typeof input.total_amount !== "undefined") payload.total_amount = input.total_amount;
  if (typeof input.status !== "undefined") payload.status = input.status;

  const { data, error } = await supabase
    .from("invoices")
    .update(payload)
    .eq("id", id)
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

export async function deleteInvoice(id: string) {
  const { error } = await supabase.from("invoices").delete().eq("id", id);
  if (error) throw error;
  return true;
}

export async function fetchPendingInvoicesByLease(leaseId: string) {
  const today = new Date().toISOString().slice(0, 10);
  const { data, error } = await supabase
    .from("invoices")
    .select(`
      id, number, lease_id, tenant_id, due_date, currency, total_amount, status,
      tenant:profiles ( first_name, last_name )
    `)
    .eq("lease_id", leaseId)
    .in("status", ["sent", "partial", "overdue"])
    .order("due_date", { ascending: true });
  if (error) throw error;
  return data ?? [];
}