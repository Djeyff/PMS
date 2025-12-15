import React, { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/contexts/AuthProvider";
import { useQueryClient } from "@tanstack/react-query";
import { runDiagnostics, type DiagnosticsResult } from "@/services/debug";
import AppShell from "@/components/layout/AppShell";

const Row = ({ label, value }: { label: string; value: React.ReactNode }) => (
  <div className="flex items-center justify-between py-1 text-sm">
    <span className="text-muted-foreground">{label}</span>
    <span className="font-mono">{value}</span>
  </div>
);

const Debug = () => {
  const { loading, session, user, role, profile } = useAuth();
  const qc = useQueryClient();
  const [diag, setDiag] = useState<DiagnosticsResult | null>(null);
  const [running, setRunning] = useState(false);

  const refreshDiagnostics = async () => {
    setRunning(true);
    try {
      const res = await runDiagnostics();
      setDiag(res);
    } finally {
      setRunning(false);
    }
  };

  useEffect(() => {
    // Run once when auth becomes ready
    if (!loading && !!session) {
      refreshDiagnostics();
    }
  }, [loading, session]);

  return (
    <AppShell>
      <div className="max-w-2xl space-y-6">
        <Card>
          <CardHeader>
            <CardTitle>Auth State</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            <Row label="Loading" value={String(loading)} />
            <Row label="Session" value={session ? "yes" : "no"} />
            <Row label="User ID" value={user?.id ?? "—"} />
            <Row label="Email" value={user?.email ?? "—"} />
            <Row label="Role (derived)" value={role ?? "—"} />
            <Row label="Profile role" value={profile?.role ?? "—"} />
            <Row label="Agency ID" value={profile?.agency_id ?? "—"} />
          </CardContent>
        </Card>

        <div className="flex gap-2">
          <Button variant="outline" onClick={() => { qc.invalidateQueries(); qc.refetchQueries(); }}>
            Force Refetch All
          </Button>
          <Button onClick={refreshDiagnostics} disabled={running}>
            {running ? "Running…" : "Run Diagnostics"}
          </Button>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Diagnostics</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {!diag ? (
              <div className="text-sm text-muted-foreground">No diagnostics yet.</div>
            ) : (
              <>
                <div className="space-y-1">
                  <Row label="Token Present" value={String(diag.auth.tokenPresent)} />
                  <Row label="Profile Exists" value={String(diag.profile.exists)} />
                  <Row label="Profile Role" value={diag.profile.role ?? "—"} />
                  <Row label="Profile Agency" value={diag.profile.agency_id ?? "—"} />
                  <Row label="is_agency_admin" value={String(diag.checks.is_agency_admin)} />
                </div>
                <div className="pt-2">
                  <div className="text-sm font-medium">Row counts (RLS applied)</div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mt-2">
                    <Row label="properties" value={String(diag.counts.properties)} />
                    <Row label="leases" value={String(diag.counts.leases)} />
                    <Row label="invoices" value={String(diag.counts.invoices)} />
                    <Row label="payments" value={String(diag.counts.payments)} />
                    <Row label="maintenance" value={String(diag.counts.maintenance_requests)} />
                  </div>
                </div>
                {diag.errors.length > 0 && (
                  <div className="pt-2">
                    <div className="text-sm font-medium">Errors</div>
                    <ul className="text-xs text-red-600 mt-1 space-y-1">
                      {diag.errors.map((e, i) => <li key={i}>{e}</li>)}
                    </ul>
                  </div>
                )}
              </>
            )}
          </CardContent>
        </Card>
      </div>
    </AppShell>
  );
};

export default Debug;