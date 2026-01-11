import React from "react";
import { useAuth } from "@/contexts/AuthProvider";
import Loader from "@/components/loader";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

type Props = {
  allow: ("agency_admin" | "owner" | "tenant")[];
  children: React.ReactNode;
};

const RoleGate = ({ allow, children }: Props) => {
  const { loading, role, session, user } = useAuth();

  const MASTER_ADMIN_EMAIL = "djeyff06@gmail.com";

  // Show loader only while auth is initializing
  if (loading) return <Loader />;

  // If no session, block
  if (!session) {
    return (
      <div className="mx-auto max-w-2xl">
        <Card>
          <CardHeader>
            <CardTitle>Access denied</CardTitle>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground">
            You don't have permission to view this page.
          </CardContent>
        </Card>
      </div>
    );
  }

  // Fallback: allow master admin to access admin pages even if role hasn't persisted yet
  if (!role) {
    const email = (user?.email ?? "").toLowerCase();
    const isMasterAdmin = email === MASTER_ADMIN_EMAIL;
    if (isMasterAdmin && allow.includes("agency_admin")) {
      return <>{children}</>;
    }
    return (
      <div className="mx-auto max-w-2xl">
        <Card>
          <CardHeader>
            <CardTitle>Access denied</CardTitle>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground">
            You don't have permission to view this page.
          </CardContent>
        </Card>
      </div>
    );
  }

  // Normal role gating
  if (!allow.includes(role)) {
    return (
      <div className="mx-auto max-w-2xl">
        <Card>
          <CardHeader>
            <CardTitle>Access denied</CardTitle>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground">
            You don't have permission to view this page.
          </CardContent>
        </Card>
      </div>
    );
  }

  return <>{children}</>;
};

export default RoleGate;