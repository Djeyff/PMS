import React, { useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/contexts/AuthProvider";
import { toast } from "sonner";

const AuthQuerySync = () => {
  const qc = useQueryClient();
  const { loading, session, role, profile } = useAuth();

  // When auth becomes ready, refetch everything so anonymous/empty caches are refreshed
  useEffect(() => {
    const ready = !loading && !!session && (!!role || !!profile?.role);
    if (!ready) return;

    // Invalidate to refetch active queries immediately
    qc.invalidateQueries();

    // Also refetch inactive queries shortly after to cover views loaded later
    const t = setTimeout(() => {
      qc.refetchQueries({ type: "inactive" });
    }, 150);

    return () => clearTimeout(t);
  }, [loading, session, role, profile?.role, profile?.agency_id, qc]);

  return null;
};

export default AuthQuerySync;