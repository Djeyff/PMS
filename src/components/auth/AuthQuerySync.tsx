import React, { useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/contexts/AuthProvider";
import { toast } from "sonner";

const AuthQuerySync = () => {
  const qc = useQueryClient();
  const { loading, session, profile } = useAuth();

  useEffect(() => {
    const ready = !loading && !!session && !!profile?.role;
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