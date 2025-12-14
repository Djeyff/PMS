import React from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/contexts/AuthProvider";
import { useEffect } from "react";
import { useNavigate } from "react-router-dom";

const Pending = () => {
  const { signOut, role } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (role) {
      navigate("/dashboard", { replace: true });
    }
  }, [role, navigate]);

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
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default Pending;