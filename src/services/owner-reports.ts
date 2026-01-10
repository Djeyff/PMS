import { supabase } from "@/integrations/supabase/client";

export type OwnerReportRow = {
  id: string;
  agency_id: string;
  owner_id: string;
  month: string;
  start_date: string;
  end_date: string;
  avg_rate: number | null;
  usd_cash_total: number;
  dop_cash_total: number;
  usd_transfer_total: number;
  dop_transfer_total: number;
  usd_total: number;
  dop_total: number;
  created_at: string | null;
  updated_at: string | null;
};

export async function listOwnerReports(agencyId: string, ownerId?: string) {
  let query = supabase
    .from("owner_reports")
    .select("*")
    .eq("agency_id", agencyId)
    .order("start_date", { ascending: false });
  if (ownerId) query = query.eq("owner_id", ownerId);
  const { data, error } = await query;
  if (error) throw error;
  return (data ?? []) as OwnerReportRow[];
}

export async function createOwnerReport(input: Omit<OwnerReportRow, "id" | "created_at" | "updated_at">) {
  const payload = { ...input };
  const { data, error } = await supabase
    .from("owner_reports")
    .insert(payload)
    .select("*")
    .single();
  if (error) throw error;
  return data as OwnerReportRow;
}

export async function updateOwnerReport(id: string, updates: Partial<OwnerReportRow>) {
  const { data, error } = await supabase
    .from("owner_reports")
    .update(updates)
    .eq("id", id)
    .select("*")
    .single();
  if (error) throw error;
  return data as OwnerReportRow;
}

export async function deleteOwnerReport(id: string) {
  const { data, error } = await supabase
    .from("owner_reports")
    .delete()
    .eq("id", id)
    .select("id")
    .single();
  if (error) throw error;
  return true;
}

export async function deleteOwnerReportsForPeriod(agencyId: string, month: string, startDate: string, endDate: string) {
  const { error } = await supabase
    .from("owner_reports")
    .delete()
    .eq("agency_id", agencyId)
    .eq("month", month)
    .eq("start_date", startDate)
    .eq("end_date", endDate);
  if (error) throw error;
  return true;
}