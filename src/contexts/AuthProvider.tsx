import React, { createContext, useContext, useEffect, useMemo, useState } from "react";
import { Session, User } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";
import { createAgency as createAgencyService } from "@/services/agencies";
import { getAuthedClient } from "@/integrations/supabase/client";

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

  // Role resolves only from profile
  const role: Role | null = useMemo(() => {
    return profile?.role ?? null;
  }, [profile?.role]);

  const ensureProfileRow = async (uid: string) => {
    const { data: sess } = await supabase.auth.getSession();
    const db = getAuthedClient(sess.session?.access_token);
    const { error } = await db
      .from("profiles")
      .upsert({ id: uid }, { onConflict: "id" });
    if (error) {
      console.warn("ensureProfileRow: upsert failed", error);
      return false;
    }
    return true;
  };

  useEffect(() => {
    let active = true;
    setLoading(true);

    const hardStop = setTimeout(() => {
      if (active) setLoading(false);
    }, 2500);

    (async () => {
      const { data } = await supabase.auth.getSession();
      const sess = data.session ?? null;

      if (!active) return;
      setSession(sess);
      setUser(sess?.user ?? null);

      if (sess?.user?.id) {
        let p = await fetchProfile(sess.user.id).catch(() => null);

        if (!p) {
          await ensureProfileRow(sess.user.id);
          p = await fetchProfile(sess.user.id).catch(() => null);
        }

        if (!active) return;
        setProfile(p);

        // Secure bootstrap: if role is missing, attempt server-side bootstrap-admin, then re-fetch profile
        if (!p?.role) {
          const token = sess?.access_token;
          if (token) {
            const url = "https://tsfswvmwkfairaoccfqa.supabase.co/functions/v1/bootstrap-admin";
            await fetch(url, {
              method: "POST",
              headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
              body: JSON.stringify({}),
            }).catch(() => {});
            const refreshed = await fetchProfile(sess.user.id).catch(() => null);
            if (active && refreshed) setProfile(refreshed);
          }
        }
      } else {
        setProfile(null);
      }

      if (active) setLoading(false);
    })();

    const { data: sub } = supabase.auth.onAuthStateChange(async (_event, sess) => {
      if (!active) return;

      setSession(sess ?? null);
      setUser(sess?.user ?? null);

      if (sess?.user?.id) {
        let p = await fetchProfile(sess.user.id).catch(() => null);

        if (!p) {
          await ensureProfileRow(sess.user.id);
          p = await fetchProfile(sess.user.id).catch(() => null);
        }

        if (!active) return;
        setProfile(p);

        // Secure bootstrap on subsequent auth events if role still missing
        if (!p?.role) {
          const token = sess?.access_token;
          if (token) {
            const url = "https://tsfswvmwkfairaoccfqa.supabase.co/functions/v1/bootstrap-admin";
            await fetch(url, {
              method: "POST",
              headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
              body: JSON.stringify({}),
            }).catch(() => {});
            const refreshed = await fetchProfile(sess.user.id).catch(() => null);
            if (active && refreshed) setProfile(refreshed);
          }
        }
      } else {
        setProfile(null);
      }

      setLoading(false);
    });

    return () => {
      active = false;
      clearTimeout(hardStop);
      sub?.subscription?.unsubscribe();
    };
  }, []);

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