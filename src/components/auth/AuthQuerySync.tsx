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
    if (!ready) return;

    qc.invalidateQueries();
    const t = setTimeout(() => {
      qc.refetchQueries({ type: "inactive" });
    }, 150);

    return () => clearTimeout(t);
  }, [loading, session, profile?.role, profile?.agency_id, qc]);

  return null;
};

export default AuthQuerySync;