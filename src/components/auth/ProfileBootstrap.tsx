import React, { useEffect, useState } from "react";
import { useAuth } from "@/contexts/AuthProvider";
import { supabase, getAuthedClient } from "@/integrations/supabase/client";
import Loader from "@/components/loader";
import { createAgency as createAgencyService } from "@/services/agencies";

const MASTER_ADMIN_EMAIL = "djeyff06@gmail.com";

const ProfileBootstrap = () => {
  const { loading, session, user, profile, refreshProfile } = useAuth();
  const [busy, setBusy] = useState(false);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const run = async () => {
      if (busy || ready) return;
      if (loading) return;
      if (!session || !user) {
        setReady(true);
        return;
      }

      setBusy(true);
      try {
        const { data: sess } = await supabase.auth.getSession();
        const token = sess.session?.access_token ?? null;
        const db = getAuthedClient(token);

        // 1) Master admin: ensure role is set in DB
        const email = (user.email ?? "").toLowerCase();
        if (email === MASTER_ADMIN_EMAIL && (!profile?.role || profile.role !== "agency_admin")) {
          await db.from("profiles").upsert({ id: user.id, role: "agency_admin" }, { onConflict: "id" });
        }

        // Refresh local profile after role upsert
        await refreshProfile();

        // 2) If role is admin but agency_id is missing, create agency and assign
        const roleNow = profile?.role ?? (email === MASTER_ADMIN_EMAIL ? "agency_admin" : null);
        const needsAgency = roleNow === "agency_admin" && !profile?.agency_id;

        if (needsAgency) {
          try {
            // Use edge function path first; it sets agency_id and is safe
            await createAgencyService({ name: "Master Agency", default_currency: "USD" });
          } catch {
            // Fallback: insert agency via RLS-allowed insert, then assign profile.agency_id
            const { data: agency, error: insertErr } = await db
              .from("agencies")
              .insert({ name: "Master Agency", default_currency: "USD" })
              .select("id")
              .single();
            if (!insertErr && agency?.id) {
              await db.from("profiles").upsert({ id: user.id, agency_id: agency.id }, { onConflict: "id" });
            }
          }
        }

        // Final profile refresh
        await refreshProfile();
      } finally {
        setBusy(false);
        setReady(true);
      }
    };

    run();
  }, [loading, session, user?.id, user?.email, profile?.role, profile?.agency_id, busy, ready, refreshProfile]);

  // Block downstream until bootstrap completes when a session exists
  if (loading) return null;
  if (session && !ready) {
    return (
      <div className="fixed inset-0 z-50 bg-background/80 backdrop-blur-sm">
        <div className="h-full w-full flex items-center justify-center">
          <Loader />
        </div>
      </div>
    );
  }
  return null;
};

export default ProfileBootstrap;