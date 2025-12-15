import React, { createContext, useContext, useEffect, useMemo, useState } from "react";
import { Session, User } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";
import { getAuthedClient } from "@/integrations/supabase/client";
import { createAgency as createAgencyService } from "@/services/agencies";

export type Role = "agency_admin" | "owner" | "tenant";
export type Profile = {
  id: string;
  role: Role | null;
  agency_id: string | null;
  first_name: string | null;
  last_name: string | null;
  avatar_url: string | null;
  email?: string | null;
};

type AuthContextValue = {
  session: Session | null;
  user: User | null;
  profile: Profile | null;
  role: Role | null;
  loading: boolean;
  signOut: () => Promise<void>;
  refreshProfile: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

const fetchProfile = async (userId: string): Promise<Profile | null> => {
  const { data: sess } = await supabase.auth.getSession();
  const db = getAuthedClient(sess.session?.access_token);
  const { data, error } = await db
    .from("profiles")
    .select("id, role, agency_id, first_name, last_name, avatar_url")
    .eq("id", userId)
    .single();
  if (error) {
    if ((error as any).code === "PGRST116") return null;
    throw error;
  }
  return data as Profile;
};

export const AuthProvider = ({ children }: { children: React.ReactNode }) => {
  const [session, setSession] = useState<Session | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);
  const [profileReady, setProfileReady] = useState(false);

  const MASTER_ADMIN_EMAIL = "djeyff06@gmail.com";

  // Immediate role fallback for master email so UI doesn't bounce to Pending
  const role: Role | null = useMemo(() => {
    if (profile?.role) return profile.role;
    if ((user?.email?.toLowerCase() ?? "") === MASTER_ADMIN_EMAIL) return "agency_admin";
    return null;
  }, [profile?.role, user?.email]);

  const ensureMasterAdmin = async (u: User, current: Profile | null) => {
    const email = u.email?.toLowerCase() ?? "";
    if (email !== MASTER_ADMIN_EMAIL) return;

    const { data: sess } = await supabase.auth.getSession();
    const token = sess.session?.access_token;
    if (!token) return;

    try {
      const url = "https://tsfswvmwkfairaoccfqa.supabase.co/functions/v1/bootstrap-admin";
      const res = await fetch(url, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      // proceed regardless; profile will be refreshed below
      console.log("[AuthProvider] bootstrap-admin status:", res.status);
    } catch (e) {
      console.warn("ensureMasterAdmin: bootstrap-admin failed", e);
    }

    // Refresh profile after bootstrap attempt
    const updated = await fetchProfile(u.id).catch(() => null);
    if (updated) setProfile(updated);
  };

  const loadSessionAndProfile = async () => {
    console.log("[AuthProvider] loadSessionAndProfile start");
    const { data } = await supabase.auth.getSession();
    const sess = data.session ?? null;
    console.log("[AuthProvider] session:", sess ? "present" : "none");
    setSession(sess);
    setUser(sess?.user ?? null);
    if (sess?.user?.id) {
      let p = await fetchProfile(sess.user.id).catch(() => null);
      console.log("[AuthProvider] initial profile:", p);
      if (!p) {
        // Ensure profile row exists (authed client not required to create the row)
        const { error: upsertErr } = await supabase
          .from("profiles")
          .upsert({ id: sess.user.id }, { onConflict: "id" });
        if (upsertErr) console.warn("ensureProfileRow failed", upsertErr);
        p = await fetchProfile(sess.user.id).catch(() => null);
        console.log("[AuthProvider] profile after ensure row:", p);
      }
      setProfile(p);

      // If master admin and missing role or missing agency, run server-side bootstrap, then refresh profile
      const needBootstrap = (sess.user.email?.toLowerCase() === MASTER_ADMIN_EMAIL) && (!p?.role || (p?.role === "agency_admin" && !p.agency_id));
      if (needBootstrap) {
        console.log("[AuthProvider] needBootstrap -> calling bootstrap-admin");
        await ensureMasterAdmin(sess.user, p ?? null);
        const updated = await fetchProfile(sess.user.id).catch(() => null);
        console.log("[AuthProvider] profile after bootstrap-admin:", updated);
        if (updated) setProfile(updated);
      }
    } else {
      setProfile(null);
    }
  };

  useEffect(() => {
    let mounted = true;
    (async () => {
      console.log("[AuthProvider] useEffect init start");
      setLoading(true);
      setProfileReady(false);
      await loadSessionAndProfile();
      if (mounted) setLoading(false);
      console.log("[AuthProvider] useEffect init end, loading cleared");
    })();

    const { data: sub } = supabase.auth.onAuthStateChange(async (_event, sess) => {
      console.log("[AuthProvider] onAuthStateChange:", _event, sess ? "session present" : "no session");
      setSession(sess ?? null);
      setUser(sess?.user ?? null);
      if (sess?.user?.id) {
        let p = await fetchProfile(sess.user.id).catch(() => null);
        console.log("[AuthProvider] onAuthStateChange profile:", p);
        if (!p) {
          const { error: upsertErr } = await supabase
            .from("profiles")
            .upsert({ id: sess.user.id }, { onConflict: "id" });
          if (upsertErr) console.warn("ensureProfileRow failed", upsertErr);
          p = await fetchProfile(sess.user.id).catch(() => null);
          console.log("[AuthProvider] onAuthStateChange profile after ensure row:", p);
        }
        setProfile(p);

        if (p?.role === "agency_admin" && !p.agency_id) {
          console.log("[AuthProvider] onAuthStateChange admin without agency, bootstrapping agency");
          try {
            await createAgencyService({ name: "Master Agency", default_currency: "USD" });
          } catch (e) {
            console.warn("createAgency fallback failed", e);
          }
          const updated = await fetchProfile(sess.user.id).catch(() => null);
          console.log("[AuthProvider] onAuthStateChange profile after agency bootstrap:", updated);
          if (updated) setProfile(updated);
        }
      } else {
        setProfile(null);
      }
    });

    const fallback = setTimeout(() => {
      if (mounted) setLoading(false);
      console.log("[AuthProvider] fallback timeout cleared loading");
    }, 4000);

    return () => {
      mounted = false;
      clearTimeout(fallback);
      sub?.subscription?.unsubscribe();
    };
  }, []);

  // Update profileReady flag whenever profile changes
  useEffect(() => {
    const ready = !!profile && (profile.role !== "agency_admin" || !!profile.agency_id);
    console.log("[AuthProvider] profileReady check:", { profile, ready });
    setProfileReady(ready);
  }, [profile]);

  const signOut = async () => {
    await supabase.auth.signOut();
    setProfile(null);
  };

  const refreshProfile = async () => {
    if (!user?.id) return;
    const p = await fetchProfile(user.id).catch(() => null);
    setProfile(p);
  };

  const value: AuthContextValue = {
    session,
    user,
    profile,
    role,
    loading,
    signOut,
    refreshProfile,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

export const useAuth = () => {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
};