import React, { useState } from "react";
import { useAuth } from "@/contexts/AuthProvider";
import { supabase } from "@/integrations/supabase/client";
import { useNavigate } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";

const Onboarding = () => {
  const { user, refreshProfile } = useAuth();
  const navigate = useNavigate();
  const [role, setRole] = useState<"agency_admin" | "owner" | "tenant">("tenant");
  const [loading, setLoading] = useState(false);

  if (!user) {
    navigate("/login", { replace: true });
  }

  const onSave = async () => {
    if (!user) return;
    setLoading(true);
    const { error } = await supabase
      .from("profiles")
      .upsert({ id: user.id, role, agency_id: null }, { onConflict: "id" });
    if (error) {
      setLoading(false);
      throw error;
    }
    await refreshProfile();
    setLoading(false);
    navigate("/dashboard", { replace: true });
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-background">
      <Card className="w-full max-w-lg">
        <CardHeader>
          <CardTitle>Welcome! Choose your role</CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          <RadioGroup value={role} onValueChange={(v) => setRole(v as any)}>
            <div className="flex items-center space-x-2">
              <RadioGroupItem value="agency_admin" id="r1" />
              <Label htmlFor="r1">Agency Admin / Staff</Label>
            </div>
            <div className="flex items-center space-x-2">
              <RadioGroupItem value="owner" id="r2" />
              <Label htmlFor="r2">Property Owner</Label>
            </div>
            <div className="flex items-center space-x-2">
              <RadioGroupItem value="tenant" id="r3" />
              <Label htmlFor="r3">Tenant</Label>
            </div>
          </RadioGroup>
          <Button onClick={onSave} disabled={loading}>
            {loading ? "Saving..." : "Continue"}
          </Button>
        </CardContent>
      </Card>
    </div>
  );
};

export default Onboarding;