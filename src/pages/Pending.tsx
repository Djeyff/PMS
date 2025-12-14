import React from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/contexts/AuthProvider";

const Pending = () => {
  const { signOut } = useAuth();

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <Card className="max-w-lg w-full">
        <CardHeader>
          <CardTitle>Access pending</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4 text-sm text-muted-foreground">
          <p>Your account is awaiting activation. An Agency Admin will assign your role shortly.</p>
          <p>If you believe this is a mistake, please contact your agency administrator.</p>
          <div className="pt-2">
            <Button variant="ghost" onClick={() => signOut()}>Sign out</Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default Pending;