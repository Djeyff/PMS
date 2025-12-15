import { supabase, getAuthedClient } from "@/integrations/supabase/client";

export type DiagnosticsResult = {
  auth: {
    userId: string | null;
    email: string | null;
    tokenPresent: boolean;
  };
  profile: {
    exists: boolean;
    id?: string;
    role?: string | null;
    agency_id?: string | null;
    updated_at?: string | null;
  };
  checks: {
    is_agency_admin: boolean | null;
  };
  counts: {
    properties: number | null;
    leases: number | null;
    invoices: number | null;
    payments: number | null;
    maintenance_requests: number | null;
  };
  errors: string[];
};

export async function getAuthStatus() {
  const { data } = await supabase.auth.getSession();
  const sess = data.session ?? null;
  return {
    userId: sess?.user?.id ?? null,
    email: sess?.user?.email ?? null,
    tokenPresent: !!sess?.access_token,
    accessToken: sess?.access_token ?? null,
  };
}

export async function runDiagnostics(): Promise<DiagnosticsResult> {
  const status = await getAuthStatus();
  const db = getAuthedClient(status.accessToken);
  const errors: string[] = [];

  const result: DiagnosticsResult = {
    auth: {
      userId: status.userId,
      email: status.email,
      tokenPresent: status.tokenPresent,
    },
    profile: { exists: false },
    checks: { is_agency_admin: null },
    counts: {
      properties: null,
      leases: null,
      invoices: null,
      payments: null,
      maintenance_requests: null,
    },
    errors,
  };

  // Profile
  try {
    if (status.userId) {
      const { data: prof, error } = await db
        .from("profiles")
        .select("id, role, agency_id, updated_at")
        .eq("id", status.userId)
        .single();
      if (error) throw error;
      result.profile = {
        exists: !!prof?.id,
        id: prof?.id,
        role: prof?.role ?? null,
        agency_id: prof?.agency_id ?? null,
        updated_at: prof?.updated_at ?? null,
      };
    } else {
      result.errors.push("No user session");
    }
  } catch (e: any) {
    result.errors.push(`Profile error: ${e?.message ?? String(e)}`);
  }

  // RLS check: is_agency_admin(auth uid)
  try {
    if (status.userId) {
      const { data, error } = await db.rpc("is_agency_admin", { u: status.userId });
      if (error) throw error;
      result.checks.is_agency_admin = !!data;
    }
  } catch (e: any) {
    result.errors.push(`is_agency_admin check failed: ${e?.message ?? String(e)}`);
  }

  // Counts for tables (RLS will apply)
  async function countRows(table: string, filter?: (q: any) => any) {
    let q = db.from(table).select("id", { count: "exact" });
    if (filter) q = filter(q);
    const res = await q.limit(3);
    if (res.error) throw res.error;
    const rows = (res.data ?? []) as any[];
    return typeof res.count === "number" ? res.count : rows.length;
  }

  try {
    result.counts.properties = await countRows("properties");
  } catch (e: any) {
    result.errors.push(`properties: ${e?.message ?? String(e)}`);
    result.counts.properties = -1;
  }

  try {
    result.counts.leases = await countRows("leases");
  } catch (e: any) {
    result.errors.push(`leases: ${e?.message ?? String(e)}`);
    result.counts.leases = -1;
  }

  try {
    result.counts.invoices = await countRows("invoices");
  } catch (e: any) {
    result.errors.push(`invoices: ${e?.message ?? String(e)}`);
    result.counts.invoices = -1;
  }

  try {
    result.counts.payments = await countRows("payments");
  } catch (e: any) {
    result.errors.push(`payments: ${e?.message ?? String(e)}`);
    result.counts.payments = -1;
  }

  try {
    result.counts.maintenance_requests = await countRows("maintenance_requests");
  } catch (e: any) {
    result.errors.push(`maintenance_requests: ${e?.message ?? String(e)}`);
    result.counts.maintenance_requests = -1;
  }

  return result;
}