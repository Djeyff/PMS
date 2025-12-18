import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const authHeader = req.headers.get("Authorization");
  if (!authHeader) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
  const supabase = createClient(supabaseUrl, supabaseAnonKey, {
    global: { headers: { Authorization: authHeader } },
  });

  const { data: userRes } = await supabase.auth.getUser();
  const user = userRes?.user;
  if (!user) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const body = await req.json().catch(() => null);
  const invoiceId = body?.invoiceId as string | undefined;
  if (!invoiceId) {
    return new Response(JSON.stringify({ error: "invoiceId is required" }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  // Fetch invoice minimal fields
  const { data: invoice, error: invErr } = await supabase
    .from("invoices")
    .select("id, lease_id, tenant_id, pdf_url")
    .eq("id", invoiceId)
    .single();

  if (invErr || !invoice) {
    return new Response(JSON.stringify({ error: "Invoice not found" }), {
      status: 404,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const requesterId = user.id;

  let authorized = false;

  // 1) Tenant check
  if (invoice.tenant_id === requesterId) {
    authorized = true;
  }

  // 2) Owner and admin checks
  if (!authorized) {
    const { data: lease, error: leaseErr } = await supabase
      .from("leases")
      .select("property_id")
      .eq("id", invoice.lease_id)
      .single();

    if (leaseErr || !lease) {
      return new Response(JSON.stringify({ error: "Lease not found" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Owner check
    const { data: ownerOk } = await supabase.rpc("owns_property", { u: requesterId, pid: lease.property_id });

    // Admin same-agency check
    const { data: propAgencyId } = await supabase.rpc("property_agency_id", { pid: lease.property_id });
    const { data: adminAgencyId } = await supabase.rpc("admin_agency_id", { u: requesterId });
    const { data: isAdmin } = await supabase.rpc("is_agency_admin", { u: requesterId });

    if (ownerOk === true || (isAdmin === true && propAgencyId && adminAgencyId && propAgencyId === adminAgencyId)) {
      authorized = true;
    }
  }

  if (!authorized) {
    return new Response(JSON.stringify({ error: "Forbidden" }), {
      status: 403,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const path = invoice.pdf_url;
  if (!path) {
    return new Response(JSON.stringify({ error: "No PDF available" }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const { data: signed, error: signErr } = await supabase.storage.from("invoices").createSignedUrl(path, 60);
  if (signErr || !signed) {
    return new Response(JSON.stringify({ error: "Failed to create signed URL" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  return new Response(JSON.stringify({ signedUrl: signed.signedUrl }), {
    status: 200,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});