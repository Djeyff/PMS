import React from "react";
import { useAuth } from "@/contexts/AuthProvider";
import Loader from "@/components/loader";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

type Props = {
  allow: ("agency_admin" | "owner" | "tenant")[];
  children: React.ReactNode;
};

const RoleGate = ({ allow, children }: Props) => {
  const { loading, role } = useAuth();

  if (loading) return <Loader />;

  if (!role || !allow.includes(role)) {
    return (
      <div className="mx-auto max-w-2xl">
        <Card>
          <CardHeader>
            <CardTitle>Access denied</CardTitle>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground">
            You don’t have permission to view this page.
          </CardContent>
        </Card>
      </div>
    );
  }

  return <>{children}</>;
};

export default RoleGate;