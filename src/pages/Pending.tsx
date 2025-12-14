import React from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/contexts/AuthProvider";
import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

const MASTER_ADMIN_EMAIL = "djeyff06@gmail.com";

const Pending = () => {
  const { signOut, role, user, profile, refreshProfile } = useAuth();
  const navigate = useNavigate();
  const [claiming, setClaiming] = useState(false);

  const isMaster = (user?.email?.toLowerCase() ?? "") === MASTER_ADMIN_EMAIL;

  useEffect(() => {
    if (role) {
      navigate("/dashboard", { replace: true });
    }
  }, [role, navigate]);

  const claimAdmin = async () => {
    if (!user) return;
    setClaiming(true);
    try {
      // Promote role
      const { error: upErr } = await supabase
        .from("profiles")
        .update({ role: "agency_admin" })
        .eq("id", user.id);
      if (upErr) throw upErr;

      // Ensure agency assignment: create one if needed
      let agencyId = profile?.agency_id ?? null;
      if (!agencyId) {
        const { data: agency, error: aErr } = await supabase
          .from("agencies")
          .insert({ name: "Master Agency", default_currency: "USD" })
          .select("id")
          .single();
        if (aErr) throw aErr;
        agencyId = agency.id;
        const { error: profErr } = await supabase
          .from("profiles")
          .update({ agency_id: agencyId })
          .eq("id", user.id);
        if (profErr) throw profErr;
      }

      await refreshProfile();
      toast.success("You are now Agency Admin");
      navigate("/dashboard", { replace: true });
    } catch (e: any) {
      console.error("Claim admin failed:", e);
      toast.error(e?.message ?? "Failed to promote admin");
    } finally {
      setClaiming(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <Card className="max-w-lg w-full">
        <CardHeader>
          <CardTitle>Access pending</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4 text-sm text-muted-foreground">
          <p>Your account is awaiting activation. An Agency Admin will assign your role shortly.</p>
          <p>If you believe this is a mistake, please contact your agency administrator.</p>
          <div className="pt-2 flex gap-2">
            <Button variant="secondary" onClick={() => navigate("/dashboard")}>Retry</Button>
            <Button variant="ghost" onClick={() => signOut()}>Sign out</Button>
            {isMaster && (
              <Button onClick={claimAdmin} disabled={claiming}>
                {claiming ? "Promoting..." : "Claim admin"}
              </Button>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default Pending;