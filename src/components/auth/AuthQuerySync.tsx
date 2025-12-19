import React, { useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/contexts/AuthProvider";
import { runAutoInvoiceNoForce } from "@/services/auto-invoice";

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

    // Auto-invoice scheduler for admins: run immediately and then every minute
    let timer: any = null;
    const startAuto = async () => {
      if (profile?.role === "agency_admin" && profile?.agency_id) {
        try {
          await runAutoInvoiceNoForce();
          console.log("[AuthQuerySync] auto-invoice executed (no force)");
        } catch (e) {
          console.warn("[AuthQuerySync] auto-invoice error", e);
        }
        timer = setInterval(async () => {
          try {
            await runAutoInvoiceNoForce();
            console.log("[AuthQuerySync] auto-invoice executed (interval)");
          } catch (e) {
            console.warn("[AuthQuerySync] auto-invoice interval error", e);
          }
        }, 60_000);
      }
    };
    startAuto();

    return () => {
      clearTimeout(t);
      if (timer) clearInterval(timer);
    };
  }, [loading, session, profile?.role, profile?.agency_id, qc]);

  return null;
};

export default AuthQuerySync;