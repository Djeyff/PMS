import { supabase } from "@/integrations/supabase/client";

export type ManagerReportRow = {
  id: string;
  agency_id: string;
  month: string;
  start_date: string;
  end_date: string;
  avg_rate: number | null;
  fee_percent: number;
  usd_cash_total: number;
  dop_cash_total: number;
  usd_transfer_total: number;
  dop_transfer_total: number;
  usd_total: number;
  dop_total: number;
  fee_base_dop: number;
  fee_dop: number;
  fee_deducted_dop: number;
  created_at: string | null;
  updated_at: string | null;
};

export async function listManagerReports(agencyId: string) {
  const { data, error } = await supabase
    .from("manager_reports")
    .select("*")
    .eq("agency_id", agencyId)
    .order("start_date", { ascending: false });
  if (error) throw error;
  return (data ?? []) as ManagerReportRow[];
}

export async function createManagerReport(input: Omit<ManagerReportRow, "id" | "created_at" | "updated_at">) {
  const payload = { ...input };
  const { data, error } = await supabase
    .from("manager_reports")
    .insert(payload)
    .select("*")
    .single();
  if (error) throw error;
  return data as ManagerReportRow;
}

export async function updateManagerReport(id: string, updates: Partial<ManagerReportRow>) {
  const { data, error } = await supabase
    .from("manager_reports")
    .update(updates)
    .eq("id", id)
    .select("*")
    .single();
  if (error) throw error;
  return data as ManagerReportRow;
}

export async function deleteManagerReport(id: string) {
  const { data, error } = await supabase
    .from("manager_reports")
    .delete()
    .eq("id", id)
    .select("id")
    .single();
  if (error) throw error;
  return true;
}