import React from "react";
import { useAuth } from "@/contexts/AuthProvider";
import Loader from "@/components/loader";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

type Props = {
  allow: ("agency_admin" | "owner" | "tenant")[];
  children: React.ReactNode;
};

const RoleGate = ({ allow, children }: Props) => {
  const { loading, role, session } = useAuth();

  // Show loader only while the overall auth is initializing (first load)
  if (loading) return <Loader />;

  // If the user is signed in but we haven't resolved a role yet, allow rendering.
  // Backend RLS will still enforce access.
  if (session && !role) {
    return <>{children}</>;
  }

  if (!role || !allow.includes(role)) {
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