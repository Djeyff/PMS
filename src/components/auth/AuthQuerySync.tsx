import React, { useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/contexts/AuthProvider";

const AuthQuerySync = () => {
  const qc = useQueryClient();
  const { loading, session, profile } = useAuth();

  useEffect(() => {
    const role = profile?.role;
    const agencyReady = role !== "agency_admin" || !!profile?.agency_id;
    const ready = !loading && !!session && !!role && agencyReady;
    console.log("[AuthQuerySync] check:", { loading, session: !!session, role, agencyReady, ready });
    if (!ready) {
      console.log("[AuthQuerySync] not ready, skipping invalidate");
      return;
    }

    console.log("[AuthQuerySync] ready, invalidating and refetching queries");
    qc.invalidateQueries();
    const t = setTimeout(() => {
      qc.refetchQueries({ type: "inactive" });
      console.log("[AuthQuerySync] refetchQueries executed");
    }, 150);

    return () => clearTimeout(t);
  }, [loading, session, profile?.role, profile?.agency_id, qc]);

  return null;
};

export default AuthQuerySync;